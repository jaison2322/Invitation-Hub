package com.vip.intelligence;

import static org.junit.Assert.*;

import org.junit.Test;

public class NotificationPermissionTest {

    // Helper logic simulating AppPermissionsPlugin.checkNotificationPermission logic
    static class PermissionStateResolver {
        public static class Result {
            public final boolean granted;
            public final String status;
            public final boolean canAskAgain;

            public Result(boolean granted, String status, boolean canAskAgain) {
                this.granted = granted;
                this.status = status;
                this.canAskAgain = canAskAgain;
            }
        }

        public static Result resolve(int sdkInt, boolean hasManifestPerm, boolean askedBefore, boolean rationale, boolean areNotificationsEnabled) {
            boolean granted;
            boolean canAskAgain;
            String status;

            if (sdkInt >= 33) { // Build.VERSION_CODES.TIRAMISU
                granted = hasManifestPerm;
                if (granted) {
                    status = "granted";
                    canAskAgain = true;
                } else if (!askedBefore) {
                    status = "prompt";
                    canAskAgain = true;
                } else {
                    status = "denied";
                    canAskAgain = rationale;
                }
            } else {
                granted = areNotificationsEnabled;
                status = granted ? "granted" : "denied";
                canAskAgain = granted;
            }

            return new Result(granted, status, canAskAgain);
        }
    }

    @Test
    public void testAndroid13_FreshInstall_ReturnsPromptAndCanAskAgain() {
        // Android 13 (API 33), permission not yet granted, never asked before
        PermissionStateResolver.Result result = PermissionStateResolver.resolve(
            33, /* sdkInt */
            false, /* hasManifestPerm */
            false, /* askedBefore */
            false, /* rationale */
            true  /* areNotificationsEnabled */
        );

        assertFalse("Permission should not be granted on fresh install", result.granted);
        assertEquals("Status should be 'prompt' on fresh install", "prompt", result.status);
        assertTrue("User can be asked on first launch", result.canAskAgain);
    }

    @Test
    public void testAndroid13_UserAllows_ReturnsGranted() {
        // Android 13, user tapped Allow
        PermissionStateResolver.Result result = PermissionStateResolver.resolve(
            33,
            true, /* hasManifestPerm granted */
            true, /* askedBefore */
            false,
            true
        );

        assertTrue("Permission should be granted", result.granted);
        assertEquals("Status should be 'granted'", "granted", result.status);
        assertTrue(result.canAskAgain);
    }

    @Test
    public void testAndroid13_UserDeniesOnce_ReturnsDeniedWithCanAskAgain() {
        // Android 13, user tapped Don't allow once (rationale == true)
        PermissionStateResolver.Result result = PermissionStateResolver.resolve(
            33,
            false,
            true, /* askedBefore */
            true, /* rationale == true */
            true
        );

        assertFalse(result.granted);
        assertEquals("Status should be 'denied'", "denied", result.status);
        assertTrue("canAskAgain should be true after first denial", result.canAskAgain);
    }

    @Test
    public void testAndroid13_UserPermanentlyDenies_ReturnsDeniedWithCannotAskAgain() {
        // Android 13, user selected "Don't ask again" / denied twice (rationale == false)
        PermissionStateResolver.Result result = PermissionStateResolver.resolve(
            33,
            false,
            true, /* askedBefore */
            false, /* rationale == false */
            true
        );

        assertFalse(result.granted);
        assertEquals("Status should be 'denied'", "denied", result.status);
        assertFalse("canAskAgain should be false after permanent denial", result.canAskAgain);
    }

    @Test
    public void testAndroid12AndBelow_NoRuntimeRequest_RespectsNotificationManager() {
        // Android 12 (API 32 or 31) - notifications enabled by default
        PermissionStateResolver.Result result = PermissionStateResolver.resolve(
            32, /* sdkInt */
            false, /* POST_NOTIFICATIONS runtime permission does not exist on API 32 */
            false,
            false,
            true /* areNotificationsEnabled */
        );

        assertTrue("Notifications enabled on Android 12 should be granted", result.granted);
        assertEquals("Status should be 'granted' on Android 12", "granted", result.status);
        assertTrue(result.canAskAgain);
    }

    @Test
    public void testAndroid12AndBelow_DisabledInSettings_ReturnsDenied() {
        // Android 12 (API 32) - notifications disabled in app settings by user
        PermissionStateResolver.Result result = PermissionStateResolver.resolve(
            32,
            false,
            true,
            false,
            false /* areNotificationsEnabled is false */
        );

        assertFalse(result.granted);
        assertEquals("Status should be 'denied'", "denied", result.status);
        assertFalse(result.canAskAgain);
    }
}
