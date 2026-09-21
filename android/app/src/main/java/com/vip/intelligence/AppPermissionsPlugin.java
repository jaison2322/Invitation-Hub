package com.vip.intelligence;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.UUID;

@CapacitorPlugin(
    name = "AppPermissions",
    permissions = {
        @Permission(
            alias = "camera",
            strings = { Manifest.permission.CAMERA }
        ),
        @Permission(
            alias = "notifications",
            strings = { Manifest.permission.POST_NOTIFICATIONS }
        )
    }
)
public class AppPermissionsPlugin extends Plugin {

    public static final String NOTIFICATION_CHANNEL_ID = "vip_notifications_channel";
    public static final String NOTIFICATION_CHANNEL_NAME = "VIP Intelligence Alerts";
    public static final String NOTIFICATION_CHANNEL_DESC = "Urgent VIP event, schedule conflict, and invitation notifications";

    private static final String CAMERA_ALIAS = "camera";
    private static final String NOTIFICATIONS_ALIAS = "notifications";

    @Override
    public void load() {
        super.load();
        createNotificationChannel(getContext());
        BackgroundNotificationSync.startSync(getContext());
    }

    public static void createNotificationChannel(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && context != null) {
            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                NotificationChannel channel = new NotificationChannel(
                    NOTIFICATION_CHANNEL_ID,
                    NOTIFICATION_CHANNEL_NAME,
                    NotificationManager.IMPORTANCE_HIGH
                );
                channel.setDescription(NOTIFICATION_CHANNEL_DESC);
                channel.enableLights(true);
                channel.enableVibration(true);
                channel.setShowBadge(true);
                channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
                manager.createNotificationChannel(channel);
            }
        }
    }

    @PluginMethod
    public void checkCameraPermission(PluginCall call) {
        boolean granted = ContextCompat.checkSelfPermission(
            getContext(),
            Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED;

        boolean canAskAgain = true;
        if (!granted && getActivity() != null) {
            // If rationale is false, it could be first time or 'Don't ask again'
            canAskAgain = !hasPermission(Manifest.permission.CAMERA);
        }

        JSObject ret = new JSObject();
        ret.put("granted", granted);
        ret.put("status", granted ? "granted" : "prompt");
        ret.put("canAskAgain", canAskAgain);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestCameraPermission(PluginCall call) {
        boolean granted = ContextCompat.checkSelfPermission(
            getContext(),
            Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED;

        if (granted) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            ret.put("status", "granted");
            ret.put("canAskAgain", true);
            call.resolve(ret);
            return;
        }

        requestPermissionForAlias(CAMERA_ALIAS, call, "cameraCallback");
    }

    @PermissionCallback
    public void cameraCallback(PluginCall call) {
        boolean granted = ContextCompat.checkSelfPermission(
            getContext(),
            Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED;

        boolean rationale = false;
        if (getActivity() != null) {
            rationale = ActivityCompat.shouldShowRequestPermissionRationale(
                getActivity(),
                Manifest.permission.CAMERA
            );
        }

        JSObject ret = new JSObject();
        ret.put("granted", granted);
        ret.put("status", granted ? "granted" : "denied");
        // If denied and rationale is false, the user selected "Don't ask again"
        ret.put("canAskAgain", granted || rationale);
        call.resolve(ret);
    }

    @PluginMethod
    public void checkNotificationPermission(PluginCall call) {
        boolean granted;
        boolean canAskAgain = true;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            granted = ContextCompat.checkSelfPermission(
                getContext(),
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED;

            if (!granted && getActivity() != null) {
                boolean rationale = ActivityCompat.shouldShowRequestPermissionRationale(
                    getActivity(),
                    Manifest.permission.POST_NOTIFICATIONS
                );
                canAskAgain = rationale || !hasPermission(Manifest.permission.POST_NOTIFICATIONS);
            }
        } else {
            granted = NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
            canAskAgain = granted;
        }

        JSObject ret = new JSObject();
        ret.put("granted", granted);
        ret.put("status", granted ? "granted" : "prompt");
        ret.put("canAskAgain", canAskAgain);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            boolean granted = ContextCompat.checkSelfPermission(
                getContext(),
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED;

            if (granted) {
                JSObject ret = new JSObject();
                ret.put("granted", true);
                ret.put("status", "granted");
                ret.put("canAskAgain", true);
                call.resolve(ret);
                return;
            }

            requestPermissionForAlias(NOTIFICATIONS_ALIAS, call, "notificationCallback");
        } else {
            boolean enabled = NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
            JSObject ret = new JSObject();
            ret.put("granted", enabled);
            ret.put("status", enabled ? "granted" : "denied");
            ret.put("canAskAgain", enabled);
            call.resolve(ret);
        }
    }

    @PermissionCallback
    public void notificationCallback(PluginCall call) {
        boolean granted;
        boolean canAskAgain = true;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            granted = ContextCompat.checkSelfPermission(
                getContext(),
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED;

            boolean rationale = false;
            if (getActivity() != null) {
                rationale = ActivityCompat.shouldShowRequestPermissionRationale(
                    getActivity(),
                    Manifest.permission.POST_NOTIFICATIONS
                );
            }
            canAskAgain = granted || rationale;
        } else {
            granted = NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
        }

        JSObject ret = new JSObject();
        ret.put("granted", granted);
        ret.put("status", granted ? "granted" : "denied");
        ret.put("canAskAgain", canAskAgain);
        call.resolve(ret);
    }

    public static boolean showNotificationDirectly(Context context, int id, String title, String body, String actionUrl) {
        if (context == null) return false;
        try {
            boolean hasPermission = true;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                hasPermission = ContextCompat.checkSelfPermission(
                    context,
                    Manifest.permission.POST_NOTIFICATIONS
                ) == PackageManager.PERMISSION_GRANTED;
            } else {
                hasPermission = NotificationManagerCompat.from(context).areNotificationsEnabled();
            }

            if (!hasPermission) {
                android.util.Log.w("AppPermissionsPlugin", "POST_NOTIFICATIONS permission not granted");
                return false;
            }

            createNotificationChannel(context);

            Intent intent = new Intent(context, MainActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            intent.putExtra("actionUrl", actionUrl != null ? actionUrl : "/notifications");

            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pendingIntent = PendingIntent.getActivity(context, id, intent, flags);

            int smallIcon = context.getApplicationInfo().icon;
            if (smallIcon == 0) {
                smallIcon = android.R.drawable.ic_dialog_info;
            }

            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, NOTIFICATION_CHANNEL_ID)
                .setSmallIcon(smallIcon)
                .setContentTitle(title != null ? title : "VIP Intelligence Alert")
                .setContentText(body != null ? body : "")
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body != null ? body : ""))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .setAutoCancel(true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setContentIntent(pendingIntent);

            NotificationManagerCompat.from(context).notify(id, builder.build());
            return true;
        } catch (Exception e) {
            android.util.Log.e("AppPermissionsPlugin", "showNotificationDirectly error: " + e.getMessage(), e);
            return false;
        }
    }

    @PluginMethod
    public void showLocalNotification(PluginCall call) {
        String title = call.getString("title", "VIP Intelligence Alert");
        String body = call.getString("body", call.getString("message", "New VIP update available"));
        int id = call.getInt("id", (int) (System.currentTimeMillis() % 1000000));
        String actionUrl = call.getString("actionUrl", "/notifications");

        boolean delivered = showNotificationDirectly(getContext(), id, title, body, actionUrl);
        JSObject ret = new JSObject();
        ret.put("delivered", delivered);
        ret.put("id", id);
        if (!delivered) {
            ret.put("error", "Failed to deliver or permission not granted");
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void configureBackgroundSync(PluginCall call) {
        String username = call.getString("username", "");
        String token = call.getString("token", "");
        String url = call.getString("supabaseUrl", BackgroundNotificationSync.DEFAULT_URL);
        String key = call.getString("supabaseKey", BackgroundNotificationSync.DEFAULT_KEY);

        BackgroundNotificationSync.saveConfig(getContext(), username, token, url, key);
        BackgroundNotificationSync.startSync(getContext());

        JSObject ret = new JSObject();
        ret.put("configured", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void cancelNotification(PluginCall call) {
        int id = call.getInt("id", -1);
        if (id != -1) {
            NotificationManagerCompat.from(getContext()).cancel(id);
        } else {
            NotificationManagerCompat.from(getContext()).cancelAll();
        }
        JSObject ret = new JSObject();
        ret.put("cancelled", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void getDevicePushToken(PluginCall call) {
        try {
            // First check if we have a cached FCM token from VIPFirebaseMessagingService
            android.content.SharedPreferences prefs = getContext().getSharedPreferences(
                BackgroundNotificationSync.PREFS_NAME, android.content.Context.MODE_PRIVATE);
            String cachedFcmToken = prefs.getString("fcm_token", null);

            if (cachedFcmToken != null && !cachedFcmToken.isEmpty()) {
                // Return cached FCM token immediately
                JSObject ret = new JSObject();
                ret.put("token", cachedFcmToken);
                ret.put("platform", "android");
                ret.put("tokenType", "fcm");
                call.resolve(ret);
                return;
            }

            // Attempt to get FCM token asynchronously
            com.google.firebase.messaging.FirebaseMessaging.getInstance().getToken()
                .addOnSuccessListener(token -> {
                    // Cache the FCM token
                    prefs.edit().putString("fcm_token", token).apply();
                    prefs.edit().putString(BackgroundNotificationSync.KEY_DEVICE_TOKEN, token).apply();

                    JSObject ret = new JSObject();
                    ret.put("token", token);
                    ret.put("platform", "android");
                    ret.put("tokenType", "fcm");
                    call.resolve(ret);
                })
                .addOnFailureListener(e -> {
                    // Fallback to Android ID if FCM isn't available
                    android.util.Log.w("AppPermissionsPlugin", "FCM token unavailable, falling back to Android ID: " + e.getMessage());
                    String androidId = Settings.Secure.getString(getContext().getContentResolver(), Settings.Secure.ANDROID_ID);
                    String fallbackToken = "android-" + (androidId != null && !androidId.isEmpty() ? androidId : UUID.randomUUID().toString());
                    JSObject ret = new JSObject();
                    ret.put("token", fallbackToken);
                    ret.put("platform", "android");
                    ret.put("tokenType", "device_id");
                    call.resolve(ret);
                });
        } catch (Exception e) {
            String fallbackToken = "android-device-" + UUID.randomUUID().toString();
            JSObject ret = new JSObject();
            ret.put("token", fallbackToken);
            ret.put("platform", "android");
            ret.put("tokenType", "fallback");
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Intent intent;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
            } else {
                intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                Uri uri = Uri.fromParts("package", getContext().getPackageName(), null);
                intent.setData(uri);
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);

            JSObject ret = new JSObject();
            ret.put("opened", true);
            call.resolve(ret);
        } catch (Exception ex) {
            try {
                Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                Uri uri = Uri.fromParts("package", getContext().getPackageName(), null);
                fallback.setData(uri);
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(fallback);

                JSObject ret = new JSObject();
                ret.put("opened", true);
                call.resolve(ret);
            } catch (Exception e2) {
                call.reject("Unable to open app settings: " + e2.getMessage());
            }
        }
    }
}

