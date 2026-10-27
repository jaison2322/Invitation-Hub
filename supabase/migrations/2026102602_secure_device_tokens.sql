-- ==============================================================================
-- Migration: 2026102602_secure_device_tokens.sql
-- Sprint 1, Task 2: Secure device_tokens against cross-VIP and cross-user access (P0)
--
-- Security Rules Enforced:
--   1. Ensure `vip_id` exists on public.device_tokens and is backfilled from user_accounts.
--   2. Define public.get_auth_username() which verifies `x-vip-id` and `x-user-token`
--      against public.user_accounts (only active VIPs or APPROVED staff).
--   3. Remove legacy insecure RLS policies (USING (true) / WITH CHECK (true)).
--   4. Enforce strict RLS on public.device_tokens:
--      - SELECT: vip_id = get_auth_vip_id() AND username = get_auth_username()
--      - INSERT: WITH CHECK (vip_id = get_auth_vip_id() AND username = get_auth_username())
--      - UPDATE: USING (vip_id = get_auth_vip_id() AND username = get_auth_username())
--                WITH CHECK (vip_id = get_auth_vip_id() AND username = get_auth_username())
--      - DELETE: USING (vip_id = get_auth_vip_id() AND username = get_auth_username())
--   5. Provide secure RPCs:
--      - register_device_token(p_fcm_token, p_platform, p_device_id)
--      - deactivate_device_token(p_fcm_token)
--      - deactivate_all_user_tokens()
--      All verify caller identity server-side via get_auth_vip_id() and get_auth_username().
--   6. Create composite indexes for optimal lookup during push notifications and RLS checks.
-- ==============================================================================

-- 1. Ensure vip_id column exists on public.device_tokens
ALTER TABLE public.device_tokens ADD COLUMN IF NOT EXISTS vip_id TEXT;

-- 2. Backfill vip_id from user_accounts if any legacy rows exist with NULL vip_id
UPDATE public.device_tokens dt
SET vip_id = ua.vip_id
FROM public.user_accounts ua
WHERE dt.username = ua.username AND dt.vip_id IS NULL;

-- 3. Define public.get_auth_username() helper function
CREATE OR REPLACE FUNCTION public.get_auth_username()
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_headers json;
  v_vip_id text;
  v_token text;
  v_verified_user text;
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

  -- Both headers must be present
  IF v_vip_id IS NULL OR v_token IS NULL THEN
    RETURN NULL;
  END IF;

  -- Verify token against active user_accounts in this tenant
  SELECT username INTO v_verified_user
  FROM public.user_accounts
  WHERE vip_id = v_vip_id
    AND auth_token = v_token
    AND (
      role = 'vip'
      OR (role = 'staff' AND approval_status = 'APPROVED')
    )
  LIMIT 1;

  RETURN v_verified_user;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$function$;

-- Explicit grants for get_auth_username()
REVOKE ALL ON FUNCTION public.get_auth_username() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auth_username() TO anon, authenticated, service_role;

-- 4. Enable RLS on device_tokens
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

-- 5. Drop all legacy / insecure policies on device_tokens
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

-- 6. Create strict RLS policies on device_tokens
CREATE POLICY "device_tokens_select_own"
ON public.device_tokens
FOR SELECT TO anon, authenticated
USING (
  vip_id = public.get_auth_vip_id()
  AND username = public.get_auth_username()
);

CREATE POLICY "device_tokens_insert_own"
ON public.device_tokens
FOR INSERT TO anon, authenticated
WITH CHECK (
  vip_id = public.get_auth_vip_id()
  AND username = public.get_auth_username()
);

CREATE POLICY "device_tokens_update_own"
ON public.device_tokens
FOR UPDATE TO anon, authenticated
USING (
  vip_id = public.get_auth_vip_id()
  AND username = public.get_auth_username()
)
WITH CHECK (
  vip_id = public.get_auth_vip_id()
  AND username = public.get_auth_username()
);

CREATE POLICY "device_tokens_delete_own"
ON public.device_tokens
FOR DELETE TO anon, authenticated
USING (
  vip_id = public.get_auth_vip_id()
  AND username = public.get_auth_username()
);

-- 7. Secure RPC: register_device_token
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
  v_vip_id text;
  v_username text;
  v_clean_token text;
BEGIN
  v_clean_token := NULLIF(trim(p_fcm_token), '');
  IF v_clean_token IS NULL OR length(v_clean_token) < 20 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid FCM token format');
  END IF;

  -- Authenticate caller via verified session headers
  v_vip_id := public.get_auth_vip_id();
  v_username := public.get_auth_username();

  IF v_vip_id IS NULL OR v_username IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Upsert device token for this authenticated user and tenant
  INSERT INTO public.device_tokens (
    vip_id,
    username,
    fcm_token,
    platform,
    device_id,
    is_active,
    updated_at
  ) VALUES (
    v_vip_id,
    v_username,
    v_clean_token,
    COALESCE(NULLIF(trim(p_platform), ''), 'android'),
    p_device_id,
    true,
    NOW()
  )
  ON CONFLICT (fcm_token) DO UPDATE SET
    vip_id = EXCLUDED.vip_id,
    username = EXCLUDED.username,
    platform = EXCLUDED.platform,
    device_id = COALESCE(EXCLUDED.device_id, public.device_tokens.device_id),
    is_active = true,
    updated_at = NOW();

  RETURN jsonb_build_object('success', true, 'username', v_username, 'vip_id', v_vip_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

REVOKE ALL ON FUNCTION public.register_device_token(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_device_token(text, text, text) TO anon, authenticated, service_role;

-- 8. Secure RPC: deactivate_device_token
CREATE OR REPLACE FUNCTION public.deactivate_device_token(
  p_fcm_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_vip_id text;
  v_username text;
  v_clean_token text;
  v_affected integer;
BEGIN
  v_clean_token := NULLIF(trim(p_fcm_token), '');
  IF v_clean_token IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid token');
  END IF;

  -- Authenticate caller via verified session headers
  v_vip_id := public.get_auth_vip_id();
  v_username := public.get_auth_username();

  IF v_vip_id IS NULL OR v_username IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Only deactivate if the token belongs to the authenticated caller
  UPDATE public.device_tokens
  SET is_active = false,
      updated_at = NOW()
  WHERE fcm_token = v_clean_token
    AND username = v_username
    AND vip_id = v_vip_id;

  GET DIAGNOSTICS v_affected = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'deactivated', v_affected);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

REVOKE ALL ON FUNCTION public.deactivate_device_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deactivate_device_token(text) TO anon, authenticated, service_role;

-- 9. Secure RPC: deactivate_all_user_tokens
CREATE OR REPLACE FUNCTION public.deactivate_all_user_tokens()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_vip_id text;
  v_username text;
  v_affected integer;
BEGIN
  -- Authenticate caller via verified session headers
  v_vip_id := public.get_auth_vip_id();
  v_username := public.get_auth_username();

  IF v_vip_id IS NULL OR v_username IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  UPDATE public.device_tokens
  SET is_active = false,
      updated_at = NOW()
  WHERE username = v_username
    AND vip_id = v_vip_id;

  GET DIAGNOSTICS v_affected = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'deactivated', v_affected);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

REVOKE ALL ON FUNCTION public.deactivate_all_user_tokens() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deactivate_all_user_tokens() TO anon, authenticated, service_role;

-- 10. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_device_tokens_vip_user
ON public.device_tokens(vip_id, username);

CREATE INDEX IF NOT EXISTS idx_device_tokens_active_vip
ON public.device_tokens(vip_id, is_active) WHERE is_active = true;
