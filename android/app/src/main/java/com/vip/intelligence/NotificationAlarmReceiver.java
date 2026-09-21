package com.vip.intelligence;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.PowerManager;
import android.util.Log;

public class NotificationAlarmReceiver extends BroadcastReceiver {
    private static final String TAG = "VIP_AlarmReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : null;
        Log.i(TAG, "NotificationAlarmReceiver triggered with action: " + action);

        final PendingResult pendingResult = goAsync();

        PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        PowerManager.WakeLock wakeLock = null;
        if (pm != null) {
            try {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "vip:NotificationAlarmWakeLock");
                wakeLock.acquire(15000); // 15s timeout
            } catch (Exception e) {
                Log.w(TAG, "Could not acquire wakelock: " + e.getMessage());
            }
        }

        final PowerManager.WakeLock finalLock = wakeLock;
        BackgroundNotificationSync.checkNotifications(context, new BackgroundNotificationSync.SyncCallback() {
            @Override
            public void onComplete(int deliveredCount) {
                Log.i(TAG, "Background check complete. Delivered notifications: " + deliveredCount);
                if (finalLock != null && finalLock.isHeld()) {
                    try {
                        finalLock.release();
                    } catch (Exception ignored) {}
                }
                // Continuously reschedule next alarm so the phone receives notifications when the app is closed
                BackgroundNotificationSync.scheduleNextAlarm(context, BackgroundNotificationSync.DEFAULT_ALARM_INTERVAL_MS);

                try {
                    if (pendingResult != null) {
                        pendingResult.finish();
                    }
                } catch (Exception ignored) {}
            }
        });
    }
}
