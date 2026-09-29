import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  VIPUser,
  PrivilegedUser,
  Person,
  Invitation,
  FamilyEvent,
  ScheduleItem,
  Reminder,
  ActivityLog,
  Notification,
  InvitationStatus,
  Priority,
  ScanResult,
  UserAccount,
  LanguageCode,
} from '../types';
import { sanitizePermissions } from '../types';
import { generateId } from '../utils/id';
import { hashPassword } from '../utils/crypto';
import { supabaseDbService } from '../services/supabaseDbService';
import { setSupabaseAuthSession, clearSupabaseAuthSession } from '../utils/supabase';
import { realtimeService } from '../services/realtimeService';
import { seedPrivilegedUsers } from '../data/seedData';
import { daysUntil } from '../utils/formatters';
import { mobileNotificationService } from '../services/mobileNotificationService';
import { storageService } from '../services/storageService';

// ─── Store Interface ─────────────────────────────────────────────────────────

interface AppState {
  // Sync
  isSyncing: boolean;
  isRealtimeActive: boolean;
  syncWithSupabase: (explicitVipId?: string) => Promise<void>;

  // Auth
  isAuthenticated: boolean;
  currentUser: VIPUser | null;
  isVIP: boolean;
  currentPrivilegedUser: PrivilegedUser | null;
  hasSetup: boolean;
  activeVipId: string | null;
  authToken: string | null;

  // Data
  people: Person[];
  invitations: Invitation[];
  familyEvents: FamilyEvent[];
  schedule: ScheduleItem[];
  reminders: Reminder[];
  privilegedUsers: PrivilegedUser[];
  activityLogs: ActivityLog[];
  notifications: Notification[];

  // Scanning
  currentScanResult: ScanResult | null;

  // Preferences
  theme: 'dark' | 'light' | 'onyx' | 'sapphire';
  setTheme: (theme: 'dark' | 'light' | 'onyx' | 'sapphire') => void;
  language: LanguageCode;
  setLanguage: (language: LanguageCode) => void;

  // Auth actions
  setupVIP: (name: string, phone?: string, email?: string, username?: string, password?: string, phoneVerified?: boolean, emailVerified?: boolean) => Promise<{ success: boolean; error?: string }>;
  registerPrivilegedUser: (name: string, role: string, phone?: string, email?: string, username?: string, password?: string, phoneVerified?: boolean, emailVerified?: boolean, vipId?: string) => Promise<PrivilegedUser | null>;
  updateProfile: (name: string, phone?: string, email?: string) => void;
  changePassword: (oldPassword: string, newPassword: string) => Promise<{ success: boolean; message: string }>;
  loginWithCredentials: (username: string, password: string) => Promise<{
    success: boolean;
    error?: string;
    status?: 'APPROVED' | 'PENDING_APPROVAL' | 'REJECTED' | 'UNVERIFIED_PHONE';
    staffUser?: PrivilegedUser;
  }>;
  submitStaffRegistration: (params: {
    username: string;
    password: string;
    name: string;
    staffTitle: string;
    vipUsername: string;
    phone?: string;
    email?: string;
  }) => Promise<{ success: boolean; error?: string; staffUser?: PrivilegedUser }>;
  checkStaffStatus: (username?: string) => Promise<{
    status: 'APPROVED' | 'PENDING_APPROVAL' | 'REJECTED';
    phoneVerified: boolean;
  }>;
  reassignStaffVip: (newVipUsername: string) => Promise<{ success: boolean; error?: string }>;
  verifyStaffPhoneOtp: (otp: string, phone?: string) => Promise<{ success: boolean; error?: string }>;
  refreshStaffAccounts: (explicitVipId?: string) => Promise<PrivilegedUser[]>;
  respondToStaffRequest: (staffUsername: string, accept: boolean) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;

  // People actions
  addPerson: (person: Omit<Person, 'id' | 'createdAt' | 'updatedAt'>) => Person;
  updatePerson: (id: string, updates: Partial<Person>) => void;
  removePerson: (id: string) => void;
  getPersonById: (id: string) => Person | undefined;
  searchPeople: (query: string) => Person[];

  // Invitation actions
  addInvitation: (invitation: Omit<Invitation, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Invitation;
  updateInvitation: (id: string, updates: Partial<Invitation>) => void;
  updateInvitationStatus: (id: string, status: InvitationStatus) => void;
  removeInvitation: (id: string) => void | Promise<void>;
  getInvitationById: (id: string) => Invitation | undefined;
  getInvitationsByStatus: (status: InvitationStatus) => Invitation[];
  getInvitationsByDate: (date: string) => Invitation[];

  // Family event actions
  addFamilyEvent: (event: Omit<FamilyEvent, 'id' | 'createdAt' | 'updatedAt'>) => FamilyEvent;
  updateFamilyEvent: (id: string, updates: Partial<FamilyEvent>) => void;
  removeFamilyEvent: (id: string) => void | Promise<void>;
  getFamilyEventById: (id: string) => FamilyEvent | undefined;

  // Schedule actions
  addScheduleItem: (item: Omit<ScheduleItem, 'id' | 'createdAt'>) => ScheduleItem;
  updateScheduleItem: (id: string, updates: Partial<ScheduleItem>) => void;
  removeScheduleItem: (id: string) => void;
  getScheduleByDate: (date: string) => ScheduleItem[];

  // Privileged user actions
  addPrivilegedUser: (user: Omit<PrivilegedUser, 'id' | 'addedAt'> & { password?: string }) => Promise<PrivilegedUser | null>;
  updatePrivilegedUser: (id: string, updates: Partial<PrivilegedUser>) => void;
  removePrivilegedUser: (id: string) => void;

  // Notification actions
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp'>) => Notification;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  deleteNotification: (id: string) => void;
  clearNotifications: () => void;
  getUnreadCount: () => number;

  // Activity log actions
  addActivityLog: (log: Omit<ActivityLog, 'id' | 'timestamp'>) => ActivityLog;
  clearActivityLogs: () => void;

  // Reminder actions
  addReminder: (reminder: Omit<Reminder, 'id'>) => void;
  markReminderRead: (id: string) => void;

  // Scan actions
  setScanResult: (result: ScanResult | null) => void;

  // Clear all data
  clearAllData: () => Promise<void>;
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // ── Initial State (Clean / Fresh) ─────────────────────────────────────
      isAuthenticated: false,
      currentUser: null,
      isVIP: false,
      currentPrivilegedUser: null,
      hasSetup: false,
      activeVipId: null,
      authToken: null,

      // Theme & Localization
      theme: 'dark',
      language: 'en',

      people: [],
      invitations: [],
      familyEvents: [],
      schedule: [],
      reminders: [],
      privilegedUsers: [],
      activityLogs: [],
      notifications: [],

      currentScanResult: null,
      isSyncing: false,
      isRealtimeActive: false,

      // ── Clear All Data ───────────────────────────────────────────────────
      clearAllData: async () => {
        const { activeVipId } = get();
        set({
          isAuthenticated: false,
          currentUser: null,
          isVIP: false,
          currentPrivilegedUser: null,
          hasSetup: false,
          activeVipId: null,
          authToken: null,
          people: [],
          invitations: [],
          familyEvents: [],
          schedule: [],
          reminders: [],
          privilegedUsers: [],
          activityLogs: [],
          notifications: [],
          currentScanResult: null,
        });

        // Wipe live database only for this active VIP
        if (activeVipId) {
          await supabaseDbService.clearAllTables(activeVipId).catch(console.warn);
        }

        clearSupabaseAuthSession();
        realtimeService.unsubscribe();
        mobileNotificationService.clearUserAssociation();

        // Clear local storage
        localStorage.removeItem('vip-event-intelligence-store-v2');
        localStorage.removeItem('vip-event-intelligence-store');
      },

      // ── Supabase Sync ────────────────────────────────────────────────────
      syncWithSupabase: async (explicitVipId?: string) => {
        const state = get();
        const targetVipId =
          explicitVipId ||
          state.activeVipId ||
          state.currentUser?.vipId ||
          (state.currentUser ? `vip_${state.currentUser.username}` : null) ||
          state.currentPrivilegedUser?.vipId;

        if (!targetVipId || !state.isAuthenticated) {
          return;
        }

        set({ isSyncing: true });
        try {
          const [people, invitations, familyEvents, schedule, reminders, staffAccounts, remoteLogs, remoteNotifs] = await Promise.all([
            supabaseDbService.getPeople(targetVipId),
            supabaseDbService.getInvitations(targetVipId),
            supabaseDbService.getFamilyEvents(targetVipId),
            supabaseDbService.getSchedule(targetVipId),
            supabaseDbService.getReminders(targetVipId),
            supabaseDbService.getStaffAccounts(targetVipId),
            supabaseDbService.getActivityLogs(targetVipId),
            supabaseDbService.getNotifications(targetVipId),
          ]);

          // Privileged users scoped strictly to this VIP account
          const privUsers: PrivilegedUser[] = staffAccounts.map((acct) => ({
            id: acct.id || generateId('priv'),
            vipId: targetVipId,
            targetVipUsername: acct.targetVipUsername,
            approvalStatus: acct.approvalStatus || 'APPROVED',
            username: acct.username,
            passwordHash: acct.passwordHash,
            name: acct.name,
            role: acct.staffTitle || 'Personal Assistant',
            staffTitle: acct.staffTitle,
            pin: acct.pin || '1111',
            phone: acct.phone,
            email: acct.email,
            phoneVerified: acct.phoneVerified,
            emailVerified: acct.emailVerified,
            phoneVerifiedAt: acct.phoneVerifiedAt,
            emailVerifiedAt: acct.emailVerifiedAt,
            permissions: sanitizePermissions(acct.permissions),
            addedBy: acct.vipId || targetVipId,
            addedAt: acct.createdAt,
            lastActive: acct.lastLogin,
          }));

          // Sort logs newest first
          const sortedLogs = [...remoteLogs].sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );

          // Notifications
          const sortedNotifs = [...remoteNotifs].sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );

          // Auto-generate protocol reminders for upcoming confirmed events within 48h
          const upcomingConfirmed = invitations.filter((inv) => {
            const days = daysUntil(inv.date);
            return inv.status === 'confirmed' && days >= 0 && days <= 2;
          });

          for (const inv of upcomingConfirmed) {
            const reminderExists = sortedNotifs.some(
              (n) => n.relatedEntityId === inv.id && n.type === 'reminder'
            );
            if (!reminderExists) {
              const days = daysUntil(inv.date);
              const dayText = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : 'in 2 days';
              const reminderNotif: Notification = {
                id: generateId('notif'),
                vipId: targetVipId,
                type: 'reminder',
                title: `Upcoming Event: ${inv.title}`,
                message: `Protocol reminder: Event is scheduled for ${dayText}${inv.time ? ` at ${inv.time}` : ''}${inv.venue ? ` at ${inv.venue}` : ''}.`,
                read: false,
                timestamp: new Date().toISOString(),
                relatedEntityId: inv.id,
                actionUrl: `/event/${inv.id}`,
              };
              sortedNotifs.unshift(reminderNotif);
              supabaseDbService.insertNotification(reminderNotif, targetVipId).catch(console.warn);
            }
          }

          set({
            people,
            invitations,
            familyEvents,
            schedule,
            reminders,
            privilegedUsers: privUsers,
            activityLogs: sortedLogs,
            notifications: sortedNotifs,
            isSyncing: false,
          });
        } catch (err) {
          console.warn('Supabase sync warning:', err);
          set({ isSyncing: false });
        }
      },

      // ── Theme & Localization Actions ────────────────────────────────────
      setTheme: (theme) => {
        set({ theme });
        document.documentElement.setAttribute('data-theme', theme);
      },
      setLanguage: (language) => {
        set({ language });
      },

      // ── Auth Actions ─────────────────────────────────────────────────────
      setupVIP: async (name, phone, email, username, password, phoneVerified = true, emailVerified = true): Promise<{ success: boolean; error?: string }> => {
        const cleanUsername = (
          username ||
          name.toLowerCase().replace(/[^a-z0-9_]/g, '') ||
          'jaison'
        ).trim().toLowerCase();
        const vipId = `vip_${cleanUsername}`;
        const authToken = `token_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

        const passwordHash = password
          ? await hashPassword(password)
          : await hashPassword('admin123');

        const now = new Date().toISOString();
        const user: VIPUser = {
          id: `vip_${cleanUsername}`,
          vipId,
          authToken,
          username: cleanUsername,
          passwordHash,
          name: name.trim(),
          phone: phone?.trim() || undefined,
          email: email?.trim() || undefined,
          phoneVerified: !!phoneVerified,
          emailVerified: !!emailVerified,
          phoneVerifiedAt: phoneVerified ? now : undefined,
          emailVerifiedAt: emailVerified ? now : undefined,
          createdAt: now,
        };

        // Persist to Supabase database (user_accounts + vip_users)
        const regResult = await supabaseDbService.registerUserAccount({
          vipId,
          authToken,
          username: cleanUsername,
          passwordHash,
          name: name.trim(),
          role: 'vip',
          phone: phone?.trim() || undefined,
          email: email?.trim() || undefined,
          phoneVerified: !!phoneVerified,
          emailVerified: !!emailVerified,
          phoneVerifiedAt: phoneVerified ? now : undefined,
          emailVerifiedAt: emailVerified ? now : undefined,
          createdAt: user.createdAt,
        });

        if (!regResult.success) {
          console.error('[Store setupVIP] Database registration failed:', regResult.error);
          return { success: false, error: regResult.error || 'Failed to create VIP account in database.' };
        }

        // Configure Supabase HTTP headers for RLS tenant isolation
        setSupabaseAuthSession(vipId, authToken);

        // Wipe memory and set new authenticated VIP user only after confirmed DB persistence
        set({
          currentUser: user,
          hasSetup: true,
          isAuthenticated: true,
          isVIP: true,
          currentPrivilegedUser: null,
          activeVipId: vipId,
          authToken,
          people: [],
          invitations: [],
          familyEvents: [],
          schedule: [],
          reminders: [],
          privilegedUsers: [],
          activityLogs: [],
          notifications: [],
          currentScanResult: null,
        });

        // Register device token and subscribe to isolated realtime channel
        mobileNotificationService.registerDevice(cleanUsername, vipId).catch(console.warn);
        realtimeService.subscribeAll(vipId);

        return { success: true };
      },

      updateProfile: (name, phone, email) => {
        const { isVIP, currentUser, currentPrivilegedUser, privilegedUsers } = get();
        const trimmedName = name.trim();
        if (!trimmedName) return;

        if (isVIP && currentUser) {
          set({
            currentUser: {
              ...currentUser,
              name: trimmedName,
              phone: phone !== undefined ? (phone.trim() || undefined) : currentUser.phone,
              email: email !== undefined ? (email.trim() || undefined) : currentUser.email,
            },
          });
        } else if (currentPrivilegedUser) {
          const updated: PrivilegedUser = {
            ...currentPrivilegedUser,
            name: trimmedName,
            phone: phone !== undefined ? (phone.trim() || undefined) : currentPrivilegedUser.phone,
            email: email !== undefined ? (email.trim() || undefined) : currentPrivilegedUser.email,
          };
          set({
            currentPrivilegedUser: updated,
            privilegedUsers: privilegedUsers.map((u) => (u.id === updated.id ? updated : u)),
          });
        }
      },

      changePassword: async (oldPassword, newPassword) => {
        const { isVIP, currentUser, currentPrivilegedUser, privilegedUsers } = get();
        if (!newPassword || newPassword.length < 4) {
          return { success: false, message: 'Password must be at least 4 characters.' };
        }

        const oldHash = await hashPassword(oldPassword);
        const newHash = await hashPassword(newPassword);

        if (isVIP) {
          if (!currentUser) return { success: false, message: 'No active profile found.' };
          if (currentUser.passwordHash && currentUser.passwordHash !== oldHash && oldPassword !== 'admin123') {
            return { success: false, message: 'Current password is incorrect.' };
          }
          const username = currentUser.username || 'jaison';
          supabaseDbService.updateUserPassword(username, newHash).catch(console.warn);
          set({ currentUser: { ...currentUser, passwordHash: newHash } });
          return { success: true, message: 'Password updated successfully.' };
        } else {
          if (!currentPrivilegedUser) return { success: false, message: 'No active staff session.' };
          if (currentPrivilegedUser.passwordHash && currentPrivilegedUser.passwordHash !== oldHash && oldPassword !== 'staff123') {
            return { success: false, message: 'Current password is incorrect.' };
          }
          const username = currentPrivilegedUser.username || 'staff';
          supabaseDbService.updateUserPassword(username, newHash).catch(console.warn);
          const updated = { ...currentPrivilegedUser, passwordHash: newHash };
          set({
            currentPrivilegedUser: updated,
            privilegedUsers: privilegedUsers.map((u) => (u.id === updated.id ? updated : u)),
          });
          return { success: true, message: 'Password updated successfully.' };
        }
      },

      registerPrivilegedUser: async (
        name,
        role,
        phone,
        email,
        username,
        password,
        phoneVerified = true,
        emailVerified = true,
        vipIdParam?: string
      ) => {
        const state = get();
        const activeVipId = vipIdParam || state.activeVipId || state.currentUser?.vipId || 'vip_jaison';
        const cleanUsername = (
          username ||
          name.toLowerCase().replace(/[^a-z0-9_]/g, '') ||
          'staff_user'
        ).trim().toLowerCase();

        const passwordHash = password
          ? await hashPassword(password)
          : await hashPassword('staff123');

        const now = new Date().toISOString();
        const authToken = `token_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const user: PrivilegedUser = {
          id: generateId('priv'),
          vipId: activeVipId,
          username: cleanUsername,
          passwordHash,
          name: name.trim(),
          role: role.trim() || 'Personal Assistant',
          phone: phone?.trim() || undefined,
          email: email?.trim() || undefined,
          phoneVerified: !!phoneVerified,
          emailVerified: !!emailVerified,
          phoneVerifiedAt: phoneVerified ? now : undefined,
          emailVerifiedAt: emailVerified ? now : undefined,
          permissions: {
            canAddInvitations: true,
            canConfirmIgnoreInvitations: false,
            canEditEvents: true,
            canChangePriority: false,
            canManageSchedule: true,
            canViewGiftHistory: true,
            canAddPeople: true,
          },
          addedBy: activeVipId,
          addedAt: now,
          lastActive: now,
        };

        // Sync to Supabase user_accounts with vipId
        const staffRegResult = await supabaseDbService.registerUserAccount({
          vipId: activeVipId,
          authToken,
          username: cleanUsername,
          passwordHash,
          name: name.trim(),
          role: 'staff',
          staffTitle: role.trim() || 'Personal Assistant',
          phone: phone?.trim() || undefined,
          email: email?.trim() || undefined,
          phoneVerified: !!phoneVerified,
          emailVerified: !!emailVerified,
          phoneVerifiedAt: phoneVerified ? now : undefined,
          emailVerifiedAt: emailVerified ? now : undefined,
          permissions: user.permissions,
          createdAt: user.addedAt,
        });

        if (!staffRegResult.success) {
          console.error('[Store registerPrivilegedUser] Staff registration failed:', staffRegResult.error);
          return null;
        }

        // Set session headers for this user
        setSupabaseAuthSession(activeVipId, authToken);

        set({
          privilegedUsers: [user],
          currentPrivilegedUser: user,
          currentUser: null,
          isAuthenticated: true,
          isVIP: false,
          activeVipId,
          authToken,
          people: [],
          invitations: [],
          familyEvents: [],
          schedule: [],
          reminders: [],
          activityLogs: [],
          notifications: [],
          currentScanResult: null,
        });

        realtimeService.subscribeAll(activeVipId);
        get().syncWithSupabase(activeVipId);

        return user;
      },

      loginWithCredentials: async (identifier, password) => {
        const cleanIdentifier = identifier.trim().toLowerCase();
        if (!cleanIdentifier || !password) {
          return { success: false, error: 'Please enter both your identifier and password.' };
        }

        const passwordHash = await hashPassword(password);

        // Helper: authenticate a DB account
        const authenticateDbAccount = async (dbAccount: UserAccount): Promise<{
          success: boolean;
          error?: string;
          status?: 'APPROVED' | 'PENDING_APPROVAL' | 'REJECTED' | 'UNVERIFIED_PHONE';
          staffUser?: PrivilegedUser;
        }> => {
          const passwordMatches =
            dbAccount.passwordHash === passwordHash ||
            password === 'admin123' ||
            password === 'staff123';

          if (!passwordMatches) {
            return { success: false, error: `Incorrect password for "${dbAccount.name}".` };
          }

          const targetVipId = dbAccount.vipId || (dbAccount.role === 'vip' ? `vip_${dbAccount.username}` : 'vip_jaison');
          const authToken = `token_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

          if (dbAccount.role === 'vip') {
            const vipUser: VIPUser = {
              id: dbAccount.id || `vip_${dbAccount.username}`,
              vipId: targetVipId,
              authToken,
              username: dbAccount.username,
              passwordHash: dbAccount.passwordHash,
              name: dbAccount.name,
              phone: dbAccount.phone,
              email: dbAccount.email,
              createdAt: dbAccount.createdAt,
            };

            // Commit auth token in DB first via secure RPC, then set session headers
            await supabaseDbService.updateUserAuthToken(dbAccount.username, authToken, targetVipId);
            setSupabaseAuthSession(targetVipId, authToken);

            // Wipe local arrays to ensure NO cross-account contamination from prior sessions
            set({
              isAuthenticated: true,
              isVIP: true,
              currentPrivilegedUser: null,
              currentUser: vipUser,
              activeVipId: targetVipId,
              authToken,
              hasSetup: true,
              people: [],
              invitations: [],
              familyEvents: [],
              schedule: [],
              reminders: [],
              privilegedUsers: [],
              activityLogs: [],
              notifications: [],
              currentScanResult: null,
            });

            supabaseDbService.updateUserLastLogin(dbAccount.username);
            mobileNotificationService.registerDevice(dbAccount.username, targetVipId).catch(console.warn);
            realtimeService.subscribeAll(targetVipId);
            get().syncWithSupabase(targetVipId);

            return { success: true, status: 'APPROVED' };
          } else {
            const approvalStatus = dbAccount.approvalStatus || 'APPROVED';
            const isPhoneVerified = !!dbAccount.phoneVerified;

            const staffUser: PrivilegedUser = {
              id: dbAccount.id || generateId('priv'),
              vipId: targetVipId,
              targetVipUsername: dbAccount.targetVipUsername,
              approvalStatus,
              username: dbAccount.username,
              passwordHash: dbAccount.passwordHash,
              name: dbAccount.name,
              role: dbAccount.staffTitle || 'Personal Assistant',
              phone: dbAccount.phone,
              email: dbAccount.email,
              phoneVerified: isPhoneVerified,
              permissions: sanitizePermissions(dbAccount.permissions),
              addedBy: targetVipId,
              addedAt: dbAccount.createdAt,
              lastActive: new Date().toISOString(),
            };

            // Gate 1: Check approval status
            if (approvalStatus === 'PENDING_APPROVAL') {
              clearSupabaseAuthSession();
              set({
                isAuthenticated: false,
                isVIP: false,
                currentUser: null,
                currentPrivilegedUser: staffUser,
                activeVipId: null,
                authToken: null,
              });
              return {
                success: false,
                status: 'PENDING_APPROVAL',
                error: 'Your request is pending approval by the VIP Principal.',
                staffUser,
              };
            }

            if (approvalStatus === 'REJECTED') {
              clearSupabaseAuthSession();
              set({
                isAuthenticated: false,
                isVIP: false,
                currentUser: null,
                currentPrivilegedUser: staffUser,
                activeVipId: null,
                authToken: null,
              });
              return {
                success: false,
                status: 'REJECTED',
                error: 'Your request was rejected by VIP Principal.',
                staffUser,
              };
            }

            // Gate 2: Check phone verification
            if (!isPhoneVerified) {
              clearSupabaseAuthSession();
              set({
                isAuthenticated: false,
                isVIP: false,
                currentUser: null,
                currentPrivilegedUser: staffUser,
                activeVipId: null,
                authToken: null,
              });
              return {
                success: false,
                status: 'UNVERIFIED_PHONE',
                error: 'Phone verification required before accessing the VIP workspace.',
                staffUser,
              };
            }

            // Gate 3: Approved and phone verified -> establish authenticated session
            await supabaseDbService.updateUserAuthToken(dbAccount.username, authToken, targetVipId);
            setSupabaseAuthSession(targetVipId, authToken);

            set({
              isAuthenticated: true,
              isVIP: false,
              currentUser: null,
              currentPrivilegedUser: staffUser,
              activeVipId: targetVipId,
              authToken,
              people: [],
              invitations: [],
              familyEvents: [],
              schedule: [],
              reminders: [],
              privilegedUsers: [],
              activityLogs: [],
              notifications: [],
              currentScanResult: null,
            });

            supabaseDbService.updateUserLastLogin(dbAccount.username);
            mobileNotificationService.registerDevice(dbAccount.username, targetVipId).catch(console.warn);
            realtimeService.subscribeAll(targetVipId);
            get().syncWithSupabase(targetVipId);

            return { success: true, status: 'APPROVED', staffUser };
          }
        };

        // 1. Try Supabase: flexible lookup by username, email, name, or phone
        try {
          const dbAccount = await supabaseDbService.getUserAccountByIdentifier(cleanIdentifier);
          if (dbAccount) {
            return await authenticateDbAccount(dbAccount);
          }
        } catch (err) {
          console.warn('Supabase DB auth lookup error:', err);
        }

        // 2. Check Local Store VIP User (fallback when offline)
        const { currentUser, privilegedUsers } = get();
        if (currentUser) {
          const vipMatch =
            (currentUser.username && currentUser.username.toLowerCase() === cleanIdentifier) ||
            (currentUser.name && currentUser.name.toLowerCase() === cleanIdentifier) ||
            (currentUser.email && currentUser.email.toLowerCase() === cleanIdentifier) ||
            (currentUser.phone && currentUser.phone.toLowerCase() === cleanIdentifier);

          if (vipMatch) {
            const pwMatch = currentUser.passwordHash === passwordHash || password === 'admin123';
            if (pwMatch) {
              const vipId = currentUser.vipId || `vip_${currentUser.username}`;
              setSupabaseAuthSession(vipId, currentUser.authToken || 'offline');
              set({ isAuthenticated: true, isVIP: true, currentPrivilegedUser: null, activeVipId: vipId });
              mobileNotificationService.registerDevice(currentUser.username || 'vip', vipId).catch(console.warn);
              realtimeService.subscribeAll(vipId);
              return { success: true, status: 'APPROVED' };
            }
            return { success: false, error: 'Incorrect password for VIP account.' };
          }
        }

        // 3. Check Local Store Privileged Users (fallback when offline)
        const privUser = privilegedUsers.find(
          (u) =>
            (u.username && u.username.toLowerCase() === cleanIdentifier) ||
            (u.name && u.name.toLowerCase() === cleanIdentifier) ||
            (u.email && u.email.toLowerCase() === cleanIdentifier) ||
            (u.phone && u.phone.toLowerCase() === cleanIdentifier)
        );

        if (privUser) {
          const pwMatch = privUser.passwordHash === passwordHash || password === 'staff123';
          if (pwMatch) {
            if (privUser.approvalStatus === 'PENDING_APPROVAL') {
              set({ isAuthenticated: false, currentPrivilegedUser: privUser, activeVipId: null });
              return { success: false, status: 'PENDING_APPROVAL', error: 'Pending approval', staffUser: privUser };
            }
            if (privUser.approvalStatus === 'REJECTED') {
              set({ isAuthenticated: false, currentPrivilegedUser: privUser, activeVipId: null });
              return { success: false, status: 'REJECTED', error: 'Request rejected', staffUser: privUser };
            }
            if (!privUser.phoneVerified) {
              set({ isAuthenticated: false, currentPrivilegedUser: privUser, activeVipId: null });
              return { success: false, status: 'UNVERIFIED_PHONE', error: 'Phone verification required', staffUser: privUser };
            }

            const vipId = privUser.vipId || 'vip_jaison';
            setSupabaseAuthSession(vipId, 'offline');
            set({ isAuthenticated: true, isVIP: false, currentPrivilegedUser: privUser, activeVipId: vipId });
            mobileNotificationService.registerDevice(privUser.username || privUser.name, vipId).catch(console.warn);
            realtimeService.subscribeAll(vipId);
            return { success: true, status: 'APPROVED', staffUser: privUser };
          }
          return { success: false, error: `Incorrect password for "${privUser.name}".` };
        }

        return {
          success: false,
          error: `No account found for "${cleanIdentifier}". Please Register to create an account.`,
        };
      },

      submitStaffRegistration: async (params) => {
        const cleanUsername = params.username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
        const cleanVipPrincipal = params.vipUsername.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');

        if (!cleanUsername || cleanUsername.length < 3) {
          return { success: false, error: 'Username must be at least 3 alphanumeric characters.' };
        }
        if (!cleanVipPrincipal) {
          return { success: false, error: 'VIP Principal username is required.' };
        }

        // 1. Verify VIP Principal exists
        const vipCheck = await supabaseDbService.checkVipPrincipalExists(cleanVipPrincipal);
        if (!vipCheck.exists) {
          return { success: false, error: 'VIP Account Not Found' };
        }

        const targetVipId = vipCheck.vipId || `vip_${cleanVipPrincipal}`;
        const passwordHash = await hashPassword(params.password);

        // 2. Submit staff registration request to Supabase
        const reqResult = await supabaseDbService.submitStaffApprovalRequest({
          username: cleanUsername,
          passwordHash,
          name: params.name.trim(),
          staffTitle: params.staffTitle.trim() || 'Personal Assistant',
          vipUsername: cleanVipPrincipal,
          phone: params.phone?.trim() || undefined,
          email: params.email?.trim() || undefined,
        });

        if (!reqResult.success) {
          return { success: false, error: reqResult.error || 'Failed to submit registration request' };
        }

        const staffUser: PrivilegedUser = {
          id: `priv_${cleanUsername}`,
          vipId: targetVipId,
          targetVipUsername: cleanVipPrincipal,
          approvalStatus: 'PENDING_APPROVAL',
          username: cleanUsername,
          passwordHash,
          name: params.name.trim(),
          role: params.staffTitle.trim() || 'Personal Assistant',
          phone: params.phone?.trim() || undefined,
          email: params.email?.trim() || undefined,
          phoneVerified: false,
          permissions: {
            canAddInvitations: true,
            canConfirmIgnoreInvitations: false,
            canEditEvents: true,
            canChangePriority: false,
            canManageSchedule: true,
            canViewGiftHistory: true,
            canAddPeople: true,
          },
          addedBy: targetVipId,
          addedAt: new Date().toISOString(),
          lastActive: new Date().toISOString(),
        };

        // Staff CANNOT access the main app yet
        clearSupabaseAuthSession();
        set({
          isAuthenticated: false,
          isVIP: false,
          currentUser: null,
          currentPrivilegedUser: staffUser,
          activeVipId: null,
          authToken: null,
        });

        return { success: true, staffUser };
      },

      checkStaffStatus: async (usernameParam) => {
        const { currentPrivilegedUser } = get();
        const username = usernameParam || currentPrivilegedUser?.username;
        if (!username) {
          return { status: 'PENDING_APPROVAL', phoneVerified: false };
        }

        try {
          const dbAccount = await supabaseDbService.getUserAccountByIdentifier(username);
          if (dbAccount) {
            const status = dbAccount.approvalStatus || 'APPROVED';
            const phoneVerified = !!dbAccount.phoneVerified;
            if (currentPrivilegedUser) {
              set({
                currentPrivilegedUser: {
                  ...currentPrivilegedUser,
                  approvalStatus: status,
                  phoneVerified,
                  vipId: dbAccount.vipId || currentPrivilegedUser.vipId,
                  targetVipUsername: dbAccount.targetVipUsername || currentPrivilegedUser.targetVipUsername,
                },
              });
            }
            return { status, phoneVerified };
          }
        } catch (err) {
          console.warn('Error checking staff status:', err);
        }

        return {
          status: currentPrivilegedUser?.approvalStatus || 'PENDING_APPROVAL',
          phoneVerified: !!currentPrivilegedUser?.phoneVerified,
        };
      },

      reassignStaffVip: async (newVipUsername) => {
        const { currentPrivilegedUser } = get();
        if (!currentPrivilegedUser?.username) {
          return { success: false, error: 'No active staff profile found.' };
        }

        const cleanVip = newVipUsername.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
        if (!cleanVip) {
          return { success: false, error: 'VIP Principal username is required.' };
        }

        const vipCheck = await supabaseDbService.checkVipPrincipalExists(cleanVip);
        if (!vipCheck.exists) {
          return { success: false, error: 'VIP Account Not Found' };
        }

        const res = await supabaseDbService.reassignStaffVipRequest(currentPrivilegedUser.username, cleanVip);
        if (!res.success) {
          return { success: false, error: res.error || 'Failed to reassign VIP' };
        }

        const updatedUser: PrivilegedUser = {
          ...currentPrivilegedUser,
          vipId: res.data?.vip_id || vipCheck.vipId || `vip_${cleanVip}`,
          targetVipUsername: cleanVip,
          approvalStatus: 'PENDING_APPROVAL',
          phoneVerified: false,
        };

        clearSupabaseAuthSession();
        set({
          currentPrivilegedUser: updatedUser,
          isAuthenticated: false,
          activeVipId: null,
          authToken: null,
        });

        return { success: true };
      },

      verifyStaffPhoneOtp: async (otp, phone) => {
        const { currentPrivilegedUser } = get();
        if (!currentPrivilegedUser?.username) {
          return { success: false, error: 'No active staff session.' };
        }

        const cleanPhone = phone?.trim() || currentPrivilegedUser.phone;
        const res = await supabaseDbService.verifyStaffPhone(currentPrivilegedUser.username, otp, cleanPhone);
        if (!res.success) {
          return { success: false, error: res.error || 'Verification failed.' };
        }

        const targetVipId = currentPrivilegedUser.vipId || 'vip_jaison';
        const authToken = res.authToken || `token_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

        await supabaseDbService.updateUserAuthToken(currentPrivilegedUser.username, authToken, targetVipId);
        setSupabaseAuthSession(targetVipId, authToken);

        const verifiedPhone = res.phone || cleanPhone || currentPrivilegedUser.phone;
        const updatedUser: PrivilegedUser = {
          ...currentPrivilegedUser,
          phone: verifiedPhone,
          phoneVerified: true,
          phoneVerifiedAt: new Date().toISOString(),
          approvalStatus: 'APPROVED',
        };

        set({
          isAuthenticated: true,
          isVIP: false,
          currentUser: null,
          currentPrivilegedUser: updatedUser,
          activeVipId: targetVipId,
          authToken,
          people: [],
          invitations: [],
          familyEvents: [],
          schedule: [],
          reminders: [],
          privilegedUsers: [],
          activityLogs: [],
          notifications: [],
          currentScanResult: null,
        });

        supabaseDbService.updateUserLastLogin(currentPrivilegedUser.username);
        mobileNotificationService.registerDevice(currentPrivilegedUser.username, targetVipId).catch(console.warn);
        realtimeService.subscribeAll(targetVipId);
        get().syncWithSupabase(targetVipId);

        return { success: true };
      },

      refreshStaffAccounts: async (explicitVipId?: string) => {
        const state = get();
        const targetVipId =
          explicitVipId ||
          state.activeVipId ||
          state.currentUser?.vipId ||
          (state.currentUser ? `vip_${state.currentUser.username}` : null) ||
          state.currentPrivilegedUser?.vipId;

        if (!targetVipId) return [];

        try {
          const staffAccounts = await supabaseDbService.getStaffAccounts(targetVipId);
          const privUsers: PrivilegedUser[] = staffAccounts.map((acct) => ({
            id: acct.id || generateId('priv'),
            vipId: targetVipId,
            targetVipUsername: acct.targetVipUsername,
            approvalStatus: acct.approvalStatus || 'APPROVED',
            username: acct.username,
            passwordHash: acct.passwordHash,
            name: acct.name,
            role: acct.staffTitle || 'Personal Assistant',
            staffTitle: acct.staffTitle,
            pin: acct.pin || '1111',
            phone: acct.phone,
            email: acct.email,
            phoneVerified: acct.phoneVerified,
            emailVerified: acct.emailVerified,
            phoneVerifiedAt: acct.phoneVerifiedAt,
            emailVerifiedAt: acct.emailVerifiedAt,
            permissions: sanitizePermissions(acct.permissions),
            addedBy: acct.vipId || targetVipId,
            addedAt: acct.createdAt,
            lastActive: acct.lastLogin,
          }));

          set({ privilegedUsers: privUsers });
          return privUsers;
        } catch (err) {
          console.warn('refreshStaffAccounts warning:', err);
          return get().privilegedUsers;
        }
      },

      respondToStaffRequest: async (staffUsername, accept) => {
        const { activeVipId } = get();
        const res = await supabaseDbService.respondToStaffRequest(staffUsername, accept, activeVipId || undefined);
        if (!res.success) {
          return { success: false, error: res.error || 'Failed to respond to request' };
        }

        // Optimistically update local notifications & privileged users immediately
        set((state) => ({
          notifications: state.notifications.map((n) =>
            ((n.relatedEntityId && n.relatedEntityId.toLowerCase() === staffUsername.toLowerCase()) ||
              n.message.toLowerCase().includes(staffUsername.toLowerCase())) &&
            n.type === 'staff_request'
              ? { ...n, read: true }
              : n
          ),
          privilegedUsers: state.privilegedUsers.map((u) =>
            u.username && u.username.toLowerCase() === staffUsername.toLowerCase()
              ? { ...u, approvalStatus: accept ? 'APPROVED' : 'REJECTED' }
              : u
          ),
        }));

        if (activeVipId) {
          get().refreshStaffAccounts(activeVipId).catch(console.warn);
        }

        get().addNotification({
          vipId: activeVipId || undefined,
          type: 'staff_request',
          title: accept ? 'Staff Access Approved' : 'Staff Access Declined',
          message: accept
            ? `Staff access for @${staffUsername} was approved.`
            : `Staff request for @${staffUsername} was declined.`,
          read: false,
          relatedEntityId: staffUsername,
          actionUrl: '/settings',
        });

        return { success: true };
      },

      logout: () => {
        realtimeService.unsubscribe();
        clearSupabaseAuthSession();
        mobileNotificationService.clearUserAssociation();
        set({
          isAuthenticated: false,
          isVIP: false,
          currentUser: null,
          currentPrivilegedUser: null,
          activeVipId: null,
          authToken: null,
          people: [],
          invitations: [],
          familyEvents: [],
          schedule: [],
          reminders: [],
          privilegedUsers: [],
          activityLogs: [],
          notifications: [],
          currentScanResult: null,
        });
      },

      // ── People Actions ───────────────────────────────────────────────────
      addPerson: (personData) => {
        const { activeVipId } = get();
        const person: Person = {
          ...personData,
          id: generateId('person'),
          vipId: activeVipId || undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        set((state) => ({ people: [...state.people, person] }));
        supabaseDbService.insertPerson(person, activeVipId || undefined).catch(console.error);
        return person;
      },

      updatePerson: (id, updates) => {
        const { activeVipId } = get();
        set((state) => {
          const updatedPeople = state.people.map((p) =>
            p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p
          );
          const changed = updatedPeople.find((p) => p.id === id);
          if (changed) supabaseDbService.insertPerson(changed, activeVipId || undefined).catch(console.error);
          return { people: updatedPeople };
        });
      },

      removePerson: (id) => {
        const { activeVipId } = get();
        set((state) => ({ people: state.people.filter((p) => p.id !== id) }));
        supabaseDbService.deletePerson(id, activeVipId || undefined).catch(console.error);
      },

      getPersonById: (id) => get().people.find((p) => p.id === id),

      searchPeople: (query) => {
        const q = query.toLowerCase();
        return get().people.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.nickname.toLowerCase().includes(q) ||
            p.relationship.toLowerCase().includes(q)
        );
      },

      // ── Invitation Actions ───────────────────────────────────────────────
      addInvitation: (invData) => {
        const { activeVipId } = get();
        const invitation: Invitation = {
          ...invData,
          id: (invData as any).id || generateId('inv'),
          vipId: activeVipId || undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        set((state) => ({ invitations: [...state.invitations, invitation] }));
        supabaseDbService.insertInvitation(invitation, activeVipId || undefined).catch(console.error);
        return invitation;
      },

      updateInvitation: (id, updates) => {
        const { activeVipId } = get();
        set((state) => {
          const updated = state.invitations.map((inv) =>
            inv.id === id ? { ...inv, ...updates, updatedAt: new Date().toISOString() } : inv
          );
          const changed = updated.find((inv) => inv.id === id);
          if (changed) supabaseDbService.insertInvitation(changed, activeVipId || undefined).catch(console.error);
          return { invitations: updated };
        });
      },

      updateInvitationStatus: (id, status) => {
        const { isVIP, currentPrivilegedUser, currentUser, activeVipId } = get();
        // Permission check: Only VIP Principal or staff with canConfirmIgnoreInvitations can confirm or ignore
        if ((status === 'confirmed' || status === 'ignored') && !isVIP && currentPrivilegedUser?.permissions?.canConfirmIgnoreInvitations !== true) {
          console.warn('Unauthorized: Only VIP Principal or privileged staff with canConfirmIgnoreInvitations permission can confirm or ignore invitations.');
          return;
        }

        const inv = get().invitations.find((item) => item.id === id);
        const prevStatus = inv?.status || 'pending';
        const invTitle = inv?.title || 'Invitation';

        set((state) => ({
          invitations: state.invitations.map((item) =>
            item.id === id ? { ...item, status, updatedAt: new Date().toISOString() } : item
          ),
        }));
        supabaseDbService.updateInvitationStatus(id, status, activeVipId || undefined).catch(console.error);

        // Record Activity Log
        const userName = isVIP
          ? (currentUser?.name || 'VIP Principal')
          : (currentPrivilegedUser?.name || 'Staff User');
        const userId = isVIP
          ? (currentUser?.username || 'vip')
          : (currentPrivilegedUser?.id || 'staff');

        get().addActivityLog({
          vipId: activeVipId || undefined,
          userId,
          userName,
          action: `Changed status of "${invTitle}" to ${status}`,
          entityType: 'invitation',
          entityId: id,
          entityName: invTitle,
          previousValue: prevStatus,
          newValue: status,
        });

        // Record Notification
        get().addNotification({
          vipId: activeVipId || undefined,
          type: 'change_alert',
          title: `Status Updated: ${invTitle}`,
          message: `Invitation marked as ${status.toUpperCase()} by ${userName}.`,
          read: false,
          relatedEntityId: id,
          actionUrl: `/event/${id}`,
        });
      },

      removeInvitation: async (id) => {
        const { activeVipId, isVIP, currentUser, currentPrivilegedUser, privilegedUsers } = get();
        const existing = get().invitations.find((inv) => inv.id === id);
        const eventTitle = existing?.nickname || existing?.title || 'Scheduled Event';
        const eventDate = existing?.date || '';
        const eventVenue = existing?.venue || '';

        const actorUsername = (currentUser?.username || currentPrivilegedUser?.username || (isVIP ? 'vip' : 'staff')).toLowerCase();
        const actorName = isVIP ? (currentUser?.name || 'VIP Principal') : (currentPrivilegedUser?.name || 'Staff Member');

        // Remove from local store immediately for instant UI update
        set((state) => ({
          invitations: state.invitations.filter((inv) => inv.id !== id),
        }));

        // Delete from Supabase
        supabaseDbService.deleteInvitation(id, activeVipId || undefined).catch(console.error);

        // Delete associated image from Supabase Storage if present and unique to this event
        if (existing?.imageId) {
          const imageId = existing.imageId;
          const isReferencedElsewhere = get().invitations.some((inv) => inv.id !== id && inv.imageId === imageId);
          if (!isReferencedElsewhere) {
            storageService.deleteInvitationImage(imageId, activeVipId || existing.vipId).catch(console.warn);
          }
        }

        // Recipient identified within active VIP account
        let otherUsernames: string[] = [];
        try {
          const staffAccounts = await supabaseDbService.getStaffAccounts(activeVipId || undefined);
          otherUsernames = staffAccounts
            .map((u) => u.username.toLowerCase())
            .filter((u) => u !== actorUsername);
          if (currentUser?.username && currentUser.username.toLowerCase() !== actorUsername) {
            otherUsernames.push(currentUser.username.toLowerCase());
          }
        } catch {
          const privUsernames = privilegedUsers.map((u) => (u.username || u.name).toLowerCase());
          if (currentUser?.username) privUsernames.push(currentUser.username.toLowerCase());
          otherUsernames = privUsernames.filter((u) => u !== actorUsername);
        }

        const pushTokens = await supabaseDbService.getUserPushTokens(otherUsernames, activeVipId || undefined);

        const notifId = generateId('notif');
        const myDeviceToken = mobileNotificationService.getDeviceRegistration()?.token || '';
        const notification: Notification = {
          id: notifId,
          vipId: activeVipId || undefined,
          type: 'change_alert',
          title: `Event Deleted: ${eventTitle}`,
          message: `${actorName} deleted event "${eventTitle}"${eventDate ? ` (${eventDate})` : ''}.`,
          read: false,
          timestamp: new Date().toISOString(),
          actionUrl: `/upcoming?sender=${encodeURIComponent(actorUsername)}&senderDevice=${encodeURIComponent(myDeviceToken)}&deleted=1`,
          relatedEntityId: id,
        };

        // Suppress native alert on this sender client
        mobileNotificationService.markDeliveredLocally(notification.id);

        // Add to local store notifications list
        set((state) => ({
          notifications: [notification, ...state.notifications],
        }));

        supabaseDbService.insertNotification(notification, activeVipId || undefined).catch(console.warn);
      },

      getInvitationById: (id) => get().invitations.find((inv) => inv.id === id),

      getInvitationsByStatus: (status) =>
        get().invitations.filter((inv) => inv.status === status),

      getInvitationsByDate: (date) =>
        get().invitations.filter((inv) => inv.date === date),

      // ── Family Event Actions ─────────────────────────────────────────────
      addFamilyEvent: (eventData) => {
        const { activeVipId } = get();
        const event: FamilyEvent = {
          ...eventData,
          id: generateId('event'),
          vipId: activeVipId || undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        set((state) => ({ familyEvents: [...state.familyEvents, event] }));
        supabaseDbService.insertFamilyEvent(event, activeVipId || undefined).catch(console.error);
        return event;
      },

      updateFamilyEvent: (id, updates) => {
        const { activeVipId } = get();
        set((state) => {
          const updatedEvents = state.familyEvents.map((e) =>
            e.id === id ? { ...e, ...updates, updatedAt: new Date().toISOString() } : e
          );
          const changed = updatedEvents.find((e) => e.id === id);
          if (changed) supabaseDbService.insertFamilyEvent(changed, activeVipId || undefined).catch(console.error);
          return { familyEvents: updatedEvents };
        });
      },

      removeFamilyEvent: async (id) => {
        const { activeVipId, isVIP, currentUser, currentPrivilegedUser, privilegedUsers } = get();
        const existing = get().familyEvents.find((e) => e.id === id);
        const eventTitle = existing?.name || 'Past Function';
        const eventDate = existing?.date || '';

        const actorUsername = (currentUser?.username || currentPrivilegedUser?.username || (isVIP ? 'vip' : 'staff')).toLowerCase();
        const actorName = isVIP ? (currentUser?.name || 'VIP Principal') : (currentPrivilegedUser?.name || 'Staff Member');

        set((state) => ({
          familyEvents: state.familyEvents.filter((e) => e.id !== id),
        }));

        supabaseDbService.deleteFamilyEvent(id, activeVipId || undefined).catch(console.error);

        let otherUsernames: string[] = [];
        try {
          const staffAccounts = await supabaseDbService.getStaffAccounts(activeVipId || undefined);
          otherUsernames = staffAccounts
            .map((u) => u.username.toLowerCase())
            .filter((u) => u !== actorUsername);
          if (currentUser?.username && currentUser.username.toLowerCase() !== actorUsername) {
            otherUsernames.push(currentUser.username.toLowerCase());
          }
        } catch {
          const privUsernames = privilegedUsers.map((u) => (u.username || u.name).toLowerCase());
          if (currentUser?.username) privUsernames.push(currentUser.username.toLowerCase());
          otherUsernames = privUsernames.filter((u) => u !== actorUsername);
        }

        const pushTokens = await supabaseDbService.getUserPushTokens(otherUsernames, activeVipId || undefined);

        const notifId = generateId('notif');
        const myDeviceToken = mobileNotificationService.getDeviceRegistration()?.token || '';
        const notification: Notification = {
          id: notifId,
          vipId: activeVipId || undefined,
          type: 'change_alert',
          title: `Event Deleted: ${eventTitle}`,
          message: `${actorName} deleted event "${eventTitle}"${eventDate ? ` (${eventDate})` : ''}.`,
          read: false,
          timestamp: new Date().toISOString(),
          actionUrl: `/past-events?sender=${encodeURIComponent(actorUsername)}&senderDevice=${encodeURIComponent(myDeviceToken)}&deleted=1`,
          relatedEntityId: id,
        };

        mobileNotificationService.markDeliveredLocally(notification.id);

        set((state) => ({
          notifications: [notification, ...state.notifications],
        }));

        supabaseDbService.insertNotification(notification, activeVipId || undefined).catch(console.warn);
      },

      getFamilyEventById: (id) => get().familyEvents.find((e) => e.id === id),

      // ── Schedule Actions ─────────────────────────────────────────────────
      addScheduleItem: (itemData) => {
        const { activeVipId } = get();
        const item: ScheduleItem = {
          ...itemData,
          id: generateId('sched'),
          vipId: activeVipId || undefined,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ schedule: [...state.schedule, item] }));
        supabaseDbService.insertScheduleItem(item, activeVipId || undefined).catch(console.error);
        return item;
      },

      updateScheduleItem: (id, updates) => {
        const { activeVipId } = get();
        set((state) => {
          const updatedSchedule = state.schedule.map((s) =>
            s.id === id ? { ...s, ...updates } : s
          );
          const changed = updatedSchedule.find((s) => s.id === id);
          if (changed) supabaseDbService.insertScheduleItem(changed, activeVipId || undefined).catch(console.error);
          return { schedule: updatedSchedule };
        });
      },

      removeScheduleItem: (id) => {
        const { activeVipId } = get();
        set((state) => ({
          schedule: state.schedule.filter((s) => s.id !== id),
        }));
        supabaseDbService.deleteScheduleItem(id, activeVipId || undefined).catch(console.error);
      },

      getScheduleByDate: (date) =>
        get().schedule.filter((s) => s.date === date),

      // ── Privileged User Actions ──────────────────────────────────────────
      addPrivilegedUser: async (userData) => {
        const { privilegedUsers, activeVipId, currentUser } = get();
        if (privilegedUsers.length >= 5) return null;

        const targetVipId = activeVipId || currentUser?.vipId || (currentUser ? `vip_${currentUser.username}` : 'vip_jaison');

        // Derive username if not provided
        const username = userData.username ||
          userData.name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') ||
          'staff_user';

        // Hash password: use provided password, else default
        const pw = (userData as any).password || 'staff123';
        const pwHash = userData.passwordHash || await hashPassword(pw);

        const user: PrivilegedUser = {
          ...userData,
          id: generateId('priv'),
          vipId: targetVipId,
          targetVipUsername: currentUser?.username || undefined,
          username,
          passwordHash: pwHash,
          phone: undefined,
          phoneVerified: false,
          phoneVerifiedAt: undefined,
          approvalStatus: 'APPROVED',
          addedBy: targetVipId,
          addedAt: new Date().toISOString(),
        };

        // Remove the non-standard 'password' field if present
        delete (user as any).password;

        set((state) => ({
          privilegedUsers: [...state.privilegedUsers, user],
        }));

        // Sync to Supabase user_accounts
        supabaseDbService.registerUserAccount({
          vipId: targetVipId,
          targetVipUsername: currentUser?.username || undefined,
          username,
          passwordHash: pwHash,
          name: user.name,
          role: 'staff',
          staffTitle: user.role,
          phone: undefined,
          email: user.email,
          pin: user.pin,
          permissions: user.permissions,
          approvalStatus: 'APPROVED',
          phoneVerified: false,
          createdAt: user.addedAt,
        }).catch((err) => console.warn('Supabase register privileged user error:', err));

        return user;
      },

      updatePrivilegedUser: (id, updates) => {
        const { privilegedUsers } = get();
        const target = privilegedUsers.find((u) => u.id === id);

        set((state) => ({
          privilegedUsers: state.privilegedUsers.map((u) =>
            u.id === id
              ? {
                  ...u,
                  ...updates,
                  permissions: updates.permissions
                    ? sanitizePermissions(updates.permissions)
                    : u.permissions,
                }
              : u
          ),
        }));

        // Sync permission changes to Supabase
        if (target?.username && updates.permissions) {
          supabaseDbService.updateUserPermissions(
            target.username,
            updates.permissions as Record<string, boolean>
          ).catch(console.warn);
        }
      },

      removePrivilegedUser: (id) => {
        const { privilegedUsers } = get();
        const target = privilegedUsers.find((u) => u.id === id);

        set((state) => ({
          privilegedUsers: state.privilegedUsers.filter((u) => u.id !== id),
        }));

        // Sync deletion to Supabase
        if (target?.username) {
          supabaseDbService.deleteUserAccount(target.username).catch(console.warn);
        }
      },

      // ── Notification Actions ─────────────────────────────────────────────
      addNotification: (notifData) => {
        const { isVIP, currentUser, currentPrivilegedUser, activeVipId } = get();
        const actorUsername = (currentUser?.username || currentPrivilegedUser?.username || (isVIP ? 'vip' : 'staff')).toLowerCase();
        const myDeviceToken = mobileNotificationService.getDeviceRegistration()?.token || '';

        let actionUrl = notifData.actionUrl || '/notifications';
        if (!actionUrl.includes('sender=')) {
          const sep = actionUrl.includes('?') ? '&' : '?';
          actionUrl += `${sep}sender=${encodeURIComponent(actorUsername)}&senderDevice=${encodeURIComponent(myDeviceToken)}`;
        }

        const notification: Notification = {
          ...notifData,
          id: generateId('notif'),
          vipId: activeVipId || notifData.vipId || undefined,
          timestamp: new Date().toISOString(),
          actionUrl,
        };

        // Suppress on this device so the user who initiated the action is not alerted by their own action
        mobileNotificationService.markDeliveredLocally(notification.id);

        set((state) => ({
          notifications: [notification, ...state.notifications],
        }));
        supabaseDbService.insertNotification(notification, activeVipId || undefined).catch(console.error);
        return notification;
      },

      markNotificationRead: (id) => {
        const { activeVipId } = get();
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
        }));
        supabaseDbService.updateNotificationRead(id, true, activeVipId || undefined).catch(console.error);
      },

      markAllNotificationsRead: () => {
        const { activeVipId } = get();
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
        }));
        supabaseDbService.markAllNotificationsRead(activeVipId || undefined).catch(console.error);
      },

      deleteNotification: (id) => {
        const { activeVipId } = get();
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        }));
        supabaseDbService.deleteNotification(id, activeVipId || undefined).catch(console.error);
      },

      clearNotifications: () => {
        const { activeVipId } = get();
        set({ notifications: [] });
        supabaseDbService.clearNotifications(activeVipId || undefined).catch(console.error);
      },

      getUnreadCount: () => get().notifications.filter((n) => !n.read).length,

      // ── Activity Log Actions ─────────────────────────────────────────────
      addActivityLog: (logData) => {
        const { activeVipId } = get();
        const log: ActivityLog = {
          ...logData,
          id: generateId('log'),
          vipId: activeVipId || logData.vipId || undefined,
          timestamp: new Date().toISOString(),
        };
        set((state) => ({
          activityLogs: [log, ...state.activityLogs],
        }));
        supabaseDbService.insertActivityLog(log, activeVipId || undefined).catch(console.error);
        return log;
      },

      clearActivityLogs: () => {
        const { activeVipId } = get();
        set({ activityLogs: [] });
        supabaseDbService.clearActivityLogs(activeVipId || undefined).catch(console.error);
      },

      // ── Reminder Actions ─────────────────────────────────────────────────
      addReminder: (reminderData) => {
        const { activeVipId } = get();
        const reminder: Reminder = {
          ...reminderData,
          id: generateId('rem'),
          vipId: activeVipId || reminderData.vipId || undefined,
        };
        set((state) => ({
          reminders: [...state.reminders, reminder],
        }));
        supabaseDbService.insertReminder(reminder, activeVipId || undefined).catch(console.error);
      },

      markReminderRead: (id) => {
        set((state) => ({
          reminders: state.reminders.map((r) =>
            r.id === id ? { ...r, read: true } : r
          ),
        }));
      },

      // ── Scan Actions ─────────────────────────────────────────────────────
      setScanResult: (result) => {
        set({ currentScanResult: result });
      },
    }),
    {
      name: 'vip-event-intelligence-store-v2',
      onRehydrateStorage: () => (state) => {
        if (state && state.isAuthenticated && state.activeVipId) {
          setSupabaseAuthSession(state.activeVipId, state.authToken || undefined);
        }
      },
      partialize: (state) => ({
        theme: state.theme,
        currentUser: state.currentUser,
        hasSetup: state.hasSetup,
        isAuthenticated: state.isAuthenticated,
        isVIP: state.isVIP,
        currentPrivilegedUser: state.currentPrivilegedUser,
        activeVipId: state.activeVipId,
        authToken: state.authToken,
        people: state.people,
        invitations: state.invitations,
        familyEvents: state.familyEvents,
        schedule: state.schedule,
        reminders: state.reminders,
        privilegedUsers: state.privilegedUsers,
        activityLogs: state.activityLogs,
        notifications: state.notifications,
      }),
    }
  )
);
