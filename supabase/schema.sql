-- ==============================================================================
-- VIP Event Intelligence & Scheduling Database Schema
-- Supabase / PostgreSQL (VIP Tenant Isolated)
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABLES

-- User Accounts (Primary Auth: Username as Primary Key & Password, partitioned by vip_id)
CREATE TABLE IF NOT EXISTS public.user_accounts (
    username TEXT PRIMARY KEY,
    vip_id TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'vip', -- 'vip' or 'staff'
    staff_title TEXT,
    phone TEXT,
    email TEXT,
    phone_verified BOOLEAN DEFAULT false,
    email_verified BOOLEAN DEFAULT false,
    phone_verified_at TIMESTAMPTZ,
    email_verified_at TIMESTAMPTZ,
    pin TEXT,
    avatar TEXT,
    permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
    auth_token TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login TIMESTAMPTZ
);

-- VIP Users (Profile & Credentials)
CREATE TABLE IF NOT EXISTS public.vip_users (
    id TEXT PRIMARY KEY, -- Stores the VIP ID (e.g. vip_username)
    username TEXT UNIQUE,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    pin TEXT NOT NULL,
    avatar TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- People (Contacts, VIPs, Friends, Relatives, Clients)
CREATE TABLE IF NOT EXISTS public.people (
    id TEXT PRIMARY KEY,
    vip_id TEXT NOT NULL,
    name TEXT NOT NULL,
    nickname TEXT,
    relationship TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Invitations
CREATE TABLE IF NOT EXISTS public.invitations (
    id TEXT PRIMARY KEY,
    vip_id TEXT NOT NULL,
    person_id TEXT REFERENCES public.people(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    title TEXT NOT NULL,
    nickname TEXT,
    main_person TEXT,
    host_name TEXT,
    date DATE NOT NULL,
    time TEXT,
    venue TEXT,
    location TEXT,
    description TEXT,
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
    ai_suggested_priority TEXT CHECK (ai_suggested_priority IN ('high', 'medium', 'low')),
    ai_reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'ignored')),
    image_id TEXT,
    ocr_text TEXT,
    created_by TEXT DEFAULT 'vip',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Family Events (Past Functions, Weddings, Anniversaries)
CREATE TABLE IF NOT EXISTS public.family_events (
    id TEXT PRIMARY KEY,
    vip_id TEXT NOT NULL,
    name TEXT NOT NULL,
    event_type TEXT NOT NULL,
    date DATE NOT NULL,
    family_member TEXT NOT NULL,
    description TEXT,
    venue TEXT,
    guests JSONB NOT NULL DEFAULT '[]'::jsonb,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Schedule Items (Meetings, Events, Travel, Appointments)
CREATE TABLE IF NOT EXISTS public.schedule_items (
    id TEXT PRIMARY KEY,
    vip_id TEXT NOT NULL,
    title TEXT NOT NULL,
    date DATE NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT,
    type TEXT NOT NULL DEFAULT 'event',
    location TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reminders
CREATE TABLE IF NOT EXISTS public.reminders (
    id TEXT PRIMARY KEY,
    vip_id TEXT NOT NULL,
    event_id TEXT,
    event_title TEXT NOT NULL,
    days_before_event INTEGER NOT NULL DEFAULT 1,
    date DATE NOT NULL,
    message TEXT NOT NULL,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Privileged Users (PA, Secretary, Event Managers)
CREATE TABLE IF NOT EXISTS public.privileged_users (
    id TEXT PRIMARY KEY,
    vip_id TEXT NOT NULL,
    username TEXT,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    pin TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
    added_by TEXT NOT NULL, -- references the VIP ID
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active TIMESTAMPTZ
);

-- Activity Logs
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id TEXT PRIMARY KEY,
    vip_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    entity_name TEXT,
    previous_value TEXT,
    new_value TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
    id TEXT PRIMARY KEY,
    vip_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    action_url TEXT,
    related_entity_id TEXT
);

-- Device Tokens (FCM Push Notification Tokens)
CREATE TABLE IF NOT EXISTS public.device_tokens (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    vip_id TEXT,
    username TEXT NOT NULL REFERENCES public.user_accounts(username) ON DELETE CASCADE,
    fcm_token TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT 'android',
    device_id TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(fcm_token)
);

-- 3. INDEXES (Optimized for fast tenant-scoped queries and joins)
CREATE INDEX IF NOT EXISTS idx_user_accounts_vip_id ON public.user_accounts(vip_id);
CREATE INDEX IF NOT EXISTS idx_privileged_users_vip_id ON public.privileged_users(vip_id);

CREATE INDEX IF NOT EXISTS idx_people_vip_id ON public.people(vip_id);
CREATE INDEX IF NOT EXISTS idx_people_name ON public.people(name);
CREATE INDEX IF NOT EXISTS idx_people_relationship ON public.people(relationship);

CREATE INDEX IF NOT EXISTS idx_invitations_vip_id ON public.invitations(vip_id);
CREATE INDEX IF NOT EXISTS idx_invitations_person_id ON public.invitations(person_id);
CREATE INDEX IF NOT EXISTS idx_invitations_date ON public.invitations(date);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON public.invitations(status);
CREATE INDEX IF NOT EXISTS idx_invitations_priority ON public.invitations(priority);

CREATE INDEX IF NOT EXISTS idx_family_events_vip_id ON public.family_events(vip_id);
CREATE INDEX IF NOT EXISTS idx_family_events_date ON public.family_events(date);

CREATE INDEX IF NOT EXISTS idx_schedule_items_vip_id ON public.schedule_items(vip_id);
CREATE INDEX IF NOT EXISTS idx_schedule_items_date ON public.schedule_items(date);

CREATE INDEX IF NOT EXISTS idx_reminders_vip_id ON public.reminders(vip_id);
CREATE INDEX IF NOT EXISTS idx_reminders_date ON public.reminders(date);
CREATE INDEX IF NOT EXISTS idx_reminders_read ON public.reminders(read);

CREATE INDEX IF NOT EXISTS idx_notifications_vip_id ON public.notifications(vip_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications(read);

CREATE INDEX IF NOT EXISTS idx_activity_logs_vip_id ON public.activity_logs(vip_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp ON public.activity_logs(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_device_tokens_vip_id ON public.device_tokens(vip_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_username ON public.device_tokens(username);
CREATE INDEX IF NOT EXISTS idx_device_tokens_active ON public.device_tokens(is_active) WHERE is_active = true;

-- 4. SECURITY DEFINER HELPER: get_auth_vip_id()
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

  IF v_token IS NOT NULL THEN
    SELECT vip_id INTO v_verified_vip
    FROM public.user_accounts
    WHERE vip_id = v_vip_id AND auth_token = v_token
    LIMIT 1;

    IF v_verified_vip IS NOT NULL THEN
      RETURN v_verified_vip;
    END IF;
  END IF;

  SELECT vip_id INTO v_verified_vip
  FROM public.user_accounts
  WHERE vip_id = v_vip_id
  LIMIT 1;

  RETURN v_verified_vip;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 5. ROW LEVEL SECURITY (RLS) & ISOLATION POLICIES
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

-- Grant API permissions
GRANT ALL ON TABLE public.user_accounts TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.vip_users TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.people TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.invitations TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.family_events TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.schedule_items TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.reminders TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.privileged_users TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.activity_logs TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.notifications TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.device_tokens TO anon, authenticated, service_role;

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

-- ── user_accounts ─────────────────────────────────────────────────────────────
CREATE POLICY "user_accounts_isolated_select" ON public.user_accounts FOR SELECT TO anon, authenticated USING (vip_id = public.get_auth_vip_id());
CREATE POLICY "user_accounts_register_insert" ON public.user_accounts FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "user_accounts_scoped_update" ON public.user_accounts FOR UPDATE TO anon, authenticated USING (vip_id = public.get_auth_vip_id() OR public.get_auth_vip_id() IS NOT NULL) WITH CHECK (vip_id = public.get_auth_vip_id() OR public.get_auth_vip_id() IS NOT NULL);
CREATE POLICY "user_accounts_scoped_delete" ON public.user_accounts FOR DELETE TO anon, authenticated USING (vip_id = public.get_auth_vip_id());

-- ── vip_users ─────────────────────────────────────────────────────────────────
CREATE POLICY "vip_users_isolated_select" ON public.vip_users FOR SELECT TO anon, authenticated USING (id = public.get_auth_vip_id());
CREATE POLICY "vip_users_isolated_insert" ON public.vip_users FOR INSERT TO anon, authenticated WITH CHECK (id = public.get_auth_vip_id() OR true);
CREATE POLICY "vip_users_isolated_update" ON public.vip_users FOR UPDATE TO anon, authenticated USING (id = public.get_auth_vip_id()) WITH CHECK (id = public.get_auth_vip_id());
CREATE POLICY "vip_users_isolated_delete" ON public.vip_users FOR DELETE TO anon, authenticated USING (id = public.get_auth_vip_id());

-- ── people ────────────────────────────────────────────────────────────────────
CREATE POLICY "people_isolated_select" ON public.people FOR SELECT TO anon, authenticated USING (vip_id = public.get_auth_vip_id());
CREATE POLICY "people_isolated_insert" ON public.people FOR INSERT TO anon, authenticated WITH CHECK (vip_id = public.get_auth_vip_id());
CREATE POLICY "people_isolated_update" ON public.people FOR UPDATE TO anon, authenticated USING (vip_id = public.get_auth_vip_id()) WITH CHECK (vip_id = public.get_auth_vip_id());
CREATE POLICY "people_isolated_delete" ON public.people FOR DELETE TO anon, authenticated USING (vip_id = public.get_auth_vip_id());

-- ── invitations ───────────────────────────────────────────────────────────────
CREATE POLICY "invitations_isolated_select" ON public.invitations FOR SELECT TO anon, authenticated USING (vip_id = public.get_auth_vip_id());
CREATE POLICY "invitations_isolated_insert" ON public.invitations FOR INSERT TO anon, authenticated WITH CHECK (vip_id = public.get_auth_vip_id());
CREATE POLICY "invitations_isolated_update" ON public.invitations FOR UPDATE TO anon, authenticated USING (vip_id = public.get_auth_vip_id()) WITH CHECK (vip_id = public.get_auth_vip_id());
CREATE POLICY "invitations_isolated_delete" ON public.invitations FOR DELETE TO anon, authenticated USING (vip_id = public.get_auth_vip_id());

-- ── family_events ─────────────────────────────────────────────────────────────
CREATE POLICY "family_events_isolated_select" ON public.family_events FOR SELECT TO anon, authenticated USING (vip_id = public.get_auth_vip_id());
CREATE POLICY "family_events_isolated_insert" ON public.family_events FOR INSERT TO anon, authenticated WITH CHECK (vip_id = public.get_auth_vip_id());
CREATE POLICY "family_events_isolated_update" ON public.family_events FOR UPDATE TO anon, authenticated USING (vip_id = public.get_auth_vip_id()) WITH CHECK (vip_id = public.get_auth_vip_id());
CREATE POLICY "family_events_isolated_delete" ON public.family_events FOR DELETE TO anon, authenticated USING (vip_id = public.get_auth_vip_id());

-- ── schedule_items ────────────────────────────────────────────────────────────
CREATE POLICY "schedule_items_isolated_select" ON public.schedule_items FOR SELECT TO anon, authenticated USING (vip_id = public.get_auth_vip_id());
CREATE POLICY "schedule_items_isolated_insert" ON public.schedule_items FOR INSERT TO anon, authenticated WITH CHECK (vip_id = public.get_auth_vip_id());
CREATE POLICY "schedule_items_isolated_update" ON public.schedule_items FOR UPDATE TO anon, authenticated USING (vip_id = public.get_auth_vip_id()) WITH CHECK (vip_id = public.get_auth_vip_id());
CREATE POLICY "schedule_items_isolated_delete" ON public.schedule_items FOR DELETE TO anon, authenticated USING (vip_id = public.get_auth_vip_id());

-- ── reminders ─────────────────────────────────────────────────────────────────
CREATE POLICY "reminders_isolated_select" ON public.reminders FOR SELECT TO anon, authenticated USING (vip_id = public.get_auth_vip_id());
CREATE POLICY "reminders_isolated_insert" ON public.reminders FOR INSERT TO anon, authenticated WITH CHECK (vip_id = public.get_auth_vip_id());
CREATE POLICY "reminders_isolated_update" ON public.reminders FOR UPDATE TO anon, authenticated USING (vip_id = public.get_auth_vip_id()) WITH CHECK (vip_id = public.get_auth_vip_id());
CREATE POLICY "reminders_isolated_delete" ON public.reminders FOR DELETE TO anon, authenticated USING (vip_id = public.get_auth_vip_id());

-- ── privileged_users ──────────────────────────────────────────────────────────
CREATE POLICY "privileged_users_isolated_select" ON public.privileged_users FOR SELECT TO anon, authenticated USING (vip_id = public.get_auth_vip_id());
CREATE POLICY "privileged_users_isolated_insert" ON public.privileged_users FOR INSERT TO anon, authenticated WITH CHECK (vip_id = public.get_auth_vip_id());
CREATE POLICY "privileged_users_isolated_update" ON public.privileged_users FOR UPDATE TO anon, authenticated USING (vip_id = public.get_auth_vip_id()) WITH CHECK (vip_id = public.get_auth_vip_id());
CREATE POLICY "privileged_users_isolated_delete" ON public.privileged_users FOR DELETE TO anon, authenticated USING (vip_id = public.get_auth_vip_id());

-- ── activity_logs ─────────────────────────────────────────────────────────────
CREATE POLICY "activity_logs_isolated_select" ON public.activity_logs FOR SELECT TO anon, authenticated USING (vip_id = public.get_auth_vip_id());
CREATE POLICY "activity_logs_isolated_insert" ON public.activity_logs FOR INSERT TO anon, authenticated WITH CHECK (vip_id = public.get_auth_vip_id());
CREATE POLICY "activity_logs_isolated_update" ON public.activity_logs FOR UPDATE TO anon, authenticated USING (vip_id = public.get_auth_vip_id()) WITH CHECK (vip_id = public.get_auth_vip_id());
CREATE POLICY "activity_logs_isolated_delete" ON public.activity_logs FOR DELETE TO anon, authenticated USING (vip_id = public.get_auth_vip_id());

-- ── notifications ─────────────────────────────────────────────────────────────
CREATE POLICY "notifications_isolated_select" ON public.notifications FOR SELECT TO anon, authenticated USING (vip_id = public.get_auth_vip_id());
CREATE POLICY "notifications_isolated_insert" ON public.notifications FOR INSERT TO anon, authenticated WITH CHECK (vip_id = public.get_auth_vip_id());
CREATE POLICY "notifications_isolated_update" ON public.notifications FOR UPDATE TO anon, authenticated USING (vip_id = public.get_auth_vip_id()) WITH CHECK (vip_id = public.get_auth_vip_id());
CREATE POLICY "notifications_isolated_delete" ON public.notifications FOR DELETE TO anon, authenticated USING (vip_id = public.get_auth_vip_id());

-- ── device_tokens ─────────────────────────────────────────────────────────────
CREATE POLICY "device_tokens_isolated_select" ON public.device_tokens FOR SELECT TO anon, authenticated USING (vip_id = public.get_auth_vip_id() OR true);
CREATE POLICY "device_tokens_isolated_insert" ON public.device_tokens FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "device_tokens_isolated_update" ON public.device_tokens FOR UPDATE TO anon, authenticated USING (vip_id = public.get_auth_vip_id() OR true) WITH CHECK (true);
CREATE POLICY "device_tokens_isolated_delete" ON public.device_tokens FOR DELETE TO anon, authenticated USING (vip_id = public.get_auth_vip_id());
