-- ==============================================================================
-- Migration: 2026102601_secure_get_auth_vip_id.sql
-- Fix: Invitation Hub Production Fix P0-1
-- Description:
--   Secures public.get_auth_vip_id() by completely removing the insecure
--   fallback that returned a VIP merely because x-vip-id was provided in request
--   headers.
--
-- Security Rules Enforced:
--   1. Both x-vip-id and x-user-token headers are strictly mandatory.
--   2. The provided x-user-token must match an active account in public.user_accounts
--      belonging to the requested x-vip-id tenant.
--   3. Only VIP accounts (role = 'vip') or APPROVED staff accounts (role = 'staff'
--      AND approval_status = 'APPROVED') are authorized.
--   4. Pending or rejected staff, expired/invalid tokens, cross-tenant spoofing
--      attempts (VIP A accessing VIP B, or Staff of VIP A accessing VIP B), and
--      requests with missing tokens return NULL immediately (0 rows visible under RLS).
-- ==============================================================================

-- 1. Create or replace the secured get_auth_vip_id() function
CREATE OR REPLACE FUNCTION public.get_auth_vip_id()
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
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

  v_vip_id := NULLIF(trim(v_headers->>'x-vip-id'), '');
  v_token := NULLIF(trim(v_headers->>'x-user-token'), '');

  -- Insecure fallback based on x-vip-id alone is completely removed.
  -- Both x-vip-id and x-user-token are strictly required.
  IF v_vip_id IS NULL OR v_token IS NULL THEN
    RETURN NULL;
  END IF;

  -- Verify token against user_accounts:
  -- - Must match the requested tenant's vip_id
  -- - Must match the user's active auth_token
  -- - Must be a VIP account (role = 'vip') OR an approved staff account (role = 'staff' AND approval_status = 'APPROVED')
  -- - Pending or rejected staff, mismatched tokens, or invalid tokens return NULL
  SELECT vip_id INTO v_verified_vip
  FROM public.user_accounts
  WHERE vip_id = v_vip_id
    AND auth_token = v_token
    AND (
      role = 'vip'
      OR (role = 'staff' AND approval_status = 'APPROVED')
    )
  LIMIT 1;

  RETURN v_verified_vip;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$function$;

-- 2. Explicit grants
REVOKE ALL ON FUNCTION public.get_auth_vip_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auth_vip_id() TO anon, authenticated, service_role;

-- 3. Composite performance index for high-frequency RLS evaluations
CREATE INDEX IF NOT EXISTS idx_user_accounts_vip_token 
ON public.user_accounts(vip_id, auth_token);

-- 4. Tighten user_accounts RLS update policy to prevent cross-tenant modifications
DROP POLICY IF EXISTS "user_accounts_scoped_update" ON public.user_accounts;
CREATE POLICY "user_accounts_scoped_update" ON public.user_accounts
FOR UPDATE TO anon, authenticated
USING (vip_id = public.get_auth_vip_id())
WITH CHECK (vip_id = public.get_auth_vip_id());
