package com.vip.intelligence;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

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

    private static final String CAMERA_ALIAS = "camera";
    private static final String NOTIFICATIONS_ALIAS = "notifications";

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

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            Uri uri = Uri.fromParts("package", getContext().getPackageName(), null);
            intent.setData(uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);

            JSObject ret = new JSObject();
            ret.put("opened", true);
            call.resolve(ret);
        } catch (Exception ex) {
            call.reject("Unable to open app settings: " + ex.getMessage());
        }
    }
}
