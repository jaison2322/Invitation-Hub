package com.vip.intelligence;

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
    public void onDestroy() {
        super.onDestroy();
        BackgroundNotificationSync.scheduleNextAlarm(this, 15000);
    }
}
