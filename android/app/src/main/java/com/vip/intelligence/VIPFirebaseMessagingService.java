package com.vip.intelligence;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;

/**
 * Firebase Cloud Messaging service that receives push notifications
 * even when the app is completely closed or force-stopped.
 * 
 * This is the primary notification delivery mechanism, replacing the
 * polling-based BackgroundNotificationSync for most use cases.
 */
public class VIPFirebaseMessagingService extends FirebaseMessagingService {
    private static final String TAG = "VIP_FCM";

    @Override
    public void onCreate() {
        super.onCreate();
        AppPermissionsPlugin.createNotificationChannel(this);
    }

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);
        Log.i(TAG, "FCM message received from: " + remoteMessage.getFrom());

        String title = null;
        String body = null;
        String actionUrl = "/notifications";
        String notificationId = null;

        // 1. Check for data payload (preferred — always delivered, even in background)
        Map<String, String> data = remoteMessage.getData();
        if (data != null && !data.isEmpty()) {
            title = data.get("title");
            if (title == null) title = data.get("notificationTitle");
            body = data.get("body");
            if (body == null) body = data.get("message");
            if (data.containsKey("actionUrl")) actionUrl = data.get("actionUrl");
            notificationId = data.get("notificationId");
            Log.i(TAG, "Data payload: title=" + title + ", body=" + body + ", actionUrl=" + actionUrl);
        }

        // 2. Fall back to notification payload (auto-displayed by system when app is in background)
        RemoteMessage.Notification notification = remoteMessage.getNotification();
        if (notification != null) {
            if (title == null) title = notification.getTitle();
            if (body == null) body = notification.getBody();
            Log.i(TAG, "Notification payload: title=" + title + ", body=" + body);
        }

        if (title == null && body == null) {
            Log.w(TAG, "FCM message has no displayable content, ignoring.");
            return;
        }

        if (title == null) title = "VIP Intelligence Alert";
        if (body == null) body = "";

        // 3. Check sender echo suppression
        SharedPreferences prefs = getSharedPreferences(BackgroundNotificationSync.PREFS_NAME, Context.MODE_PRIVATE);
        String myUsername = prefs.getString(BackgroundNotificationSync.KEY_USERNAME, "").trim().toLowerCase();
        String myDeviceToken = prefs.getString(BackgroundNotificationSync.KEY_DEVICE_TOKEN, "").trim();

        if (actionUrl != null && actionUrl.contains("?")) {
            try {
                String query = actionUrl.substring(actionUrl.indexOf("?") + 1);
                String[] pairs = query.split("&");
                String sender = null;
                String senderDevice = null;
                for (String pair : pairs) {
                    int idx = pair.indexOf("=");
                    if (idx > 0) {
                        String k = java.net.URLDecoder.decode(pair.substring(0, idx), "UTF-8");
                        String v = java.net.URLDecoder.decode(pair.substring(idx + 1), "UTF-8");
                        if ("sender".equalsIgnoreCase(k)) sender = v.trim().toLowerCase();
                        if ("senderDevice".equalsIgnoreCase(k)) senderDevice = v.trim();
                    }
                }

                // Suppress if sender device matches this device
                if (senderDevice != null && !myDeviceToken.isEmpty() && senderDevice.equalsIgnoreCase(myDeviceToken)) {
                    Log.i(TAG, "Suppressing FCM echo for sender device: " + senderDevice);
                    return;
                }

                // Suppress if sender username matches and no device-level info
                if (senderDevice == null && sender != null && !myUsername.isEmpty() && sender.equalsIgnoreCase(myUsername)) {
                    Log.i(TAG, "Suppressing FCM echo for sender user: " + sender);
                    return;
                }
            } catch (Exception e) {
                Log.w(TAG, "Error parsing actionUrl for sender suppression: " + e.getMessage());
            }
        }

        // 4. Deduplicate — check if already delivered by background sync
        if (notificationId != null) {
            java.util.Set<String> deliveredIds = prefs.getStringSet(BackgroundNotificationSync.KEY_DELIVERED_IDS, new java.util.HashSet<>());
            if (deliveredIds != null && deliveredIds.contains(notificationId)) {
                Log.i(TAG, "Notification already delivered by background sync, skipping: " + notificationId);
                return;
            }
            // Mark as delivered
            java.util.Set<String> updatedIds = new java.util.HashSet<>(deliveredIds != null ? deliveredIds : new java.util.HashSet<>());
            updatedIds.add(notificationId);
            if (updatedIds.size() > 100) updatedIds.clear();
            prefs.edit().putStringSet(BackgroundNotificationSync.KEY_DELIVERED_IDS, updatedIds).apply();
        }

        // 5. Show the notification using existing display logic
        int numericId = notificationId != null ? hashStringToInt(notificationId) : (int) (System.currentTimeMillis() % 1000000);

        Log.i(TAG, ">>> [FCM PUSH DELIVERING] <<< Title: " + title + " | ID: " + numericId);
        AppPermissionsPlugin.showNotificationDirectly(this, numericId, title, body, actionUrl);
    }

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        Log.i(TAG, "New FCM token received: " + token.substring(0, Math.min(20, token.length())) + "...");

        // Save FCM token locally
        SharedPreferences prefs = getSharedPreferences(BackgroundNotificationSync.PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString("fcm_token", token).apply();

        // Also update the device_token key used by background sync
        prefs.edit().putString(BackgroundNotificationSync.KEY_DEVICE_TOKEN, token).apply();

        // Sync FCM token to Supabase device_tokens table
        String username = prefs.getString(BackgroundNotificationSync.KEY_USERNAME, "").trim();
        if (!username.isEmpty()) {
            syncTokenToSupabase(token, username);
        }
    }

    /**
     * Sends the FCM token to Supabase device_tokens table via REST API.
     * This runs even when the Capacitor bridge isn't available.
     */
    private void syncTokenToSupabase(final String fcmToken, final String username) {
        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                SharedPreferences prefs = getSharedPreferences(BackgroundNotificationSync.PREFS_NAME, Context.MODE_PRIVATE);
                String baseUrl = prefs.getString(BackgroundNotificationSync.KEY_SUPABASE_URL, BackgroundNotificationSync.DEFAULT_URL);
                String apiKey = prefs.getString(BackgroundNotificationSync.KEY_SUPABASE_KEY, BackgroundNotificationSync.DEFAULT_KEY);

                String androidId = android.provider.Settings.Secure.getString(
                    getContentResolver(), android.provider.Settings.Secure.ANDROID_ID);

                // Upsert FCM token into device_tokens table
                String payload = String.format(
                    "{\"username\":\"%s\",\"fcm_token\":\"%s\",\"platform\":\"android\",\"device_id\":\"%s\",\"is_active\":true,\"updated_at\":\"%s\"}",
                    username.toLowerCase(),
                    fcmToken,
                    androidId != null ? "android-" + androidId : "",
                    new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US).format(new java.util.Date())
                );

                URL url = new URL(baseUrl + "/rest/v1/device_tokens");
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("apikey", apiKey);
                conn.setRequestProperty("Authorization", "Bearer " + apiKey);
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("Prefer", "resolution=merge-duplicates");
                conn.setDoOutput(true);
                conn.setConnectTimeout(10000);
                conn.setReadTimeout(10000);

                OutputStream os = conn.getOutputStream();
                os.write(payload.getBytes("UTF-8"));
                os.flush();
                os.close();

                int responseCode = conn.getResponseCode();
                Log.i(TAG, "FCM token synced to Supabase. Response: " + responseCode);
            } catch (Exception e) {
                Log.w(TAG, "Failed to sync FCM token to Supabase: " + e.getMessage());
            } finally {
                if (conn != null) conn.disconnect();
            }
        }).start();
    }

    private static int hashStringToInt(String str) {
        if (str == null) return 1;
        int hash = 0;
        for (int i = 0; i < str.length(); i++) {
            hash = 31 * hash + str.charAt(i);
        }
        return Math.abs(hash % 1000000);
    }
}
