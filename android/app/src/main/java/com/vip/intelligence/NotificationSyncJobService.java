package com.vip.intelligence;

import android.app.job.JobParameters;
import android.app.job.JobService;
import android.util.Log;

public class NotificationSyncJobService extends JobService {
    private static final String TAG = "VIP_JobService";

    @Override
    public boolean onStartJob(JobParameters params) {
        Log.i(TAG, "JobService started by Android system scheduler.");
        BackgroundNotificationSync.checkNotifications(getApplicationContext(), new BackgroundNotificationSync.SyncCallback() {
            @Override
            public void onComplete(int deliveredCount) {
                Log.i(TAG, "JobService check complete. Delivered: " + deliveredCount);
                jobFinished(params, false);
            }
        });
        return true; // running in background thread
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true; // reschedule if interrupted
    }
}
