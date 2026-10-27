-- ==============================================================================
-- Migration: Add gift_records table for Gift Given & Received Ledger
-- Date: 2026-10-11
-- ==============================================================================

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
    recipient_person_id TEXT REFERENCES public.people(id) ON DELETE SET NULL,
    gift_name TEXT NOT NULL,
    gift_category TEXT NOT NULL DEFAULT 'other',
    estimated_value NUMERIC,
    notes TEXT,
    created_by TEXT DEFAULT 'vip',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup indexes for queries and multi-tenant isolation
CREATE INDEX IF NOT EXISTS idx_gift_records_vip_id ON public.gift_records(vip_id);
CREATE INDEX IF NOT EXISTS idx_gift_records_event_id ON public.gift_records(event_id);
CREATE INDEX IF NOT EXISTS idx_gift_records_direction ON public.gift_records(direction);
CREATE INDEX IF NOT EXISTS idx_gift_records_date ON public.gift_records(event_date DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.gift_records ENABLE ROW LEVEL SECURITY;

-- Grant API permissions to roles used by Supabase client
GRANT ALL ON TABLE public.gift_records TO anon, authenticated, service_role;

-- Row Level Security (RLS) Policies scoped by VIP tenant isolation
DROP POLICY IF EXISTS "gift_records_isolated_select" ON public.gift_records;
CREATE POLICY "gift_records_isolated_select"
    ON public.gift_records FOR SELECT TO anon, authenticated
    USING (vip_id = public.get_auth_vip_id());

DROP POLICY IF EXISTS "gift_records_isolated_insert" ON public.gift_records;
CREATE POLICY "gift_records_isolated_insert"
    ON public.gift_records FOR INSERT TO anon, authenticated
    WITH CHECK (vip_id = public.get_auth_vip_id());

DROP POLICY IF EXISTS "gift_records_isolated_update" ON public.gift_records;
CREATE POLICY "gift_records_isolated_update"
    ON public.gift_records FOR UPDATE TO anon, authenticated
    USING (vip_id = public.get_auth_vip_id())
    WITH CHECK (vip_id = public.get_auth_vip_id());

DROP POLICY IF EXISTS "gift_records_isolated_delete" ON public.gift_records;
CREATE POLICY "gift_records_isolated_delete"
    ON public.gift_records FOR DELETE TO anon, authenticated
    USING (vip_id = public.get_auth_vip_id());
