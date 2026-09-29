// ==============================================================================
// Supabase Edge Function: send-push-notification
// Triggered by database webhook/trigger on notification INSERT
// Sends FCM push notifications to all registered devices (strictly VIP isolated, except sender)
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
      return new Response(JSON.stringify({ error: 'Invalid notification payload: missing id or title' }), {
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

    // Initialize Supabase client with service role for secure database access
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // STEP 4: Critical VIP Data Isolation
    // Determine the event owner/VIP. Notifications for VIP-1 MUST NEVER be sent to VIP-2.
    let targetVipId = record.vip_id;
    if (!targetVipId && record.related_entity_id) {
      // Lookup VIP ownership from the related entity if not directly in notification
      const { data: inv } = await supabase
        .from('invitations')
        .select('vip_id')
        .eq('id', record.related_entity_id)
        .maybeSingle();
      if (inv?.vip_id) {
        targetVipId = inv.vip_id;
      }
    }

    if (!targetVipId) {
      console.warn('[VIP FCM Isolation] Notification rejected: missing vip_id. Cannot broadcast globally.', record.id);
      return new Response(JSON.stringify({ sent: 0, reason: 'missing vip_id: global broadcasts prohibited' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch ONLY active device tokens belonging to this isolated VIP account
    const { data: deviceTokens, error: tokenError } = await supabase
      .from('device_tokens')
      .select('*')
      .eq('is_active', true)
      .eq('vip_id', targetVipId);

    if (tokenError) {
      console.error('[VIP FCM] Error querying device tokens:', tokenError);
      return new Response(JSON.stringify({ error: 'Failed to query device tokens' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!deviceTokens || deviceTokens.length === 0) {
      console.log(`[VIP FCM] No active devices registered for VIP: ${targetVipId}`);
      return new Response(JSON.stringify({ sent: 0, vip_id: targetVipId, reason: 'no active device tokens for this VIP' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse sender info to exclude the actor's device
    const { sender, senderDevice } = parseSenderInfo(record.action_url);

    // Filter out sender device
    const targetDevices = deviceTokens.filter((dt: DeviceToken) => {
      // If senderDevice matches this device's token or device_id, suppress echo on actor's device
      if (senderDevice) {
        if (dt.fcm_token === senderDevice || dt.device_id === senderDevice) {
          return false;
        }
      }
      // If sender username matches and no senderDevice is specified, suppress for sender's username
      if (!senderDevice && sender && dt.username.toLowerCase() === sender) {
        return false;
      }
      return true;
    });

    if (targetDevices.length === 0) {
      console.log(`[VIP FCM] All devices filtered out by sender suppression for VIP: ${targetVipId}`);
      return new Response(JSON.stringify({ sent: 0, vip_id: targetVipId, reason: 'all devices filtered (sender suppression)' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get Firebase service account credentials from environment
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

    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
    let sentCount = 0;
    let failedCount = 0;
    const staleTokenIds: string[] = [];

    const titleText = record.title || 'Invitation Hub Alert';
    const bodyText = record.message || '';
    const actionUrl = record.action_url || '/notifications';

    console.log(`[VIP FCM Dispatch] Dispatching to ${targetDevices.length} devices for VIP: ${targetVipId} (Event: ${record.id})`);

    for (const device of targetDevices) {
      // FCM HTTP v1 payload:
      // High-priority Android notification + data payload.
      // - Notification block ensures the Android system displays the alert even when app is killed/swiped away.
      // - Data block is delivered to Android for deep linking and local UI synchronization.
      // - No click_action is set, which allows Android's default launcher intent to open MainActivity with all data extras.
      const fcmPayload: any = {
        message: {
          token: device.fcm_token,
          notification: {
            title: titleText,
            body: bodyText,
          },
          data: {
            title: titleText,
            body: bodyText,
            notificationId: String(record.id),
            vipId: String(targetVipId),
            type: String(record.type || 'system'),
            actionUrl: String(actionUrl),
            relatedEntityId: String(record.related_entity_id || ''),
            timestamp: String(record.timestamp || new Date().toISOString()),
          },
          android: {
            priority: 'high',
            notification: {
              channel_id: 'vip_notifications_channel',
              icon: 'ic_stat_notification',
              color: '#D4AF37',
              default_sound: true,
              default_vibrate_timings: true,
              visibility: 'public',
              notification_priority: 'priority_high',
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

          // STEP 10: Token Cleanup
          // If token is invalid, expired, or unregistered, mark it inactive
          if (
            response.status === 404 ||
            errorBody.includes('UNREGISTERED') ||
            errorBody.includes('INVALID_ARGUMENT') ||
            errorBody.includes('NOT_FOUND')
          ) {
            staleTokenIds.push(device.id);
            console.warn(`[VIP FCM] Stale token identified for user ${device.username}, marking inactive.`);
          }

          console.error(`[VIP FCM Error] Delivery failed for ${device.username}: ${response.status} ${errorBody}`);
        }
      } catch (sendError) {
        failedCount++;
        console.error(`[VIP FCM Exception] Delivery exception for ${device.username}:`, sendError);
      }
    }

    // Deactivate stale tokens so they don't accumulate
    if (staleTokenIds.length > 0) {
      await supabase
        .from('device_tokens')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .in('id', staleTokenIds);
      console.log(`[VIP FCM Cleanup] Deactivated ${staleTokenIds.length} stale tokens.`);
    }

    return new Response(
      JSON.stringify({
        sent: sentCount,
        failed: failedCount,
        vip_id: targetVipId,
        staleTokensDeactivated: staleTokenIds.length,
        totalTargetDevices: targetDevices.length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[VIP FCM Edge Function Error]:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
