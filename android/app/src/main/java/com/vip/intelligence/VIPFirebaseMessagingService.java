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
import java.net.URI;
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

        if (title == null) title = "Invitation Hub Alert";
        if (body == null) body = "";

        // 3. Check sender echo suppression
        SharedPreferences prefs = getSharedPreferences(BackgroundNotificationSync.PREFS_NAME, Context.MODE_PRIVATE);
        String myUsername = prefs.getString(BackgroundNotificationSync.KEY_USERNAME, "").trim().toLowerCase();
        String myDeviceToken = prefs.getString(BackgroundNotificationSync.KEY_DEVICE_TOKEN, "").trim();
        String myFcmToken = prefs.getString("fcm_token", "").trim();

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

                // Suppress if sender device matches this device (FCM token or local device token)
                if (senderDevice != null && (
                    (!myDeviceToken.isEmpty() && senderDevice.equalsIgnoreCase(myDeviceToken)) ||
                    (!myFcmToken.isEmpty() && senderDevice.equalsIgnoreCase(myFcmToken))
                )) {
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

        // 4. Deduplicate — check if already delivered by local/realtime/background sync
        if (notificationId != null && BackgroundNotificationSync.isIdDelivered(this, notificationId)) {
            Log.i(TAG, "Notification already delivered recently, skipping duplicate: " + notificationId);
            return;
        }
        if (notificationId != null) {
            BackgroundNotificationSync.recordDeliveredId(this, notificationId);
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

        // Cache rotated token and mark synchronization as pending for authenticated session
        prefs.edit()
            .putString("pending_fcm_token", token)
            .putBoolean("fcm_token_needs_sync", true)
            .apply();
        Log.i(TAG, "Cached rotated FCM token. Marked pending synchronization for authenticated app session.");
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
