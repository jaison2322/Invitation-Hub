package com.vip.intelligence;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppPermissionsPlugin.class);
        super.onCreate(savedInstanceState);
        AppPermissionsPlugin.createNotificationChannel(this);
        BackgroundNotificationSync.startSync(this);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleNotificationIntent(intent);
    }

    @Override
    public void onResume() {
        super.onResume();
        handleNotificationIntent(getIntent());
    }

    private void handleNotificationIntent(Intent intent) {
        if (intent != null && intent.hasExtra("actionUrl")) {
            String actionUrl = intent.getStringExtra("actionUrl");
            intent.removeExtra("actionUrl"); // Consume intent extra
            if (actionUrl != null && !actionUrl.isEmpty() && getBridge() != null && getBridge().getWebView() != null) {
                String js = String.format(
                    "if (window.location.pathname !== '%s') { window.location.href = '%s'; }",
                    actionUrl, actionUrl
                );
                getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(js, null));
            }
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        BackgroundNotificationSync.scheduleNextAlarm(this, 15000);
    }
}
