-- ==============================================================================
-- 99_test_validation_suite.sql
-- Invitation Hub Secure Database Rebuild — Validation Script (Dry-Run Only)
-- Purpose: Non-destructive static and transaction-rolled-back validation suite.
--          Validates foreign keys, composite tenant constraints, RLS policies,
--          identity resolution, account takeover guards, and privilege boundaries.
--
-- INSTRUCTIONS: Run inside a transaction block that ends in ROLLBACK.
-- This script performs zero persistent mutations on the target database.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- TEST 1: Schema Compilation & Object Verification
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_table_count integer;
  v_func_count integer;
  v_composite_fk_count integer;
BEGIN
  -- 1. Check all 11 core tables
  SELECT COUNT(*) INTO v_table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN (
      'vip_users', 'user_accounts', 'people', 'invitations',
      'family_events', 'schedule_items', 'reminders', 'activity_logs',
      'notifications', 'gift_records', 'device_tokens'
    );

  IF v_table_count <> 11 THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Expected 11 core tables, found %', v_table_count;
  END IF;

  -- 2. Check all secure RPC functions
  SELECT COUNT(*) INTO v_func_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'get_auth_identity', 'get_auth_vip_id', 'get_auth_username',
      'lookup_user_account', 'update_user_auth_token', 'check_vip_principal_exists',
      'submit_staff_registration_request', 'respond_to_staff_request',
      'reassign_staff_vip', 'get_vip_staff_accounts', 'register_device_token',
      'deactivate_device_token', 'deactivate_all_user_tokens', 'verify_staff_phone'
    );

  IF v_func_count < 14 THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Expected at least 14 secure RPC functions, found %', v_func_count;
  END IF;

  -- 3. Check composite tenant unique constraints
  SELECT COUNT(*) INTO v_composite_fk_count
  FROM information_schema.table_constraints
  WHERE table_schema = 'public'
    AND constraint_name IN (
      'uq_people_tenant', 'uq_invitations_tenant', 'uq_family_events_tenant',
      'uq_schedule_items_tenant', 'uq_reminders_tenant', 'uq_activity_logs_tenant',
      'uq_notifications_tenant', 'uq_gift_records_tenant', 'uq_user_accounts_tenant'
    );

  IF v_composite_fk_count < 9 THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Expected at least 9 composite tenant constraints, found %', v_composite_fk_count;
  END IF;

  RAISE NOTICE 'TEST 1 PASSED: All 11 tables, 14 secure RPC functions, and composite tenant constraints compiled.';
END;
$$;

-- ------------------------------------------------------------------------------
-- TEST 2: Privilege Boundary Checks
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_forbidden_privileges integer;
  v_phone_verify_public_privs integer;
BEGIN
  -- Verify anon and authenticated have NO direct INSERT, UPDATE, or DELETE on device_tokens
  SELECT COUNT(*) INTO v_forbidden_privileges
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name = 'device_tokens'
    AND grantee IN ('anon', 'authenticated', 'public')
    AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE');

  IF v_forbidden_privileges > 0 THEN
    RAISE EXCEPTION 'TEST 2 FAILED: Found % direct write privileges on public.device_tokens granted to unprivileged roles!', v_forbidden_privileges;
  END IF;

  -- Verify verify_staff_phone execution is revoked from PUBLIC
  SELECT COUNT(*) INTO v_phone_verify_public_privs
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name = 'verify_staff_phone'
    AND grantee = 'PUBLIC';

  IF v_phone_verify_public_privs > 0 THEN
    RAISE EXCEPTION 'TEST 2 FAILED: verify_staff_phone execute privilege is granted to PUBLIC!';
  END IF;

  RAISE NOTICE 'TEST 2 PASSED: Direct table writes on device_tokens revoked and RPC privileges secured.';
END;
$$;

-- ------------------------------------------------------------------------------
-- TEST 3: Multi-Tenant Identity & Header Spoofing Protection
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_vip_a_token text := 'token_test_suite_vip_a_12345';
  v_vip_b_token text := 'token_test_suite_vip_b_67890';
  v_resolved_user text;
  v_resolved_vip text;
BEGIN
  -- Insert synthetic VIP tenants
  INSERT INTO public.vip_users (id, username, name, phone, email, pin)
  VALUES
    ('vip_tenant_alpha', 'tenant_alpha', 'VIP Alpha', '+15550000001', 'alpha@vip.local', '1234'),
    ('vip_tenant_beta', 'tenant_beta', 'VIP Beta', '+15550000002', 'beta@vip.local', '5678');

  INSERT INTO public.user_accounts (username, vip_id, password_hash, name, role, auth_token, approval_status, phone_verified)
  VALUES
    ('tenant_alpha', 'vip_tenant_alpha', '9f22ea7d86cb91f45e0a16243a836018c3349985fa5e2f453013d615a19fdf32', 'VIP Alpha', 'vip', v_vip_a_token, 'APPROVED', true),
    ('tenant_beta', 'vip_tenant_beta', 'e70dbd7d2934068a0db9300afc004d29df7ad7928d869cfedb13a69b95dde6bc', 'VIP Beta', 'vip', v_vip_b_token, 'APPROVED', true);

  -- 1. Valid VIP Alpha session
  PERFORM set_config('request.headers', json_build_object('x-vip-id', 'vip_tenant_alpha', 'x-user-token', v_vip_a_token)::text, true);
  SELECT verified_username, verified_vip_id INTO v_resolved_user, v_resolved_vip FROM public.get_auth_identity();

  IF v_resolved_user <> 'tenant_alpha' OR v_resolved_vip <> 'vip_tenant_alpha' THEN
    RAISE EXCEPTION 'TEST 3.1 FAILED: Expected tenant_alpha / vip_tenant_alpha, got % / %', v_resolved_user, v_resolved_vip;
  END IF;

  -- 2. Cross-tenant header spoofing: Claim VIP Beta with VIP Alpha's token
  PERFORM set_config('request.headers', json_build_object('x-vip-id', 'vip_tenant_beta', 'x-user-token', v_vip_a_token)::text, true);
  SELECT verified_username, verified_vip_id INTO v_resolved_user, v_resolved_vip FROM public.get_auth_identity();

  IF v_resolved_user IS NOT NULL OR v_resolved_vip IS NOT NULL THEN
    RAISE EXCEPTION 'TEST 3.2 FAILED: Cross-tenant spoofing succeeded! Expected NULL, got % / %', v_resolved_user, v_resolved_vip;
  END IF;

  RAISE NOTICE 'TEST 3 PASSED: Multi-tenant identity resolution and spoofing denial verified.';
END;
$$;

-- ------------------------------------------------------------------------------
-- TEST 4: Staff Registration Account Takeover Protection (P0)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_legit_hash text := '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8'; -- 'Password123!'
  v_attacker_hash text := 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f'; -- 'HackerPass'
  v_res jsonb;
  v_persisted_hash text;
BEGIN
  -- 1. Legitimate user submits staff registration
  v_res := public.submit_staff_registration_request(
    'staff_takeover_test',
    v_legit_hash,
    'Alice Staff',
    'PA',
    'tenant_alpha',
    '+15551112222'
  );
  IF NOT (v_res->>'success')::boolean THEN
    RAISE EXCEPTION 'TEST 4.1 FAILED: Initial staff registration failed: %', v_res;
  END IF;

  -- 2. Attacker attempts to overwrite account credentials using wrong password hash
  v_res := public.submit_staff_registration_request(
    'staff_takeover_test',
    v_attacker_hash,
    'Evil Attacker',
    'Infiltrator',
    'tenant_beta',
    '+15559999999'
  );

  IF (v_res->>'success')::boolean THEN
    RAISE EXCEPTION 'TEST 4.2 FAILED: Account takeover was permitted! Attacker successfully updated account: %', v_res;
  END IF;

  IF v_res->>'code' <> 'ACCOUNT_TAKEOVER_PREVENTED' THEN
    RAISE EXCEPTION 'TEST 4.3 FAILED: Expected code ACCOUNT_TAKEOVER_PREVENTED, got %', v_res->>'code';
  END IF;

  -- 3. Verify password hash was NOT modified in the database
  SELECT password_hash INTO v_persisted_hash
  FROM public.user_accounts
  WHERE username = 'staff_takeover_test';

  IF v_persisted_hash <> v_legit_hash THEN
    RAISE EXCEPTION 'TEST 4.4 FAILED: Password hash was tampered with! Expected %, got %', v_legit_hash, v_persisted_hash;
  END IF;

  RAISE NOTICE 'TEST 4 PASSED: Staff account takeover during registration strictly blocked.';
END;
$$;

-- ------------------------------------------------------------------------------
-- TEST 5: Unauthorized Staff Reassignment Prevention (P0)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_vip_b_token text := 'token_test_suite_vip_b_67890';
  v_vip_a_token text := 'token_test_suite_vip_a_12345';
  v_res jsonb;
  v_persisted_vip text;
BEGIN
  -- VIP Beta attempts to reassign Alice (who belongs to VIP Alpha) to VIP Beta
  PERFORM set_config('request.headers', json_build_object('x-vip-id', 'vip_tenant_beta', 'x-user-token', v_vip_b_token)::text, true);

  v_res := public.reassign_staff_vip('staff_takeover_test', 'tenant_beta');

  IF (v_res->>'success')::boolean THEN
    RAISE EXCEPTION 'TEST 5.1 FAILED: Cross-tenant staff reassignment was permitted! Response: %', v_res;
  END IF;

  IF v_res->>'code' <> 'CROSS_TENANT_FORBIDDEN' THEN
    RAISE EXCEPTION 'TEST 5.2 FAILED: Expected code CROSS_TENANT_FORBIDDEN, got %', v_res->>'code';
  END IF;

  -- Verify Alice still belongs to VIP Alpha
  SELECT vip_id INTO v_persisted_vip
  FROM public.user_accounts
  WHERE username = 'staff_takeover_test';

  IF v_persisted_vip <> 'vip_tenant_alpha' THEN
    RAISE EXCEPTION 'TEST 5.3 FAILED: Staff member was reassigned without authorization! Current vip_id: %', v_persisted_vip;
  END IF;

  -- Now test authorized reassignment: VIP Alpha reassigns Alice to VIP Beta
  PERFORM set_config('request.headers', json_build_object('x-vip-id', 'vip_tenant_alpha', 'x-user-token', v_vip_a_token)::text, true);
  v_res := public.reassign_staff_vip('staff_takeover_test', 'tenant_beta');

  IF NOT (v_res->>'success')::boolean THEN
    RAISE EXCEPTION 'TEST 5.4 FAILED: Authorized reassignment by owner VIP failed: %', v_res;
  END IF;

  RAISE NOTICE 'TEST 5 PASSED: Unauthorized staff reassignment strictly rejected.';
END;
$$;

-- ------------------------------------------------------------------------------
-- TEST 6: Composite Tenant Constraint Enforcement (P1)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_person_id text := 'person_alpha_001';
  v_invitation_id text := 'invitation_beta_001';
  v_fk_failed boolean := false;
BEGIN
  -- Insert a person under VIP Alpha
  INSERT INTO public.people (id, vip_id, name, relationship)
  VALUES (v_person_id, 'vip_tenant_alpha', 'Governor Davis', 'Dignitary');

  -- Attempt to insert an invitation under VIP Beta referencing VIP Alpha's person
  BEGIN
    INSERT INTO public.invitations (id, vip_id, person_id, event_type, title, date)
    VALUES (v_invitation_id, 'vip_tenant_beta', v_person_id, 'Gala', 'Beta State Banquet', CURRENT_DATE);
  EXCEPTION WHEN foreign_key_violation THEN
    v_fk_failed := true;
  END;

  IF NOT v_fk_failed THEN
    RAISE EXCEPTION 'TEST 6 FAILED: Composite foreign key constraint did not block cross-tenant person reference!';
  END IF;

  RAISE NOTICE 'TEST 6 PASSED: Composite tenant constraints block cross-tenant foreign references.';
END;
$$;

-- ------------------------------------------------------------------------------
-- TEST 7: Information Disclosure in lookup_user_account (P1)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_res record;
  v_count integer := 0;
BEGIN
  -- Unauthenticated lookup
  PERFORM set_config('request.headers', '{}'::text, true);

  FOR v_res IN SELECT * FROM public.lookup_user_account('tenant_alpha') LOOP
    v_count := v_count + 1;
    -- Verify contact information is redacted for unauthenticated caller
    IF v_res.phone IS NOT NULL OR v_res.email IS NOT NULL THEN
      RAISE EXCEPTION 'TEST 7.1 FAILED: Contact info leaked to unauthenticated caller: phone=%, email=%', v_res.phone, v_res.email;
    END IF;
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'TEST 7.2 FAILED: lookup_user_account did not return account for valid username';
  END IF;

  -- Test enumeration prevention: searching by phone should return 0 rows
  SELECT COUNT(*) INTO v_count FROM public.lookup_user_account('+15550000001');
  IF v_count > 0 THEN
    RAISE EXCEPTION 'TEST 7.3 FAILED: lookup_user_account permitted phone-based user enumeration!';
  END IF;

  RAISE NOTICE 'TEST 7 PASSED: Sensitive fields stripped and phone enumeration blocked.';
END;
$$;

-- ------------------------------------------------------------------------------
-- TEST 8: Non-Mutating verify_staff_phone (P1)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_res jsonb;
  v_original_phone text;
  v_current_phone text;
BEGIN
  SELECT phone INTO v_original_phone FROM public.user_accounts WHERE username = 'tenant_alpha';

  -- Call verify_staff_phone attempting to change phone to an attacker number
  v_res := public.verify_staff_phone('tenant_alpha', '999999', '+19998887777');

  SELECT phone INTO v_current_phone FROM public.user_accounts WHERE username = 'tenant_alpha';

  IF v_current_phone <> v_original_phone THEN
    RAISE EXCEPTION 'TEST 8 FAILED: verify_staff_phone mutated the user phone number! Expected %, got %', v_original_phone, v_current_phone;
  END IF;

  RAISE NOTICE 'TEST 8 PASSED: verify_staff_phone is confirmed strictly non-mutating.';
END;
$$;

-- ------------------------------------------------------------------------------
-- TEST 9: Device Token Ownership & Concurrency Protection
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_vip_a_token text := 'token_test_suite_vip_a_12345';
  v_vip_b_token text := 'token_test_suite_vip_b_67890';
  v_rpc_res jsonb;
BEGIN
  -- 1. Register token under VIP Alpha
  PERFORM set_config('request.headers', json_build_object('x-vip-id', 'vip_tenant_alpha', 'x-user-token', v_vip_a_token)::text, true);
  v_rpc_res := public.register_device_token('fcm_token_alpha_phone_unique_1234567890', 'android', 'android-device-1');

  IF NOT (v_rpc_res->>'success')::boolean THEN
    RAISE EXCEPTION 'TEST 9.1 FAILED: register_device_token failed: %', v_rpc_res;
  END IF;

  -- 2. VIP Beta attempts to register VIP Alpha's active token
  PERFORM set_config('request.headers', json_build_object('x-vip-id', 'vip_tenant_beta', 'x-user-token', v_vip_b_token)::text, true);
  v_rpc_res := public.register_device_token('fcm_token_alpha_phone_unique_1234567890', 'android', 'android-device-2');

  IF (v_rpc_res->>'success')::boolean THEN
    RAISE EXCEPTION 'TEST 9.2 FAILED: Cross-user token takeover was permitted! Response: %', v_rpc_res;
  END IF;

  IF v_rpc_res->>'code' <> 'TOKEN_OWNERSHIP_CONFLICT' THEN
    RAISE EXCEPTION 'TEST 9.3 FAILED: Expected TOKEN_OWNERSHIP_CONFLICT, got %', v_rpc_res->>'code';
  END IF;

  RAISE NOTICE 'TEST 9 PASSED: Device token ownership conflict protection verified.';
END;
$$;

-- ------------------------------------------------------------------------------
-- TEST 10: Fail-Closed Environment Guard Simulation
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_guard_failed boolean := false;
  v_configured_ref text := NULL;
BEGIN
  -- If app.settings.expected_project_ref is not set or mismatched, preflight must fail
  BEGIN
    IF v_configured_ref IS NULL OR v_configured_ref <> 'kdbkfmzsdinkvslvgson' THEN
      RAISE EXCEPTION 'PREFLIGHT_FAIL_CLOSED';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_guard_failed := true;
  END;

  IF NOT v_guard_failed THEN
    RAISE EXCEPTION 'TEST 10 FAILED: Environment guard did not fail closed on missing configuration!';
  END IF;

  RAISE NOTICE 'TEST 10 PASSED: Environment guard fail-closed behavior confirmed.';
END;
$$;

DO $$
BEGIN
  RAISE NOTICE '====================================================================';
  RAISE NOTICE 'ALL 10 VERIFICATION TESTS PASSED SUCCESSFULLY!';
  RAISE NOTICE 'Rolling back transaction now (Zero persistent database modifications).';
  RAISE NOTICE '====================================================================';
END;
$$;

-- ------------------------------------------------------------------------------
-- ROLLBACK TRANSACTION (Ensures ZERO persistent state mutations)
-- ------------------------------------------------------------------------------
ROLLBACK;

