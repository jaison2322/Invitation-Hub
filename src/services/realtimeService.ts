import { supabase } from '../utils/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useAppStore } from '../store/useAppStore';
import type {
  Invitation,
  Person,
  FamilyEvent,
  ScheduleItem,
  Reminder,
  Notification,
  ActivityLog,
} from '../types';
import { sanitizePermissions } from '../types';
import { mobileNotificationService } from './mobileNotificationService';

let realtimeChannel: RealtimeChannel | null = null;
let isSubscribed = false;
let currentSubscribedVipId: string | null = null;

export const realtimeService = {
  /**
   * Initializes real-time subscriptions scoped strictly to the authenticated VIP account.
   */
  subscribeAll(vipId?: string): () => void {
    const targetVipId =
      vipId ||
      useAppStore.getState().activeVipId ||
      useAppStore.getState().currentUser?.vipId ||
      useAppStore.getState().currentPrivilegedUser?.vipId;

    if (!targetVipId) {
      this.unsubscribe();
      return () => {};
    }

    if (isSubscribed && realtimeChannel && currentSubscribedVipId === targetVipId) {
      return () => this.unsubscribe();
    }

    if (realtimeChannel) {
      this.unsubscribe();
    }

    try {
      currentSubscribedVipId = targetVipId;
      const channelName = `vip-realtime-${targetVipId}`;

      realtimeChannel = supabase
        .channel(channelName)
        // ── 1. Listen to user_accounts changes for this VIP ────────────────
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'user_accounts', filter: `vip_id=eq.${targetVipId}` },
          (payload) => {
            const store = useAppStore.getState();
            if (payload.eventType === 'UPDATE') {
              const updatedAccount = payload.new as any;
              const activeUsername =
                store.currentUser?.username || store.currentPrivilegedUser?.username;

              if (activeUsername && updatedAccount.username?.toLowerCase() === activeUsername.toLowerCase()) {
                if (store.isVIP && store.currentUser) {
                  store.updateProfile(
                    updatedAccount.name,
                    updatedAccount.phone || '',
                    updatedAccount.email || ''
                  );
                }
              }

              // Also update permissions, name, and approval status for privileged users
              if (updatedAccount.role === 'staff') {
                const { privilegedUsers } = store;
                const existing = privilegedUsers.find(
                  (u) => u.username && u.username.toLowerCase() === updatedAccount.username?.toLowerCase()
                );
                if (existing) {
                  useAppStore.setState({
                    privilegedUsers: privilegedUsers.map((u) =>
                      u.id === existing.id
                        ? {
                            ...u,
                            permissions: updatedAccount.permissions ? sanitizePermissions(updatedAccount.permissions) : u.permissions,
                            name: updatedAccount.name || u.name,
                            role: updatedAccount.staff_title || u.role,
                            staffTitle: updatedAccount.staff_title || u.staffTitle,
                            approvalStatus: updatedAccount.approval_status || u.approvalStatus,
                            phoneVerified: updatedAccount.phone_verified !== undefined ? !!updatedAccount.phone_verified : u.phoneVerified,
                          }
                        : u
                    ),
                  });
                }
              }
            }

            // Handle new staff account added for this VIP
            if (payload.eventType === 'INSERT') {
              const newAccount = payload.new as any;
              if (newAccount.role === 'staff') {
                const { privilegedUsers } = store;
                const alreadyExists = privilegedUsers.some(
                  (u) => u.username && u.username.toLowerCase() === newAccount.username?.toLowerCase()
                );
                if (!alreadyExists) {
                  useAppStore.setState({
                    privilegedUsers: [
                      ...privilegedUsers,
                      {
                        id: 'priv-' + Date.now(),
                        vipId: targetVipId,
                        targetVipUsername: newAccount.target_vip_username,
                        approvalStatus: newAccount.approval_status || 'APPROVED',
                        username: newAccount.username,
                        passwordHash: newAccount.password_hash,
                        name: newAccount.name,
                        role: newAccount.staff_title || 'Personal Assistant',
                        staffTitle: newAccount.staff_title,
                        pin: newAccount.pin || '1111',
                        phone: newAccount.phone,
                        email: newAccount.email,
                        phoneVerified: !!newAccount.phone_verified,
                        phoneVerifiedAt: newAccount.phone_verified_at,
                        permissions: sanitizePermissions(newAccount.permissions),
                        addedBy: targetVipId,
                        addedAt: newAccount.created_at,
                      },
                    ],
                  });
                }
              }
            }

            // Handle staff account deleted for this VIP
            if (payload.eventType === 'DELETE') {
              const deletedAccount = payload.old as any;
              if (deletedAccount?.username) {
                const { privilegedUsers } = store;
                useAppStore.setState({
                  privilegedUsers: privilegedUsers.filter(
                    (u) => !(u.username && u.username.toLowerCase() === deletedAccount.username.toLowerCase())
                  ),
                });
              }
            }
          }
        )
        // ── 2. Listen to invitations changes for this VIP ──────────────────
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'invitations', filter: `vip_id=eq.${targetVipId}` },
          (payload) => {
            const store = useAppStore.getState();
            if (payload.eventType === 'INSERT') {
              const newRow = payload.new as any;
              const formatted: Invitation = {
                id: newRow.id,
                vipId: targetVipId,
                personId: newRow.person_id || newRow.personId,
                eventType: newRow.event_type || newRow.eventType || 'other',
                title: newRow.title,
                nickname: newRow.nickname,
                mainPerson: newRow.main_person || newRow.mainPerson,
                hostName: newRow.host_name || newRow.hostName,
                date: newRow.date,
                time: newRow.time,
                venue: newRow.venue,
                location: newRow.location,
                description: newRow.description,
                priority: newRow.priority || 'medium',
                aiSuggestedPriority: newRow.ai_suggested_priority || newRow.aiSuggestedPriority,
                aiReason: newRow.ai_reason || newRow.aiReason,
                status: newRow.status || 'pending',
                ocrText: newRow.ocr_text || newRow.ocrText,
                imageId: newRow.image_id || newRow.imageId,
                createdBy: newRow.created_by || newRow.createdBy || 'staff',
                createdAt: newRow.created_at || newRow.createdAt || new Date().toISOString(),
                updatedAt: newRow.updated_at || newRow.updatedAt || new Date().toISOString(),
              };

              if (!store.invitations.some((inv) => inv.id === formatted.id)) {
                useAppStore.setState((state) => ({
                  invitations: [...state.invitations, formatted],
                }));

                // Alert the device if this was added by another user in this VIP account
                const myUsername = (store.currentUser?.username || store.currentPrivilegedUser?.username || '').toLowerCase();
                const creator = (formatted.createdBy || '').toLowerCase();
                if (myUsername && creator && creator !== myUsername) {
                  mobileNotificationService.deliverNotification({
                    id: 'notif-rt-' + Date.now(),
                    vipId: targetVipId,
                    type: 'new_invitation',
                    title: `New Invitation: ${formatted.title}`,
                    message: `${formatted.createdBy || 'Staff'} added a new invitation for ${formatted.date}.`,
                    read: false,
                    timestamp: new Date().toISOString(),
                    actionUrl: `/event/${formatted.id}`,
                    relatedEntityId: formatted.id,
                  });
                }
              }
            } else if (payload.eventType === 'UPDATE') {
              const updatedRow = payload.new as any;
              useAppStore.setState((state) => ({
                invitations: state.invitations.map((inv) =>
                  inv.id === updatedRow.id
                    ? {
                        ...inv,
                        personId: updatedRow.person_id ?? inv.personId,
                        eventType: updatedRow.event_type ?? inv.eventType,
                        title: updatedRow.title ?? inv.title,
                        nickname: updatedRow.nickname ?? inv.nickname,
                        mainPerson: updatedRow.main_person ?? inv.mainPerson,
                        hostName: updatedRow.host_name ?? inv.hostName,
                        date: updatedRow.date ?? inv.date,
                        time: updatedRow.time ?? inv.time,
                        venue: updatedRow.venue ?? inv.venue,
                        location: updatedRow.location ?? inv.location,
                        description: updatedRow.description ?? inv.description,
                        priority: updatedRow.priority ?? inv.priority,
                        aiSuggestedPriority: updatedRow.ai_suggested_priority ?? inv.aiSuggestedPriority,
                        aiReason: updatedRow.ai_reason ?? inv.aiReason,
                        status: updatedRow.status ?? inv.status,
                        ocrText: updatedRow.ocr_text ?? inv.ocrText,
                        imageId: updatedRow.image_id ?? inv.imageId,
                        updatedAt: updatedRow.updated_at ?? new Date().toISOString(),
                      }
                    : inv
                ),
              }));
            } else if (payload.eventType === 'DELETE') {
              const oldRow = payload.old as any;
              useAppStore.setState((state) => ({
                invitations: state.invitations.filter((inv) => inv.id !== oldRow.id),
              }));
            }
          }
        )
        // ── 3. Listen to people changes for this VIP ───────────────────────
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'people', filter: `vip_id=eq.${targetVipId}` },
          (payload) => {
            const store = useAppStore.getState();
            if (payload.eventType === 'INSERT') {
              const row = payload.new as any;
              const formatted: Person = {
                id: row.id,
                vipId: targetVipId,
                name: row.name,
                nickname: row.nickname || '',
                relationship: row.relationship,
                phone: row.phone,
                email: row.email,
                notes: row.notes,
                createdAt: row.created_at || new Date().toISOString(),
                updatedAt: row.updated_at || new Date().toISOString(),
              };
              if (!store.people.some((p) => p.id === formatted.id)) {
                useAppStore.setState((state) => ({
                  people: [...state.people, formatted],
                }));
              }
            } else if (payload.eventType === 'UPDATE') {
              const row = payload.new as any;
              useAppStore.setState((state) => ({
                people: state.people.map((p) =>
                  p.id === row.id
                    ? {
                        ...p,
                        name: row.name ?? p.name,
                        nickname: row.nickname ?? p.nickname,
                        relationship: row.relationship ?? p.relationship,
                        phone: row.phone ?? p.phone,
                        email: row.email ?? p.email,
                        notes: row.notes ?? p.notes,
                        updatedAt: row.updated_at ?? new Date().toISOString(),
                      }
                    : p
                ),
              }));
            } else if (payload.eventType === 'DELETE') {
              const oldRow = payload.old as any;
              useAppStore.setState((state) => ({
                people: state.people.filter((p) => p.id !== oldRow.id),
              }));
            }
          }
        )
        // ── 4. Listen to family_events changes for this VIP ────────────────
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'family_events', filter: `vip_id=eq.${targetVipId}` },
          (payload) => {
            const store = useAppStore.getState();
            if (payload.eventType === 'INSERT') {
              const row = payload.new as any;
              const formatted: FamilyEvent = {
                id: row.id,
                vipId: targetVipId,
                name: row.name,
                eventType: row.event_type || 'other',
                date: row.date,
                familyMember: row.family_member || '',
                description: row.description,
                venue: row.venue,
                guests: row.guests || [],
                notes: row.notes,
                createdAt: row.created_at || new Date().toISOString(),
                updatedAt: row.updated_at || new Date().toISOString(),
              };
              if (!store.familyEvents.some((e) => e.id === formatted.id)) {
                useAppStore.setState((state) => ({
                  familyEvents: [...state.familyEvents, formatted],
                }));
              }
            } else if (payload.eventType === 'UPDATE') {
              const row = payload.new as any;
              useAppStore.setState((state) => ({
                familyEvents: state.familyEvents.map((e) =>
                  e.id === row.id
                    ? {
                        ...e,
                        name: row.name ?? e.name,
                        eventType: row.event_type ?? e.eventType,
                        date: row.date ?? e.date,
                        familyMember: row.family_member ?? e.familyMember,
                        description: row.description ?? e.description,
                        venue: row.venue ?? e.venue,
                        guests: row.guests ?? e.guests,
                        notes: row.notes ?? e.notes,
                        updatedAt: row.updated_at ?? new Date().toISOString(),
                      }
                    : e
                ),
              }));
            } else if (payload.eventType === 'DELETE') {
              const oldRow = payload.old as any;
              useAppStore.setState((state) => ({
                familyEvents: state.familyEvents.filter((e) => e.id !== oldRow.id),
              }));
            }
          }
        )
        // ── 5. Listen to schedule_items changes for this VIP ───────────────
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'schedule_items', filter: `vip_id=eq.${targetVipId}` },
          (payload) => {
            const store = useAppStore.getState();
            if (payload.eventType === 'INSERT') {
              const row = payload.new as any;
              const formatted: ScheduleItem = {
                id: row.id,
                vipId: targetVipId,
                title: row.title,
                date: row.date,
                startTime: row.start_time,
                endTime: row.end_time,
                type: row.type || 'event',
                location: row.location,
                notes: row.notes,
                createdAt: row.created_at || new Date().toISOString(),
              };
              if (!store.schedule.some((s) => s.id === formatted.id)) {
                useAppStore.setState((state) => ({
                  schedule: [...state.schedule, formatted],
                }));
              }
            } else if (payload.eventType === 'UPDATE') {
              const row = payload.new as any;
              useAppStore.setState((state) => ({
                schedule: state.schedule.map((s) =>
                  s.id === row.id
                    ? {
                        ...s,
                        title: row.title ?? s.title,
                        date: row.date ?? s.date,
                        startTime: row.start_time ?? s.startTime,
                        endTime: row.end_time ?? s.endTime,
                        type: row.type ?? s.type,
                        location: row.location ?? s.location,
                        notes: row.notes ?? s.notes,
                      }
                    : s
                ),
              }));
            } else if (payload.eventType === 'DELETE') {
              const oldRow = payload.old as any;
              useAppStore.setState((state) => ({
                schedule: state.schedule.filter((s) => s.id !== oldRow.id),
              }));
            }
          }
        )
        // ── 6. Listen to reminders changes for this VIP ────────────────────
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'reminders', filter: `vip_id=eq.${targetVipId}` },
          (payload) => {
            const store = useAppStore.getState();
            if (payload.eventType === 'INSERT') {
              const row = payload.new as any;
              const formatted: Reminder = {
                id: row.id,
                vipId: targetVipId,
                eventId: row.event_id,
                eventTitle: row.event_title,
                daysBeforeEvent: row.days_before_event ?? 1,
                date: row.date,
                message: row.message,
                read: Boolean(row.read),
                priority: row.priority || 'medium',
              };
              if (!store.reminders.some((r) => r.id === formatted.id)) {
                useAppStore.setState((state) => ({
                  reminders: [...state.reminders, formatted],
                }));
              }
            } else if (payload.eventType === 'UPDATE') {
              const row = payload.new as any;
              useAppStore.setState((state) => ({
                reminders: state.reminders.map((r) =>
                  r.id === row.id
                    ? {
                        ...r,
                        read: row.read !== undefined ? Boolean(row.read) : r.read,
                        message: row.message ?? r.message,
                      }
                    : r
                ),
              }));
            } else if (payload.eventType === 'DELETE') {
              const oldRow = payload.old as any;
              useAppStore.setState((state) => ({
                reminders: state.reminders.filter((r) => r.id !== oldRow.id),
              }));
            }
          }
        )
        // ── 7. Listen to notifications changes for this VIP ────────────────
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'notifications', filter: `vip_id=eq.${targetVipId}` },
          (payload) => {
            const store = useAppStore.getState();
            if (payload.eventType === 'INSERT') {
              const row = payload.new as any;
              const formatted: Notification = {
                id: row.id,
                vipId: targetVipId,
                type: row.type || 'system',
                title: row.title,
                message: row.message,
                read: Boolean(row.read),
                timestamp: row.timestamp || new Date().toISOString(),
                actionUrl: row.action_url,
                relatedEntityId: row.related_entity_id,
              };

              if (!store.notifications.some((n) => n.id === formatted.id)) {
                useAppStore.setState((state) => ({
                  notifications: [formatted, ...state.notifications],
                }));

                // Check sender info
                const activeUser = (
                  store.currentUser?.username ||
                  store.currentPrivilegedUser?.username ||
                  ''
                ).toLowerCase();
                const urlParams = formatted.actionUrl
                  ? new URLSearchParams(formatted.actionUrl.split('?')[1] || '')
                  : null;
                const sender = urlParams?.get('sender')?.toLowerCase();

                if (!sender || !activeUser || sender !== activeUser) {
                  mobileNotificationService.deliverNotification(formatted);
                }
              }
            } else if (payload.eventType === 'UPDATE') {
              const row = payload.new as any;
              useAppStore.setState((state) => ({
                notifications: state.notifications.map((n) =>
                  n.id === row.id
                    ? {
                        ...n,
                        read: row.read !== undefined ? Boolean(row.read) : n.read,
                      }
                    : n
                ),
              }));
            } else if (payload.eventType === 'DELETE') {
              const oldRow = payload.old as any;
              useAppStore.setState((state) => ({
                notifications: state.notifications.filter((n) => n.id !== oldRow.id),
              }));
            }
          }
        )
        // ── 8. Listen to activity_logs changes for this VIP ────────────────
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'activity_logs', filter: `vip_id=eq.${targetVipId}` },
          (payload) => {
            const store = useAppStore.getState();
            if (payload.eventType === 'INSERT') {
              const row = payload.new as any;
              const formatted: ActivityLog = {
                id: row.id,
                vipId: targetVipId,
                userId: row.user_id || row.userId || 'system',
                userName: row.user_name || row.userName || 'VIP Principal',
                action: row.action,
                entityType: row.entity_type || row.entityType || 'system',
                entityId: row.entity_id || row.entityId || '',
                entityName: row.entity_name || row.entityName,
                previousValue: row.previous_value || row.previousValue,
                newValue: row.new_value || row.newValue,
                timestamp: row.timestamp || new Date().toISOString(),
              };
              if (!store.activityLogs.some((x) => x.id === formatted.id)) {
                useAppStore.setState((state) => ({
                  activityLogs: [formatted, ...state.activityLogs],
                }));
              }
            } else if (payload.eventType === 'UPDATE') {
              const row = payload.new as any;
              useAppStore.setState((state) => ({
                activityLogs: state.activityLogs.map((log) =>
                  log.id === row.id
                    ? {
                        ...log,
                        action: row.action ?? log.action,
                        entityName: row.entity_name ?? log.entityName,
                        previousValue: row.previous_value ?? log.previousValue,
                        newValue: row.new_value ?? log.newValue,
                      }
                    : log
                ),
              }));
            } else if (payload.eventType === 'DELETE') {
              const oldRow = payload.old as any;
              useAppStore.setState((state) => ({
                activityLogs: state.activityLogs.filter((l) => l.id !== oldRow.id),
              }));
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            isSubscribed = true;
            useAppStore.setState({ isRealtimeActive: true });
            console.log(`[Realtime] Subscription active for VIP on channel: ${channelName}`);
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            isSubscribed = false;
            useAppStore.setState({ isRealtimeActive: false });
            console.warn('[Realtime] Subscription interrupted (' + status + '). Scheduling reconnection...');
            setTimeout(() => {
              realtimeService.ensureConnection();
            }, 3000);
          }
        });

      return () => this.unsubscribe();
    } catch (err) {
      console.warn('Realtime subscription initialization error:', err);
      return () => {};
    }
  },

  /**
   * Ensures the real-time channel is connected and healthy for the active VIP.
   */
  ensureConnection() {
    const store = useAppStore.getState();
    const targetVipId = store.activeVipId || store.currentUser?.vipId || store.currentPrivilegedUser?.vipId;
    if (!targetVipId || !store.isAuthenticated) {
      this.unsubscribe();
      return;
    }
    if (!isSubscribed || !realtimeChannel || currentSubscribedVipId !== targetVipId) {
      this.unsubscribe();
      this.subscribeAll(targetVipId);
    }
  },

  /**
   * Unsubscribes from active real-time channels and clears VIP subscription state.
   */
  unsubscribe() {
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
    isSubscribed = false;
    currentSubscribedVipId = null;
    useAppStore.setState({ isRealtimeActive: false });
  },
};

// Lifecycle listeners: re-establish socket and catch up notifications when app resumes or reconnects
if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      realtimeService.ensureConnection();
      const store = useAppStore.getState();
      const activeUser = store.currentUser?.username || store.currentPrivilegedUser?.username;
      const activeVip = store.activeVipId || store.currentUser?.vipId;
      if (activeUser && activeVip) {
        mobileNotificationService.checkRecentUnreadNotifications(activeUser, activeVip).catch(console.warn);
      }
    }
  });

  window.addEventListener('focus', () => {
    realtimeService.ensureConnection();
    const store = useAppStore.getState();
    const activeUser = store.currentUser?.username || store.currentPrivilegedUser?.username;
    const activeVip = store.activeVipId || store.currentUser?.vipId;
    if (activeUser && activeVip) {
      mobileNotificationService.checkRecentUnreadNotifications(activeUser, activeVip).catch(console.warn);
    }
  });

  window.addEventListener('online', () => {
    realtimeService.ensureConnection();
  });
}
