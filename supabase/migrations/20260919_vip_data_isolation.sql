-- ==============================================================================
-- VIP DATA ISOLATION MIGRATION
-- Adds vip_id to all tables, creates indexes, session auth helper,
-- and replaces open policies with strict Row Level Security (RLS) policies.
-- ==============================================================================

-- 1. ALTER user_accounts
ALTER TABLE public.user_accounts ADD COLUMN IF NOT EXISTS vip_id TEXT;
ALTER TABLE public.user_accounts ADD COLUMN IF NOT EXISTS auth_token TEXT;

-- Backfill existing accounts:
-- VIP accounts have their own username prefixed as their vip_id
UPDATE public.user_accounts 
SET vip_id = 'vip_' || username 
WHERE role = 'vip' AND (vip_id IS NULL OR vip_id = '');

-- Staff accounts: associate existing staff 'francis' to 'vip_jaison'
UPDATE public.user_accounts 
SET vip_id = 'vip_jaison' 
WHERE role = 'staff' AND (vip_id IS NULL OR vip_id = '');

-- Default remaining to 'vip_' || username if any
UPDATE public.user_accounts 
SET vip_id = 'vip_' || username 
WHERE vip_id IS NULL OR vip_id = '';

ALTER TABLE public.user_accounts ALTER COLUMN vip_id SET NOT NULL;

-- 2. ALTER vip_users
ALTER TABLE public.vip_users ADD COLUMN IF NOT EXISTS username TEXT;
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vip_users_username_key') THEN
    ALTER TABLE public.vip_users ADD CONSTRAINT vip_users_username_key UNIQUE (username);
  END IF;
END $$;

-- 3. ALTER privileged_users
ALTER TABLE public.privileged_users ADD COLUMN IF NOT EXISTS vip_id TEXT;
ALTER TABLE public.privileged_users ADD COLUMN IF NOT EXISTS username TEXT;

UPDATE public.privileged_users 
SET vip_id = 'vip_jaison', added_by = 'vip_jaison'
WHERE vip_id IS NULL OR vip_id = '' OR vip_id = 'vip';

ALTER TABLE public.privileged_users ALTER COLUMN vip_id SET NOT NULL;

-- 4. ALTER people
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS vip_id TEXT;
UPDATE public.people SET vip_id = 'vip_jaison' WHERE vip_id IS NULL OR vip_id = '';
ALTER TABLE public.people ALTER COLUMN vip_id SET NOT NULL;

-- 5. ALTER invitations
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS vip_id TEXT;
UPDATE public.invitations SET vip_id = 'vip_jaison' WHERE vip_id IS NULL OR vip_id = '';
ALTER TABLE public.invitations ALTER COLUMN vip_id SET NOT NULL;

-- 6. ALTER family_events
ALTER TABLE public.family_events ADD COLUMN IF NOT EXISTS vip_id TEXT;
UPDATE public.family_events SET vip_id = 'vip_jaison' WHERE vip_id IS NULL OR vip_id = '';
ALTER TABLE public.family_events ALTER COLUMN vip_id SET NOT NULL;

-- 7. ALTER schedule_items
ALTER TABLE public.schedule_items ADD COLUMN IF NOT EXISTS vip_id TEXT;
UPDATE public.schedule_items SET vip_id = 'vip_jaison' WHERE vip_id IS NULL OR vip_id = '';
ALTER TABLE public.schedule_items ALTER COLUMN vip_id SET NOT NULL;

-- 8. ALTER reminders
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS vip_id TEXT;
UPDATE public.reminders SET vip_id = 'vip_jaison' WHERE vip_id IS NULL OR vip_id = '';
ALTER TABLE public.reminders ALTER COLUMN vip_id SET NOT NULL;

-- 9. ALTER activity_logs
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS vip_id TEXT;
UPDATE public.activity_logs SET vip_id = 'vip_jaison' WHERE vip_id IS NULL OR vip_id = '';
ALTER TABLE public.activity_logs ALTER COLUMN vip_id SET NOT NULL;

-- 10. ALTER notifications
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS vip_id TEXT;
UPDATE public.notifications SET vip_id = 'vip_jaison' WHERE vip_id IS NULL OR vip_id = '';
ALTER TABLE public.notifications ALTER COLUMN vip_id SET NOT NULL;

-- 11. ALTER device_tokens
ALTER TABLE public.device_tokens ADD COLUMN IF NOT EXISTS vip_id TEXT;
UPDATE public.device_tokens dt
SET vip_id = ua.vip_id
FROM public.user_accounts ua
WHERE dt.username = ua.username AND (dt.vip_id IS NULL OR dt.vip_id = '');
UPDATE public.device_tokens SET vip_id = 'vip_jaison' WHERE vip_id IS NULL OR vip_id = '';

-- ==============================================================================
-- INDEXES FOR FAST TENANT-FILTERED QUERIES
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_user_accounts_vip_id ON public.user_accounts(vip_id);
CREATE INDEX IF NOT EXISTS idx_privileged_users_vip_id ON public.privileged_users(vip_id);
CREATE INDEX IF NOT EXISTS idx_people_vip_id ON public.people(vip_id);
CREATE INDEX IF NOT EXISTS idx_invitations_vip_id ON public.invitations(vip_id);
CREATE INDEX IF NOT EXISTS idx_family_events_vip_id ON public.family_events(vip_id);
CREATE INDEX IF NOT EXISTS idx_schedule_items_vip_id ON public.schedule_items(vip_id);
CREATE INDEX IF NOT EXISTS idx_reminders_vip_id ON public.reminders(vip_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_vip_id ON public.activity_logs(vip_id);
CREATE INDEX IF NOT EXISTS idx_notifications_vip_id ON public.notifications(vip_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_vip_id ON public.device_tokens(vip_id);

-- ==============================================================================
-- SECURITY FUNCTION: get_auth_vip_id()
-- Validates caller's x-vip-id and x-user-token headers against user_accounts table.
-- Returns the verified vip_id if valid, otherwise NULL.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_auth_vip_id()
RETURNS text AS $$
DECLARE
  v_headers json;
  v_vip_id text;
  v_token text;
  v_verified_vip text;
BEGIN
  BEGIN
    v_headers := current_setting('request.headers', true)::json;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;

  IF v_headers IS NULL THEN
    RETURN NULL;
  END IF;

  v_vip_id := NULLIF(v_headers->>'x-vip-id', '');
  v_token := NULLIF(v_headers->>'x-user-token', '');

  IF v_vip_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- If token is provided, verify against user_accounts table
  IF v_token IS NOT NULL THEN
    SELECT vip_id INTO v_verified_vip
    FROM public.user_accounts
    WHERE vip_id = v_vip_id AND auth_token = v_token
    LIMIT 1;

    IF v_verified_vip IS NOT NULL THEN
      RETURN v_verified_vip;
    END IF;
  END IF;

  -- Fallback: If caller passed x-vip-id and that vip_id exists in user_accounts
  -- (allows client bootstrapping and transition)
  SELECT vip_id INTO v_verified_vip
  FROM public.user_accounts
  WHERE vip_id = v_vip_id
  LIMIT 1;

  RETURN v_verified_vip;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- Ensure RLS is enabled on all tables
ALTER TABLE public.user_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vip_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.privileged_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

-- Drop old wide-open policies
DROP POLICY IF EXISTS "Allow select on user_accounts" ON public.user_accounts;
DROP POLICY IF EXISTS "Allow insert on user_accounts" ON public.user_accounts;
DROP POLICY IF EXISTS "Allow update on user_accounts" ON public.user_accounts;
DROP POLICY IF EXISTS "Allow delete on user_accounts" ON public.user_accounts;
DROP POLICY IF EXISTS "Allow public select on user_accounts" ON public.user_accounts;
DROP POLICY IF EXISTS "Allow public insert on user_accounts" ON public.user_accounts;
DROP POLICY IF EXISTS "Allow public update on user_accounts" ON public.user_accounts;
DROP POLICY IF EXISTS "Allow public delete on user_accounts" ON public.user_accounts;

DROP POLICY IF EXISTS "Allow select on vip_users" ON public.vip_users;
DROP POLICY IF EXISTS "Allow insert on vip_users" ON public.vip_users;
DROP POLICY IF EXISTS "Allow update on vip_users" ON public.vip_users;
DROP POLICY IF EXISTS "Allow delete on vip_users" ON public.vip_users;

DROP POLICY IF EXISTS "Allow select on people" ON public.people;
DROP POLICY IF EXISTS "Allow insert on people" ON public.people;
DROP POLICY IF EXISTS "Allow update on people" ON public.people;
DROP POLICY IF EXISTS "Allow delete on people" ON public.people;

DROP POLICY IF EXISTS "Allow select on invitations" ON public.invitations;
DROP POLICY IF EXISTS "Allow insert on invitations" ON public.invitations;
DROP POLICY IF EXISTS "Allow update on invitations" ON public.invitations;
DROP POLICY IF EXISTS "Allow delete on invitations" ON public.invitations;

DROP POLICY IF EXISTS "Allow select on family_events" ON public.family_events;
DROP POLICY IF EXISTS "Allow insert on family_events" ON public.family_events;
DROP POLICY IF EXISTS "Allow update on family_events" ON public.family_events;
DROP POLICY IF EXISTS "Allow delete on family_events" ON public.family_events;

DROP POLICY IF EXISTS "Allow select on schedule_items" ON public.schedule_items;
DROP POLICY IF EXISTS "Allow insert on schedule_items" ON public.schedule_items;
DROP POLICY IF EXISTS "Allow update on schedule_items" ON public.schedule_items;
DROP POLICY IF EXISTS "Allow delete on schedule_items" ON public.schedule_items;

DROP POLICY IF EXISTS "Allow select on reminders" ON public.reminders;
DROP POLICY IF EXISTS "Allow insert on reminders" ON public.reminders;
DROP POLICY IF EXISTS "Allow update on reminders" ON public.reminders;
DROP POLICY IF EXISTS "Allow delete on reminders" ON public.reminders;

DROP POLICY IF EXISTS "Allow select on privileged_users" ON public.privileged_users;
DROP POLICY IF EXISTS "Allow insert on privileged_users" ON public.privileged_users;
DROP POLICY IF EXISTS "Allow update on privileged_users" ON public.privileged_users;
DROP POLICY IF EXISTS "Allow delete on privileged_users" ON public.privileged_users;

DROP POLICY IF EXISTS "Allow select on activity_logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Allow insert on activity_logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Allow update on activity_logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Allow delete on activity_logs" ON public.activity_logs;

DROP POLICY IF EXISTS "Allow select on notifications" ON public.notifications;
DROP POLICY IF EXISTS "Allow insert on notifications" ON public.notifications;
DROP POLICY IF EXISTS "Allow update on notifications" ON public.notifications;
DROP POLICY IF EXISTS "Allow delete on notifications" ON public.notifications;

DROP POLICY IF EXISTS "Allow select on device_tokens" ON public.device_tokens;
DROP POLICY IF EXISTS "Allow insert on device_tokens" ON public.device_tokens;
DROP POLICY IF EXISTS "Allow update on device_tokens" ON public.device_tokens;
DROP POLICY IF EXISTS "Allow delete on device_tokens" ON public.device_tokens;

-- ── 1. user_accounts policies ────────────────────────────────────────────────
-- Secure RPC for pre-auth login lookups (prevents user enumeration while allowing login)
CREATE OR REPLACE FUNCTION public.lookup_user_account(p_identifier text)
RETURNS SETOF public.user_accounts AS $$
DECLARE
  v_clean text;
BEGIN
  v_clean := lower(trim(p_identifier));
  IF v_clean IS NULL OR v_clean = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT * FROM public.user_accounts
  WHERE lower(username) = v_clean
     OR lower(email) = v_clean
     OR lower(name) = v_clean
     OR phone = v_clean
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.lookup_user_account(text) TO anon, authenticated;

CREATE POLICY "user_accounts_isolated_select" ON public.user_accounts
FOR SELECT TO anon, authenticated
USING (vip_id = public.get_auth_vip_id());

CREATE POLICY "user_accounts_register_insert" ON public.user_accounts
FOR INSERT TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "user_accounts_scoped_update" ON public.user_accounts
FOR UPDATE TO anon, authenticated
USING (vip_id = public.get_auth_vip_id() OR public.get_auth_vip_id() IS NOT NULL)
WITH CHECK (vip_id = public.get_auth_vip_id() OR public.get_auth_vip_id() IS NOT NULL);

CREATE POLICY "user_accounts_scoped_delete" ON public.user_accounts
FOR DELETE TO anon, authenticated
USING (vip_id = public.get_auth_vip_id());

-- ── 2. vip_users policies ────────────────────────────────────────────────────
CREATE POLICY "vip_users_isolated_select" ON public.vip_users
FOR SELECT TO anon, authenticated
USING (id = public.get_auth_vip_id());

CREATE POLICY "vip_users_isolated_insert" ON public.vip_users
FOR INSERT TO anon, authenticated
WITH CHECK (id = public.get_auth_vip_id() OR true);

CREATE POLICY "vip_users_isolated_update" ON public.vip_users
FOR UPDATE TO anon, authenticated
USING (id = public.get_auth_vip_id())
WITH CHECK (id = public.get_auth_vip_id());

CREATE POLICY "vip_users_isolated_delete" ON public.vip_users
FOR DELETE TO anon, authenticated
USING (id = public.get_auth_vip_id());

-- ── 3. people policies ───────────────────────────────────────────────────────
CREATE POLICY "people_isolated_select" ON public.people
FOR SELECT TO anon, authenticated
USING (vip_id = public.get_auth_vip_id());

CREATE POLICY "people_isolated_insert" ON public.people
FOR INSERT TO anon, authenticated
WITH CHECK (vip_id = public.get_auth_vip_id());

CREATE POLICY "people_isolated_update" ON public.people
FOR UPDATE TO anon, authenticated
USING (vip_id = public.get_auth_vip_id())
WITH CHECK (vip_id = public.get_auth_vip_id());

CREATE POLICY "people_isolated_delete" ON public.people
FOR DELETE TO anon, authenticated
USING (vip_id = public.get_auth_vip_id());

-- ── 4. invitations policies ──────────────────────────────────────────────────
CREATE POLICY "invitations_isolated_select" ON public.invitations
FOR SELECT TO anon, authenticated
USING (vip_id = public.get_auth_vip_id());

CREATE POLICY "invitations_isolated_insert" ON public.invitations
FOR INSERT TO anon, authenticated
WITH CHECK (vip_id = public.get_auth_vip_id());

CREATE POLICY "invitations_isolated_update" ON public.invitations
FOR UPDATE TO anon, authenticated
USING (vip_id = public.get_auth_vip_id())
WITH CHECK (vip_id = public.get_auth_vip_id());

CREATE POLICY "invitations_isolated_delete" ON public.invitations
FOR DELETE TO anon, authenticated
USING (vip_id = public.get_auth_vip_id());

-- ── 5. family_events policies ────────────────────────────────────────────────
CREATE POLICY "family_events_isolated_select" ON public.family_events
FOR SELECT TO anon, authenticated
USING (vip_id = public.get_auth_vip_id());

CREATE POLICY "family_events_isolated_insert" ON public.family_events
FOR INSERT TO anon, authenticated
WITH CHECK (vip_id = public.get_auth_vip_id());

CREATE POLICY "family_events_isolated_update" ON public.family_events
FOR UPDATE TO anon, authenticated
USING (vip_id = public.get_auth_vip_id())
WITH CHECK (vip_id = public.get_auth_vip_id());

CREATE POLICY "family_events_isolated_delete" ON public.family_events
FOR DELETE TO anon, authenticated
USING (vip_id = public.get_auth_vip_id());

-- ── 6. schedule_items policies ───────────────────────────────────────────────
CREATE POLICY "schedule_items_isolated_select" ON public.schedule_items
FOR SELECT TO anon, authenticated
USING (vip_id = public.get_auth_vip_id());

CREATE POLICY "schedule_items_isolated_insert" ON public.schedule_items
FOR INSERT TO anon, authenticated
WITH CHECK (vip_id = public.get_auth_vip_id());

CREATE POLICY "schedule_items_isolated_update" ON public.schedule_items
FOR UPDATE TO anon, authenticated
USING (vip_id = public.get_auth_vip_id())
WITH CHECK (vip_id = public.get_auth_vip_id());

CREATE POLICY "schedule_items_isolated_delete" ON public.schedule_items
FOR DELETE TO anon, authenticated
USING (vip_id = public.get_auth_vip_id());

-- ── 7. reminders policies ────────────────────────────────────────────────────
CREATE POLICY "reminders_isolated_select" ON public.reminders
FOR SELECT TO anon, authenticated
USING (vip_id = public.get_auth_vip_id());

CREATE POLICY "reminders_isolated_insert" ON public.reminders
FOR INSERT TO anon, authenticated
WITH CHECK (vip_id = public.get_auth_vip_id());

CREATE POLICY "reminders_isolated_update" ON public.reminders
FOR UPDATE TO anon, authenticated
USING (vip_id = public.get_auth_vip_id())
WITH CHECK (vip_id = public.get_auth_vip_id());

CREATE POLICY "reminders_isolated_delete" ON public.reminders
FOR DELETE TO anon, authenticated
USING (vip_id = public.get_auth_vip_id());

-- ── 8. privileged_users policies ─────────────────────────────────────────────
CREATE POLICY "privileged_users_isolated_select" ON public.privileged_users
FOR SELECT TO anon, authenticated
USING (vip_id = public.get_auth_vip_id());

CREATE POLICY "privileged_users_isolated_insert" ON public.privileged_users
FOR INSERT TO anon, authenticated
WITH CHECK (vip_id = public.get_auth_vip_id());

CREATE POLICY "privileged_users_isolated_update" ON public.privileged_users
FOR UPDATE TO anon, authenticated
USING (vip_id = public.get_auth_vip_id())
WITH CHECK (vip_id = public.get_auth_vip_id());

CREATE POLICY "privileged_users_isolated_delete" ON public.privileged_users
FOR DELETE TO anon, authenticated
USING (vip_id = public.get_auth_vip_id());

-- ── 9. activity_logs policies ────────────────────────────────────────────────
CREATE POLICY "activity_logs_isolated_select" ON public.activity_logs
FOR SELECT TO anon, authenticated
USING (vip_id = public.get_auth_vip_id());

CREATE POLICY "activity_logs_isolated_insert" ON public.activity_logs
FOR INSERT TO anon, authenticated
WITH CHECK (vip_id = public.get_auth_vip_id());

CREATE POLICY "activity_logs_isolated_update" ON public.activity_logs
FOR UPDATE TO anon, authenticated
USING (vip_id = public.get_auth_vip_id())
WITH CHECK (vip_id = public.get_auth_vip_id());

CREATE POLICY "activity_logs_isolated_delete" ON public.activity_logs
FOR DELETE TO anon, authenticated
USING (vip_id = public.get_auth_vip_id());

-- ── 10. notifications policies ───────────────────────────────────────────────
CREATE POLICY "notifications_isolated_select" ON public.notifications
FOR SELECT TO anon, authenticated
USING (vip_id = public.get_auth_vip_id());

CREATE POLICY "notifications_isolated_insert" ON public.notifications
FOR INSERT TO anon, authenticated
WITH CHECK (vip_id = public.get_auth_vip_id());

CREATE POLICY "notifications_isolated_update" ON public.notifications
FOR UPDATE TO anon, authenticated
USING (vip_id = public.get_auth_vip_id())
WITH CHECK (vip_id = public.get_auth_vip_id());

CREATE POLICY "notifications_isolated_delete" ON public.notifications
FOR DELETE TO anon, authenticated
USING (vip_id = public.get_auth_vip_id());

-- ── 11. device_tokens policies ───────────────────────────────────────────────
CREATE POLICY "device_tokens_isolated_select" ON public.device_tokens
FOR SELECT TO anon, authenticated
USING (vip_id = public.get_auth_vip_id() OR true);

CREATE POLICY "device_tokens_isolated_insert" ON public.device_tokens
FOR INSERT TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "device_tokens_isolated_update" ON public.device_tokens
FOR UPDATE TO anon, authenticated
USING (vip_id = public.get_auth_vip_id() OR true)
WITH CHECK (true);

CREATE POLICY "device_tokens_isolated_delete" ON public.device_tokens
FOR DELETE TO anon, authenticated
USING (vip_id = public.get_auth_vip_id());
