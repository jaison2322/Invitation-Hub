-- ==============================================================================
-- 01_core_tables_and_constraints.sql
-- Invitation Hub Secure Database Rebuild — Migration Step 01
-- Purpose: Complete, coherent DDL for all 11 application tables with proper
--          primary keys, composite tenant foreign keys, check constraints,
--          and performance indexes.
-- Target Environment: Staging ONLY (project ref: kdbkfmzsdinkvslvgson)
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. VIP Users (Tenant Ownership & Profile Table)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vip_users (
    id TEXT PRIMARY KEY,                       -- Tenant ID (e.g. 'vip_jaison')
    username TEXT UNIQUE NOT NULL,             -- Unique alphanumeric VIP username
    name TEXT NOT NULL,                        -- VIP display name
    phone TEXT,                                -- Contact phone (stored as contact info only; no OTP)
    email TEXT,                                -- Contact email
    pin TEXT DEFAULT '1234',                   -- Legacy PIN compatibility
    avatar TEXT,                               -- Avatar image URL
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 2. User Accounts (Primary Authentication & Credential Table)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_accounts (
    username TEXT PRIMARY KEY,                 -- Unique account handle (case-insensitive)
    vip_id TEXT NOT NULL,                      -- Multi-tenant partition key
    password_hash TEXT NOT NULL,               -- Lowercase hex SHA-256 password hash
    name TEXT NOT NULL,                        -- User display name
    role TEXT NOT NULL DEFAULT 'vip' CHECK (role IN ('vip', 'staff')),
    staff_title TEXT,                          -- e.g. 'Personal Assistant'
    target_vip_username TEXT,                  -- VIP username this staff member assists
    approval_status TEXT NOT NULL DEFAULT 'APPROVED' CHECK (approval_status IN ('APPROVED', 'PENDING_APPROVAL', 'REJECTED')),
    phone TEXT,                                -- Contact phone (no OTP requirement)
    email TEXT,                                -- Contact email
    phone_verified BOOLEAN NOT NULL DEFAULT true, -- Phone OTP deprecated; defaults to true
    email_verified BOOLEAN NOT NULL DEFAULT false,
    phone_verified_at TIMESTAMPTZ,
    email_verified_at TIMESTAMPTZ,
    pin TEXT,                                  -- Legacy PIN compatibility
    avatar TEXT,
    permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
    auth_token TEXT,                           -- Active session token for PostgREST requests
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login TIMESTAMPTZ,
    CONSTRAINT uq_user_accounts_tenant UNIQUE (username, vip_id)
);

CREATE INDEX IF NOT EXISTS idx_user_accounts_vip_id ON public.user_accounts(vip_id);
CREATE INDEX IF NOT EXISTS idx_user_accounts_vip_token ON public.user_accounts(vip_id, auth_token);
CREATE INDEX IF NOT EXISTS idx_user_accounts_role ON public.user_accounts(role);
CREATE INDEX IF NOT EXISTS idx_user_accounts_target_vip ON public.user_accounts(target_vip_username) WHERE target_vip_username IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_accounts_approval ON public.user_accounts(vip_id, approval_status);

-- ------------------------------------------------------------------------------
-- 3. People (Contacts, Friends, Relatives, VIPs, Dignitaries)
-- Schema matches existing application contract (Person interface)
-- ------------------------------------------------------------------------------
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
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_people_tenant UNIQUE (id, vip_id)
);

CREATE INDEX IF NOT EXISTS idx_people_vip_id ON public.people(vip_id);
CREATE INDEX IF NOT EXISTS idx_people_vip_name ON public.people(vip_id, name);

-- ------------------------------------------------------------------------------
-- 4. Invitations (Events, Functions, AI-Scanned Cards)
-- Enforces composite foreign key to people: person MUST belong to the same VIP
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invitations (
    id TEXT PRIMARY KEY,
    vip_id TEXT NOT NULL,
    person_id TEXT,
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
    image_url TEXT,
    ocr_text TEXT,
    created_by TEXT DEFAULT 'vip',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_invitations_tenant UNIQUE (id, vip_id),
    CONSTRAINT fk_invitations_person FOREIGN KEY (person_id, vip_id)
        REFERENCES public.people(id, vip_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_invitations_vip_id ON public.invitations(vip_id);
CREATE INDEX IF NOT EXISTS idx_invitations_date ON public.invitations(vip_id, date);
CREATE INDEX IF NOT EXISTS idx_invitations_person_tenant ON public.invitations(person_id, vip_id);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON public.invitations(vip_id, status);
CREATE INDEX IF NOT EXISTS idx_invitations_priority ON public.invitations(vip_id, priority);

-- ------------------------------------------------------------------------------
-- 5. Family Events (Past & Recurring Family Functions, Anniversaries)
-- ------------------------------------------------------------------------------
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
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_family_events_tenant UNIQUE (id, vip_id)
);

CREATE INDEX IF NOT EXISTS idx_family_events_vip_id ON public.family_events(vip_id);
CREATE INDEX IF NOT EXISTS idx_family_events_date ON public.family_events(vip_id, date);

-- ------------------------------------------------------------------------------
-- 6. Schedule Items (Meetings, Protocol Travel, Appointments)
-- ------------------------------------------------------------------------------
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_schedule_items_tenant UNIQUE (id, vip_id)
);

CREATE INDEX IF NOT EXISTS idx_schedule_items_vip_id ON public.schedule_items(vip_id);
CREATE INDEX IF NOT EXISTS idx_schedule_items_date ON public.schedule_items(vip_id, date);

-- ------------------------------------------------------------------------------
-- 7. Reminders (Alert Timers for Upcoming Functions)
-- ------------------------------------------------------------------------------
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_reminders_tenant UNIQUE (id, vip_id)
);

CREATE INDEX IF NOT EXISTS idx_reminders_vip_id ON public.reminders(vip_id);
CREATE INDEX IF NOT EXISTS idx_reminders_date ON public.reminders(vip_id, date);
CREATE INDEX IF NOT EXISTS idx_reminders_read ON public.reminders(vip_id, read) WHERE read = false;

-- ------------------------------------------------------------------------------
-- 8. Activity Logs (Tenant-Scoped Audit Trail)
-- ------------------------------------------------------------------------------
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
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_activity_logs_tenant UNIQUE (id, vip_id)
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_vip_id ON public.activity_logs(vip_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp ON public.activity_logs(vip_id, timestamp DESC);

-- ------------------------------------------------------------------------------
-- 9. Notifications (In-App & Push Notification Event Records)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
    id TEXT PRIMARY KEY,
    vip_id TEXT NOT NULL,
    type TEXT NOT NULL,                        -- 'change_alert', 'new_invitation', 'reminder', 'system', 'staff_request'
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    action_url TEXT,
    related_entity_id TEXT,
    CONSTRAINT uq_notifications_tenant UNIQUE (id, vip_id)
);

CREATE INDEX IF NOT EXISTS idx_notifications_vip_id ON public.notifications(vip_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(vip_id, read) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_timestamp ON public.notifications(vip_id, timestamp DESC);

-- ------------------------------------------------------------------------------
-- 10. Gift Records (Gift Given & Received Ledger)
-- Enforces composite foreign key to people: recipient MUST belong to same VIP
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gift_records (
    id TEXT PRIMARY KEY,
    vip_id TEXT NOT NULL,
    direction TEXT NOT NULL DEFAULT 'given' CHECK (direction IN ('received', 'given')),
    event_id TEXT NOT NULL,
    event_title TEXT NOT NULL,
    event_date DATE NOT NULL,
    event_type TEXT,
    event_venue TEXT,
    recipient_name TEXT,
    recipient_person_id TEXT,
    gift_name TEXT NOT NULL,
    gift_category TEXT NOT NULL DEFAULT 'other',
    estimated_value NUMERIC,
    notes TEXT,
    created_by TEXT DEFAULT 'vip',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_gift_records_tenant UNIQUE (id, vip_id),
    CONSTRAINT fk_gift_records_person FOREIGN KEY (recipient_person_id, vip_id)
        REFERENCES public.people(id, vip_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_gift_records_vip_id ON public.gift_records(vip_id);
CREATE INDEX IF NOT EXISTS idx_gift_records_direction ON public.gift_records(vip_id, direction);
CREATE INDEX IF NOT EXISTS idx_gift_records_date ON public.gift_records(vip_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_gift_records_recipient_tenant ON public.gift_records(recipient_person_id, vip_id);

-- ------------------------------------------------------------------------------
-- 11. Device Tokens (Firebase Cloud Messaging Push Tokens)
-- Enforces composite foreign key to user_accounts: user MUST belong to same VIP
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.device_tokens (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    vip_id TEXT NOT NULL,
    username TEXT NOT NULL,
    fcm_token TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT 'android',
    device_id TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_device_tokens_fcm_token UNIQUE(fcm_token),
    CONSTRAINT fk_device_tokens_user FOREIGN KEY (username, vip_id)
        REFERENCES public.user_accounts(username, vip_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_vip_user ON public.device_tokens(vip_id, username);
CREATE INDEX IF NOT EXISTS idx_device_tokens_active_vip ON public.device_tokens(vip_id, is_active) WHERE is_active = true;

COMMIT;
