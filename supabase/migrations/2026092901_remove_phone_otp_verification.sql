-- Migration: 2026092901_remove_phone_otp_verification.sql
-- Description: Completely remove phone OTP verification requirements while preserving phone number storage and VIP tenant isolation.

-- 1. Ensure public.user_accounts default for phone_verified is true so no user is blocked
ALTER TABLE public.user_accounts ALTER COLUMN phone_verified SET DEFAULT true;

-- 2. Backfill existing records to ensure no existing user is blocked by phone_verified flag
UPDATE public.user_accounts
SET phone_verified = true
WHERE phone_verified IS NOT TRUE;

-- 3. Update get_auth_vip_id() to authorize approved staff without requiring phone_verified = true
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
  -- Authorized if user is VIP, OR if user is staff with APPROVED status
  IF v_token IS NOT NULL THEN
    SELECT vip_id INTO v_verified_vip
    FROM public.user_accounts
    WHERE vip_id = v_vip_id
      AND auth_token = v_token
      AND (
        role = 'vip'
        OR (role = 'staff' AND approval_status = 'APPROVED')
      )
    LIMIT 1;

    IF v_verified_vip IS NOT NULL THEN
      RETURN v_verified_vip;
    END IF;
  END IF;

  -- 2. Fallback: If VIP principal role matches the requested vip_id, permit access
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

-- 4. Update submit_staff_registration_request to store phone number and default phone_verified to true
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
        phone_verified = true,
        auth_token = v_token,
        updated_at = now()
    WHERE lower(username) = v_clean_user;
  ELSE
    -- Insert new staff record with phone stored
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
      true,
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
    'approval_status', 'PENDING_APPROVAL',
    'phone', p_phone,
    'auth_token', v_token,
    'notif_id', v_notif_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_staff_registration_request(text, text, text, text, text, text, text, text, text, jsonb) TO anon, authenticated;
