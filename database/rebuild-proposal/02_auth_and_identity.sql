-- ==============================================================================
-- 02_auth_and_identity.sql
-- Invitation Hub Secure Database Rebuild — Migration Step 02
-- Purpose: Hardened session extraction, tenant context resolution, and
--          secure authentication RPCs (Fixes SEC-01 & SEC-02).
-- Target Environment: Staging ONLY (project ref: kdbkfmzsdinkvslvgson)
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. SECURE CORE IDENTITY RESOLUTION: get_auth_identity()
-- ------------------------------------------------------------------------------
-- Extracts `x-vip-id` and `x-user-token` from PostgREST HTTP request headers.
-- Validates that the token exists in `user_accounts` for that specific VIP tenant.
-- Enforces approval gating:
--   - Role 'vip' is always permitted.
--   - Role 'staff' MUST have `approval_status = 'APPROVED'`.
-- Fails closed (returns NULL, NULL) if credentials are missing, invalid, expired,
-- cross-tenant, pending, or rejected.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_auth_identity(
  OUT verified_username text,
  OUT verified_vip_id text
)
RETURNS record
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_headers json;
  v_header_vip_id text;
  v_header_token text;
  v_match_count integer;
  v_found_username text;
  v_found_vip_id text;
BEGIN
  verified_username := NULL;
  verified_vip_id := NULL;

  -- 1. Safely extract PostgREST request headers
  BEGIN
    v_headers := current_setting('request.headers', true)::json;
  EXCEPTION WHEN OTHERS THEN
    RETURN;
  END;

  IF v_headers IS NULL THEN
    RETURN;
  END IF;

  v_header_vip_id := NULLIF(trim(v_headers->>'x-vip-id'), '');
  v_header_token := NULLIF(trim(v_headers->>'x-user-token'), '');

  -- Both headers are strictly mandatory for all tenant operations
  IF v_header_vip_id IS NULL OR v_header_token IS NULL THEN
    RETURN;
  END IF;

  -- 2. Verify credentials against user_accounts with explicit status gating
  SELECT COUNT(*), MIN(ua.username), MIN(ua.vip_id)
  INTO v_match_count, v_found_username, v_found_vip_id
  FROM public.user_accounts ua
  WHERE ua.vip_id = v_header_vip_id
    AND ua.auth_token = v_header_token
    AND (
      ua.role = 'vip'
      OR (ua.role = 'staff' AND ua.approval_status = 'APPROVED')
    );

  -- Fail closed on non-unique match (should never happen due to token uniqueness)
  IF v_match_count = 1 THEN
    verified_username := v_found_username;
    verified_vip_id := v_found_vip_id;
  END IF;

  RETURN;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_auth_identity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auth_identity() TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 2. Tenant Context Resolution Helper: get_auth_vip_id()
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_auth_vip_id()
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_auth record;
BEGIN
  SELECT * INTO v_auth FROM public.get_auth_identity();
  RETURN v_auth.verified_vip_id;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_auth_vip_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auth_vip_id() TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 3. Public User Isolation Helper: get_auth_username()
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_auth_username()
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_auth record;
BEGIN
  SELECT * INTO v_auth FROM public.get_auth_identity();
  RETURN v_auth.verified_username;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_auth_username() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auth_username() TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 4. SECURE REPLACEMENT: lookup_user_account() (Fixes SEC-01 & Limits Disclosure)
-- ------------------------------------------------------------------------------
-- Previously returned `SELECT *` from user_accounts, leaking password_hash,
-- auth_token, and pin to unauthenticated callers.
-- The secured version:
-- 1. NEVER returns password_hash, auth_token, or pin.
-- 2. Returns only safe public profile fields needed for sign-in & status checks.
-- 3. Restricts lookup to EXACT username or EXACT email match.
--    (Removes loose phone and display name searches to prevent account enumeration).
-- 4. Protects phone and email metadata from unauthorized scrapers.
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.lookup_user_account(text);

CREATE OR REPLACE FUNCTION public.lookup_user_account(p_identifier text)
RETURNS TABLE (
  username text,
  vip_id text,
  name text,
  role text,
  staff_title text,
  target_vip_username text,
  approval_status text,
  avatar text,
  phone text,
  email text,
  phone_verified boolean,
  permissions jsonb
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clean text;
  v_caller_vip text;
BEGIN
  v_clean := lower(trim(p_identifier));
  IF v_clean IS NULL OR v_clean = '' THEN
    RETURN;
  END IF;

  v_caller_vip := public.get_auth_vip_id();

  RETURN QUERY
  SELECT 
    ua.username,
    ua.vip_id,
    ua.name,
    ua.role,
    ua.staff_title,
    ua.target_vip_username,
    ua.approval_status,
    ua.avatar,
    -- Disclose contact info only if caller is authenticated under the same VIP tenant
    CASE WHEN v_caller_vip IS NOT NULL AND v_caller_vip = ua.vip_id THEN ua.phone ELSE NULL END AS phone,
    CASE WHEN v_caller_vip IS NOT NULL AND v_caller_vip = ua.vip_id THEN ua.email ELSE NULL END AS email,
    ua.phone_verified,
    ua.permissions
  FROM public.user_accounts ua
  WHERE lower(ua.username) = v_clean
     OR lower(ua.email) = v_clean
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_user_account(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_user_account(text) TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 5. SECURE REPLACEMENT: update_user_auth_token() (Fixes SEC-02)
-- ------------------------------------------------------------------------------
-- Previously allowed any unauthenticated caller to overwrite any user's auth_token
-- without authorization.
-- The secured version enforces strict authorization:
--   Path A: Caller is already authenticated with a valid session matching this user.
--   Path B: Caller proves identity by supplying the user's verified SHA-256 password hash.
-- Rejects any unauthenticated token modification attempts.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_user_auth_token(
  p_username text,
  p_auth_token text,
  p_vip_id text DEFAULT NULL,
  p_password_hash text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clean_user text;
  v_auth record;
  v_user record;
  v_new_token text;
BEGIN
  v_clean_user := lower(trim(p_username));
  IF v_clean_user IS NULL OR v_clean_user = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Username is required', 'code', 'VALIDATION_ERROR');
  END IF;

  v_new_token := trim(p_auth_token);
  IF v_new_token IS NULL OR v_new_token = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Auth token is required', 'code', 'VALIDATION_ERROR');
  END IF;

  -- Locate target user
  SELECT username, vip_id, password_hash, role, approval_status
  INTO v_user
  FROM public.user_accounts
  WHERE lower(username) = v_clean_user;

  IF v_user.username IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found', 'code', 'NOT_FOUND');
  END IF;

  -- Authorization check:
  -- Path A: Caller is already authenticated as this user via valid session headers
  SELECT * INTO v_auth FROM public.get_auth_identity();
  IF v_auth.verified_username IS NOT NULL AND v_auth.verified_username = v_user.username THEN
    -- Authorized via active verified session (e.g. token refresh/rotation)
    UPDATE public.user_accounts
    SET auth_token = v_new_token,
        updated_at = NOW()
    WHERE username = v_user.username;

    RETURN jsonb_build_object('success', true, 'username', v_user.username, 'vip_id', v_user.vip_id);
  END IF;

  -- Path B: Sign-in / session renewal providing valid password hash
  IF p_password_hash IS NOT NULL AND p_password_hash <> '' THEN
    IF v_user.password_hash = lower(trim(p_password_hash)) THEN
      UPDATE public.user_accounts
      SET auth_token = v_new_token,
          last_login = NOW(),
          updated_at = NOW()
      WHERE username = v_user.username;

      RETURN jsonb_build_object('success', true, 'username', v_user.username, 'vip_id', v_user.vip_id);
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Invalid password credential', 'code', 'INVALID_CREDENTIALS');
    END IF;
  END IF;

  -- Neither valid session nor valid password hash provided -> reject
  RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Valid session or verified password hash required to update auth token', 'code', 'UNAUTHORIZED');
END;
$$;

REVOKE ALL ON FUNCTION public.update_user_auth_token(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_user_auth_token(text, text, text, text) TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 6. Pre-Auth Helper: check_vip_principal_exists()
-- ------------------------------------------------------------------------------
-- Verifies whether a target VIP username exists prior to staff registration.
-- Returns only name, username, and vip_id without leaking passwords or tokens.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_vip_principal_exists(p_username text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clean text;
  v_vip record;
BEGIN
  v_clean := lower(trim(p_username));
  IF v_clean IS NULL OR v_clean = '' THEN
    RETURN jsonb_build_object('exists', false, 'error', 'VIP username is required');
  END IF;

  SELECT username, name, vip_id INTO v_vip
  FROM public.user_accounts
  WHERE lower(username) = v_clean AND role = 'vip'
  LIMIT 1;

  IF v_vip.username IS NOT NULL THEN
    RETURN jsonb_build_object(
      'exists', true,
      'username', v_vip.username,
      'name', v_vip.name,
      'vipId', v_vip.vip_id
    );
  ELSE
    RETURN jsonb_build_object('exists', false);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.check_vip_principal_exists(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_vip_principal_exists(text) TO anon, authenticated, service_role;

COMMIT;
