-- ==============================================================================
-- 06_storage_policies.sql
-- Invitation Hub Secure Database Rebuild — Migration Step 06
-- Purpose: Setup private Supabase Storage bucket for invitation photos with
--          strict multi-tenant folder isolation reconciled with custom session headers.
-- Target Environment: Staging ONLY (project ref: kdbkfmzsdinkvslvgson)
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. Create / Configure Private Storage Bucket for Invitation Photos
-- ------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'invitations',
    'invitations',
    false, -- STRICT: Private bucket; unauthenticated public access denied
    15728640, -- 15MB max file size
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/jpg', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 15728640,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/jpg', 'image/gif'];

-- ------------------------------------------------------------------------------
-- 2. Drop Any Insecure Legacy Storage Policies (Fixes SEC-04)
-- ------------------------------------------------------------------------------
-- Previous legacy policies included `OR public.get_auth_vip_id() IS NULL`, granting
-- open public access to invitation cards across all tenants.
DROP POLICY IF EXISTS "invitations_bucket_select" ON storage.objects;
DROP POLICY IF EXISTS "invitations_bucket_insert" ON storage.objects;
DROP POLICY IF EXISTS "invitations_bucket_update" ON storage.objects;
DROP POLICY IF EXISTS "invitations_bucket_delete" ON storage.objects;
DROP POLICY IF EXISTS "invitations_service_role_all" ON storage.objects;

-- ------------------------------------------------------------------------------
-- 3. Strict Tenant-Scoped Storage RLS Policies
-- ------------------------------------------------------------------------------
-- STORAGE AUTHENTICATION ARCHITECTURE:
-- In Invitation Hub, authentication is header-based (`x-vip-id` and `x-user-token`)
-- injected automatically by `authenticatedFetch` in `src/utils/supabase.ts`.
--
-- DO NOT rely on `auth.role() = 'authenticated'` alone, as that represents standard
-- Supabase GoTrue JWTs which are not used by the custom tenant auth system.
--
-- All Storage operations evaluate `public.get_auth_vip_id()`. This function parses
-- `x-vip-id` and `x-user-token` from PostgREST/Storage request headers, verifies
-- them against `user_accounts`, and returns the verified VIP tenant UUID/string.
--
-- Folder Structure:
--   Path: {vip_id}/{eventId}/invitation_{timestamp}_{random}.{ext}
--   The first path segment `(storage.foldername(name))[1]` represents the tenant ID.
--
-- Flow Compatibility:
-- 1. Upload: Client uploads to `{vip_id}/...`. Allowed ONLY if `(storage.foldername(name))[1] = get_auth_vip_id()`.
-- 2. View: Client calls `storage.from('invitations').createSignedUrl(...)`. Allowed ONLY if caller owns folder.
-- 3. Delete: Client calls `storage.from('invitations').remove(...)`. Allowed ONLY if caller owns folder.
-- ------------------------------------------------------------------------------

-- SELECT: Only verified tenant members can view or sign URLs for their folder
CREATE POLICY "invitations_bucket_select"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (
    bucket_id = 'invitations'
    AND public.get_auth_vip_id() IS NOT NULL
    AND (storage.foldername(name))[1] = public.get_auth_vip_id()
);

-- INSERT: Only verified tenant members can upload files into their tenant folder
CREATE POLICY "invitations_bucket_insert"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (
    bucket_id = 'invitations'
    AND public.get_auth_vip_id() IS NOT NULL
    AND (storage.foldername(name))[1] = public.get_auth_vip_id()
);

-- UPDATE: Only verified tenant members can overwrite or modify files in their tenant folder
CREATE POLICY "invitations_bucket_update"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (
    bucket_id = 'invitations'
    AND public.get_auth_vip_id() IS NOT NULL
    AND (storage.foldername(name))[1] = public.get_auth_vip_id()
)
WITH CHECK (
    bucket_id = 'invitations'
    AND public.get_auth_vip_id() IS NOT NULL
    AND (storage.foldername(name))[1] = public.get_auth_vip_id()
);

-- DELETE: Only verified tenant members can delete files from their tenant folder
CREATE POLICY "invitations_bucket_delete"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (
    bucket_id = 'invitations'
    AND public.get_auth_vip_id() IS NOT NULL
    AND (storage.foldername(name))[1] = public.get_auth_vip_id()
);

-- Service Role Policy: Background workers and Edge Functions (e.g. AI OCR) retain full access
CREATE POLICY "invitations_service_role_all"
ON storage.objects FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

COMMIT;
