// ==============================================================================
// Supabase Edge Function: send-push-notification
// Triggered by database webhook/trigger on notification INSERT
// Sends FCM push notifications to all registered devices (except sender)
// ==============================================================================

// @ts-ignore: Deno URL import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response> | Response) => void;
  env: {
    get: (key: string) => string | undefined;
  };
};

interface NotificationRecord {
  id: string;
  vip_id?: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  timestamp: string;
  action_url?: string;
  related_entity_id?: string;
}

interface DeviceToken {
  id: string;
  vip_id?: string;
  username: string;
  fcm_token: string;
  platform: string;
  device_id: string | null;
  is_active: boolean;
}

interface FCMMessage {
  message: {
    token: string;
    notification: {
      title: string;
      body: string;
    };
    data: Record<string, string>;
    android: {
      priority: string;
      notification: {
        channel_id: string;
        priority: string;
        default_vibrate_timings: boolean;
        visibility: string;
        click_action: string;
      };
    };
  };
}

// --- Google OAuth2 Token via Service Account ---
async function getAccessToken(serviceAccount: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claimSet = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const encoder = new TextEncoder();
  const headerB64 = btoa(String.fromCharCode(...encoder.encode(JSON.stringify(header))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const claimB64 = btoa(String.fromCharCode(...encoder.encode(JSON.stringify(claimSet))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const signInput = `${headerB64}.${claimB64}`;

  // Import the private key for signing
  const pemContents = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '');

  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    encoder.encode(signInput)
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const jwt = `${signInput}.${sigB64}`;

  // Exchange JWT for access token
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenResponse.json();
  if (!tokenData.access_token) {
    throw new Error(`Failed to get access token: ${JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token;
}

// --- Parse sender info from action_url ---
function parseSenderInfo(actionUrl: string | undefined): { sender?: string; senderDevice?: string } {
  if (!actionUrl || !actionUrl.includes('?')) return {};
  const queryString = actionUrl.split('?')[1] || '';
  const params = new URLSearchParams(queryString);
  return {
    sender: params.get('sender')?.toLowerCase() || undefined,
    senderDevice: params.get('senderDevice') || undefined,
  };
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// --- Main handler ---
Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Parse incoming webhook / direct invocation payload
    const payload = await req.json();
    const record: NotificationRecord = payload.record || payload;

    if (!record.id || !record.title) {
      return new Response(JSON.stringify({ error: 'Invalid notification payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Don't send push for already-read notifications
    if (record.read) {
      return new Response(JSON.stringify({ skipped: true, reason: 'already read' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get Firebase service account from env
    const firebaseServiceAccountJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
    if (!firebaseServiceAccountJson) {
      return new Response(JSON.stringify({ error: 'FIREBASE_SERVICE_ACCOUNT not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const serviceAccount = JSON.parse(firebaseServiceAccountJson);
    const projectId = serviceAccount.project_id;

    // Get FCM access token
    const accessToken = await getAccessToken(serviceAccount);

    // Fetch all active device tokens scoped to this VIP account
    let tokensQuery = supabase
      .from('device_tokens')
      .select('*')
      .eq('is_active', true);

    if (record.vip_id) {
      tokensQuery = tokensQuery.eq('vip_id', record.vip_id);
    }

    const { data: deviceTokens, error: tokenError } = await tokensQuery;

    if (tokenError || !deviceTokens || deviceTokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: 'no active device tokens' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse sender info to exclude the sender's device
    const { sender, senderDevice } = parseSenderInfo(record.action_url);

    // Filter out sender's devices
    const targetDevices = deviceTokens.filter((dt: DeviceToken) => {
      // If senderDevice matches this device_id, skip (exact device suppression)
      if (senderDevice && dt.device_id && senderDevice === dt.device_id) {
        return false;
      }
      // If sender username matches this token's user AND no senderDevice specified, skip
      if (!senderDevice && sender && dt.username.toLowerCase() === sender) {
        return false;
      }
      return true;
    });

    if (targetDevices.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: 'all devices filtered (sender suppression)' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Send FCM push to each device
    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
    let sentCount = 0;
    let failedCount = 0;
    const staleTokenIds: string[] = [];

    const titleText = record.title || 'VIP Intelligence Alert';
    const bodyText = record.message || '';
    const actionUrl = record.action_url || '/notifications';

    for (const device of targetDevices) {
      const fcmPayload: any = {
        message: {
          token: device.fcm_token,
          // Dual payload: top-level notification enables OS-level tray banner when app is closed/killed
          notification: {
            title: titleText,
            body: bodyText,
          },
          // Data payload is delivered to onMessageReceived() when app is running/foreground
          data: {
            title: titleText,
            body: bodyText,
            notificationId: String(record.id),
            type: String(record.type || 'system'),
            actionUrl: String(actionUrl),
            relatedEntityId: String(record.related_entity_id || ''),
            timestamp: String(record.timestamp || new Date().toISOString()),
          },
          android: {
            priority: 'high',
            notification: {
              channel_id: 'vip_notifications_channel',
              default_sound: true,
              default_vibrate_timings: true,
              visibility: 'public',
              click_action: 'FLUTTER_NOTIFICATION_CLICK',
            },
          },
          webpush: {
            headers: {
              Urgency: 'high',
            },
            notification: {
              title: titleText,
              body: bodyText,
              icon: '/icon.png',
              badge: '/favicon.svg',
              tag: `vip-${record.id}`,
            },
          },
          apns: {
            headers: {
              'apns-priority': '10',
            },
            payload: {
              aps: {
                alert: {
                  title: titleText,
                  body: bodyText,
                },
                sound: 'default',
                badge: 1,
              },
            },
          },
        },
      };

      try {
        const response = await fetch(fcmUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(fcmPayload),
        });

        if (response.ok) {
          sentCount++;
        } else {
          const errorBody = await response.text();
          failedCount++;

          // If token is invalid/unregistered, mark as inactive
          if (
            response.status === 404 ||
            errorBody.includes('UNREGISTERED') ||
            errorBody.includes('INVALID_ARGUMENT') ||
            errorBody.includes('NOT_FOUND')
          ) {
            staleTokenIds.push(device.id);
          }

          console.error(`FCM send failed for ${device.username}: ${response.status} ${errorBody}`);
        }
      } catch (sendError) {
        failedCount++;
        console.error(`FCM send exception for ${device.username}:`, sendError);
      }
    }

    // Deactivate stale tokens
    if (staleTokenIds.length > 0) {
      await supabase
        .from('device_tokens')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .in('id', staleTokenIds);
    }

    return new Response(
      JSON.stringify({
        sent: sentCount,
        failed: failedCount,
        staleTokensDeactivated: staleTokenIds.length,
        totalTargetDevices: targetDevices.length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
