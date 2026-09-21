-- ==============================================================================
-- VIP EVENT INTELLIGENCE - CLEAR ALL TABLE DATA
-- Supabase PostgreSQL Script
-- ==============================================================================
-- INSTRUCTIONS:
-- 1. Open your Supabase project: https://supabase.com/dashboard/project/lliowikzustvebudgsoy/sql/new
-- 2. Paste this entire script into the SQL Editor
-- 3. Click "RUN" (or press Ctrl + Enter / Cmd + Enter)
-- ==============================================================================

-- Option 1 (Recommended): Fast TRUNCATE all public tables and reset sequences
TRUNCATE TABLE 
    public.device_tokens,
    public.notifications,
    public.activity_logs,
    public.reminders,
    public.schedule_items,
    public.family_events,
    public.invitations,
    public.people,
    public.privileged_users,
    public.vip_users,
    public.user_accounts
RESTART IDENTITY CASCADE;

-- Verification: Check that all tables are now 0 rows
SELECT 
    (SELECT COUNT(*) FROM public.user_accounts) AS user_accounts_count,
    (SELECT COUNT(*) FROM public.vip_users) AS vip_users_count,
    (SELECT COUNT(*) FROM public.privileged_users) AS privileged_users_count,
    (SELECT COUNT(*) FROM public.people) AS people_count,
    (SELECT COUNT(*) FROM public.invitations) AS invitations_count,
    (SELECT COUNT(*) FROM public.family_events) AS family_events_count,
    (SELECT COUNT(*) FROM public.schedule_items) AS schedule_items_count,
    (SELECT COUNT(*) FROM public.reminders) AS reminders_count,
    (SELECT COUNT(*) FROM public.activity_logs) AS activity_logs_count,
    (SELECT COUNT(*) FROM public.notifications) AS notifications_count,
    (SELECT COUNT(*) FROM public.device_tokens) AS device_tokens_count;
