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

let realtimeChannel: RealtimeChannel | null = null;
let isSubscribed = false;

export const realtimeService = {
  /**
   * Initializes real-time subscriptions to live Supabase PostgreSQL tables.
   */
  subscribeAll(): () => void {
    if (isSubscribed && realtimeChannel) {
      return () => this.unsubscribe();
    }

    try {
      realtimeChannel = supabase
        .channel('vip-event-intelligence-realtime-channel')
        // ── 1. Listen to user_accounts changes ──────────────────────────────
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'user_accounts' },
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

              // Also update permissions for privileged users
              if (updatedAccount.role === 'staff') {
                const { privilegedUsers } = store;
                const existing = privilegedUsers.find(
                  (u) => u.username && u.username.toLowerCase() === updatedAccount.username?.toLowerCase()
                );
                if (existing && updatedAccount.permissions) {
                  useAppStore.setState({
                    privilegedUsers: privilegedUsers.map((u) =>
                      u.id === existing.id
                        ? { ...u, permissions: updatedAccount.permissions, name: updatedAccount.name }
                        : u
                    ),
                  });
                }
              }
            }

            // Handle new staff account added from another client
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
                        username: newAccount.username,
                        passwordHash: newAccount.password_hash,
                        name: newAccount.name,
                        role: newAccount.staff_title || 'Personal Assistant',
                        pin: newAccount.pin || '1111',
                        phone: newAccount.phone,
                        email: newAccount.email,
                        permissions: newAccount.permissions || {
                          canAddInvitations: true,
                          canEditEvents: false,
                          canChangePriority: false,
                          canManageSchedule: false,
                          canViewGiftHistory: false,
                          canAddPeople: false,
                        },
                        addedBy: 'vip',
                        addedAt: newAccount.created_at,
                      },
                    ],
                  });
                }
              }
            }

            // Handle staff account deleted from another client
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
        // ── 2. Listen to invitations changes ────────────────────────────────
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'invitations' },
          (payload) => {
            const store = useAppStore.getState();
            if (payload.eventType === 'INSERT') {
              const newRow = payload.new as any;
              const formatted: Invitation = {
                id: newRow.id,
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

              if (!store.invitations.some((i) => i.id === formatted.id)) {
                useAppStore.setState((state) => ({
                  invitations: [formatted, ...state.invitations],
                }));
              }
            } else if (payload.eventType === 'UPDATE') {
              const updatedRow = payload.new as any;
              useAppStore.setState((state) => ({
                invitations: state.invitations.map((inv) =>
                  inv.id === updatedRow.id
                    ? {
                        ...inv,
                        title: updatedRow.title ?? inv.title,
                        status: updatedRow.status ?? inv.status,
                        priority: updatedRow.priority ?? inv.priority,
                        date: updatedRow.date ?? inv.date,
                        time: updatedRow.time ?? inv.time,
                        venue: updatedRow.venue ?? inv.venue,
                        updatedAt: updatedRow.updated_at ?? inv.updatedAt,
                      }
                    : inv
                ),
              }));
            } else if (payload.eventType === 'DELETE') {
              const oldRow = payload.old as any;
              useAppStore.setState((state) => ({
                invitations: state.invitations.filter((i) => i.id !== oldRow.id),
              }));
            }
          }
        )
        // ── 3. Listen to people changes ─────────────────────────────────────
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'people' },
          (payload) => {
            const store = useAppStore.getState();
            if (payload.eventType === 'INSERT') {
              const p = payload.new as any;
              const formatted: Person = {
                id: p.id,
                name: p.name,
                nickname: p.nickname || p.name,
                relationship: p.relationship || 'friend',
                phone: p.phone,
                email: p.email,
                notes: p.notes,
                createdAt: p.created_at || p.createdAt || new Date().toISOString(),
                updatedAt: p.updated_at || p.updatedAt || new Date().toISOString(),
              };
              if (!store.people.some((x) => x.id === formatted.id)) {
                useAppStore.setState((state) => ({
                  people: [formatted, ...state.people],
                }));
              }
            } else if (payload.eventType === 'UPDATE') {
              const p = payload.new as any;
              useAppStore.setState((state) => ({
                people: state.people.map((person) =>
                  person.id === p.id
                    ? {
                        ...person,
                        name: p.name ?? person.name,
                        nickname: p.nickname ?? person.nickname,
                        relationship: p.relationship ?? person.relationship,
                        phone: p.phone ?? person.phone,
                        email: p.email ?? person.email,
                        notes: p.notes ?? person.notes,
                        updatedAt: p.updated_at ?? person.updatedAt,
                      }
                    : person
                ),
              }));
            } else if (payload.eventType === 'DELETE') {
              const oldRow = payload.old as any;
              useAppStore.setState((state) => ({
                people: state.people.filter((x) => x.id !== oldRow.id),
              }));
            }
          }
        )
        // ── 4. Listen to family_events changes ──────────────────────────────
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'family_events' },
          (payload) => {
            const store = useAppStore.getState();
            if (payload.eventType === 'INSERT') {
              const ev = payload.new as any;
              const formatted: FamilyEvent = {
                id: ev.id,
                name: ev.name,
                eventType: ev.event_type || ev.eventType || 'other',
                date: ev.date,
                familyMember: ev.family_member || ev.familyMember || '',
                description: ev.description,
                venue: ev.venue,
                guests: ev.guests || [],
                notes: ev.notes,
                createdAt: ev.created_at || ev.createdAt || new Date().toISOString(),
                updatedAt: ev.updated_at || ev.updatedAt || new Date().toISOString(),
              };
              if (!store.familyEvents.some((x) => x.id === formatted.id)) {
                useAppStore.setState((state) => ({
                  familyEvents: [formatted, ...state.familyEvents],
                }));
              }
            } else if (payload.eventType === 'UPDATE') {
              const ev = payload.new as any;
              useAppStore.setState((state) => ({
                familyEvents: state.familyEvents.map((item) =>
                  item.id === ev.id
                    ? {
                        ...item,
                        name: ev.name ?? item.name,
                        date: ev.date ?? item.date,
                        guests: ev.guests ?? item.guests,
                        notes: ev.notes ?? item.notes,
                      }
                    : item
                ),
              }));
            } else if (payload.eventType === 'DELETE') {
              const oldRow = payload.old as any;
              useAppStore.setState((state) => ({
                familyEvents: state.familyEvents.filter((x) => x.id !== oldRow.id),
              }));
            }
          }
        )
        // ── 5. Listen to schedule_items changes ─────────────────────────────
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'schedule_items' },
          (payload) => {
            const store = useAppStore.getState();
            if (payload.eventType === 'INSERT') {
              const sc = payload.new as any;
              const formatted: ScheduleItem = {
                id: sc.id,
                title: sc.title,
                date: sc.date,
                startTime: sc.start_time || sc.startTime || '09:00',
                endTime: sc.end_time || sc.endTime,
                type: sc.type || 'event',
                location: sc.location,
                notes: sc.notes,
                createdAt: sc.created_at || sc.createdAt || new Date().toISOString(),
              };
              if (!store.schedule.some((x) => x.id === formatted.id)) {
                useAppStore.setState((state) => ({
                  schedule: [...state.schedule, formatted],
                }));
              }
            } else if (payload.eventType === 'UPDATE') {
              const sc = payload.new as any;
              useAppStore.setState((state) => ({
                schedule: state.schedule.map((item) =>
                  item.id === sc.id
                    ? {
                        ...item,
                        title: sc.title ?? item.title,
                        date: sc.date ?? item.date,
                        startTime: sc.start_time ?? item.startTime,
                        endTime: sc.end_time ?? item.endTime,
                        location: sc.location ?? item.location,
                      }
                    : item
                ),
              }));
            } else if (payload.eventType === 'DELETE') {
              const oldRow = payload.old as any;
              useAppStore.setState((state) => ({
                schedule: state.schedule.filter((x) => x.id !== oldRow.id),
              }));
            }
          }
        )
        // ── 6. Listen to reminders changes ──────────────────────────────────
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'reminders' },
          (payload) => {
            const store = useAppStore.getState();
            if (payload.eventType === 'INSERT') {
              const rem = payload.new as any;
              const formatted: Reminder = {
                id: rem.id,
                eventId: rem.event_id || rem.eventId,
                eventTitle: rem.event_title || rem.eventTitle,
                daysBeforeEvent: rem.days_before_event ?? rem.daysBeforeEvent ?? 1,
                date: rem.date,
                message: rem.message,
                read: rem.read ?? false,
                priority: rem.priority || 'medium',
              };
              if (!store.reminders.some((x) => x.id === formatted.id)) {
                useAppStore.setState((state) => ({
                  reminders: [formatted, ...state.reminders],
                }));
              }
            } else if (payload.eventType === 'UPDATE') {
              const rem = payload.new as any;
              useAppStore.setState((state) => ({
                reminders: state.reminders.map((r) =>
                  r.id === rem.id ? { ...r, read: rem.read ?? r.read } : r
                ),
              }));
            } else if (payload.eventType === 'DELETE') {
              const oldRow = payload.old as any;
              useAppStore.setState((state) => ({
                reminders: state.reminders.filter((x) => x.id !== oldRow.id),
              }));
            }
          }
        )
        // ── 7. Listen to notifications changes ──────────────────────────────
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'notifications' },
          (payload) => {
            const store = useAppStore.getState();
            if (payload.eventType === 'INSERT') {
              const notif = payload.new as any;
              const formatted: Notification = {
                id: notif.id,
                type: notif.type || 'system',
                title: notif.title,
                message: notif.message,
                actionUrl: notif.action_url || notif.actionUrl,
                relatedEntityId: notif.related_entity_id || notif.relatedEntityId,
                read: notif.read ?? false,
                timestamp: notif.timestamp || notif.created_at || new Date().toISOString(),
              };
              if (!store.notifications.some((x) => x.id === formatted.id)) {
                useAppStore.setState((state) => ({
                  notifications: [formatted, ...state.notifications],
                }));
              }
            } else if (payload.eventType === 'UPDATE') {
              const updatedNotif = payload.new as any;
              useAppStore.setState((state) => ({
                notifications: state.notifications.map((n) =>
                  n.id === updatedNotif.id
                    ? {
                        ...n,
                        read: updatedNotif.read ?? n.read,
                        title: updatedNotif.title ?? n.title,
                        message: updatedNotif.message ?? n.message,
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
        // ── 8. Listen to activity_logs changes ─────────────────────────────
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'activity_logs' },
          (payload) => {
            const store = useAppStore.getState();
            if (payload.eventType === 'INSERT') {
              const row = payload.new as any;
              const formatted: ActivityLog = {
                id: row.id,
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
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            isSubscribed = false;
            useAppStore.setState({ isRealtimeActive: false });
          }
        });

      return () => this.unsubscribe();
    } catch (err) {
      console.warn('Realtime subscription initialization error:', err);
      return () => {};
    }
  },

  /**
   * Unsubscribes from active real-time channels.
   */
  unsubscribe() {
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
      realtimeChannel = null;
      isSubscribed = false;
      useAppStore.setState({ isRealtimeActive: false });
    }
  },
};
