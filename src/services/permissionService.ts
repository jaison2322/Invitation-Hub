import { registerPlugin, Capacitor } from '@capacitor/core';

export interface PermissionResult {
  granted: boolean;
  status: 'granted' | 'denied' | 'prompt';
  canAskAgain: boolean;
}

export interface AppPermissionsPluginInterface {
  checkCameraPermission(): Promise<PermissionResult>;
  requestCameraPermission(): Promise<PermissionResult>;
  checkNotificationPermission(): Promise<PermissionResult>;
  requestNotificationPermission(): Promise<PermissionResult>;
  openAppSettings(): Promise<{ opened: boolean }>;
}

const NativeAppPermissions = registerPlugin<AppPermissionsPluginInterface>('AppPermissions');

export const permissionService = {
  isNative(): boolean {
    return Capacitor.isNativePlatform();
  },

  async checkCamera(): Promise<PermissionResult> {
    if (!this.isNative()) {
      return { granted: true, status: 'granted', canAskAgain: true };
    }
    try {
      return await NativeAppPermissions.checkCameraPermission();
    } catch (e) {
      console.warn('Error checking camera permission:', e);
      return { granted: false, status: 'denied', canAskAgain: true };
    }
  },

  async requestCamera(): Promise<PermissionResult> {
    if (!this.isNative()) {
      return { granted: true, status: 'granted', canAskAgain: true };
    }
    try {
      return await NativeAppPermissions.requestCameraPermission();
    } catch (e) {
      console.warn('Error requesting camera permission:', e);
      return { granted: false, status: 'denied', canAskAgain: true };
    }
  },

  async checkNotifications(): Promise<PermissionResult> {
    if (!this.isNative()) {
      if (typeof Notification !== 'undefined') {
        const perm = Notification.permission;
        return {
          granted: perm === 'granted',
          status: perm === 'granted' ? 'granted' : perm === 'denied' ? 'denied' : 'prompt',
          canAskAgain: perm !== 'denied',
        };
      }
      return { granted: true, status: 'granted', canAskAgain: true };
    }
    try {
      return await NativeAppPermissions.checkNotificationPermission();
    } catch (e) {
      console.warn('Error checking notification permission:', e);
      return { granted: false, status: 'denied', canAskAgain: true };
    }
  },

  async requestNotifications(): Promise<PermissionResult> {
    if (!this.isNative()) {
      if (typeof Notification !== 'undefined') {
        try {
          const res = await Notification.requestPermission();
          return {
            granted: res === 'granted',
            status: res === 'granted' ? 'granted' : 'denied',
            canAskAgain: res !== 'denied',
          };
        } catch {
          return { granted: false, status: 'denied', canAskAgain: false };
        }
      }
      return { granted: true, status: 'granted', canAskAgain: true };
    }
    try {
      return await NativeAppPermissions.requestNotificationPermission();
    } catch (e) {
      console.warn('Error requesting notification permission:', e);
      return { granted: false, status: 'denied', canAskAgain: true };
    }
  },

  async openSettings(): Promise<boolean> {
    if (!this.isNative()) return false;
    try {
      const res = await NativeAppPermissions.openAppSettings();
      return !!res.opened;
    } catch (e) {
      console.warn('Error opening app settings:', e);
      return false;
    }
  },
};
