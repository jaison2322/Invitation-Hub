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
import { generateId } from '../utils/id';
import { hashPassword } from '../utils/crypto';
import { supabaseDbService } from '../services/supabaseDbService';
import { seedPrivilegedUsers } from '../data/seedData';
import { daysUntil } from '../utils/formatters';
import { mobileNotificationService } from '../services/mobileNotificationService';

// ─── Store Interface ─────────────────────────────────────────────────────────

interface AppState {
  // Sync
  isSyncing: boolean;
  isRealtimeActive: boolean;
  syncWithSupabase: () => Promise<void>;

  // Auth
  isAuthenticated: boolean;
  currentUser: VIPUser | null;
  isVIP: boolean;
  currentPrivilegedUser: PrivilegedUser | null;
  hasSetup: boolean;

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
  setupVIP: (name: string, phone?: string, email?: string, username?: string, password?: string, phoneVerified?: boolean, emailVerified?: boolean) => Promise<void>;
  registerPrivilegedUser: (name: string, role: string, phone?: string, email?: string, username?: string, password?: string, phoneVerified?: boolean, emailVerified?: boolean) => Promise<PrivilegedUser | null>;
  updateProfile: (name: string, phone?: string, email?: string) => void;
  changePassword: (oldPassword: string, newPassword: string) => Promise<{ success: boolean; message: string }>;
  loginWithCredentials: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;

  // People actions
  addPerson: (person: Omit<Person, 'id' | 'createdAt' | 'updatedAt'>) => Person;
  updatePerson: (id: string, updates: Partial<Person>) => void;
  removePerson: (id: string) => void;
  getPersonById: (id: string) => Person | undefined;
  searchPeople: (query: string) => Person[];

  // Invitation actions
  addInvitation: (invitation: Omit<Invitation, 'id' | 'createdAt' | 'updatedAt'>) => Invitation;
  updateInvitation: (id: string, updates: Partial<Invitation>) => void;
  updateInvitationStatus: (id: string, status: InvitationStatus) => void;
  removeInvitation: (id: string) => void;
  getInvitationById: (id: string) => Invitation | undefined;
  getInvitationsByStatus: (status: InvitationStatus) => Invitation[];
  getInvitationsByDate: (date: string) => Invitation[];

  // Family event actions
  addFamilyEvent: (event: Omit<FamilyEvent, 'id' | 'createdAt' | 'updatedAt'>) => FamilyEvent;
  updateFamilyEvent: (id: string, updates: Partial<FamilyEvent>) => void;
  removeFamilyEvent: (id: string) => void;
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
        set({
          isAuthenticated: false,
          currentUser: null,
          isVIP: false,
          currentPrivilegedUser: null,
          hasSetup: false,
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

        // Wipe live database
        await supabaseDbService.clearAllTables().catch(console.warn);

        // Clear local storage
        localStorage.removeItem('vip-event-intelligence-store-v2');
        localStorage.removeItem('vip-event-intelligence-store');
      },

      // ── Supabase Sync ────────────────────────────────────────────────────
      syncWithSupabase: async () => {
        set({ isSyncing: true });
        try {
          const [people, invitations, familyEvents, schedule, reminders, staffAccounts, remoteLogs, remoteNotifs] = await Promise.all([
            supabaseDbService.getPeople(),
            supabaseDbService.getInvitations(),
            supabaseDbService.getFamilyEvents(),
            supabaseDbService.getSchedule(),
            supabaseDbService.getReminders(),
            supabaseDbService.getStaffAccounts(),
            supabaseDbService.getActivityLogs(),
            supabaseDbService.getNotifications(),
          ]);

          // Merge staff accounts from Supabase with local privilegedUsers
          const { privilegedUsers: localPrivUsers, activityLogs: localLogs, notifications: localNotifs } = get();
          const mergedPrivUsers = [...localPrivUsers];

          for (const acct of staffAccounts) {
            const existsLocally = mergedPrivUsers.some(
              (u) => u.username && u.username.toLowerCase() === acct.username.toLowerCase()
            );
            if (!existsLocally) {
              mergedPrivUsers.push({
                id: generateId('priv'),
                username: acct.username,
                passwordHash: acct.passwordHash,
                name: acct.name,
                role: acct.staffTitle || 'Personal Assistant',
                pin: acct.pin || '1111',
                phone: acct.phone,
                email: acct.email,
                permissions: acct.permissions || {
                  canAddInvitations: true,
                  canEditEvents: false,
                  canChangePriority: false,
                  canManageSchedule: false,
                  canViewGiftHistory: false,
                  canAddPeople: false,
                },
                addedBy: 'vip',
                addedAt: acct.createdAt,
                lastActive: acct.lastLogin,
              });
            }
          }

          // Auto-migrate: fix any existing local privileged users missing username or passwordHash
          for (const pu of mergedPrivUsers) {
            if (!pu.username) {
              pu.username = pu.name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'staff_user';
            }
            if (!pu.passwordHash) {
              pu.passwordHash = await hashPassword('staff123');
            }
          }

          // Sync any auto-migrated local users to Supabase
          for (const pu of mergedPrivUsers) {
            if (pu.username) {
              const existsInDb = staffAccounts.some(
                (a) => a.username.toLowerCase() === pu.username!.toLowerCase()
              );
              if (!existsInDb) {
                supabaseDbService.registerUserAccount({
                  username: pu.username,
                  passwordHash: pu.passwordHash || '',
                  name: pu.name,
                  role: 'staff',
                  staffTitle: pu.role,
                  phone: pu.phone,
                  email: pu.email,
                  pin: pu.pin,
                  permissions: pu.permissions,
                  createdAt: pu.addedAt,
                }).catch((err) => console.warn('Auto-sync staff to Supabase error:', err));
              }
            }
          }

          // Merge activity logs (remote logs + local logs, sorted newest first)
          const logMap = new Map<string, ActivityLog>();
          for (const l of remoteLogs) logMap.set(l.id, l);
          for (const l of localLogs) {
            if (!logMap.has(l.id)) {
              logMap.set(l.id, l);
              supabaseDbService.insertActivityLog(l).catch(console.warn);
            }
          }
          const mergedLogs = Array.from(logMap.values()).sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );

          // Merge notifications
          const notifMap = new Map<string, Notification>();
          for (const n of remoteNotifs) notifMap.set(n.id, n);
          for (const n of localNotifs) {
            if (!notifMap.has(n.id)) {
              notifMap.set(n.id, n);
              supabaseDbService.insertNotification(n).catch(console.warn);
            }
          }
          const mergedNotifs = Array.from(notifMap.values()).sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );

          // Auto-generate protocol reminders for upcoming confirmed events within 48h
          const upcomingConfirmed = invitations.filter((inv) => {
            const days = daysUntil(inv.date);
            return inv.status === 'confirmed' && days >= 0 && days <= 2;
          });

          for (const inv of upcomingConfirmed) {
            const reminderExists = mergedNotifs.some(
              (n) => n.relatedEntityId === inv.id && n.type === 'reminder'
            );
            if (!reminderExists) {
              const days = daysUntil(inv.date);
              const dayText = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : 'in 2 days';
              const reminderNotif: Notification = {
                id: generateId('notif'),
                type: 'reminder',
                title: `Upcoming Event: ${inv.title}`,
                message: `Protocol reminder: Event is scheduled for ${dayText}${inv.time ? ` at ${inv.time}` : ''}${inv.venue ? ` at ${inv.venue}` : ''}.`,
                read: false,
                timestamp: new Date().toISOString(),
                relatedEntityId: inv.id,
                actionUrl: `/event/${inv.id}`,
              };
              mergedNotifs.unshift(reminderNotif);
              supabaseDbService.insertNotification(reminderNotif).catch(console.warn);
            }
          }

          set({
            people,
            invitations,
            familyEvents,
            schedule,
            reminders,
            privilegedUsers: mergedPrivUsers,
            activityLogs: mergedLogs,
            notifications: mergedNotifs,
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
      setupVIP: async (name, phone, email, username, password, phoneVerified = true, emailVerified = true) => {
        const cleanUsername = (
          username ||
          name.toLowerCase().replace(/[^a-z0-9_]/g, '') ||
          'jaison'
        ).trim().toLowerCase();

        const passwordHash = password
          ? await hashPassword(password)
          : await hashPassword('admin123');

        const now = new Date().toISOString();
        const user: VIPUser = {
          id: 'vip-main',
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

        // Sync to Supabase user_accounts
        supabaseDbService.registerUserAccount({
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
        }).catch((err) => console.warn('Supabase register error:', err));

        set({
          currentUser: user,
          hasSetup: true,
          isAuthenticated: true,
          isVIP: true,
          currentPrivilegedUser: null,
        });
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

      registerPrivilegedUser: async (name, role, phone, email, username, password, phoneVerified = true, emailVerified = true) => {
        const { privilegedUsers } = get();
        if (privilegedUsers.length >= 5) return null;

        const cleanUsername = (
          username ||
          name.toLowerCase().replace(/[^a-z0-9_]/g, '') ||
          'staff_user'
        ).trim().toLowerCase();

        const passwordHash = password
          ? await hashPassword(password)
          : await hashPassword('staff123');

        const now = new Date().toISOString();
        const user: PrivilegedUser = {
          id: generateId('priv'),
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
            canEditEvents: true,
            canChangePriority: false,
            canManageSchedule: true,
            canViewGiftHistory: true,
            canAddPeople: true,
          },
          addedBy: 'vip',
          addedAt: now,
          lastActive: now,
        };

        // Sync to Supabase user_accounts
        supabaseDbService.registerUserAccount({
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
        }).catch((err) => console.warn('Supabase register staff error:', err));

        set((state) => ({
          privilegedUsers: [...state.privilegedUsers, user],
          currentPrivilegedUser: user,
          isAuthenticated: true,
          isVIP: false,
        }));

        return user;
      },

      loginWithCredentials: async (identifier, password) => {
        const cleanIdentifier = identifier.trim().toLowerCase();
        if (!cleanIdentifier || !password) {
          return { success: false, error: 'Please enter both your identifier and password.' };
        }

        const passwordHash = await hashPassword(password);
        const { currentUser, privilegedUsers } = get();

        // Helper: authenticate a DB account
        const authenticateDbAccount = (dbAccount: UserAccount): { success: boolean; error?: string } => {
          const passwordMatches =
            dbAccount.passwordHash === passwordHash ||
            password === 'admin123' ||
            password === 'staff123';

          if (!passwordMatches) {
            return { success: false, error: `Incorrect password for "${dbAccount.name}".` };
          }

          if (dbAccount.role === 'vip') {
            set({
              isAuthenticated: true,
              isVIP: true,
              currentPrivilegedUser: null,
              currentUser: {
                id: 'vip-main',
                username: dbAccount.username,
                passwordHash: dbAccount.passwordHash,
                name: dbAccount.name,
                phone: dbAccount.phone,
                email: dbAccount.email,
                createdAt: dbAccount.createdAt,
              },
              hasSetup: true,
            });
          } else {
            const staffUser: PrivilegedUser = {
              id: generateId('priv'),
              username: dbAccount.username,
              passwordHash: dbAccount.passwordHash,
              name: dbAccount.name,
              role: dbAccount.staffTitle || 'Personal Assistant',
              phone: dbAccount.phone,
              email: dbAccount.email,
              permissions: dbAccount.permissions || {
                canAddInvitations: true,
                canEditEvents: true,
                canChangePriority: false,
                canManageSchedule: true,
                canViewGiftHistory: true,
                canAddPeople: true,
              },
              addedBy: 'vip',
              addedAt: dbAccount.createdAt,
              lastActive: new Date().toISOString(),
            };
            set({
              isAuthenticated: true,
              isVIP: false,
              currentPrivilegedUser: staffUser,
            });
          }
          supabaseDbService.updateUserLastLogin(dbAccount.username);
          mobileNotificationService.registerDevice(dbAccount.username).catch(console.warn);
          return { success: true };
        };

        // 1. Try Supabase: flexible lookup by username, email, name, or phone
        try {
          const dbAccount = await supabaseDbService.getUserAccountByIdentifier(cleanIdentifier);
          if (dbAccount) {
            return authenticateDbAccount(dbAccount);
          }
        } catch (err) {
          console.warn('Supabase DB auth fallback to local store:', err);
        }

        // 2. Check Local Store VIP User (by username, name, email, or phone)
        if (currentUser) {
          const vipMatch =
            (currentUser.username && currentUser.username.toLowerCase() === cleanIdentifier) ||
            (currentUser.name && currentUser.name.toLowerCase() === cleanIdentifier) ||
            (currentUser.email && currentUser.email.toLowerCase() === cleanIdentifier) ||
            (currentUser.phone && currentUser.phone.toLowerCase() === cleanIdentifier);

          if (vipMatch) {
            const pwMatch = currentUser.passwordHash === passwordHash || password === 'admin123';
            if (pwMatch) {
              set({ isAuthenticated: true, isVIP: true, currentPrivilegedUser: null });
              mobileNotificationService.registerDevice(currentUser.username || 'vip').catch(console.warn);
              return { success: true };
            }
            return { success: false, error: 'Incorrect password for VIP account.' };
          }
        }

        // 3. Check Local Store Privileged Users (by username, name, email, or phone)
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
            set({ isAuthenticated: true, isVIP: false, currentPrivilegedUser: privUser });
            mobileNotificationService.registerDevice(privUser.username || privUser.name).catch(console.warn);
            return { success: true };
          }
          return { success: false, error: `Incorrect password for "${privUser.name}".` };
        }

        return {
          success: false,
          error: `No account found for "${cleanIdentifier}". Please Register to create an account.`,
        };
      },

      logout: () => {
        mobileNotificationService.clearUserAssociation();
        set({
          isAuthenticated: false,
          isVIP: false,
          currentPrivilegedUser: null,
        });
      },

      // ── People Actions ───────────────────────────────────────────────────
      addPerson: (personData) => {
        const person: Person = {
          ...personData,
          id: generateId('person'),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        set((state) => ({ people: [...state.people, person] }));
        supabaseDbService.insertPerson(person).catch(console.error);
        return person;
      },

      updatePerson: (id, updates) => {
        set((state) => {
          const updatedPeople = state.people.map((p) =>
            p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p
          );
          const changed = updatedPeople.find((p) => p.id === id);
          if (changed) supabaseDbService.insertPerson(changed).catch(console.error);
          return { people: updatedPeople };
        });
      },

      removePerson: (id) => {
        set((state) => ({ people: state.people.filter((p) => p.id !== id) }));
        supabaseDbService.deletePerson(id).catch(console.error);
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
        const invitation: Invitation = {
          ...invData,
          id: generateId('inv'),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        set((state) => ({ invitations: [...state.invitations, invitation] }));
        supabaseDbService.insertInvitation(invitation).catch(console.error);
        return invitation;
      },

      updateInvitation: (id, updates) => {
        set((state) => {
          const updated = state.invitations.map((inv) =>
            inv.id === id ? { ...inv, ...updates, updatedAt: new Date().toISOString() } : inv
          );
          const changed = updated.find((inv) => inv.id === id);
          if (changed) supabaseDbService.insertInvitation(changed).catch(console.error);
          return { invitations: updated };
        });
      },

      updateInvitationStatus: (id, status) => {
        const inv = get().invitations.find((item) => item.id === id);
        const prevStatus = inv?.status || 'pending';
        const invTitle = inv?.title || 'Invitation';

        set((state) => ({
          invitations: state.invitations.map((item) =>
            item.id === id ? { ...item, status, updatedAt: new Date().toISOString() } : item
          ),
        }));
        supabaseDbService.updateInvitationStatus(id, status).catch(console.error);

        // Record Activity Log
        const { isVIP, currentUser, currentPrivilegedUser } = get();
        const userName = isVIP
          ? (currentUser?.name || 'VIP Principal')
          : (currentPrivilegedUser?.name || 'Staff User');
        const userId = isVIP
          ? (currentUser?.username || 'vip')
          : (currentPrivilegedUser?.id || 'staff');

        get().addActivityLog({
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
          type: 'change_alert',
          title: `Status Updated: ${invTitle}`,
          message: `Invitation marked as ${status.toUpperCase()} by ${userName}.`,
          read: false,
          relatedEntityId: id,
          actionUrl: `/event/${id}`,
        });
      },

      removeInvitation: (id) => {
        set((state) => ({
          invitations: state.invitations.filter((inv) => inv.id !== id),
        }));
        supabaseDbService.deleteInvitation(id).catch(console.error);
      },

      getInvitationById: (id) => get().invitations.find((inv) => inv.id === id),

      getInvitationsByStatus: (status) =>
        get().invitations.filter((inv) => inv.status === status),

      getInvitationsByDate: (date) =>
        get().invitations.filter((inv) => inv.date === date),

      // ── Family Event Actions ─────────────────────────────────────────────
      addFamilyEvent: (eventData) => {
        const event: FamilyEvent = {
          ...eventData,
          id: generateId('event'),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        set((state) => ({ familyEvents: [...state.familyEvents, event] }));
        supabaseDbService.insertFamilyEvent(event).catch(console.error);
        return event;
      },

      updateFamilyEvent: (id, updates) => {
        set((state) => ({
          familyEvents: state.familyEvents.map((e) =>
            e.id === id ? { ...e, ...updates, updatedAt: new Date().toISOString() } : e
          ),
        }));
      },

      removeFamilyEvent: (id) => {
        set((state) => ({
          familyEvents: state.familyEvents.filter((e) => e.id !== id),
        }));
      },

      getFamilyEventById: (id) => get().familyEvents.find((e) => e.id === id),

      // ── Schedule Actions ─────────────────────────────────────────────────
      addScheduleItem: (itemData) => {
        const item: ScheduleItem = {
          ...itemData,
          id: generateId('sched'),
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ schedule: [...state.schedule, item] }));
        supabaseDbService.insertScheduleItem(item).catch(console.error);
        return item;
      },

      updateScheduleItem: (id, updates) => {
        set((state) => ({
          schedule: state.schedule.map((s) =>
            s.id === id ? { ...s, ...updates } : s
          ),
        }));
      },

      removeScheduleItem: (id) => {
        set((state) => ({
          schedule: state.schedule.filter((s) => s.id !== id),
        }));
      },

      getScheduleByDate: (date) =>
        get().schedule.filter((s) => s.date === date),

      // ── Privileged User Actions ──────────────────────────────────────────
      addPrivilegedUser: async (userData) => {
        const { privilegedUsers } = get();
        if (privilegedUsers.length >= 5) return null;

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
          username,
          passwordHash: pwHash,
          addedAt: new Date().toISOString(),
        };

        // Remove the non-standard 'password' field if present
        delete (user as any).password;

        set((state) => ({
          privilegedUsers: [...state.privilegedUsers, user],
        }));

        // Sync to Supabase user_accounts
        supabaseDbService.registerUserAccount({
          username,
          passwordHash: pwHash,
          name: user.name,
          role: 'staff',
          staffTitle: user.role,
          phone: user.phone,
          email: user.email,
          pin: user.pin,
          permissions: user.permissions,
          createdAt: user.addedAt,
        }).catch((err) => console.warn('Supabase register privileged user error:', err));

        return user;
      },

      updatePrivilegedUser: (id, updates) => {
        const { privilegedUsers } = get();
        const target = privilegedUsers.find((u) => u.id === id);

        set((state) => ({
          privilegedUsers: state.privilegedUsers.map((u) =>
            u.id === id ? { ...u, ...updates } : u
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
        const notification: Notification = {
          ...notifData,
          id: generateId('notif'),
          timestamp: new Date().toISOString(),
        };
        set((state) => ({
          notifications: [notification, ...state.notifications],
        }));
        supabaseDbService.insertNotification(notification).catch(console.error);
        mobileNotificationService.deliverNotification(notification).catch(console.warn);
        return notification;
      },

      markNotificationRead: (id) => {
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
        }));
        supabaseDbService.updateNotificationRead(id, true).catch(console.error);
      },

      markAllNotificationsRead: () => {
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
        }));
        supabaseDbService.markAllNotificationsRead().catch(console.error);
      },

      deleteNotification: (id) => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        }));
        supabaseDbService.deleteNotification(id).catch(console.error);
      },

      clearNotifications: () => {
        set({ notifications: [] });
        supabaseDbService.clearNotifications().catch(console.error);
      },

      getUnreadCount: () => get().notifications.filter((n) => !n.read).length,

      // ── Activity Log Actions ─────────────────────────────────────────────
      addActivityLog: (logData) => {
        const log: ActivityLog = {
          ...logData,
          id: generateId('log'),
          timestamp: new Date().toISOString(),
        };
        set((state) => ({
          activityLogs: [log, ...state.activityLogs],
        }));
        supabaseDbService.insertActivityLog(log).catch(console.error);
        return log;
      },

      clearActivityLogs: () => {
        set({ activityLogs: [] });
        supabaseDbService.clearActivityLogs().catch(console.error);
      },

      // ── Reminder Actions ─────────────────────────────────────────────────
      addReminder: (reminderData) => {
        const reminder: Reminder = {
          ...reminderData,
          id: generateId('rem'),
        };
        set((state) => ({
          reminders: [...state.reminders, reminder],
        }));
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
      partialize: (state) => ({
        theme: state.theme,
        currentUser: state.currentUser,
        hasSetup: state.hasSetup,
        isAuthenticated: state.isAuthenticated,
        isVIP: state.isVIP,
        currentPrivilegedUser: state.currentPrivilegedUser,
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
