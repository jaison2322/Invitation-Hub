-- ==============================================================================
-- 07_realtime_setup.sql
-- Invitation Hub Secure Database Rebuild — Migration Step 07
-- Purpose: Configure PostgreSQL Replica Identity and Supabase Realtime publication
--          for all 10 tenant-subscribed tables (including gift_records).
-- Target Environment: Staging ONLY (project ref: kdbkfmzsdinkvslvgson)
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. Set Replica Identity to FULL on All Subscribed Tables
-- ------------------------------------------------------------------------------
-- REPLICA IDENTITY FULL ensures that both old and new record payloads are delivered
-- in Realtime UPDATE and DELETE change events, enabling accurate client-side state synchronization.
ALTER TABLE public.user_accounts REPLICA IDENTITY FULL;
ALTER TABLE public.vip_users REPLICA IDENTITY FULL;
ALTER TABLE public.people REPLICA IDENTITY FULL;
ALTER TABLE public.invitations REPLICA IDENTITY FULL;
ALTER TABLE public.family_events REPLICA IDENTITY FULL;
ALTER TABLE public.schedule_items REPLICA IDENTITY FULL;
ALTER TABLE public.reminders REPLICA IDENTITY FULL;
ALTER TABLE public.activity_logs REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.gift_records REPLICA IDENTITY FULL;

-- ------------------------------------------------------------------------------
-- 2. Register All Application Tables in supabase_realtime Publication
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'user_accounts',
    'vip_users',
    'people',
    'invitations',
    'family_events',
    'schedule_items',
    'reminders',
    'activity_logs',
    'notifications',
    'gift_records'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = v_table
    ) THEN
      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
        RAISE NOTICE 'Added public.% to supabase_realtime publication.', v_table;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not add public.% to supabase_realtime: %', v_table, SQLERRM;
      END;
    ELSE
      RAISE NOTICE 'Table public.% is already in supabase_realtime publication.', v_table;
    END IF;
  END LOOP;
END;
$$;

COMMIT;

