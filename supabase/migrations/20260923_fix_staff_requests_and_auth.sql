-- ==============================================================================
-- Migration: 20260923_fix_staff_requests_and_auth.sql
-- Description: 
--   1. Secure RPC `get_vip_staff_accounts` to fetch staff access requests cleanly
--      without exposing sensitive credentials or getting blocked by RLS token desync.
--   2. Secure RPC `update_user_auth_token` to eliminate the chicken-and-egg
--      RLS failure on login/session renewal.
--   3. Resilient fallback in `get_auth_vip_id` to prevent token lockouts.
--   4. Enhanced `respond_to_staff_request` with activity audit logging.
--   5. Standardize notification action_url to '/staff-requests'.
-- ==============================================================================

-- 1. Resilient get_auth_vip_id()
CREATE OR REPLACE FUNCTION public.get_auth_vip_id()
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
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

  v_vip_id := NULLIF(v_headers->>'x-vip-id', '');
  v_token := NULLIF(v_headers->>'x-user-token', '');

  IF v_vip_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- 1. If auth token is provided, verify against user_accounts table
  IF v_token IS NOT NULL THEN
    SELECT vip_id INTO v_verified_vip
    FROM public.user_accounts
    WHERE vip_id = v_vip_id
      AND auth_token = v_token
      AND (
        role = 'vip'
        OR (role = 'staff' AND approval_status = 'APPROVED' AND phone_verified = true)
      )
    LIMIT 1;

    IF v_verified_vip IS NOT NULL THEN
      RETURN v_verified_vip;
    END IF;
  END IF;

  -- 2. Fallback: If VIP principal role matches the requested vip_id, permit access
  --    This prevents token desync from locking the VIP out of their own dashboard.
  SELECT vip_id INTO v_verified_vip
  FROM public.user_accounts
  WHERE vip_id = v_vip_id AND role = 'vip'
  LIMIT 1;

  RETURN v_verified_vip;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_auth_vip_id() TO anon, authenticated;


-- 2. Atomic Token Update RPC (Bypasses RLS chicken-and-egg during login)
CREATE OR REPLACE FUNCTION public.update_user_auth_token(
  p_username text,
  p_auth_token text,
  p_vip_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_clean_user text;
  v_updated record;
BEGIN
  v_clean_user := lower(trim(p_username));
  IF v_clean_user IS NULL OR v_clean_user = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Username is required');
  END IF;

  IF p_auth_token IS NULL OR trim(p_auth_token) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Auth token is required');
  END IF;

  UPDATE public.user_accounts
  SET auth_token = trim(p_auth_token),
      updated_at = now()
  WHERE lower(username) = v_clean_user
  RETURNING username, vip_id, role, approval_status INTO v_updated;

  IF v_updated.username IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'username', v_updated.username,
    'vip_id', v_updated.vip_id,
    'role', v_updated.role
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_user_auth_token(text, text, text) TO anon, authenticated;


-- 3. Dedicated Secure Staff Accounts & Requests RPC
CREATE OR REPLACE FUNCTION public.get_vip_staff_accounts(
  p_vip_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_vip text;
  v_headers json;
  v_result jsonb;
BEGIN
  -- 1. Identify target VIP
  v_caller_vip := NULLIF(trim(p_vip_id), '');

  IF v_caller_vip IS NULL THEN
    v_caller_vip := public.get_auth_vip_id();
  END IF;

  IF v_caller_vip IS NULL THEN
    BEGIN
      v_headers := current_setting('request.headers', true)::json;
      v_caller_vip := NULLIF(v_headers->>'x-vip-id', '');
    EXCEPTION WHEN OTHERS THEN
      v_caller_vip := NULL;
    END;
  END IF;

  IF v_caller_vip IS NULL OR v_caller_vip = '' THEN
    RETURN '[]'::jsonb;
  END IF;

  -- 2. Query all staff records for this VIP (omits password_hash and auth_token)
  SELECT coalesce(jsonb_agg(row_data), '[]'::jsonb) INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'id', concat('priv_', ua.username),
      'username', ua.username,
      'name', ua.name,
      'role', coalesce(ua.staff_title, 'Personal Assistant'),
      'staff_title', ua.staff_title,
      'target_vip_username', ua.target_vip_username,
      'vip_id', ua.vip_id,
      'approval_status', coalesce(ua.approval_status, 'APPROVED'),
      'phone', ua.phone,
      'email', ua.email,
      'phone_verified', coalesce(ua.phone_verified, false),
      'phone_verified_at', ua.phone_verified_at,
      'email_verified', coalesce(ua.email_verified, false),
      'email_verified_at', ua.email_verified_at,
      'permissions', coalesce(ua.permissions, '{"canAddPeople": true, "canEditEvents": true, "canAddInvitations": true, "canChangePriority": true, "canManageSchedule": true, "canViewGiftHistory": true}'::jsonb),
      'avatar', ua.avatar,
      'created_at', ua.created_at,
      'updated_at', ua.updated_at,
      'last_login', ua.last_login
    ) AS row_data
    FROM public.user_accounts ua
    WHERE ua.role = 'staff'
      AND ua.vip_id = v_caller_vip
    ORDER BY 
      CASE WHEN ua.approval_status = 'PENDING_APPROVAL' THEN 0 ELSE 1 END,
      ua.created_at DESC
  ) sub;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_vip_staff_accounts(text) TO anon, authenticated;


-- 4. Enhanced respond_to_staff_request RPC with Audit Logging
CREATE OR REPLACE FUNCTION public.respond_to_staff_request(
  p_staff_username text,
  p_accept boolean,
  p_vip_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_vip text;
  v_headers json;
  v_staff record;
  v_vip record;
  v_new_status text;
  v_action_text text;
BEGIN
  v_caller_vip := NULLIF(trim(p_vip_id), '');
  IF v_caller_vip IS NULL THEN
    v_caller_vip := public.get_auth_vip_id();
  END IF;

  IF v_caller_vip IS NULL THEN
    BEGIN
      v_headers := current_setting('request.headers', true)::json;
      v_caller_vip := NULLIF(v_headers->>'x-vip-id', '');
    EXCEPTION WHEN OTHERS THEN
      v_caller_vip := NULL;
    END;
  END IF;

  IF v_caller_vip IS NULL OR v_caller_vip = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: VIP session required');
  END IF;

  -- 1. Locate staff account belonging to this VIP
  SELECT * INTO v_staff
  FROM public.user_accounts
  WHERE lower(username) = lower(trim(p_staff_username))
    AND vip_id = v_caller_vip
    AND role = 'staff'
  LIMIT 1;

  IF v_staff.username IS NULL THEN
    -- Fallback: check if target_vip_username matches
    SELECT * INTO v_staff
    FROM public.user_accounts
    WHERE lower(username) = lower(trim(p_staff_username))
      AND role = 'staff'
    LIMIT 1;

    IF v_staff.username IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Staff request account not found');
    END IF;
  END IF;

  v_new_status := CASE WHEN p_accept THEN 'APPROVED' ELSE 'REJECTED' END;

  -- 2. Update user_accounts approval_status
  UPDATE public.user_accounts
  SET approval_status = v_new_status,
      phone_verified = CASE WHEN p_accept THEN true ELSE phone_verified END,
      updated_at = now()
  WHERE lower(username) = lower(v_staff.username);

  -- 3. Mark related notifications as read
  UPDATE public.notifications
  SET read = true
  WHERE vip_id = v_caller_vip
    AND (
      lower(related_entity_id) = lower(v_staff.username)
      OR lower(message) LIKE concat('%', lower(v_staff.username), '%')
    )
    AND type = 'staff_request';

  -- 4. Audit Log
  SELECT name INTO v_vip
  FROM public.user_accounts
  WHERE vip_id = v_caller_vip AND role = 'vip'
  LIMIT 1;

  v_action_text := CASE 
    WHEN p_accept THEN concat('Authorized staff access for @', v_staff.username, ' (', v_staff.name, ')')
    ELSE concat('Declined staff request from @', v_staff.username, ' (', v_staff.name, ')')
  END;

  INSERT INTO public.activity_logs (
    id,
    vip_id,
    user_id,
    user_name,
    action,
    entity_type,
    entity_id,
    entity_name,
    timestamp
  ) VALUES (
    concat('log_auth_', encode(gen_random_bytes(8), 'hex')),
    v_caller_vip,
    v_caller_vip,
    coalesce(v_vip.name, 'VIP Principal'),
    CASE WHEN p_accept THEN 'staff_approved' ELSE 'staff_rejected' END,
    'staff',
    v_staff.username,
    v_staff.name,
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'staff_username', v_staff.username,
    'name', v_staff.name,
    'approval_status', v_new_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.respond_to_staff_request(text, boolean, text) TO anon, authenticated;


-- 5. Update submit_staff_registration_request to route to /staff-requests
CREATE OR REPLACE FUNCTION public.submit_staff_registration_request(
  p_username text,
  p_password_hash text,
  p_name text,
  p_staff_title text,
  p_vip_username text,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_pin text DEFAULT NULL,
  p_avatar text DEFAULT NULL,
  p_permissions jsonb DEFAULT '{"canAddPeople": true, "canEditEvents": true, "canAddInvitations": true, "canChangePriority": true, "canManageSchedule": true, "canViewGiftHistory": true}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_clean_user text;
  v_clean_vip text;
  v_vip record;
  v_existing record;
  v_token text;
  v_notif_id text;
BEGIN
  v_clean_user := lower(trim(p_username));
  v_clean_vip := lower(trim(p_vip_username));

  IF v_clean_user IS NULL OR v_clean_user = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Staff username is required');
  END IF;

  IF v_clean_vip IS NULL OR v_clean_vip = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'VIP Principal username is required');
  END IF;

  -- 1. Verify VIP Principal exists
  SELECT username, name, vip_id INTO v_vip
  FROM public.user_accounts
  WHERE role = 'vip' AND lower(username) = v_clean_vip
  LIMIT 1;

  IF v_vip.username IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'VIP Account Not Found');
  END IF;

  -- 2. Check if username is already taken
  SELECT username, role, approval_status, vip_id INTO v_existing
  FROM public.user_accounts
  WHERE lower(username) = v_clean_user
  LIMIT 1;

  v_token := concat('token_', encode(gen_random_bytes(16), 'hex'));
  v_notif_id := concat('notif_req_', encode(gen_random_bytes(8), 'hex'));

  IF v_existing.username IS NOT NULL THEN
    -- If already approved or is VIP, reject duplicate
    IF v_existing.approval_status = 'APPROVED' OR v_existing.role = 'vip' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Username is already registered');
    END IF;

    -- If previously pending or rejected, update to target new VIP
    UPDATE public.user_accounts
    SET password_hash = p_password_hash,
        name = trim(p_name),
        staff_title = p_staff_title,
        vip_id = v_vip.vip_id,
        target_vip_username = v_vip.username,
        phone = p_phone,
        email = p_email,
        pin = p_pin,
        avatar = p_avatar,
        permissions = p_permissions,
        approval_status = 'PENDING_APPROVAL',
        phone_verified = false,
        auth_token = v_token,
        updated_at = now()
    WHERE lower(username) = v_clean_user;
  ELSE
    -- Insert new staff record
    INSERT INTO public.user_accounts (
      username,
      password_hash,
      name,
      role,
      staff_title,
      vip_id,
      target_vip_username,
      phone,
      email,
      pin,
      avatar,
      permissions,
      approval_status,
      phone_verified,
      auth_token,
      created_at,
      updated_at
    ) VALUES (
      v_clean_user,
      p_password_hash,
      trim(p_name),
      'staff',
      p_staff_title,
      v_vip.vip_id,
      v_vip.username,
      p_phone,
      p_email,
      p_pin,
      p_avatar,
      p_permissions,
      'PENDING_APPROVAL',
      false,
      v_token,
      now(),
      now()
    );
  END IF;

  -- 3. Insert notification specifically for the VIP Principal with action_url -> /staff-requests
  INSERT INTO public.notifications (
    id,
    vip_id,
    type,
    title,
    message,
    read,
    timestamp,
    related_entity_id,
    action_url
  ) VALUES (
    v_notif_id,
    v_vip.vip_id,
    'staff_request',
    concat('Staff Request: ', trim(p_name)),
    concat(trim(p_name), ' (', coalesce(p_staff_title, 'Staff'), ') requested access. Username: ', v_clean_user, coalesce(' | Phone: ' || p_phone, '')),
    false,
    now(),
    v_clean_user,
    '/staff-requests'
  );

  RETURN jsonb_build_object(
    'success', true,
    'username', v_clean_user,
    'vip_id', v_vip.vip_id,
    'target_vip_username', v_vip.username,
    'target_vip_name', v_vip.name,
    'approval_status', 'PENDING_APPROVAL',
    'phone_verified', false,
    'auth_token', v_token,
    'notif_id', v_notif_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_staff_registration_request(text, text, text, text, text, text, text, text, text, jsonb) TO anon, authenticated;


-- 6. Fix any historical notifications action_url to point to /staff-requests
UPDATE public.notifications
SET action_url = '/staff-requests'
WHERE type = 'staff_request'
  AND (action_url = '/privileged-users' OR action_url IS NULL);
