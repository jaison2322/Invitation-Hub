-- ==============================================================================
-- Migration: Add device_tokens table for Firebase Cloud Messaging (FCM)
-- Stores FCM push tokens per user/device for cloud push notification delivery
-- ==============================================================================

-- 1. Create the device_tokens table
CREATE TABLE IF NOT EXISTS public.device_tokens (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    username TEXT NOT NULL REFERENCES public.user_accounts(username) ON DELETE CASCADE,
    fcm_token TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT 'android',
    device_id TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(fcm_token)
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_device_tokens_username ON public.device_tokens(username);
CREATE INDEX IF NOT EXISTS idx_device_tokens_active ON public.device_tokens(is_active) WHERE is_active = true;

-- 3. Enable RLS
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

-- 4. Grant access
GRANT ALL ON TABLE public.device_tokens TO anon, authenticated, service_role;

-- 5. RLS Policies (matching existing app pattern)
DROP POLICY IF EXISTS "Allow select on device_tokens" ON public.device_tokens;
CREATE POLICY "Allow select on device_tokens" ON public.device_tokens FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow insert on device_tokens" ON public.device_tokens;
CREATE POLICY "Allow insert on device_tokens" ON public.device_tokens FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update on device_tokens" ON public.device_tokens;
CREATE POLICY "Allow update on device_tokens" ON public.device_tokens FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow delete on device_tokens" ON public.device_tokens;
CREATE POLICY "Allow delete on device_tokens" ON public.device_tokens FOR DELETE TO anon, authenticated USING (true);

-- 6. Database trigger function: auto-send push notifications via pg_net
-- This calls the Edge Function whenever a new notification is inserted
CREATE OR REPLACE FUNCTION public.handle_new_notification()
RETURNS TRIGGER AS $$
DECLARE
    edge_function_url TEXT;
    payload JSONB;
BEGIN
    -- Build payload from the new notification row
    payload := jsonb_build_object(
        'type', 'INSERT',
        'table', 'notifications',
        'record', jsonb_build_object(
            'id', NEW.id,
            'type', NEW.type,
            'title', NEW.title,
            'message', NEW.message,
            'read', NEW.read,
            'timestamp', NEW.timestamp,
            'action_url', NEW.action_url,
            'related_entity_id', NEW.related_entity_id
        )
    );

    -- Call Edge Function via pg_net (Supabase's HTTP extension)
    -- The URL will be: https://<project-ref>.supabase.co/functions/v1/send-push-notification
    PERFORM net.http_post(
        url := current_setting('app.settings.supabase_url', true) || '/functions/v1/send-push-notification',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := payload::text
    );

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Don't block notification insert if push delivery fails
        RAISE WARNING 'push notification trigger error: %', SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Attach trigger to notifications table
DROP TRIGGER IF EXISTS on_notification_insert_send_push ON public.notifications;
CREATE TRIGGER on_notification_insert_send_push
    AFTER INSERT ON public.notifications
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_notification();
