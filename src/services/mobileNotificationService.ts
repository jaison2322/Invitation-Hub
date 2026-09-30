import { registerPlugin, Capacitor } from '@capacitor/core';
import type { Notification } from '../types';
import { supabaseDbService } from './supabaseDbService';

export interface PermissionResult {
  granted: boolean;
  status: 'granted' | 'denied' | 'prompt';
  canAskAgain: boolean;
}

export interface NativeAppPermissionsInterface {
  checkCameraPermission(): Promise<PermissionResult>;
  requestCameraPermission(): Promise<PermissionResult>;
  checkNotificationPermission(): Promise<PermissionResult>;
  requestNotificationPermission(): Promise<PermissionResult>;
  showLocalNotification(options: {
    id?: number;
    title: string;
    body: string;
    actionUrl?: string;
    priority?: string;
  }): Promise<{ delivered: boolean; id?: number; error?: string }>;
  cancelNotification(options: { id?: number }): Promise<{ cancelled: boolean }>;
  getDevicePushToken(): Promise<{ token: string; platform: string }>;
  openAppSettings(): Promise<{ opened: boolean }>;
  configureBackgroundSync(options: {
    username: string;
    token: string;
    supabaseUrl?: string;
    supabaseKey?: string;
    vipId?: string;
  }): Promise<{ configured: boolean }>;
}

export const NativeAppPermissions = registerPlugin<NativeAppPermissionsInterface>('AppPermissions');

export interface DeviceRegistration {
  token: string;
  platform: 'android' | 'ios' | 'web';
  username: string | null;
  registeredAt: string;
  lastActive: string;
}

// Memory cache of recently delivered notification IDs (prevents echo/duplicate alerts)
const deliveredNotifIds = new Map<string, number>();
const DEDUPLICATION_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

function pruneDeliveredCache() {
  const now = Date.now();
  for (const [id, time] of deliveredNotifIds.entries()) {
    if (now - time > DEDUPLICATION_WINDOW_MS) {
      deliveredNotifIds.delete(id);
    }
  }
}

// Generate numeric hash from string notification id for Android Notification ID
function hashStringToInt(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash % 1000000);
}

const STORAGE_KEY_REGISTRATION = 'vip_device_push_registration';
const STORAGE_KEY_ASKED = 'vip_notif_perm_asked';

// In-memory guard to prevent repeated requests during recompositions, StrictMode double-invocations, or navigation
let hasRequestedFirstLaunch = false;

export const mobileNotificationService = {
  isNative(): boolean {
    return Capacitor.isNativePlatform();
  },

  getPlatform(): 'android' | 'ios' | 'web' {
    if (Capacitor.getPlatform() === 'android') return 'android';
    if (Capacitor.getPlatform() === 'ios') return 'ios';
    return 'web';
  },

  /**
   * Initializes Service Worker registration on web/PWA and prepares push capability.
   */
  async init(): Promise<void> {
    try {
      if (!this.isNative() && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
        // Register service worker if not already registered
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        if (reg.installing) {
          reg.installing.addEventListener('statechange', (e: any) => {
            if (e.target?.state === 'activated') {
              console.log('[VIP Notification] Service Worker activated.');
            }
          });
        }
      }
    } catch (err) {
      console.warn('[VIP Notification] Service Worker init warning:', err);
    }
  },

  /**
   * Checks current permission status without prompting.
   */
  async checkPermission(): Promise<PermissionResult> {
    if (this.isNative()) {
      try {
        return await NativeAppPermissions.checkNotificationPermission();
      } catch (e) {
        console.warn('Native checkNotificationPermission error:', e);
        return { granted: false, status: 'denied', canAskAgain: true };
      }
    }

    // Web / PWA
    if (typeof Notification !== 'undefined') {
      const perm = Notification.permission;
      const granted = perm === 'granted';
      const status: 'granted' | 'denied' | 'prompt' =
        perm === 'granted' ? 'granted' : perm === 'denied' ? 'denied' : 'prompt';
      return {
        granted,
        status,
        canAskAgain: perm !== 'denied',
      };
    }

    return { granted: false, status: 'denied', canAskAgain: false };
  },

  /**
   * Requests permission from the user. Respects previous denials to avoid nagging.
   */
  async requestPermission(force = false): Promise<PermissionResult> {
    // Check current state first
    const current = await this.checkPermission();
    if (current.granted) return current;

    // If previously denied and not forced, respect user's decision
    if (current.status === 'denied' && !current.canAskAgain && !force) {
      return current;
    }

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_ASKED, 'true');
      }

      if (this.isNative()) {
        return await NativeAppPermissions.requestNotificationPermission();
      }

      // Web / PWA request
      if (typeof Notification !== 'undefined') {
        const result = await Notification.requestPermission();
        const granted = result === 'granted';
        return {
          granted,
          status: granted ? 'granted' : 'denied',
          canAskAgain: result !== 'denied',
        };
      }
    } catch (e) {
      console.warn('requestNotificationPermission error:', e);
    }

    return { granted: false, status: 'denied', canAskAgain: false };
  },

  /**
   * Automatically requests notification permission on the first app launch after
   * the main activity is ready.
   * Guarantees:
   * - Triggered automatically on fresh install / first launch
   * - Never triggered repeatedly during recompositions, activity recreation, or navigation
   * - Checks current permission status first; skips if already granted
   * - Skips if previously prompted or permanently denied
   * - Handles granted, denied, and dismissed outcomes without blocking login or app usage
   * - Does not request runtime permission on Android 12 and below
   */
  async requestFirstLaunchPermission(): Promise<PermissionResult | null> {
    if (hasRequestedFirstLaunch) {
      return null;
    }
    hasRequestedFirstLaunch = true;

    try {
      // Check persistent flag: if asked on a past session, do not prompt again
      const alreadyAsked = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY_ASKED) : null;
      if (alreadyAsked === 'true') {
        return null;
      }

      // Check current permission status before requesting
      const current = await this.checkPermission();
      if (current.granted) {
        // Permission is already granted (e.g. Android 12 or below, or already allowed)
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(STORAGE_KEY_ASKED, 'true');
        }
        return current;
      }

      // If permanently denied, respect user decision and do not repeatedly force dialog
      if (current.status === 'denied' && !current.canAskAgain) {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(STORAGE_KEY_ASKED, 'true');
        }
        return current;
      }

      // On native platform, give the Activity window a brief moment to finish its initial frame draw
      if (this.isNative()) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      // Mark asked in localStorage immediately so activity recreation does not loop
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_ASKED, 'true');
      }

      // Request runtime permission
      const result = await this.requestPermission(false);

      // If granted, sync device registration if active user exists
      if (result.granted) {
        const reg = this.getDeviceRegistration();
        if (reg?.username) {
          this.registerDevice(reg.username).catch(console.warn);
        }
      }

      return result;
    } catch (err) {
      console.warn('[VIP Notification] Error requesting first-launch permission:', err);
      // Guarantee non-blocking behavior
      return null;
    }
  },

  /**
   * Opens native OS application notification settings or alerts web users.
   */
  async openSettings(): Promise<boolean> {
    if (this.isNative()) {
      try {
        const res = await NativeAppPermissions.openAppSettings();
        return !!res.opened;
      } catch (e) {
        console.warn('Error opening native app settings:', e);
        return false;
      }
    }

    // Browser guidance
    alert(
      'To enable notifications, click the lock/settings icon beside the URL in your browser address bar and set Notifications to "Allow".'
    );
    return false;
  },

  /**
   * Registers current device / browser and associates it with the active logged-in user.
   */
  async registerDevice(username?: string, vipId?: string): Promise<DeviceRegistration | null> {
    try {
      let token = '';
      const platform = this.getPlatform();

      if (this.isNative()) {
        const nativeRes = await NativeAppPermissions.getDevicePushToken();
        token = nativeRes.token;
      } else {
        // Web Push or persistent client identifier
        let localToken = localStorage.getItem('vip_web_push_token');
        if (!localToken) {
          const randomId =
            typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
              ? crypto.randomUUID()
              : Math.random().toString(36).substring(2, 11) + '-' + Date.now().toString(36);
          localToken = 'web-' + randomId;
          localStorage.setItem('vip_web_push_token', localToken);
        }
        token = localToken;
      }

      const activeUser = username || null;
      const targetVipId = vipId || undefined;
      const registration: DeviceRegistration = {
        token,
        platform,
        username: activeUser,
        registeredAt: new Date().toISOString(),
        lastActive: new Date().toISOString(),
      };

      localStorage.setItem(STORAGE_KEY_REGISTRATION, JSON.stringify(registration));

      // Configure native background sync engine (AlarmManager & JobScheduler) — now a 30min fallback
      if (this.isNative()) {
        NativeAppPermissions.configureBackgroundSync({
          username: activeUser || '',
          token,
          supabaseUrl: 'https://lliowikzustvebudgsoy.supabase.co',
          supabaseKey: 'sb_publishable_HOmmQBn10vwi0eehQDX5gg_3aRXTUTH',
          vipId: targetVipId || '',
        }).catch((e) => console.warn('[VIP Notification] configureBackgroundSync error:', e));
      }

      // Sync device registration & push token to user account in Supabase
      if (activeUser) {
        supabaseDbService.saveDevicePushToken(activeUser, token, platform, registration, targetVipId).catch(console.warn);

        // Also save FCM token to the device_tokens table scoped to this VIP account
        supabaseDbService.saveDeviceTokenFCM(activeUser, token, platform, undefined, targetVipId).catch((e) =>
          console.warn('[VIP Notification] saveDeviceTokenFCM error:', e)
        );
      }

      console.log('[VIP Notification] Device registered with FCM token for VIP:', targetVipId, token.substring(0, 20) + '...');
      return registration;
    } catch (err) {
      console.warn('[VIP Notification] Device registration warning:', err);
      return null;
    }
  },

  /**
   * Retrieves active device registration.
   */
  getDeviceRegistration(): DeviceRegistration | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_REGISTRATION);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  /**
   * Clears user association on logout so the device is decoupled from the account.
   */
  clearUserAssociation(): void {
    try {
      const reg = this.getDeviceRegistration();
      if (reg) {
        // Deactivate FCM token in cloud so this device stops receiving pushes for this user
        if (reg.token) {
          supabaseDbService.deactivateDeviceToken(reg.token).catch((e) =>
            console.warn('[VIP Notification] deactivateDeviceToken error:', e)
          );
        }

        reg.username = null;
        reg.lastActive = new Date().toISOString();
        localStorage.setItem(STORAGE_KEY_REGISTRATION, JSON.stringify(reg));
      }
    } catch (e) {
      console.warn('clearUserAssociation error:', e);
    }
  },

  /**
   * Delivers an OS / system-level notification to the mobile device or browser.
   * Handles foreground, background, lock-screen display, and deduplication.
   */
  async deliverNotification(notification: Notification): Promise<boolean> {
    if (!notification || !notification.id) return false;

    // 1. Deduplication: check if already delivered recently
    pruneDeliveredCache();
    if (deliveredNotifIds.has(notification.id)) {
      return false; // Already delivered to the OS, skip duplicate
    }
    deliveredNotifIds.set(notification.id, Date.now());

    // 2. Check permission
    const perm = await this.checkPermission();
    if (!perm.granted) {
      return false;
    }

    const title = notification.title || 'Invitation Hub Alert';
    const body = notification.message || '';
    const actionUrl = notification.actionUrl || (notification.relatedEntityId ? `/event/${notification.relatedEntityId}` : '/notifications');
    const numericId = hashStringToInt(notification.id);

    // 3. Platform Delivery: Native Android / iOS
    if (this.isNative()) {
      try {
        const res = await NativeAppPermissions.showLocalNotification({
          id: numericId,
          title,
          body,
          actionUrl,
          priority: 'high',
        });
        return !!res.delivered;
      } catch (err) {
        console.warn('[VIP Notification] Native notification error:', err);
        return false;
      }
    }

    // 4. Platform Delivery: Mobile Web / PWA (Service Worker)
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        if (reg && 'showNotification' in reg) {
          await reg.showNotification(title, {
            body,
            icon: '/icon.png',
            badge: '/favicon.svg',
            tag: 'vip-notif-' + notification.id,
            data: { actionUrl },
            vibrate: [200, 100, 200],
            renotify: true,
          } as any);
          return true;
        }

        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: 'SHOW_NOTIFICATION',
            title,
            body,
            actionUrl,
            id: notification.id,
          });
          return true;
        }
      }

      // Fallback: Desktop window Notification (only if constructor is safe)
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        // Guard against Android Chrome Illegal constructor
        try {
          const n = new Notification(title, {
            body,
            icon: '/icon.png',
            badge: '/favicon.svg',
            tag: 'vip-notif-' + notification.id,
          });
          n.onclick = () => {
            window.focus();
            if (actionUrl) window.location.hash = actionUrl;
          };
          return true;
        } catch (constrErr) {
          console.warn('[VIP Notification] Fallback constructor bypassed (mobile browser requirement):', constrErr);
        }
      }
    } catch (err) {
      console.warn('[VIP Notification] Web notification delivery error:', err);
    }

    return false;
  },

  /**
   * Registers a notification ID as already delivered locally so the actor device does not alert itself.
   */
  markDeliveredLocally(id: string): void {
    pruneDeliveredCache();
    deliveredNotifIds.set(id, Date.now());
  },

  /**
   * Catches up and delivers any recent unread notifications missed while the device was sleeping, locked, or backgrounded.
   */
  async checkRecentUnreadNotifications(myUsername?: string, vipId?: string): Promise<void> {
    try {
      const recentNotifs = await supabaseDbService.getNotifications(vipId);
      const cleanMyUser = (myUsername || '').toLowerCase();
      const now = Date.now();
      const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

      for (const notif of recentNotifs) {
        if (notif.read) continue;
        const notifTime = new Date(notif.timestamp).getTime();
        if (now - notifTime > FIFTEEN_MINUTES_MS) continue;

        // Check if sender is current user
        const urlParams = notif.actionUrl ? new URLSearchParams(notif.actionUrl.split('?')[1] || '') : null;
        const sender = urlParams?.get('sender')?.toLowerCase();
        if (cleanMyUser && sender && sender === cleanMyUser) {
          continue; // Do not alert the sender on their own device
        }

        pruneDeliveredCache();
        if (!deliveredNotifIds.has(notif.id)) {
          console.log('=== [DEVICE RECEIVED?] === Catching up missed background notification:', notif.title);
          await this.deliverNotification(notif);
        }
      }
    } catch (err) {
      console.warn('checkRecentUnreadNotifications warning:', err);
    }
  },

  /**
   * Sends a test notification to verify end-to-end device delivery.
   */
  async sendTestNotification(): Promise<boolean> {
    const testNotif: Notification = {
      id: 'test-' + Date.now(),
      type: 'system',
      title: 'Invitation Hub Verified',
      message: 'Mobile notifications are active and delivering with high priority.',
      timestamp: new Date().toISOString(),
      read: false,
      actionUrl: '/notifications',
    };
    return await this.deliverNotification(testNotif);
  },
};

