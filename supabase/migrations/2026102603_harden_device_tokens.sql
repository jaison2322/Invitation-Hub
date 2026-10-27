-- ==============================================================================
-- Migration: 2026102603_harden_device_tokens.sql
-- Sprint 1, Task 2: Complete Device Token Hardening & Ownership Isolation
-- Target: public.device_tokens, public.get_auth_identity, and related RPCs
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- STEP 1: Ensure column definitions exist before assertions
-- ------------------------------------------------------------------------------
ALTER TABLE public.device_tokens ADD COLUMN IF NOT EXISTS vip_id TEXT;
ALTER TABLE public.device_tokens ADD COLUMN IF NOT EXISTS device_id TEXT;
ALTER TABLE public.device_tokens ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'android';
ALTER TABLE public.device_tokens ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE public.device_tokens ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ------------------------------------------------------------------------------
-- STEP 2: Preflight Data Integrity Assertions & Safe Non-Destructive Backfill
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_dup_fcm_count integer;
  v_invalid_fcm_count integer;
  v_unmapped_vip_count integer;
  v_mismatch_tenant_count integer;
  v_existing_invalid_idx_count integer;
BEGIN
  -- Assertion 1: Verify no duplicate FCM tokens exist
  SELECT COUNT(*) INTO v_dup_fcm_count
  FROM (
    SELECT fcm_token
    FROM public.device_tokens
    WHERE fcm_token IS NOT NULL AND trim(fcm_token) <> ''
    GROUP BY fcm_token
    HAVING COUNT(*) > 1
  ) dups;

  IF v_dup_fcm_count > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT ASSERTION FAILED: Found % duplicate FCM token groups in public.device_tokens. Resolve duplicate tokens before applying unique constraint.', v_dup_fcm_count;
  END IF;

  -- Assertion 2: Verify no blank or short (< 20 chars) FCM tokens exist
  -- Non-destructive: Does NOT delete data; aborts transaction if invalid rows exist.
  SELECT COUNT(*) INTO v_invalid_fcm_count
  FROM public.device_tokens
  WHERE fcm_token IS NULL OR trim(fcm_token) = '' OR length(trim(fcm_token)) < 20;

  IF v_invalid_fcm_count > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT ASSERTION FAILED: Found % invalid or short (< 20 chars) FCM tokens in public.device_tokens. Execute separate approved cleanup procedure before migrating.', v_invalid_fcm_count;
  END IF;

  -- Safe backfill: Populate NULL vip_id ONLY where an exact username match exists in user_accounts
  UPDATE public.device_tokens dt
  SET vip_id = ua.vip_id
  FROM public.user_accounts ua
  WHERE dt.username = ua.username
    AND (dt.vip_id IS NULL OR trim(dt.vip_id) = '');

  -- Assertion 3: Verify that 0 rows have unmapped or NULL vip_id after backfill
  SELECT COUNT(*) INTO v_unmapped_vip_count
  FROM public.device_tokens
  WHERE vip_id IS NULL OR trim(vip_id) = '';

  IF v_unmapped_vip_count > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT ASSERTION FAILED: Found % device tokens with unmapped/NULL vip_id after backfill. Every token must map to a valid tenant.', v_unmapped_vip_count;
  END IF;

  -- Assertion 4: Verify 0 tenant mismatches between device_tokens and user_accounts
  SELECT COUNT(*) INTO v_mismatch_tenant_count
  FROM public.device_tokens dt
  JOIN public.user_accounts ua ON dt.username = ua.username
  WHERE dt.vip_id <> ua.vip_id;

  IF v_mismatch_tenant_count > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT ASSERTION FAILED: Found % device tokens where vip_id does not match user_accounts.vip_id.', v_mismatch_tenant_count;
  END IF;

  -- Assertion 5: Verify no invalid (corrupted) indexes exist on fcm_token
  SELECT COUNT(*) INTO v_existing_invalid_idx_count
  FROM pg_index ix
  JOIN pg_class c ON c.oid = ix.indrelid
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(ix.indkey)
  WHERE c.relname = 'device_tokens'
    AND a.attname = 'fcm_token'
    AND ix.indisvalid = false;

  IF v_existing_invalid_idx_count > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT ASSERTION FAILED: Found % invalid index on public.device_tokens(fcm_token). Rebuild or drop invalid index before applying migration.', v_existing_invalid_idx_count;
  END IF;

  RAISE NOTICE 'PREFLIGHT INTEGRITY ASSERTIONS PASSED: 0 duplicates, 0 invalid tokens, 0 unmapped tenants, 0 tenant mismatches.';
END;
$$;

-- ------------------------------------------------------------------------------
-- STEP 3: Create Unique Index on public.device_tokens(fcm_token) (Redundant-Safe)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index ix
    JOIN pg_class c ON c.oid = ix.indrelid
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(ix.indkey)
    WHERE c.relname = 'device_tokens'
      AND a.attname = 'fcm_token'
      AND ix.indisunique = true
      AND ix.indisvalid = true
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX uq_device_tokens_fcm_token ON public.device_tokens (fcm_token)';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_device_tokens_vip_user
ON public.device_tokens(vip_id, username);

CREATE INDEX IF NOT EXISTS idx_device_tokens_active_vip
ON public.device_tokens(vip_id, is_active) WHERE is_active = true;

-- ------------------------------------------------------------------------------
-- STEP 4: Single Authoritative Identity Resolution Helper
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

  -- 1. Safely extract PostgREST request headers (closed properly with END;)
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

  -- Both headers are strictly mandatory
  IF v_header_vip_id IS NULL OR v_header_token IS NULL THEN
    RETURN;
  END IF;

  -- 2. Query authoritative user_accounts:
  -- Explicitly aggregate matches to distinguish zero, exactly one, and multi-row collisions.
  SELECT COUNT(*), MIN(ua.username), MIN(ua.vip_id)
  INTO v_match_count, v_found_username, v_found_vip_id
  FROM public.user_accounts ua
  WHERE ua.vip_id = v_header_vip_id
    AND ua.auth_token = v_header_token
    AND ua.vip_id IS NOT NULL AND trim(ua.vip_id) <> ''
    AND ua.username IS NOT NULL AND trim(ua.username) <> ''
    AND (
      ua.role = 'vip'
      OR (ua.role = 'staff' AND ua.approval_status = 'APPROVED')
    );

  -- Exactly one matching account must exist.
  -- Zero matches (invalid credentials) or >1 matches (token collision / compromise) fail closed.
  IF v_match_count = 1 THEN
    verified_username := v_found_username;
    verified_vip_id := v_found_vip_id;
  ELSE
    verified_username := NULL;
    verified_vip_id := NULL;
  END IF;

  RETURN;
EXCEPTION WHEN OTHERS THEN
  verified_username := NULL;
  verified_vip_id := NULL;
  RETURN;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_auth_identity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auth_identity() TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- STEP 5: Preserve Existing Signatures (Delegating to get_auth_identity)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_auth_username()
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user text;
  v_vip text;
BEGIN
  SELECT verified_username, verified_vip_id INTO v_user, v_vip FROM public.get_auth_identity();
  RETURN v_user;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_auth_username() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auth_username() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_auth_vip_id()
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user text;
  v_vip text;
BEGIN
  SELECT verified_username, verified_vip_id INTO v_user, v_vip FROM public.get_auth_identity();
  RETURN v_vip;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_auth_vip_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auth_vip_id() TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- STEP 6: Hardened Atomic RPCs with Immutable Ownership & Sanitized Errors
-- ------------------------------------------------------------------------------

-- RPC 1: register_device_token
CREATE OR REPLACE FUNCTION public.register_device_token(
  p_fcm_token text,
  p_platform text DEFAULT 'android',
  p_device_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_auth record;
  v_clean_token text;
  v_clean_platform text;
  v_clean_device_id text;
  v_existing_username text;
  v_existing_vip_id text;
  v_existing_active boolean;
  v_affected integer;
BEGIN
  v_clean_token := NULLIF(trim(p_fcm_token), '');
  IF v_clean_token IS NULL OR length(v_clean_token) < 20 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid FCM token format: must be at least 20 characters',
      'code', 'INVALID_TOKEN'
    );
  END IF;

  v_clean_platform := LOWER(COALESCE(NULLIF(trim(p_platform), ''), 'android'));
  IF v_clean_platform NOT IN ('android', 'ios', 'web') THEN
    v_clean_platform := 'android';
  END IF;

  v_clean_device_id := NULLIF(trim(p_device_id), '');

  SELECT * INTO v_auth FROM public.get_auth_identity();
  IF v_auth.verified_username IS NULL OR v_auth.verified_vip_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: invalid or missing session credentials',
      'code', 'UNAUTHORIZED'
    );
  END IF;

  -- Acquire Level 1 User lock then Level 2 Token lock
  PERFORM pg_advisory_xact_lock(hashtext('user:' || v_auth.verified_username || ':' || v_auth.verified_vip_id));
  PERFORM pg_advisory_xact_lock(hashtext('token:' || v_clean_token));

  -- Check existing token ownership under row-level lock
  SELECT username, vip_id, is_active
  INTO v_existing_username, v_existing_vip_id, v_existing_active
  FROM public.device_tokens
  WHERE fcm_token = v_clean_token
  FOR UPDATE;

  IF FOUND THEN
    -- Immutable Ownership Rule: Tokens can NEVER be stolen or reassigned across users or tenants
    IF v_existing_username <> v_auth.verified_username OR v_existing_vip_id <> v_auth.verified_vip_id THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Security violation: token is already registered to another account or tenant',
        'code', 'TOKEN_OWNERSHIP_CONFLICT'
      );
    END IF;

    UPDATE public.device_tokens
    SET is_active = true,
        platform = v_clean_platform,
        device_id = COALESCE(v_clean_device_id, public.device_tokens.device_id),
        updated_at = NOW()
    WHERE fcm_token = v_clean_token;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'reactivated',
      'username', v_auth.verified_username,
      'vip_id', v_auth.verified_vip_id
    );
  END IF;

  -- Insert new token for the authenticated caller
  INSERT INTO public.device_tokens (
    vip_id,
    username,
    fcm_token,
    platform,
    device_id,
    is_active,
    updated_at
  ) VALUES (
    v_auth.verified_vip_id,
    v_auth.verified_username,
    v_clean_token,
    v_clean_platform,
    v_clean_device_id,
    true,
    NOW()
  )
  ON CONFLICT (fcm_token) DO UPDATE SET
    is_active = true,
    platform = EXCLUDED.platform,
    device_id = COALESCE(EXCLUDED.device_id, public.device_tokens.device_id),
    updated_at = NOW()
  WHERE public.device_tokens.username = EXCLUDED.username
    AND public.device_tokens.vip_id = EXCLUDED.vip_id;

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Token registration conflict: concurrent ownership race detected',
      'code', 'TOKEN_OWNERSHIP_CONFLICT'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'registered',
    'username', v_auth.verified_username,
    'vip_id', v_auth.verified_vip_id
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', 'Internal database error during token registration', 'code', 'DATABASE_ERROR');
END;
$function$;

REVOKE ALL ON FUNCTION public.register_device_token(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_device_token(text, text, text) TO anon, authenticated, service_role;

-- RPC 2: deactivate_device_token
CREATE OR REPLACE FUNCTION public.deactivate_device_token(
  p_fcm_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_auth record;
  v_clean_token text;
  v_existing_username text;
  v_existing_vip_id text;
  v_existing_active boolean;
BEGIN
  v_clean_token := NULLIF(trim(p_fcm_token), '');
  IF v_clean_token IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid FCM token',
      'code', 'INVALID_TOKEN',
      'deactivated', 0
    );
  END IF;

  SELECT * INTO v_auth FROM public.get_auth_identity();
  IF v_auth.verified_username IS NULL OR v_auth.verified_vip_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: invalid or missing session credentials',
      'code', 'UNAUTHORIZED',
      'deactivated', 0
    );
  END IF;

  -- Acquire Level 1 User lock then Level 2 Token lock
  PERFORM pg_advisory_xact_lock(hashtext('user:' || v_auth.verified_username || ':' || v_auth.verified_vip_id));
  PERFORM pg_advisory_xact_lock(hashtext('token:' || v_clean_token));

  -- Check existing token under row lock
  SELECT username, vip_id, is_active
  INTO v_existing_username, v_existing_vip_id, v_existing_active
  FROM public.device_tokens
  WHERE fcm_token = v_clean_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Token not found',
      'code', 'TOKEN_NOT_FOUND',
      'deactivated', 0
    );
  END IF;

  IF v_existing_username <> v_auth.verified_username OR v_existing_vip_id <> v_auth.verified_vip_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot deactivate token owned by another account',
      'code', 'TOKEN_OWNERSHIP_CONFLICT',
      'deactivated', 0
    );
  END IF;

  IF NOT v_existing_active THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'already_inactive',
      'deactivated', 0
    );
  END IF;

  UPDATE public.device_tokens
  SET is_active = false,
      updated_at = NOW()
  WHERE fcm_token = v_clean_token;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'deactivated',
    'deactivated', 1
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', 'Internal database error during deactivation', 'code', 'DATABASE_ERROR', 'deactivated', 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.deactivate_device_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deactivate_device_token(text) TO anon, authenticated, service_role;

-- RPC 3: deactivate_all_user_tokens
CREATE OR REPLACE FUNCTION public.deactivate_all_user_tokens()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_auth record;
  v_affected integer;
  v_total_user_tokens integer;
BEGIN
  SELECT * INTO v_auth FROM public.get_auth_identity();
  IF v_auth.verified_username IS NULL OR v_auth.verified_vip_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: invalid or missing session credentials',
      'code', 'UNAUTHORIZED',
      'deactivated', 0
    );
  END IF;

  -- Acquire Level 1 User lock
  PERFORM pg_advisory_xact_lock(hashtext('user:' || v_auth.verified_username || ':' || v_auth.verified_vip_id));

  UPDATE public.device_tokens
  SET is_active = false,
      updated_at = NOW()
  WHERE username = v_auth.verified_username
    AND vip_id = v_auth.verified_vip_id
    AND is_active = true;

  GET DIAGNOSTICS v_affected = ROW_COUNT;

  IF v_affected > 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'deactivated',
      'deactivated', v_affected
    );
  END IF;

  -- Distinguish between user having 0 registered tokens vs all already inactive
  SELECT COUNT(*) INTO v_total_user_tokens
  FROM public.device_tokens
  WHERE username = v_auth.verified_username
    AND vip_id = v_auth.verified_vip_id;

  IF v_total_user_tokens = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'no_tokens_registered',
      'deactivated', 0
    );
  ELSE
    RETURN jsonb_build_object(
      'success', true,
      'status', 'already_inactive',
      'deactivated', 0
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', 'Internal database error during bulk deactivation', 'code', 'DATABASE_ERROR', 'deactivated', 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.deactivate_all_user_tokens() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deactivate_all_user_tokens() TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- STEP 7: Revoke Direct Table Writes & Enforce Read-Only Scoped RLS
-- ------------------------------------------------------------------------------
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON public.device_tokens FROM anon, authenticated, PUBLIC;
GRANT SELECT ON public.device_tokens TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_tokens TO service_role;

DROP POLICY IF EXISTS "Allow select on device_tokens" ON public.device_tokens;
DROP POLICY IF EXISTS "Allow insert on device_tokens" ON public.device_tokens;
DROP POLICY IF EXISTS "Allow update on device_tokens" ON public.device_tokens;
DROP POLICY IF EXISTS "Allow delete on device_tokens" ON public.device_tokens;
DROP POLICY IF EXISTS "device_tokens_isolated_select" ON public.device_tokens;
DROP POLICY IF EXISTS "device_tokens_isolated_insert" ON public.device_tokens;
DROP POLICY IF EXISTS "device_tokens_isolated_update" ON public.device_tokens;
DROP POLICY IF EXISTS "device_tokens_isolated_delete" ON public.device_tokens;
DROP POLICY IF EXISTS "device_tokens_select_own" ON public.device_tokens;
DROP POLICY IF EXISTS "device_tokens_insert_own" ON public.device_tokens;
DROP POLICY IF EXISTS "device_tokens_update_own" ON public.device_tokens;
DROP POLICY IF EXISTS "device_tokens_delete_own" ON public.device_tokens;

CREATE POLICY "device_tokens_select_own"
ON public.device_tokens
FOR SELECT TO anon, authenticated
USING (
  vip_id = public.get_auth_vip_id()
  AND username = public.get_auth_username()
);

COMMIT;
