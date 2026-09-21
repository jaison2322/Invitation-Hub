package com.vip.intelligence;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLDecoder;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class BackgroundNotificationSync {
    public static final String TAG = "VIP_BackgroundSync";
    public static final String PREFS_NAME = "vip_notification_prefs";
    public static final String KEY_SUPABASE_URL = "supabase_url";
    public static final String KEY_SUPABASE_KEY = "supabase_key";
    public static final String KEY_USERNAME = "active_username";
    public static final String KEY_DEVICE_TOKEN = "device_token";
    public static final String KEY_DELIVERED_IDS = "delivered_ids";
    public static final String KEY_LAST_CHECK_TIME = "last_check_time";

    public static final String DEFAULT_URL = "https://lliowikzustvebudgsoy.supabase.co";
    public static final String DEFAULT_KEY = "sb_publishable_HOmmQBn10vwi0eehQDX5gg_3aRXTUTH";

    public static final int ALARM_REQUEST_CODE = 1001;
    public static final int JOB_ID = 1002;
    public static final long DEFAULT_ALARM_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes fallback (FCM is primary)

    private static final ExecutorService executor = Executors.newSingleThreadExecutor();

    public interface SyncCallback {
        void onComplete(int deliveredCount);
    }

    public static void saveConfig(Context context, String username, String token, String url, String key) {
        if (context == null) return;
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();
        if (username != null && !username.isEmpty()) editor.putString(KEY_USERNAME, username.trim().toLowerCase());
        if (token != null && !token.isEmpty()) editor.putString(KEY_DEVICE_TOKEN, token.trim());
        if (url != null && !url.isEmpty()) editor.putString(KEY_SUPABASE_URL, url.trim());
        if (key != null && !key.isEmpty()) editor.putString(KEY_SUPABASE_KEY, key.trim());
        editor.apply();
        Log.i(TAG, "Config saved: user=" + username + ", token=" + token);
    }

    public static void startSync(Context context) {
        if (context == null) return;
        scheduleNextAlarm(context, 10000);
        scheduleJob(context);
    }

    public static void scheduleNextAlarm(Context context, long delayMillis) {
        if (context == null) return;
        try {
            AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (alarmManager == null) return;

            Intent intent = new Intent(context, NotificationAlarmReceiver.class);
            intent.setAction("com.vip.intelligence.CHECK_NOTIFICATIONS");

            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pendingIntent = PendingIntent.getBroadcast(context, ALARM_REQUEST_CODE, intent, flags);

            long triggerAtMillis = System.currentTimeMillis() + delayMillis;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                try {
                    alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent);
                } catch (SecurityException se) {
                    try {
                        alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent);
                    } catch (Exception ignored) {
                        alarmManager.set(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent);
                    }
                }
            } else {
                alarmManager.set(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent);
            }
            Log.i(TAG, "Scheduled next background alarm in " + (delayMillis / 1000) + "s");
        } catch (Exception e) {
            Log.w(TAG, "Failed to schedule alarm: " + e.getMessage());
        }
    }

    public static void scheduleJob(Context context) {
        if (context == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) return;
        try {
            JobScheduler scheduler = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (scheduler == null) return;

            ComponentName component = new ComponentName(context, NotificationSyncJobService.class);
            JobInfo.Builder builder = new JobInfo.Builder(JOB_ID, component)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPersisted(true);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                builder.setPeriodic(15 * 60 * 1000, 5 * 60 * 1000); // 15 min periodic
            } else {
                builder.setPeriodic(15 * 60 * 1000);
            }

            scheduler.schedule(builder.build());
            Log.i(TAG, "Scheduled persistent JobScheduler background service");
        } catch (Exception e) {
            Log.w(TAG, "JobScheduler setup warning: " + e.getMessage());
        }
    }

    public static void checkNotifications(final Context context, final SyncCallback callback) {
        if (context == null) {
            if (callback != null) callback.onComplete(0);
            return;
        }

        executor.execute(() -> {
            int deliveredCount = 0;
            HttpURLConnection conn = null;
            try {
                SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                String baseUrl = prefs.getString(KEY_SUPABASE_URL, DEFAULT_URL);
                String apiKey = prefs.getString(KEY_SUPABASE_KEY, DEFAULT_KEY);
                String myUsername = prefs.getString(KEY_USERNAME, "").trim().toLowerCase();
                String myDeviceToken = prefs.getString(KEY_DEVICE_TOKEN, "").trim();
                if (myDeviceToken.isEmpty()) {
                    try {
                        String androidId = android.provider.Settings.Secure.getString(context.getContentResolver(), android.provider.Settings.Secure.ANDROID_ID);
                        if (androidId != null && !androidId.isEmpty()) {
                            myDeviceToken = "android-" + androidId;
                            prefs.edit().putString(KEY_DEVICE_TOKEN, myDeviceToken).apply();
                        }
                    } catch (Exception ignored) {}
                }

                Set<String> deliveredIds = new HashSet<>(prefs.getStringSet(KEY_DELIVERED_IDS, new HashSet<>()));

                URL url = new URL(baseUrl + "/rest/v1/notifications?order=timestamp.desc&limit=15");
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setRequestProperty("apikey", apiKey);
                conn.setRequestProperty("Authorization", "Bearer " + apiKey);
                conn.setRequestProperty("Accept", "application/json");
                conn.setConnectTimeout(8000);
                conn.setReadTimeout(8000);

                int responseCode = conn.getResponseCode();
                if (responseCode >= 200 && responseCode < 300) {
                    BufferedReader in = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                    StringBuilder response = new StringBuilder();
                    String line;
                    while ((line = in.readLine()) != null) {
                        response.append(line);
                    }
                    in.close();

                    JSONArray notifs = new JSONArray(response.toString());
                    long now = System.currentTimeMillis();
                    long maxAge = 30 * 60 * 1000; // 30 minutes

                    for (int i = 0; i < notifs.length(); i++) {
                        JSONObject notif = notifs.getJSONObject(i);
                        String id = notif.optString("id");
                        if (id == null || id.isEmpty()) continue;

                        boolean read = notif.optBoolean("read", false);
                        if (read) continue;

                        // Check if already delivered
                        if (deliveredIds.contains(id)) continue;

                        String actionUrl = notif.optString("action_url", "");
                        String sender = null;
                        String senderDevice = null;

                        if (actionUrl != null && actionUrl.contains("?")) {
                            String query = actionUrl.substring(actionUrl.indexOf("?") + 1);
                            String[] pairs = query.split("&");
                            for (String pair : pairs) {
                                int idx = pair.indexOf("=");
                                if (idx > 0) {
                                    String k = URLDecoder.decode(pair.substring(0, idx), "UTF-8");
                                    String v = URLDecoder.decode(pair.substring(idx + 1), "UTF-8");
                                    if ("sender".equalsIgnoreCase(k)) sender = v.trim().toLowerCase();
                                    if ("senderDevice".equalsIgnoreCase(k)) senderDevice = v.trim();
                                }
                            }
                        }

                        // Test 5: If sender device matches this exact device token, suppress local echo
                        if (senderDevice != null && !myDeviceToken.isEmpty() && senderDevice.equalsIgnoreCase(myDeviceToken)) {
                            deliveredIds.add(id);
                            continue;
                        }

                        // If sender username matches current active user and no senderDevice is specified, suppress
                        if (senderDevice == null && sender != null && !myUsername.isEmpty() && sender.equalsIgnoreCase(myUsername)) {
                            deliveredIds.add(id);
                            continue;
                        }

                        // Valid recipient! Deliver native notification
                        String title = notif.optString("title", "VIP Intelligence Alert");
                        String body = notif.optString("message", "You have an event protocol update.");
                        int numericId = hashStringToInt(id);

                        Log.i(TAG, ">>> [BACKGROUND PUSH DELIVERING] <<< Title: " + title + " to user: " + myUsername);
                        AppPermissionsPlugin.showNotificationDirectly(context, numericId, title, body, actionUrl);

                        deliveredIds.add(id);
                        deliveredCount++;
                    }

                    // Prune deliveredIds if too large (> 100)
                    if (deliveredIds.size() > 100) {
                        deliveredIds.clear();
                    }

                    SharedPreferences.Editor editor = prefs.edit();
                    editor.putStringSet(KEY_DELIVERED_IDS, deliveredIds);
                    editor.putLong(KEY_LAST_CHECK_TIME, now);
                    editor.apply();
                } else {
                    Log.w(TAG, "Supabase notifications HTTP error: " + responseCode);
                }
            } catch (Exception e) {
                Log.w(TAG, "Exception checking notifications in background: " + e.getMessage());
            } finally {
                if (conn != null) conn.disconnect();
            }

            if (callback != null) callback.onComplete(deliveredCount);
        });
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
