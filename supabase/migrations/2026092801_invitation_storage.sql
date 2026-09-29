-- Migration: Setup Supabase Storage for Invitation Photos with VIP Isolation
-- Bucket: 'invitations' (Private bucket)

-- 1. Create storage bucket for invitation photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'invitations',
    'invitations',
    false,
    15728640, -- 15MB max file size
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/jpg', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
    file_size_limit = 15728640,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/jpg', 'image/gif'];

-- 2. Drop any conflicting older policies for invitations bucket
DROP POLICY IF EXISTS "invitations_bucket_select" ON storage.objects;
DROP POLICY IF EXISTS "invitations_bucket_insert" ON storage.objects;
DROP POLICY IF EXISTS "invitations_bucket_update" ON storage.objects;
DROP POLICY IF EXISTS "invitations_bucket_delete" ON storage.objects;

-- 3. Create isolated policies on storage.objects for 'invitations' bucket
-- Allows access based on VIP identity matching the folder path: vip_id/event_id/file.jpg
CREATE POLICY "invitations_bucket_select"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (
    bucket_id = 'invitations' AND (
        (storage.foldername(name))[1] = public.get_auth_vip_id()
        OR public.get_auth_vip_id() IS NULL
    )
);

CREATE POLICY "invitations_bucket_insert"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (
    bucket_id = 'invitations' AND (
        (storage.foldername(name))[1] = public.get_auth_vip_id()
        OR public.get_auth_vip_id() IS NULL
    )
);

CREATE POLICY "invitations_bucket_update"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (
    bucket_id = 'invitations' AND (
        (storage.foldername(name))[1] = public.get_auth_vip_id()
        OR public.get_auth_vip_id() IS NULL
    )
)
WITH CHECK (
    bucket_id = 'invitations' AND (
        (storage.foldername(name))[1] = public.get_auth_vip_id()
        OR public.get_auth_vip_id() IS NULL
    )
);

CREATE POLICY "invitations_bucket_delete"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (
    bucket_id = 'invitations' AND (
        (storage.foldername(name))[1] = public.get_auth_vip_id()
        OR public.get_auth_vip_id() IS NULL
    )
);

-- 4. Add image_url column to public.invitations if it doesn't already exist
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS image_url TEXT;
