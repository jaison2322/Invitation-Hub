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
        if (intent == null) return;
        String actionUrl = intent.getStringExtra("actionUrl");
        if (actionUrl == null || actionUrl.isEmpty()) {
            android.os.Bundle extras = intent.getExtras();
            if (extras != null) {
                actionUrl = extras.getString("actionUrl");
            }
        }
        if (actionUrl != null && !actionUrl.isEmpty()) {
            final String finalUrl = actionUrl;
            intent.removeExtra("actionUrl");
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().postDelayed(() -> {
                    if (getBridge() != null && getBridge().getWebView() != null) {
                        String js = String.format(
                            "try { if (window.location.pathname + window.location.search !== '%s') { window.location.href = '%s'; } } catch(e){}",
                            finalUrl, finalUrl
                        );
                        getBridge().getWebView().evaluateJavascript(js, null);
                    }
                }, 600);
            }
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        BackgroundNotificationSync.scheduleNextAlarm(this, 15000);
    }
}
