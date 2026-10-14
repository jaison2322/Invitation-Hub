import { registerPlugin, Capacitor } from '@capacitor/core';
import { mobileNotificationService, type PermissionResult } from './mobileNotificationService';

export type { PermissionResult };

export interface PhoneContactRaw {
  id: string;
  name: string;
  phone: string;
  phones: string[];
}

export interface AppPermissionsPluginInterface {
  checkCameraPermission(): Promise<PermissionResult>;
  requestCameraPermission(): Promise<PermissionResult>;
  checkNotificationPermission(): Promise<PermissionResult>;
  requestNotificationPermission(): Promise<PermissionResult>;
  checkContactsPermission(): Promise<PermissionResult>;
  requestContactsPermission(): Promise<PermissionResult>;
  getPhoneContacts(): Promise<{ contacts: PhoneContactRaw[] }>;
  openAppSettings(): Promise<{ opened: boolean }>;
  saveFileToDownloads(options: {
    filename: string;
    base64Data: string;
    mimeType: string;
  }): Promise<{ success: boolean; filename: string; path?: string; savedToDownloads?: boolean }>;
}

export const NativeAppPermissions = registerPlugin<AppPermissionsPluginInterface>('AppPermissions');

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

  async checkContacts(): Promise<PermissionResult> {
    if (!this.isNative()) {
      return { granted: true, status: 'granted', canAskAgain: true };
    }
    try {
      return await NativeAppPermissions.checkContactsPermission();
    } catch (e) {
      console.warn('Error checking contacts permission:', e);
      return { granted: false, status: 'denied', canAskAgain: true };
    }
  },

  async requestContacts(): Promise<PermissionResult> {
    if (!this.isNative()) {
      return { granted: true, status: 'granted', canAskAgain: true };
    }
    try {
      return await NativeAppPermissions.requestContactsPermission();
    } catch (e) {
      console.warn('Error requesting contacts permission:', e);
      return { granted: false, status: 'denied', canAskAgain: true };
    }
  },

  async getNativeContacts(): Promise<PhoneContactRaw[]> {
    if (!this.isNative()) {
      return [];
    }
    try {
      const res = await NativeAppPermissions.getPhoneContacts();
      return res?.contacts || [];
    } catch (e) {
      console.warn('Error fetching native contacts:', e);
      return [];
    }
  },

  async openSettings(): Promise<boolean> {
    return await mobileNotificationService.openSettings();
  },
};

