import { registerPlugin, Capacitor } from '@capacitor/core';
import { mobileNotificationService, type PermissionResult } from './mobileNotificationService';

export type { PermissionResult };

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
    return await mobileNotificationService.checkPermission();
  },

  async requestNotifications(): Promise<PermissionResult> {
    return await mobileNotificationService.requestPermission();
  },

  async requestFirstLaunchNotifications(): Promise<PermissionResult | null> {
    return await mobileNotificationService.requestFirstLaunchPermission();
  },

  async openSettings(): Promise<boolean> {
    return await mobileNotificationService.openSettings();
  },
};

