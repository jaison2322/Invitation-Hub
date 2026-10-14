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
import android.database.Cursor;
import android.provider.ContactsContract;
import com.getcapacitor.JSArray;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
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
        ),
        @Permission(
            alias = "contacts",
            strings = { Manifest.permission.READ_CONTACTS }
        )
    }
)
public class AppPermissionsPlugin extends Plugin {

    public static final String NOTIFICATION_CHANNEL_ID = "vip_notifications_channel";
    public static final String NOTIFICATION_CHANNEL_NAME = "Invitation Hub Alerts";
    public static final String NOTIFICATION_CHANNEL_DESC = "Urgent VIP event, schedule conflict, and invitation notifications";

    private static final String CAMERA_ALIAS = "camera";
    private static final String NOTIFICATIONS_ALIAS = "notifications";
    private static final String CONTACTS_ALIAS = "contacts";
    private static final String PREF_NOTIF_REQUESTED = "notif_permission_requested";

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
    public void checkContactsPermission(PluginCall call) {
        boolean granted = ContextCompat.checkSelfPermission(
            getContext(),
            Manifest.permission.READ_CONTACTS
        ) == PackageManager.PERMISSION_GRANTED;

        Context context = getContext();
        android.content.SharedPreferences prefs = context != null ?
            context.getSharedPreferences(BackgroundNotificationSync.PREFS_NAME, Context.MODE_PRIVATE) : null;
        boolean askedBefore = prefs != null && prefs.getBoolean("contacts_permission_requested", false);

        boolean canAskAgain = true;
        if (!granted && askedBefore && getActivity() != null) {
            canAskAgain = ActivityCompat.shouldShowRequestPermissionRationale(
                getActivity(),
                Manifest.permission.READ_CONTACTS
            );
        }

        JSObject ret = new JSObject();
        ret.put("granted", granted);
        ret.put("status", granted ? "granted" : (!canAskAgain ? "denied" : "prompt"));
        ret.put("canAskAgain", canAskAgain);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestContactsPermission(PluginCall call) {
        boolean granted = ContextCompat.checkSelfPermission(
            getContext(),
            Manifest.permission.READ_CONTACTS
        ) == PackageManager.PERMISSION_GRANTED;

        if (granted) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            ret.put("status", "granted");
            ret.put("canAskAgain", true);
            call.resolve(ret);
            return;
        }

        Context context = getContext();
        if (context != null) {
            android.content.SharedPreferences prefs = context.getSharedPreferences(
                BackgroundNotificationSync.PREFS_NAME, Context.MODE_PRIVATE);
            if (prefs != null) {
                prefs.edit().putBoolean("contacts_permission_requested", true).apply();
            }
        }

        requestPermissionForAlias(CONTACTS_ALIAS, call, "contactsCallback");
    }

    @PermissionCallback
    public void contactsCallback(PluginCall call) {
        boolean granted = ContextCompat.checkSelfPermission(
            getContext(),
            Manifest.permission.READ_CONTACTS
        ) == PackageManager.PERMISSION_GRANTED;

        boolean rationale = false;
        if (getActivity() != null) {
            rationale = ActivityCompat.shouldShowRequestPermissionRationale(
                getActivity(),
                Manifest.permission.READ_CONTACTS
            );
        }

        JSObject ret = new JSObject();
        ret.put("granted", granted);
        ret.put("status", granted ? "granted" : "denied");
        ret.put("canAskAgain", granted || rationale);
        android.util.Log.d("AppPermissionsPlugin", "CONTACT PERMISSION = " + (granted ? "GRANTED" : "DENIED"));
        call.resolve(ret);
    }

    private static String normalizePhoneNumberKey(String raw) {
        if (raw == null) return "";
        String digits = raw.replaceAll("[^0-9]", "");
        if (digits.length() >= 10) {
            return digits.substring(digits.length() - 10);
        }
        return digits.isEmpty() ? raw.replaceAll("\\s+", "") : digits;
    }

    @PluginMethod
    public void getPhoneContacts(PluginCall call) {
        boolean granted = ContextCompat.checkSelfPermission(
            getContext(),
            Manifest.permission.READ_CONTACTS
        ) == PackageManager.PERMISSION_GRANTED;

        if (!granted) {
            android.util.Log.w("AppPermissionsPlugin", "getPhoneContacts rejected: READ_CONTACTS permission not granted");
            call.reject("PERMISSION_DENIED", "READ_CONTACTS permission not granted");
            return;
        }

        Context context = getContext();
        if (context == null) {
            call.reject("CONTEXT_NULL", "Android Context is null");
            return;
        }

        try {
            Map<String, JSObject> contactMap = new LinkedHashMap<>();
            Map<String, List<String>> phonesMap = new HashMap<>();
            Map<String, Set<String>> seenPhoneKeysMap = new HashMap<>();

            String displayNameCol = Build.VERSION.SDK_INT >= Build.VERSION_CODES.HONEYCOMB ?
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME_PRIMARY :
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME;

            Cursor cursor = context.getContentResolver().query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                new String[]{
                    ContactsContract.CommonDataKinds.Phone.CONTACT_ID,
                    displayNameCol,
                    ContactsContract.CommonDataKinds.Phone.NUMBER
                },
                null,
                null,
                displayNameCol + " COLLATE NOCASE ASC"
            );

            if (cursor != null) {
                int idIdx = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.CONTACT_ID);
                int nameIdx = cursor.getColumnIndex(displayNameCol);
                if (nameIdx < 0) {
                    nameIdx = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME);
                }
                int numIdx = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER);

                while (cursor.moveToNext()) {
                    String contactId = idIdx >= 0 ? cursor.getString(idIdx) : "";
                    String name = nameIdx >= 0 ? cursor.getString(nameIdx) : "";
                    String rawNumber = numIdx >= 0 ? cursor.getString(numIdx) : "";

                    if (name == null || name.trim().isEmpty()) continue;
                    name = name.trim();
                    String cleanNumber = rawNumber != null ? rawNumber.trim() : "";
                    if (cleanNumber.isEmpty()) continue;

                    String phoneKey = normalizePhoneNumberKey(cleanNumber);
                    String key = contactId + "_" + name.toLowerCase();

                    if (!contactMap.containsKey(key)) {
                        JSObject c = new JSObject();
                        c.put("id", contactId);
                        c.put("name", name);
                        c.put("phone", cleanNumber);
                        contactMap.put(key, c);

                        List<String> list = new ArrayList<>();
                        list.add(cleanNumber);
                        phonesMap.put(key, list);

                        Set<String> seenKeys = new HashSet<>();
                        seenKeys.add(phoneKey);
                        seenPhoneKeysMap.put(key, seenKeys);
                    } else {
                        Set<String> seenKeys = seenPhoneKeysMap.get(key);
                        if (seenKeys != null && !seenKeys.contains(phoneKey)) {
                            seenKeys.add(phoneKey);
                            List<String> list = phonesMap.get(key);
                            if (list != null) {
                                list.add(cleanNumber);
                            }
                        }
                    }
                }
                cursor.close();
            }

            JSArray result = new JSArray();
            for (Map.Entry<String, JSObject> entry : contactMap.entrySet()) {
                String key = entry.getKey();
                JSObject c = entry.getValue();
                List<String> phones = phonesMap.get(key);
                JSArray phonesArr = new JSArray();
                if (phones != null) {
                    for (String p : phones) {
                        phonesArr.put(p);
                    }
                }
                c.put("phones", phonesArr);
                result.put(c);
            }

            android.util.Log.d("AppPermissionsPlugin", "CONTACT PERMISSION = GRANTED");
            android.util.Log.d("AppPermissionsPlugin", "NUMBER OF PHONE CONTACTS READ = " + result.length());

            JSObject res = new JSObject();
            res.put("contacts", result);
            call.resolve(res);
        } catch (Exception e) {
            android.util.Log.e("AppPermissionsPlugin", "Error reading contacts: " + e.getMessage(), e);
            call.reject("ERROR_READING_CONTACTS", e.getMessage());
        }
    }

    @PluginMethod
    public void checkNotificationPermission(PluginCall call) {
        boolean granted;
        boolean canAskAgain = true;
        String status;

        Context context = getContext();
        android.content.SharedPreferences prefs = context != null ?
            context.getSharedPreferences(BackgroundNotificationSync.PREFS_NAME, Context.MODE_PRIVATE) : null;
        boolean askedBefore = prefs != null && prefs.getBoolean(PREF_NOTIF_REQUESTED, false);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            granted = ContextCompat.checkSelfPermission(
                getContext(),
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED;

            if (granted) {
                status = "granted";
                canAskAgain = true;
            } else if (!askedBefore) {
                status = "prompt";
                canAskAgain = true;
            } else {
                boolean rationale = false;
                if (getActivity() != null) {
                    rationale = ActivityCompat.shouldShowRequestPermissionRationale(
                        getActivity(),
                        Manifest.permission.POST_NOTIFICATIONS
                    );
                }
                status = "denied";
                canAskAgain = rationale;
            }
        } else {
            granted = NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
            status = granted ? "granted" : "denied";
            canAskAgain = granted;
        }

        JSObject ret = new JSObject();
        ret.put("granted", granted);
        ret.put("status", status);
        ret.put("canAskAgain", canAskAgain);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        Context context = getContext();
        if (context != null) {
            android.content.SharedPreferences prefs = context.getSharedPreferences(
                BackgroundNotificationSync.PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().putBoolean(PREF_NOTIF_REQUESTED, true).apply();
        }

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
        Context context = getContext();
        if (context != null) {
            android.content.SharedPreferences prefs = context.getSharedPreferences(
                BackgroundNotificationSync.PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().putBoolean(PREF_NOTIF_REQUESTED, true).apply();
        }

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

            int smallIcon = 0;
            try {
                smallIcon = context.getResources().getIdentifier("ic_stat_notification", "drawable", context.getPackageName());
            } catch (Exception ignored) {}
            if (smallIcon == 0) {
                smallIcon = context.getApplicationInfo().icon;
                if (smallIcon == 0) {
                    smallIcon = android.R.drawable.ic_dialog_info;
                }
            }

            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, NOTIFICATION_CHANNEL_ID)
                .setSmallIcon(smallIcon)
                .setColor(0xFFD4AF37)
                .setContentTitle(title != null ? title : "Invitation Hub Alert")
                .setContentText(body != null ? body : "")
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body != null ? body : ""))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .setAutoCancel(true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setContentIntent(pendingIntent);

            NotificationManagerCompat.from(context).notify(id, builder.build());
            BackgroundNotificationSync.recordDeliveredId(context, String.valueOf(id));
            return true;
        } catch (Exception e) {
            android.util.Log.e("AppPermissionsPlugin", "showNotificationDirectly error: " + e.getMessage(), e);
            return false;
        }
    }

    @PluginMethod
    public void showLocalNotification(PluginCall call) {
        String title = call.getString("title", "Invitation Hub Alert");
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
        String vipId = call.getString("vipId", "");

        BackgroundNotificationSync.saveConfig(getContext(), username, token, url, key, vipId);
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

    @PluginMethod
    public void saveFileToDownloads(PluginCall call) {
        String filename = call.getString("filename", "Invitation_Hub_Upcoming_Events.xlsx");
        String base64Data = call.getString("base64Data");
        String mimeType = call.getString("mimeType", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

        if (base64Data == null || base64Data.trim().isEmpty()) {
            call.reject("Base64 data is required");
            return;
        }

        try {
            if (base64Data.contains(",")) {
                base64Data = base64Data.substring(base64Data.indexOf(",") + 1);
            }
            byte[] fileBytes = android.util.Base64.decode(base64Data, android.util.Base64.DEFAULT);

            Context context = getContext();
            if (context == null) {
                call.reject("Context is not available");
                return;
            }

            Uri publicUri = null;
            String savedPath = "";

            // 1. Modern Android (API 29+ / Android 10+): Write to MediaStore Downloads
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                android.content.ContentValues values = new android.content.ContentValues();
                values.put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, filename);
                values.put(android.provider.MediaStore.MediaColumns.MIME_TYPE, mimeType);
                values.put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, android.os.Environment.DIRECTORY_DOWNLOADS);
                values.put(android.provider.MediaStore.MediaColumns.IS_PENDING, 1);

                android.content.ContentResolver resolver = context.getContentResolver();
                Uri collection = android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI;
                publicUri = resolver.insert(collection, values);

                if (publicUri != null) {
                    try (java.io.OutputStream out = resolver.openOutputStream(publicUri)) {
                        if (out != null) {
                            out.write(fileBytes);
                            out.flush();
                        }
                    }
                    values.clear();
                    values.put(android.provider.MediaStore.MediaColumns.IS_PENDING, 0);
                    resolver.update(publicUri, values, null, null);
                    savedPath = "Downloads/" + filename;
                }
            }

            // 2. Fallback for older Android (API < 29) or if MediaStore insert failed
            if (publicUri == null) {
                java.io.File downloadDir = android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOWNLOADS);
                if (!downloadDir.exists()) {
                    downloadDir.mkdirs();
                }
                java.io.File destFile = new java.io.File(downloadDir, filename);
                try (java.io.FileOutputStream fos = new java.io.FileOutputStream(destFile)) {
                    fos.write(fileBytes);
                    fos.flush();
                }
                savedPath = destFile.getAbsolutePath();
                android.media.MediaScannerConnection.scanFile(
                    context,
                    new String[]{destFile.getAbsolutePath()},
                    new String[]{mimeType},
                    null
                );
                try {
                    publicUri = androidx.core.content.FileProvider.getUriForFile(
                        context,
                        context.getPackageName() + ".fileprovider",
                        destFile
                    );
                } catch (Exception ignored) {}
            }

            // 3. Also write to cache directory for reliable FileProvider sharing across apps
            Uri shareableUri = null;
            try {
                java.io.File cacheFile = new java.io.File(context.getCacheDir(), filename);
                try (java.io.FileOutputStream fos = new java.io.FileOutputStream(cacheFile)) {
                    fos.write(fileBytes);
                    fos.flush();
                }
                shareableUri = androidx.core.content.FileProvider.getUriForFile(
                    context,
                    context.getPackageName() + ".fileprovider",
                    cacheFile
                );
            } catch (Exception ex) {
                if (publicUri != null) {
                    shareableUri = publicUri;
                }
            }

            // 4. Prompt the user with Android's native open / share sheet
            if (shareableUri != null) {
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW);
                    intent.setDataAndType(shareableUri, mimeType);
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

                    Intent chooser = Intent.createChooser(intent, "Open " + filename);
                    chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    context.startActivity(chooser);
                } catch (Exception openEx) {
                    try {
                        Intent sendIntent = new Intent(Intent.ACTION_SEND);
                        sendIntent.setType(mimeType);
                        sendIntent.putExtra(Intent.EXTRA_STREAM, shareableUri);
                        sendIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        sendIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

                        Intent chooser = Intent.createChooser(sendIntent, "Share " + filename);
                        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        context.startActivity(chooser);
                    } catch (Exception ignored) {}
                }
            }

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("filename", filename);
            ret.put("path", savedPath);
            ret.put("savedToDownloads", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to save file: " + e.getMessage(), e);
        }
    }
}

