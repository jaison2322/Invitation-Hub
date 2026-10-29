-- ==============================================================================
-- 05_device_tokens_and_push.sql
-- Invitation Hub Secure Database Rebuild — Migration Step 05
-- Purpose: Hardened FCM device token registration, immutable ownership locks,
--          safe deactivation, and push notification delivery triggers.
-- Target Environment: Staging ONLY (project ref: kdbkfmzsdinkvslvgson)
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. Preflight Data Integrity Assertions
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_dup_fcm_count integer;
  v_invalid_fcm_count integer;
  v_unmapped_vip_count integer;
  v_mismatch_tenant_count integer;
BEGIN
  -- Assertion 1: No duplicate tokens
  SELECT COUNT(*) INTO v_dup_fcm_count
  FROM (
    SELECT fcm_token
    FROM public.device_tokens
    WHERE fcm_token IS NOT NULL AND trim(fcm_token) <> ''
    GROUP BY fcm_token
    HAVING COUNT(*) > 1
  ) dups;

  IF v_dup_fcm_count > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT ASSERTION FAILED: Found % duplicate FCM tokens in public.device_tokens.', v_dup_fcm_count;
  END IF;

  -- Assertion 2: No short or blank tokens
  SELECT COUNT(*) INTO v_invalid_fcm_count
  FROM public.device_tokens
  WHERE fcm_token IS NULL OR trim(fcm_token) = '' OR length(trim(fcm_token)) < 20;

  IF v_invalid_fcm_count > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT ASSERTION FAILED: Found % invalid or short (< 20 chars) FCM tokens.', v_invalid_fcm_count;
  END IF;

  -- Assertion 3: No unmapped VIPs
  SELECT COUNT(*) INTO v_unmapped_vip_count
  FROM public.device_tokens
  WHERE vip_id IS NULL OR trim(vip_id) = '';

  IF v_unmapped_vip_count > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT ASSERTION FAILED: Found % device tokens with NULL or empty vip_id.', v_unmapped_vip_count;
  END IF;

  -- Assertion 4: No tenant mismatch between device_tokens and user_accounts
  SELECT COUNT(*) INTO v_mismatch_tenant_count
  FROM public.device_tokens dt
  JOIN public.user_accounts ua ON dt.username = ua.username
  WHERE dt.vip_id <> ua.vip_id;

  IF v_mismatch_tenant_count > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT ASSERTION FAILED: Found % device tokens where vip_id does not match user_accounts.vip_id.', v_mismatch_tenant_count;
  END IF;

  RAISE NOTICE 'PREFLIGHT ASSERTIONS PASSED: device_tokens integrity verified.';
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. Hardened Device Token Registration: register_device_token()
-- ------------------------------------------------------------------------------
-- Enforces:
--   - Caller identity verified server-side via get_auth_identity()
--   - Advisory locks (L1 User lock + L2 Token lock) to eliminate race conditions
--   - Row-level lock (FOR UPDATE) on conflicting tokens
--   - Immutable Token Ownership: An active token registered by Account A cannot
--     be taken over or hijacked by Account B (returns TOKEN_OWNERSHIP_CONFLICT)
-- ------------------------------------------------------------------------------
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
  v_existing_username text;
  v_existing_vip_id text;
  v_existing_active boolean;
BEGIN
  -- 1. Validate token format
  v_clean_token := NULLIF(trim(p_fcm_token), '');
  IF v_clean_token IS NULL OR length(v_clean_token) < 20 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid FCM token: token must be at least 20 characters',
      'code', 'INVALID_TOKEN'
    );
  END IF;

  v_clean_platform := COALESCE(NULLIF(trim(lower(p_platform)), ''), 'android');

  -- 2. Authenticate caller session
  SELECT * INTO v_auth FROM public.get_auth_identity();
  IF v_auth.verified_username IS NULL OR v_auth.verified_vip_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: invalid or missing session credentials',
      'code', 'UNAUTHORIZED'
    );
  END IF;

  -- 3. Acquire Hierarchical Advisory Locks
  -- Level 1: User lock (serializes concurrent registrations for this user)
  PERFORM pg_advisory_xact_lock(hashtext('user:' || v_auth.verified_username || ':' || v_auth.verified_vip_id));
  -- Level 2: Token lock (serializes concurrent operations on this specific device token)
  PERFORM pg_advisory_xact_lock(hashtext('token:' || v_clean_token));

  -- 4. Check existing token ownership under row lock
  SELECT username, vip_id, is_active
  INTO v_existing_username, v_existing_vip_id, v_existing_active
  FROM public.device_tokens
  WHERE fcm_token = v_clean_token
  FOR UPDATE;

  IF FOUND THEN
    -- If owned by another account, enforce ownership boundary
    IF v_existing_username <> v_auth.verified_username OR v_existing_vip_id <> v_auth.verified_vip_id THEN
      IF v_existing_active THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Token ownership conflict: token is actively registered to another account',
          'code', 'TOKEN_OWNERSHIP_CONFLICT'
        );
      END IF;

      -- If token was inactive, allow re-registration by transferring ownership to authenticated caller
      UPDATE public.device_tokens
      SET username = v_auth.verified_username,
          vip_id = v_auth.verified_vip_id,
          platform = v_clean_platform,
          device_id = COALESCE(p_device_id, public.device_tokens.device_id),
          is_active = true,
          updated_at = NOW()
      WHERE fcm_token = v_clean_token;

      RETURN jsonb_build_object(
        'success', true,
        'action', 'reassigned',
        'username', v_auth.verified_username,
        'vip_id', v_auth.verified_vip_id
      );
    END IF;

    -- Token already belongs to caller -> update metadata and ensure active
    UPDATE public.device_tokens
    SET platform = v_clean_platform,
        device_id = COALESCE(p_device_id, public.device_tokens.device_id),
        is_active = true,
        updated_at = NOW()
    WHERE fcm_token = v_clean_token;

    RETURN jsonb_build_object(
      'success', true,
      'action', 'refreshed',
      'username', v_auth.verified_username,
      'vip_id', v_auth.verified_vip_id
    );
  END IF;

  -- 5. Insert brand new device token
  INSERT INTO public.device_tokens (
    vip_id,
    username,
    fcm_token,
    platform,
    device_id,
    is_active,
    created_at,
    updated_at
  ) VALUES (
    v_auth.verified_vip_id,
    v_auth.verified_username,
    v_clean_token,
    v_clean_platform,
    p_device_id,
    true,
    NOW(),
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'action', 'inserted',
    'username', v_auth.verified_username,
    'vip_id', v_auth.verified_vip_id
  );
EXCEPTION WHEN unique_violation THEN
  -- Handle race where token was inserted concurrently
  RETURN jsonb_build_object(
    'success', false,
    'error', 'Concurrent registration detected; please retry',
    'code', 'CONCURRENT_CONFLICT'
  );
WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', 'Failed to register device token',
    'code', 'INTERNAL_ERROR'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.register_device_token(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_device_token(text, text, text) TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 3. Hardened Single Token Deactivation: deactivate_device_token()
-- ------------------------------------------------------------------------------
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
      'error', 'Invalid token',
      'code', 'INVALID_ARGUMENT',
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

  -- Enforce ownership boundary
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
  RETURN jsonb_build_object(
    'success', false,
    'error', 'Failed to deactivate token',
    'code', 'INTERNAL_ERROR',
    'deactivated', 0
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.deactivate_device_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deactivate_device_token(text) TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 4. Hardened Bulk Deactivation: deactivate_all_user_tokens()
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.deactivate_all_user_tokens()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_auth record;
  v_affected integer;
BEGIN
  SELECT * INTO v_auth FROM public.get_auth_identity();
  IF v_auth.verified_username IS NULL OR v_auth.verified_vip_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized',
      'code', 'UNAUTHORIZED',
      'deactivated', 0
    );
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('user:' || v_auth.verified_username || ':' || v_auth.verified_vip_id));

  UPDATE public.device_tokens
  SET is_active = false,
      updated_at = NOW()
  WHERE username = v_auth.verified_username
    AND vip_id = v_auth.verified_vip_id
    AND is_active = true;

  GET DIAGNOSTICS v_affected = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'deactivated', v_affected
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', 'Failed to deactivate tokens',
    'code', 'INTERNAL_ERROR',
    'deactivated', 0
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.deactivate_all_user_tokens() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deactivate_all_user_tokens() TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 5. Automated Cloud Push Trigger: on_notification_insert_push
-- ------------------------------------------------------------------------------
-- Calls Supabase Edge Function 'send-push-notification' asynchronously via pg_net
-- when a new unread notification is inserted into public.notifications.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_notification_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_url text;
  v_service_key text;
  v_payload jsonb;
BEGIN
  IF NEW.read = true THEN
    RETURN NEW;
  END IF;

  -- Build payload matching Edge Function expectations
  v_payload := jsonb_build_object(
    'record', jsonb_build_object(
      'id', NEW.id,
      'vip_id', NEW.vip_id,
      'type', NEW.type,
      'title', NEW.title,
      'message', NEW.message,
      'read', NEW.read,
      'timestamp', NEW.timestamp,
      'action_url', NEW.action_url,
      'related_entity_id', NEW.related_entity_id
    )
  );

  v_url := current_setting('app.settings.supabase_url', true);
  v_service_key := current_setting('app.settings.service_role_key', true);

  -- Only invoke net.http_post if settings and pg_net extension are configured
  IF v_url IS NOT NULL AND v_service_key IS NOT NULL THEN
    BEGIN
      PERFORM net.http_post(
        url := v_url || '/functions/v1/send-push-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_key
        ),
        body := v_payload,
        timeout_milliseconds := 5000
      );
    EXCEPTION WHEN OTHERS THEN
      -- Fail-open: Never block notification INSERT if external network push fails
      RAISE WARNING 'handle_new_notification_push failed to dispatch push: %', SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_new_notification_push() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_notification_push() TO service_role;

DROP TRIGGER IF EXISTS on_notification_insert_push ON public.notifications;
CREATE TRIGGER on_notification_insert_push
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_notification_push();

COMMIT;

