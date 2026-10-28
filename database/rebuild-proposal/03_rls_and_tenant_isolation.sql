-- ==============================================================================
-- 03_rls_and_tenant_isolation.sql
-- Invitation Hub Secure Database Rebuild — Migration Step 03
-- Purpose: Strict multi-tenant Row Level Security (RLS) policies and least-privilege
--          grants across all 11 application tables.
-- Target Environment: Staging ONLY (project ref: kdbkfmzsdinkvslvgson)
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. Enable Row Level Security (RLS) on All Application Tables
-- ------------------------------------------------------------------------------
ALTER TABLE public.vip_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 2. Explicit Least-Privilege Table Grants
-- ------------------------------------------------------------------------------
REVOKE ALL ON TABLE public.vip_users FROM PUBLIC;
REVOKE ALL ON TABLE public.user_accounts FROM PUBLIC;
REVOKE ALL ON TABLE public.people FROM PUBLIC;
REVOKE ALL ON TABLE public.invitations FROM PUBLIC;
REVOKE ALL ON TABLE public.family_events FROM PUBLIC;
REVOKE ALL ON TABLE public.schedule_items FROM PUBLIC;
REVOKE ALL ON TABLE public.reminders FROM PUBLIC;
REVOKE ALL ON TABLE public.activity_logs FROM PUBLIC;
REVOKE ALL ON TABLE public.notifications FROM PUBLIC;
REVOKE ALL ON TABLE public.gift_records FROM PUBLIC;
REVOKE ALL ON TABLE public.device_tokens FROM PUBLIC;

-- Standard tenant data tables: CRUD granted to API roles (strictly filtered by RLS policies)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.people TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.invitations TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.family_events TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.schedule_items TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reminders TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.activity_logs TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notifications TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.gift_records TO anon, authenticated, service_role;

-- Account tables: INSERT allowed for registration, SELECT/UPDATE/DELETE governed by RLS
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vip_users TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_accounts TO anon, authenticated, service_role;

-- Device Tokens: REVOKE direct table write permissions from anon and authenticated!
-- All token mutations MUST go through hardened, row-locked RPCs.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.device_tokens FROM anon, authenticated, PUBLIC;
GRANT SELECT ON TABLE public.device_tokens TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.device_tokens TO service_role;

-- ------------------------------------------------------------------------------
-- 3. RLS Policies: Tenant Scoped Data Tables
-- ------------------------------------------------------------------------------

-- ── people ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "people_isolated_select" ON public.people;
CREATE POLICY "people_isolated_select" ON public.people
FOR SELECT TO anon, authenticated
USING (vip_id = public.get_auth_vip_id());

DROP POLICY IF EXISTS "people_isolated_insert" ON public.people;
CREATE POLICY "people_isolated_insert" ON public.people
FOR INSERT TO anon, authenticated
WITH CHECK (vip_id = public.get_auth_vip_id());

DROP POLICY IF EXISTS "people_isolated_update" ON public.people;
CREATE POLICY "people_isolated_update" ON public.people
FOR UPDATE TO anon, authenticated
USING (vip_id = public.get_auth_vip_id())
WITH CHECK (vip_id = public.get_auth_vip_id());

DROP POLICY IF EXISTS "people_isolated_delete" ON public.people;
CREATE POLICY "people_isolated_delete" ON public.people
FOR DELETE TO anon, authenticated
USING (vip_id = public.get_auth_vip_id());

-- ── invitations ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "invitations_isolated_select" ON public.invitations;
CREATE POLICY "invitations_isolated_select" ON public.invitations
FOR SELECT TO anon, authenticated
USING (vip_id = public.get_auth_vip_id());

DROP POLICY IF EXISTS "invitations_isolated_insert" ON public.invitations;
CREATE POLICY "invitations_isolated_insert" ON public.invitations
FOR INSERT TO anon, authenticated
WITH CHECK (vip_id = public.get_auth_vip_id());

DROP POLICY IF EXISTS "invitations_isolated_update" ON public.invitations;
CREATE POLICY "invitations_isolated_update" ON public.invitations
FOR UPDATE TO anon, authenticated
USING (vip_id = public.get_auth_vip_id())
WITH CHECK (vip_id = public.get_auth_vip_id());

DROP POLICY IF EXISTS "invitations_isolated_delete" ON public.invitations;
CREATE POLICY "invitations_isolated_delete" ON public.invitations
FOR DELETE TO anon, authenticated
USING (vip_id = public.get_auth_vip_id());

-- ── family_events ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "family_events_isolated_select" ON public.family_events;
CREATE POLICY "family_events_isolated_select" ON public.family_events
FOR SELECT TO anon, authenticated
USING (vip_id = public.get_auth_vip_id());

DROP POLICY IF EXISTS "family_events_isolated_insert" ON public.family_events;
CREATE POLICY "family_events_isolated_insert" ON public.family_events
FOR INSERT TO anon, authenticated
WITH CHECK (vip_id = public.get_auth_vip_id());

DROP POLICY IF EXISTS "family_events_isolated_update" ON public.family_events;
CREATE POLICY "family_events_isolated_update" ON public.family_events
FOR UPDATE TO anon, authenticated
USING (vip_id = public.get_auth_vip_id())
WITH CHECK (vip_id = public.get_auth_vip_id());

DROP POLICY IF EXISTS "family_events_isolated_delete" ON public.family_events;
CREATE POLICY "family_events_isolated_delete" ON public.family_events
FOR DELETE TO anon, authenticated
USING (vip_id = public.get_auth_vip_id());

-- ── schedule_items ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "schedule_items_isolated_select" ON public.schedule_items;
CREATE POLICY "schedule_items_isolated_select" ON public.schedule_items
FOR SELECT TO anon, authenticated
USING (vip_id = public.get_auth_vip_id());

DROP POLICY IF EXISTS "schedule_items_isolated_insert" ON public.schedule_items;
CREATE POLICY "schedule_items_isolated_insert" ON public.schedule_items
FOR INSERT TO anon, authenticated
WITH CHECK (vip_id = public.get_auth_vip_id());

DROP POLICY IF EXISTS "schedule_items_isolated_update" ON public.schedule_items;
CREATE POLICY "schedule_items_isolated_update" ON public.schedule_items
FOR UPDATE TO anon, authenticated
USING (vip_id = public.get_auth_vip_id())
WITH CHECK (vip_id = public.get_auth_vip_id());

DROP POLICY IF EXISTS "schedule_items_isolated_delete" ON public.schedule_items;
CREATE POLICY "schedule_items_isolated_delete" ON public.schedule_items
FOR DELETE TO anon, authenticated
USING (vip_id = public.get_auth_vip_id());

-- ── reminders ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "reminders_isolated_select" ON public.reminders;
CREATE POLICY "reminders_isolated_select" ON public.reminders
FOR SELECT TO anon, authenticated
USING (vip_id = public.get_auth_vip_id());

DROP POLICY IF EXISTS "reminders_isolated_insert" ON public.reminders;
CREATE POLICY "reminders_isolated_insert" ON public.reminders
FOR INSERT TO anon, authenticated
WITH CHECK (vip_id = public.get_auth_vip_id());

DROP POLICY IF EXISTS "reminders_isolated_update" ON public.reminders;
CREATE POLICY "reminders_isolated_update" ON public.reminders
FOR UPDATE TO anon, authenticated
USING (vip_id = public.get_auth_vip_id())
WITH CHECK (vip_id = public.get_auth_vip_id());

DROP POLICY IF EXISTS "reminders_isolated_delete" ON public.reminders;
CREATE POLICY "reminders_isolated_delete" ON public.reminders
FOR DELETE TO anon, authenticated
USING (vip_id = public.get_auth_vip_id());

-- ── activity_logs ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "activity_logs_isolated_select" ON public.activity_logs;
CREATE POLICY "activity_logs_isolated_select" ON public.activity_logs
FOR SELECT TO anon, authenticated
USING (vip_id = public.get_auth_vip_id());

DROP POLICY IF EXISTS "activity_logs_isolated_insert" ON public.activity_logs;
CREATE POLICY "activity_logs_isolated_insert" ON public.activity_logs
FOR INSERT TO anon, authenticated
WITH CHECK (vip_id = public.get_auth_vip_id());

DROP POLICY IF EXISTS "activity_logs_isolated_update" ON public.activity_logs;
CREATE POLICY "activity_logs_isolated_update" ON public.activity_logs
FOR UPDATE TO anon, authenticated
USING (vip_id = public.get_auth_vip_id())
WITH CHECK (vip_id = public.get_auth_vip_id());

DROP POLICY IF EXISTS "activity_logs_isolated_delete" ON public.activity_logs;
CREATE POLICY "activity_logs_isolated_delete" ON public.activity_logs
FOR DELETE TO anon, authenticated
USING (vip_id = public.get_auth_vip_id());

-- ── notifications ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "notifications_isolated_select" ON public.notifications;
CREATE POLICY "notifications_isolated_select" ON public.notifications
FOR SELECT TO anon, authenticated
USING (vip_id = public.get_auth_vip_id());

DROP POLICY IF EXISTS "notifications_isolated_insert" ON public.notifications;
CREATE POLICY "notifications_isolated_insert" ON public.notifications
FOR INSERT TO anon, authenticated
WITH CHECK (vip_id = public.get_auth_vip_id());

DROP POLICY IF EXISTS "notifications_isolated_update" ON public.notifications;
CREATE POLICY "notifications_isolated_update" ON public.notifications
FOR UPDATE TO anon, authenticated
USING (vip_id = public.get_auth_vip_id())
WITH CHECK (vip_id = public.get_auth_vip_id());

DROP POLICY IF EXISTS "notifications_isolated_delete" ON public.notifications;
CREATE POLICY "notifications_isolated_delete" ON public.notifications
FOR DELETE TO anon, authenticated
USING (vip_id = public.get_auth_vip_id());

-- ── gift_records ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "gift_records_isolated_select" ON public.gift_records;
CREATE POLICY "gift_records_isolated_select" ON public.gift_records
FOR SELECT TO anon, authenticated
USING (vip_id = public.get_auth_vip_id());

DROP POLICY IF EXISTS "gift_records_isolated_insert" ON public.gift_records;
CREATE POLICY "gift_records_isolated_insert" ON public.gift_records
FOR INSERT TO anon, authenticated
WITH CHECK (vip_id = public.get_auth_vip_id());

DROP POLICY IF EXISTS "gift_records_isolated_update" ON public.gift_records;
CREATE POLICY "gift_records_isolated_update" ON public.gift_records
FOR UPDATE TO anon, authenticated
USING (vip_id = public.get_auth_vip_id())
WITH CHECK (vip_id = public.get_auth_vip_id());

DROP POLICY IF EXISTS "gift_records_isolated_delete" ON public.gift_records;
CREATE POLICY "gift_records_isolated_delete" ON public.gift_records
FOR DELETE TO anon, authenticated
USING (vip_id = public.get_auth_vip_id());

-- ------------------------------------------------------------------------------
-- 4. RLS Policies: Accounts & Identity Tables
-- ------------------------------------------------------------------------------

-- ── vip_users ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "vip_users_isolated_select" ON public.vip_users;
CREATE POLICY "vip_users_isolated_select" ON public.vip_users
FOR SELECT TO anon, authenticated
USING (id = public.get_auth_vip_id());

-- Allows VIP initial profile registration when establishing new tenant
DROP POLICY IF EXISTS "vip_users_register_insert" ON public.vip_users;
CREATE POLICY "vip_users_register_insert" ON public.vip_users
FOR INSERT TO anon, authenticated
WITH CHECK (id = concat('vip_', lower(trim(username))));

DROP POLICY IF EXISTS "vip_users_isolated_update" ON public.vip_users;
CREATE POLICY "vip_users_isolated_update" ON public.vip_users
FOR UPDATE TO anon, authenticated
USING (id = public.get_auth_vip_id())
WITH CHECK (id = public.get_auth_vip_id());

DROP POLICY IF EXISTS "vip_users_isolated_delete" ON public.vip_users;
CREATE POLICY "vip_users_isolated_delete" ON public.vip_users
FOR DELETE TO anon, authenticated
USING (id = public.get_auth_vip_id());

-- ── user_accounts ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "user_accounts_isolated_select" ON public.user_accounts;
CREATE POLICY "user_accounts_isolated_select" ON public.user_accounts
FOR SELECT TO anon, authenticated
USING (vip_id = public.get_auth_vip_id());

-- Allows self-registration of VIP or Staff accounts
DROP POLICY IF EXISTS "user_accounts_register_insert" ON public.user_accounts;
CREATE POLICY "user_accounts_register_insert" ON public.user_accounts
FOR INSERT TO anon, authenticated
WITH CHECK (
  (role = 'vip' AND vip_id = concat('vip_', lower(trim(username))) AND approval_status = 'APPROVED')
  OR
  (role = 'staff' AND approval_status = 'PENDING_APPROVAL')
);

DROP POLICY IF EXISTS "user_accounts_scoped_update" ON public.user_accounts;
CREATE POLICY "user_accounts_scoped_update" ON public.user_accounts
FOR UPDATE TO anon, authenticated
USING (
  vip_id = public.get_auth_vip_id()
  AND (
    -- VIP Principal can manage staff accounts within their tenant
    EXISTS (
      SELECT 1 FROM public.user_accounts ua_caller
      WHERE ua_caller.username = public.get_auth_username()
        AND ua_caller.vip_id = public.get_auth_vip_id()
        AND ua_caller.role = 'vip'
    )
    OR
    -- Staff users can ONLY modify their own record
    (username = public.get_auth_username())
  )
)
WITH CHECK (
  vip_id = public.get_auth_vip_id()
  AND (
    -- VIP Principal can update accounts within their tenant
    EXISTS (
      SELECT 1 FROM public.user_accounts ua_caller
      WHERE ua_caller.username = public.get_auth_username()
        AND ua_caller.vip_id = public.get_auth_vip_id()
        AND ua_caller.role = 'vip'
    )
    OR
    -- Staff users cannot privilege-escalate (role remains staff)
    (username = public.get_auth_username() AND role = 'staff')
  )
);

DROP POLICY IF EXISTS "user_accounts_isolated_delete" ON public.user_accounts;
CREATE POLICY "user_accounts_isolated_delete" ON public.user_accounts
FOR DELETE TO anon, authenticated
USING (
  vip_id = public.get_auth_vip_id()
  AND (
    -- Only the VIP Principal can delete accounts within their tenant
    EXISTS (
      SELECT 1 FROM public.user_accounts ua_caller
      WHERE ua_caller.username = public.get_auth_username()
        AND ua_caller.vip_id = public.get_auth_vip_id()
        AND ua_caller.role = 'vip'
    )
    OR
    -- Users can delete their own account
    (username = public.get_auth_username())
  )
);

-- ── device_tokens ────────────────────────────────────────────────────────────
-- SELECT restricted strictly to caller's own verified username and VIP
DROP POLICY IF EXISTS "device_tokens_select_own" ON public.device_tokens;
CREATE POLICY "device_tokens_select_own" ON public.device_tokens
FOR SELECT TO anon, authenticated
USING (
  vip_id = public.get_auth_vip_id()
  AND username = public.get_auth_username()
);

COMMIT;

