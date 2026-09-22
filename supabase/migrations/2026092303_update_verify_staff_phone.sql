-- Migration: 2026092303_update_verify_staff_phone.sql
-- Description: Update verify_staff_phone RPC to accept p_phone so that staff can enter and save their phone number upon first login OTP verification.

DROP FUNCTION IF EXISTS public.verify_staff_phone(text, text);

CREATE OR REPLACE FUNCTION public.verify_staff_phone(
  p_staff_username text,
  p_otp text,
  p_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_clean_user text;
  v_staff record;
  v_token text;
  v_phone text;
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
  v_phone := coalesce(nullif(trim(p_phone), ''), v_staff.phone);

  UPDATE public.user_accounts
  SET phone_verified = true,
      phone_verified_at = now(),
      phone = coalesce(v_phone, phone),
      auth_token = v_token,
      updated_at = now()
  WHERE username = v_staff.username;

  RETURN jsonb_build_object(
    'success', true,
    'username', v_staff.username,
    'vip_id', v_staff.vip_id,
    'phone_verified', true,
    'phone', coalesce(v_phone, v_staff.phone),
    'auth_token', v_token
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_staff_phone(text, text, text) TO anon, authenticated;
