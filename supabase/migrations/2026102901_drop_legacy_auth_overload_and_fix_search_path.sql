-- ==============================================================================
-- Migration: 2026102901_drop_legacy_auth_overload_and_fix_search_path.sql
-- Security Hardening: Drop legacy unauthenticated update_user_auth_token overload
-- and lock mutable search paths on public functions.
-- Target Environment: Production & Staging
-- ==============================================================================

BEGIN;

-- 1. Drop the legacy 3-parameter overload that lacked password verification
DROP FUNCTION IF EXISTS public.update_user_auth_token(text, text, text);

-- 2. Lock search path on sensitive public functions to prevent search_path hijacking
ALTER FUNCTION public.register_vip_principal(text, text, text, text, text, text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.check_vip_principal_exists(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_new_notification() SET search_path = public, pg_temp;

COMMIT;

