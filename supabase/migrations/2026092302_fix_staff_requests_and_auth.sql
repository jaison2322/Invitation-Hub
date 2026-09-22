-- ==============================================================================
-- Migration: 2026092302_fix_staff_requests_and_auth.sql
-- Description: Add email_verified columns and deploy get_vip_staff_accounts RPC
-- ==============================================================================

-- 1. Ensure email_verified columns exist
ALTER TABLE public.user_accounts
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Dedicated Secure Staff Accounts & Requests RPC
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
