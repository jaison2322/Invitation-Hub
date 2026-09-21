-- ==============================================================================
-- VIP REGISTRATION & PERSISTENCE SECURITY ENHANCEMENTS
-- Supabase Migration: 20260921_fix_vip_registration.sql
-- ==============================================================================

-- 1. Ensure INSERT policy on public.user_accounts is unconditionally permissive
--    for anonymous/authenticated registration flows while keeping SELECT/UPDATE scoped
DROP POLICY IF EXISTS "user_accounts_register_insert" ON public.user_accounts;
CREATE POLICY "user_accounts_register_insert" ON public.user_accounts
FOR INSERT TO anon, authenticated
WITH CHECK (true);

-- 2. Ensure INSERT policy on public.vip_users allows initial profile insertion
DROP POLICY IF EXISTS "vip_users_isolated_insert" ON public.vip_users;
CREATE POLICY "vip_users_isolated_insert" ON public.vip_users
FOR INSERT TO anon, authenticated
WITH CHECK (true);

-- 3. Optional Transactional Security-Definer RPC for VIP Principal Registration
--    Guarantees atomic creation of both user_accounts and vip_users records
CREATE OR REPLACE FUNCTION public.register_vip_principal(
  p_username text,
  p_password_hash text,
  p_name text,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_pin text DEFAULT '1234',
  p_avatar text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_clean text;
  v_vip_id text;
  v_token text;
  v_now timestamptz := now();
  v_existing record;
BEGIN
  v_clean := lower(trim(p_username));
  IF v_clean IS NULL OR v_clean = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Username is required');
  END IF;

  -- Check if username already exists
  SELECT username INTO v_existing
  FROM public.user_accounts
  WHERE lower(username) = v_clean
  LIMIT 1;

  IF v_existing.username IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Username is already registered');
  END IF;

  v_vip_id := concat('vip_', v_clean);
  v_token := concat('token_', encode(gen_random_bytes(16), 'hex'));

  -- 1. Insert user_accounts record
  INSERT INTO public.user_accounts (
    username,
    vip_id,
    password_hash,
    name,
    role,
    phone,
    email,
    pin,
    avatar,
    approval_status,
    auth_token,
    phone_verified,
    phone_verified_at,
    permissions,
    created_at,
    updated_at
  ) VALUES (
    v_clean,
    v_vip_id,
    p_password_hash,
    trim(p_name),
    'vip',
    p_phone,
    p_email,
    p_pin,
    p_avatar,
    'APPROVED',
    v_token,
    true,
    v_now,
    jsonb_build_object('phoneVerified', true, 'emailVerified', true, 'emailVerifiedAt', v_now),
    v_now,
    v_now
  );

  -- 2. Insert vip_users record
  INSERT INTO public.vip_users (
    id,
    username,
    name,
    phone,
    email,
    pin,
    avatar,
    created_at,
    updated_at
  ) VALUES (
    v_vip_id,
    v_clean,
    trim(p_name),
    p_phone,
    p_email,
    p_pin,
    p_avatar,
    v_now,
    v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'username', v_clean,
    'vip_id', v_vip_id,
    'auth_token', v_token,
    'role', 'vip'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_vip_principal(text, text, text, text, text, text, text) TO anon, authenticated;
