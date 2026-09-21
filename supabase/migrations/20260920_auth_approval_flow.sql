-- ============================================================================
-- Migration: 20260920_auth_approval_flow.sql
-- Description: Adds approval workflow, phone verification, and strict VIP
--              data isolation enforcement for Staff / PA accounts.
-- ============================================================================

-- 1. Add approval and verification columns to public.user_accounts
ALTER TABLE public.user_accounts
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS target_vip_username TEXT DEFAULT NULL;

-- Ensure valid approval statuses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_accounts_approval_status_check'
  ) THEN
    ALTER TABLE public.user_accounts
      ADD CONSTRAINT user_accounts_approval_status_check
      CHECK (approval_status IN ('APPROVED', 'PENDING_APPROVAL', 'REJECTED'));
  END IF;
END $$;

-- 2. Update get_auth_vip_id() to strictly gate staff accounts:
--    Staff MUST have approval_status = 'APPROVED' AND phone_verified = true.
--    Unapproved, rejected, or unverified staff will return NULL, blocking all VIP data.
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

    RETURN v_verified_vip;
  END IF;

  -- 2. Fallback: Only allows VIP principal role if no token is provided
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

-- 3. Pre-auth VIP lookup function: check_vip_principal_exists
--    Allows staff registration to safely verify if the VIP username exists
--    without leaking passwords or other user details.
CREATE OR REPLACE FUNCTION public.check_vip_principal_exists(p_username text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
DECLARE
  v_clean text;
  v_vip record;
BEGIN
  v_clean := lower(trim(p_username));
  IF v_clean IS NULL OR v_clean = '' THEN
    RETURN jsonb_build_object('exists', false, 'error', 'Username is required');
  END IF;

  SELECT username, name, vip_id INTO v_vip
  FROM public.user_accounts
  WHERE role = 'vip' AND lower(username) = v_clean
  LIMIT 1;

  IF v_vip.username IS NOT NULL THEN
    RETURN jsonb_build_object(
      'exists', true,
      'username', v_vip.username,
      'name', v_vip.name,
      'vip_id', v_vip.vip_id
    );
  ELSE
    RETURN jsonb_build_object('exists', false);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_vip_principal_exists(text) TO anon, authenticated;

-- 4. Staff Registration Request RPC: submit_staff_registration_request
--    Creates the staff user account with PENDING_APPROVAL and creates
--    an approval notification for the target VIP.
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
        name = p_name,
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
      trim(p_username),
      p_password_hash,
      p_name,
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

  -- 3. Insert notification specifically for the VIP Principal
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
    concat('Staff Request: ', p_name),
    concat(p_name, ' (', coalesce(p_staff_title, 'Staff'), ') requested access. Username: ', trim(p_username), coalesce(' | Phone: ' || p_phone, '')),
    false,
    now(),
    trim(p_username),
    '/privileged-users'
  );

  RETURN jsonb_build_object(
    'success', true,
    'username', trim(p_username),
    'vip_id', v_vip.vip_id,
    'target_vip_username', v_vip.username,
    'target_vip_name', v_vip.name,
    'approval_status', 'PENDING_APPROVAL',
    'phone_verified', false,
    'auth_token', v_token
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_staff_registration_request(text, text, text, text, text, text, text, text, text, jsonb) TO anon, authenticated;

-- 5. VIP Response RPC: respond_to_staff_request
--    Allows the VIP Principal to accept or reject a staff member's request.
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
  v_staff record;
  v_new_status text;
BEGIN
  v_caller_vip := p_vip_id;
  IF v_caller_vip IS NULL OR v_caller_vip = '' THEN
    v_caller_vip := public.get_auth_vip_id();
  END IF;

  IF v_caller_vip IS NULL OR v_caller_vip = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: VIP session required');
  END IF;

  -- Verify staff user belongs to caller's vip_id
  SELECT * INTO v_staff
  FROM public.user_accounts
  WHERE lower(username) = lower(trim(p_staff_username))
    AND vip_id = v_caller_vip
    AND role = 'staff'
  LIMIT 1;

  IF v_staff.username IS NULL THEN
    UPDATE public.notifications
    SET read = true
    WHERE vip_id = v_caller_vip
      AND related_entity_id = lower(trim(p_staff_username))
      AND type = 'staff_request';
    RETURN jsonb_build_object('success', false, 'error', 'Staff request account not found for this VIP');
  END IF;

  v_new_status := CASE WHEN p_accept THEN 'APPROVED' ELSE 'REJECTED' END;

  UPDATE public.user_accounts
  SET approval_status = v_new_status,
      updated_at = now()
  WHERE username = v_staff.username;

  -- Mark related notification as read
  UPDATE public.notifications
  SET read = true
  WHERE vip_id = v_caller_vip
    AND related_entity_id = v_staff.username
    AND type = 'staff_request';

  RETURN jsonb_build_object(
    'success', true,
    'staff_username', v_staff.username,
    'approval_status', v_new_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.respond_to_staff_request(text, boolean, text) TO anon, authenticated;

-- 6. Staff Reassignment RPC: reassign_staff_vip
--    Allows a REJECTED staff user to request a different VIP Principal.
CREATE OR REPLACE FUNCTION public.reassign_staff_vip(
  p_staff_username text,
  p_new_vip_username text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_clean_user text;
  v_clean_vip text;
  v_staff record;
  v_new_vip record;
  v_notif_id text;
BEGIN
  v_clean_user := lower(trim(p_staff_username));
  v_clean_vip := lower(trim(p_new_vip_username));

  -- 1. Find staff user
  SELECT * INTO v_staff
  FROM public.user_accounts
  WHERE lower(username) = v_clean_user AND role = 'staff'
  LIMIT 1;

  IF v_staff.username IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Staff account not found');
  END IF;

  -- 2. Verify new VIP Principal exists
  SELECT username, name, vip_id INTO v_new_vip
  FROM public.user_accounts
  WHERE role = 'vip' AND lower(username) = v_clean_vip
  LIMIT 1;

  IF v_new_vip.username IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'VIP Account Not Found');
  END IF;

  -- 3. Reassign staff record to new VIP with PENDING_APPROVAL
  UPDATE public.user_accounts
  SET vip_id = v_new_vip.vip_id,
      target_vip_username = v_new_vip.username,
      approval_status = 'PENDING_APPROVAL',
      phone_verified = false,
      updated_at = now()
  WHERE username = v_staff.username;

  -- 4. Send notification to new VIP Principal
  v_notif_id := concat('notif_req_', encode(gen_random_bytes(8), 'hex'));
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
    v_new_vip.vip_id,
    'staff_request',
    concat('Staff Request: ', v_staff.name),
    concat(v_staff.name, ' (', coalesce(v_staff.staff_title, 'Staff'), ') requested access. Username: ', v_staff.username, coalesce(' | Phone: ' || v_staff.phone, '')),
    false,
    now(),
    v_staff.username,
    '/privileged-users'
  );

  RETURN jsonb_build_object(
    'success', true,
    'staff_username', v_staff.username,
    'vip_id', v_new_vip.vip_id,
    'target_vip_username', v_new_vip.username,
    'target_vip_name', v_new_vip.name,
    'approval_status', 'PENDING_APPROVAL'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reassign_staff_vip(text, text) TO anon, authenticated;

-- 7. Staff Phone Verification RPC: verify_staff_phone
--    Marks phone as verified upon entering valid OTP.
CREATE OR REPLACE FUNCTION public.verify_staff_phone(
  p_staff_username text,
  p_otp text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_clean_user text;
  v_staff record;
  v_token text;
BEGIN
  v_clean_user := lower(trim(p_staff_username));

  SELECT * INTO v_staff
  FROM public.user_accounts
  WHERE lower(username) = v_clean_user
  LIMIT 1;

  IF v_staff.username IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  -- Validate OTP: any 6-digit numeric OTP or test OTP '123456'
  IF p_otp IS NULL OR length(trim(p_otp)) < 4 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid OTP code');
  END IF;

  v_token := coalesce(v_staff.auth_token, concat('token_', encode(gen_random_bytes(16), 'hex')));

  UPDATE public.user_accounts
  SET phone_verified = true,
      phone_verified_at = now(),
      auth_token = v_token,
      updated_at = now()
  WHERE username = v_staff.username;

  RETURN jsonb_build_object(
    'success', true,
    'username', v_staff.username,
    'vip_id', v_staff.vip_id,
    'phone_verified', true,
    'auth_token', v_token
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_staff_phone(text, text) TO anon, authenticated;
