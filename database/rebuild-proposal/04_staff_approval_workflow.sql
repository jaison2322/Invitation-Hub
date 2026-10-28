-- ==============================================================================
-- 04_staff_approval_workflow.sql
-- Invitation Hub Secure Database Rebuild — Migration Step 04
-- Purpose: Complete Staff / PA registration, approval, rejection, and reassignment
--          lifecycle with strict caller identity enforcement (Fixes SEC-03, P0 & P1).
-- Target Environment: Staging ONLY (project ref: kdbkfmzsdinkvslvgson)
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. Staff Registration Request RPC: submit_staff_registration_request()
-- ------------------------------------------------------------------------------
-- Allows prospective staff members to request access to a VIP Principal.
-- Creates a user_accounts record with PENDING_APPROVAL and dispatches a notification
-- to the target VIP Principal.
-- No phone OTP requirement; phone numbers stored as contact info only.
--
-- SECURITY HARDENING (Account Takeover Prevention):
-- 1. If username does not exist: inserts new staff request with PENDING_APPROVAL.
-- 2. If username exists and is APPROVED or VIP: rejects with USERNAME_TAKEN.
-- 3. If username exists and is PENDING/REJECTED: requires matching existing password_hash.
--    An attacker CANNOT overwrite credentials or personal details of an existing
--    pending/rejected account without knowing its password.
-- ------------------------------------------------------------------------------
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
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clean_user text;
  v_clean_vip text;
  v_vip record;
  v_existing record;
  v_token text;
  v_notif_id text;
  v_now timestamptz := NOW();
BEGIN
  v_clean_user := lower(trim(p_username));
  v_clean_vip := lower(trim(p_vip_username));

  IF v_clean_user IS NULL OR v_clean_user = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Staff username is required', 'code', 'VALIDATION_ERROR');
  END IF;

  IF v_clean_vip IS NULL OR v_clean_vip = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'VIP Principal username is required', 'code', 'VALIDATION_ERROR');
  END IF;

  IF p_password_hash IS NULL OR trim(p_password_hash) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Password hash is required', 'code', 'VALIDATION_ERROR');
  END IF;

  -- 1. Verify VIP Principal exists
  SELECT username, name, vip_id INTO v_vip
  FROM public.user_accounts
  WHERE role = 'vip' AND lower(username) = v_clean_vip
  LIMIT 1;

  IF v_vip.username IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'VIP Account Not Found', 'code', 'VIP_NOT_FOUND');
  END IF;

  -- 2. Check if username is already registered
  SELECT username, password_hash, role, approval_status, vip_id INTO v_existing
  FROM public.user_accounts
  WHERE lower(username) = v_clean_user
  LIMIT 1;

  v_token := concat('token_', replace(gen_random_uuid()::text, '-', ''));
  v_notif_id := concat('notif_req_', substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));

  IF v_existing.username IS NOT NULL THEN
    -- If already approved or is a VIP, reject duplicate registration immediately
    IF v_existing.approval_status = 'APPROVED' OR v_existing.role = 'vip' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Username is already registered. Please sign in.',
        'code', 'USERNAME_TAKEN'
      );
    END IF;

    -- ACCOUNT TAKEOVER GUARD:
    -- If account is in PENDING_APPROVAL or REJECTED status, require caller to prove
    -- ownership by presenting the matching password hash before modifying application details.
    IF v_existing.password_hash <> lower(trim(p_password_hash)) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Username is already registered. To update your pending registration, you must supply your existing password.',
        'code', 'ACCOUNT_TAKEOVER_PREVENTED'
      );
    END IF;

    -- Owner authenticated: update pending application details and retarget to VIP
    UPDATE public.user_accounts
    SET name = trim(p_name),
        staff_title = p_staff_title,
        vip_id = v_vip.vip_id,
        target_vip_username = v_vip.username,
        phone = p_phone,
        email = p_email,
        pin = p_pin,
        avatar = p_avatar,
        permissions = COALESCE(p_permissions, '{}'::jsonb),
        approval_status = 'PENDING_APPROVAL',
        phone_verified = true,
        auth_token = v_token,
        updated_at = v_now
    WHERE lower(username) = v_clean_user;
  ELSE
    -- Brand new staff registration record
    INSERT INTO public.user_accounts (
      username,
      vip_id,
      password_hash,
      name,
      role,
      staff_title,
      target_vip_username,
      approval_status,
      phone,
      email,
      phone_verified,
      auth_token,
      pin,
      avatar,
      permissions,
      created_at,
      updated_at
    ) VALUES (
      v_clean_user,
      v_vip.vip_id,
      lower(trim(p_password_hash)),
      trim(p_name),
      'staff',
      p_staff_title,
      v_vip.username,
      'PENDING_APPROVAL',
      p_phone,
      p_email,
      true,
      v_token,
      p_pin,
      p_avatar,
      COALESCE(p_permissions, '{}'::jsonb),
      v_now,
      v_now
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
    concat('Staff Request: ', trim(p_name)),
    concat(trim(p_name), ' (', coalesce(p_staff_title, 'Staff'), ') requested access. Username: ', v_clean_user, coalesce(' | Phone: ' || p_phone, '')),
    false,
    v_now,
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
    'auth_token', v_token,
    'notif_id', v_notif_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_staff_registration_request(text, text, text, text, text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_staff_registration_request(text, text, text, text, text, text, text, text, text, jsonb) TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 2. VIP Response RPC: respond_to_staff_request() (Fixes SEC-03)
-- ------------------------------------------------------------------------------
-- Authorizes or declines a staff member's request.
-- CRITICAL SECURITY FIX: Never trusts caller-supplied p_vip_id!
-- Derives caller VIP identity strictly from get_auth_identity().
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.respond_to_staff_request(
  p_staff_username text,
  p_accept boolean,
  p_vip_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth record;
  v_caller_vip text;
  v_caller_role text;
  v_staff record;
  v_vip record;
  v_new_status text;
BEGIN
  -- Strict Authorization: Derive caller identity from verified session credentials
  SELECT * INTO v_auth FROM public.get_auth_identity();
  
  IF v_auth.verified_username IS NULL OR v_auth.verified_vip_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: VIP session required', 'code', 'UNAUTHORIZED');
  END IF;

  v_caller_vip := v_auth.verified_vip_id;

  -- Ensure caller is an approved VIP Principal
  SELECT role INTO v_caller_role
  FROM public.user_accounts
  WHERE username = v_auth.verified_username AND vip_id = v_caller_vip;

  IF v_caller_role <> 'vip' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden: Only the VIP Principal can respond to staff requests', 'code', 'FORBIDDEN');
  END IF;

  -- 1. Locate staff account belonging to this verified VIP tenant
  SELECT username, name, role, approval_status, vip_id
  INTO v_staff
  FROM public.user_accounts
  WHERE lower(username) = lower(trim(p_staff_username))
    AND vip_id = v_caller_vip
    AND role = 'staff';

  IF v_staff.username IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Staff request account not found for this VIP tenant', 'code', 'NOT_FOUND');
  END IF;

  v_new_status := CASE WHEN p_accept THEN 'APPROVED' ELSE 'REJECTED' END;

  -- 2. Update user_accounts approval_status
  UPDATE public.user_accounts
  SET approval_status = v_new_status,
      phone_verified = true,
      updated_at = NOW()
  WHERE username = v_staff.username;

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
    concat('act_', substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
    v_caller_vip,
    v_auth.verified_username,
    COALESCE(v_vip.name, 'VIP Principal'),
    CASE WHEN p_accept THEN 'staff_approved' ELSE 'staff_rejected' END,
    'staff',
    v_staff.username,
    v_staff.name,
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'staff_username', v_staff.username,
    'name', v_staff.name,
    'approval_status', v_new_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.respond_to_staff_request(text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_to_staff_request(text, boolean, text) TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 3. Staff Reassignment RPC: reassign_staff_vip() (Hardened for P0 Finding)
-- ------------------------------------------------------------------------------
-- Reassigns a staff member to another VIP Principal.
--
-- STRICT AUTHORIZATION BOUNDARY:
-- 1. Caller MUST be an authenticated VIP principal (verified via get_auth_identity()).
-- 2. Caller MUST own the staff member's current VIP tenant (staff.vip_id = v_caller_vip).
-- 3. Cross-tenant callers (VIP B attempting to reassign VIP A's staff) are strictly
--    REJECTED without modifying any database records.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reassign_staff_vip(
  p_staff_username text,
  p_new_vip_username text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth record;
  v_caller_vip text;
  v_caller_role text;
  v_clean_user text;
  v_clean_vip text;
  v_staff record;
  v_new_vip record;
  v_notif_id text;
  v_now timestamptz := NOW();
BEGIN
  v_clean_user := lower(trim(p_staff_username));
  v_clean_vip := lower(trim(p_new_vip_username));

  -- 1. Extract and verify caller session
  SELECT * INTO v_auth FROM public.get_auth_identity();
  IF v_auth.verified_username IS NULL OR v_auth.verified_vip_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: Valid VIP session required to reassign staff',
      'code', 'UNAUTHORIZED'
    );
  END IF;

  v_caller_vip := v_auth.verified_vip_id;

  -- 2. Verify caller is an approved VIP principal
  SELECT role INTO v_caller_role
  FROM public.user_accounts
  WHERE username = v_auth.verified_username AND vip_id = v_caller_vip;

  IF v_caller_role <> 'vip' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Forbidden: Only the VIP Principal can reassign staff accounts',
      'code', 'FORBIDDEN'
    );
  END IF;

  -- 3. Locate target staff member
  SELECT username, name, staff_title, approval_status, role, vip_id
  INTO v_staff
  FROM public.user_accounts
  WHERE lower(username) = v_clean_user AND role = 'staff';

  IF v_staff.username IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Staff account not found', 'code', 'NOT_FOUND');
  END IF;

  -- CRITICAL TENANT CHECK: Caller can ONLY reassign staff currently belonging to their own tenant!
  IF v_staff.vip_id <> v_caller_vip THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: You can only reassign staff members belonging to your own VIP tenant',
      'code', 'CROSS_TENANT_FORBIDDEN'
    );
  END IF;

  -- 4. Verify new VIP Principal exists
  SELECT username, name, vip_id INTO v_new_vip
  FROM public.user_accounts
  WHERE role = 'vip' AND lower(username) = v_clean_vip
  LIMIT 1;

  IF v_new_vip.username IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target VIP Account Not Found', 'code', 'VIP_NOT_FOUND');
  END IF;

  IF v_new_vip.vip_id = v_caller_vip THEN
    RETURN jsonb_build_object('success', false, 'error', 'Staff account is already assigned to this VIP', 'code', 'SAME_VIP');
  END IF;

  -- 5. Reassign staff record to new VIP with PENDING_APPROVAL
  UPDATE public.user_accounts
  SET vip_id = v_new_vip.vip_id,
      target_vip_username = v_new_vip.username,
      approval_status = 'PENDING_APPROVAL',
      phone_verified = true,
      updated_at = v_now
  WHERE username = v_staff.username;

  -- 6. Send notification to new VIP Principal
  v_notif_id := concat('notif_req_', substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
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
    concat('Transferred Staff Request: ', v_staff.name),
    concat(v_staff.name, ' (', coalesce(v_staff.staff_title, 'Staff'), ') was reassigned to your office. Username: ', v_staff.username),
    false,
    v_now,
    v_staff.username,
    '/staff-requests'
  );

  -- 7. Audit log in former VIP tenant
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
    concat('act_', substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
    v_caller_vip,
    v_auth.verified_username,
    'VIP Principal',
    'staff_reassigned',
    'staff',
    v_staff.username,
    v_staff.name,
    v_now
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

REVOKE ALL ON FUNCTION public.reassign_staff_vip(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reassign_staff_vip(text, text) TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 4. Staff Accounts Query RPC: get_vip_staff_accounts() (Fixes SEC-03)
-- ------------------------------------------------------------------------------
-- Returns all staff records for the authenticated VIP.
-- CRITICAL SECURITY FIX: Derives caller VIP identity strictly from get_auth_vip_id().
-- Excludes password_hash, auth_token, and pin.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_vip_staff_accounts(
  p_vip_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_vip text;
  v_result jsonb;
BEGIN
  -- Strict Authorization: Derive caller tenant from verified session
  v_caller_vip := public.get_auth_vip_id();

  IF v_caller_vip IS NULL OR v_caller_vip = '' THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Query staff records strictly for this verified VIP tenant
  SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb) INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'id', concat('priv_', ua.username),
      'username', ua.username,
      'name', ua.name,
      'role', coalesce(ua.staff_title, 'Personal Assistant'),
      'staff_title', ua.staff_title,
      'target_vip_username', ua.target_vip_username,
      'vip_id', ua.vip_id,
      'approval_status', ua.approval_status,
      'phone', ua.phone,
      'email', ua.email,
      'phone_verified', ua.phone_verified,
      'phone_verified_at', ua.phone_verified_at,
      'email_verified', ua.email_verified,
      'email_verified_at', ua.email_verified_at,
      'permissions', ua.permissions,
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

REVOKE ALL ON FUNCTION public.get_vip_staff_accounts(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_vip_staff_accounts(text) TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 5. Safe Compatibility Stub: verify_staff_phone() (NON-MUTATING)
-- ------------------------------------------------------------------------------
-- Phone OTP verification is completely deprecated and removed.
-- CRITICAL SECURITY FIX: This stub performs ZERO DATABASE WRITES.
-- It does NOT alter user phone numbers and does NOT modify phone_verified status,
-- preventing unauthorized phone tampering or account modifications.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_staff_phone(
  p_staff_username text,
  p_otp text DEFAULT '123456',
  p_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Strictly NON-MUTATING response. Preserves existing accounts without modifications.
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Phone verification is deprecated; no database changes performed',
    'phone_verified', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_staff_phone(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_staff_phone(text, text, text) TO authenticated, service_role;

COMMIT;
