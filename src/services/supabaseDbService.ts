import { supabase, getActiveSessionVipId } from '../utils/supabase';
import type {
  Person,
  Invitation,
  FamilyEvent,
  ScheduleItem,
  Reminder,
  Notification,
  ActivityLog,
  VIPUser,
  PrivilegedUser,
  UserAccount,
} from '../types';

// ─── Supabase Database Service (VIP Tenant Isolated) ─────────────────────────
// Handles all CRUD operations with the live Supabase PostgreSQL database,
// enforcing data isolation at both query-level and database RLS-level.

export const supabaseDbService = {
  // ── People ──────────────────────────────────────────────────────────────────
  async getPeople(vipId?: string): Promise<Person[]> {
    const targetVipId = vipId || getActiveSessionVipId();
    if (!targetVipId) return [];

    const { data, error } = await supabase
      .from('people')
      .select('*')
      .eq('vip_id', targetVipId)
      .order('name');

    if (error) {
      console.error('Error fetching people:', error);
      return [];
    }
    return (data || []).map((row) => ({
      id: row.id,
      vipId: row.vip_id,
      name: row.name,
      nickname: row.nickname || '',
      relationship: row.relationship,
      phone: row.phone,
      email: row.email,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  },

  async insertPerson(person: Person, vipId?: string): Promise<boolean> {
    const targetVipId = vipId || person.vipId || getActiveSessionVipId();
    if (!targetVipId) {
      console.error('Cannot insert person without vipId');
      return false;
    }

    const { error } = await supabase.from('people').upsert({
      id: person.id,
      vip_id: targetVipId,
      name: person.name,
      nickname: person.nickname,
      relationship: person.relationship,
      phone: person.phone,
      email: person.email,
      notes: person.notes,
      created_at: person.createdAt,
      updated_at: person.updatedAt,
    });
    if (error) console.error('Error inserting person:', error);
    return !error;
  },

  async deletePerson(id: string, vipId?: string): Promise<boolean> {
    const targetVipId = vipId || getActiveSessionVipId();
    let query = supabase.from('people').delete().eq('id', id);
    if (targetVipId) query = query.eq('vip_id', targetVipId);

    const { error } = await query;
    if (error) console.error('Error deleting person:', error);
    return !error;
  },

  // ── Invitations ─────────────────────────────────────────────────────────────
  async getInvitations(vipId?: string): Promise<Invitation[]> {
    const targetVipId = vipId || getActiveSessionVipId();
    if (!targetVipId) return [];

    const { data, error } = await supabase
      .from('invitations')
      .select('*')
      .eq('vip_id', targetVipId)
      .order('date', { ascending: true });

    if (error) {
      console.error('Error fetching invitations:', error);
      return [];
    }
    return (data || []).map((row) => ({
      id: row.id,
      vipId: row.vip_id,
      personId: row.person_id,
      eventType: row.event_type,
      title: row.title,
      nickname: row.nickname,
      mainPerson: row.main_person,
      hostName: row.host_name,
      date: row.date,
      time: row.time,
      venue: row.venue,
      location: row.location,
      description: row.description,
      priority: row.priority,
      aiSuggestedPriority: row.ai_suggested_priority,
      aiReason: row.ai_reason,
      status: row.status,
      imageId: row.image_id,
      ocrText: row.ocr_text,
      createdBy: row.created_by || 'vip',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  },

  async insertInvitation(inv: Invitation, vipId?: string): Promise<boolean> {
    const targetVipId = vipId || inv.vipId || getActiveSessionVipId();
    if (!targetVipId) {
      console.error('Cannot insert invitation without vipId');
      return false;
    }

    const { error } = await supabase.from('invitations').upsert({
      id: inv.id,
      vip_id: targetVipId,
      person_id: inv.personId,
      event_type: inv.eventType,
      title: inv.title,
      nickname: inv.nickname,
      main_person: inv.mainPerson,
      host_name: inv.hostName,
      date: inv.date,
      time: inv.time,
      venue: inv.venue,
      location: inv.location,
      description: inv.description,
      priority: inv.priority,
      ai_suggested_priority: inv.aiSuggestedPriority,
      ai_reason: inv.aiReason,
      status: inv.status,
      image_id: inv.imageId,
      ocr_text: inv.ocrText,
      created_by: inv.createdBy,
      created_at: inv.createdAt,
      updated_at: inv.updatedAt,
    });
    if (error) console.error('Error saving invitation:', error);
    return !error;
  },

  async updateInvitationStatus(id: string, status: string, vipId?: string): Promise<boolean> {
    const targetVipId = vipId || getActiveSessionVipId();
    let query = supabase
      .from('invitations')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (targetVipId) query = query.eq('vip_id', targetVipId);

    const { error } = await query;
    if (error) console.error('Error updating invitation status:', error);
    return !error;
  },

  async deleteInvitation(id: string, vipId?: string): Promise<boolean> {
    const targetVipId = vipId || getActiveSessionVipId();
    let query = supabase.from('invitations').delete().eq('id', id);
    if (targetVipId) query = query.eq('vip_id', targetVipId);

    const { error } = await query;
    if (error) console.error('Error deleting invitation:', error);
    return !error;
  },

  // ── Family Events ───────────────────────────────────────────────────────────
  async getFamilyEvents(vipId?: string): Promise<FamilyEvent[]> {
    const targetVipId = vipId || getActiveSessionVipId();
    if (!targetVipId) return [];

    const { data, error } = await supabase
      .from('family_events')
      .select('*')
      .eq('vip_id', targetVipId)
      .order('date', { ascending: false });

    if (error) {
      console.error('Error fetching family events:', error);
      return [];
    }
    return (data || []).map((row) => ({
      id: row.id,
      vipId: row.vip_id,
      name: row.name,
      eventType: row.event_type,
      date: row.date,
      familyMember: row.family_member,
      description: row.description,
      venue: row.venue,
      guests: row.guests || [],
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  },

  async insertFamilyEvent(event: FamilyEvent, vipId?: string): Promise<boolean> {
    const targetVipId = vipId || event.vipId || getActiveSessionVipId();
    if (!targetVipId) {
      console.error('Cannot insert family event without vipId');
      return false;
    }

    const { error } = await supabase.from('family_events').upsert({
      id: event.id,
      vip_id: targetVipId,
      name: event.name,
      event_type: event.eventType,
      date: event.date,
      family_member: event.familyMember,
      description: event.description,
      venue: event.venue,
      guests: event.guests,
      notes: event.notes,
      created_at: event.createdAt,
      updated_at: event.updatedAt,
    });
    if (error) console.error('Error saving family event:', error);
    return !error;
  },

  async deleteFamilyEvent(id: string, vipId?: string): Promise<boolean> {
    const targetVipId = vipId || getActiveSessionVipId();
    let query = supabase.from('family_events').delete().eq('id', id);
    if (targetVipId) query = query.eq('vip_id', targetVipId);

    const { error } = await query;
    if (error) console.error('Error deleting family event:', error);
    return !error;
  },

  // ── Schedule Items ──────────────────────────────────────────────────────────
  async getSchedule(vipId?: string): Promise<ScheduleItem[]> {
    const targetVipId = vipId || getActiveSessionVipId();
    if (!targetVipId) return [];

    const { data, error } = await supabase
      .from('schedule_items')
      .select('*')
      .eq('vip_id', targetVipId)
      .order('date', { ascending: true });

    if (error) {
      console.error('Error fetching schedule:', error);
      return [];
    }
    return (data || []).map((row) => ({
      id: row.id,
      vipId: row.vip_id,
      title: row.title,
      date: row.date,
      startTime: row.start_time,
      endTime: row.end_time,
      type: row.type,
      location: row.location,
      notes: row.notes,
      createdAt: row.created_at,
    }));
  },

  async insertScheduleItem(item: ScheduleItem, vipId?: string): Promise<boolean> {
    const targetVipId = vipId || item.vipId || getActiveSessionVipId();
    if (!targetVipId) {
      console.error('Cannot insert schedule item without vipId');
      return false;
    }

    const { error } = await supabase.from('schedule_items').upsert({
      id: item.id,
      vip_id: targetVipId,
      title: item.title,
      date: item.date,
      start_time: item.startTime,
      end_time: item.endTime,
      type: item.type,
      location: item.location,
      notes: item.notes,
      created_at: item.createdAt,
    });
    if (error) console.error('Error saving schedule item:', error);
    return !error;
  },

  async deleteScheduleItem(id: string, vipId?: string): Promise<boolean> {
    const targetVipId = vipId || getActiveSessionVipId();
    let query = supabase.from('schedule_items').delete().eq('id', id);
    if (targetVipId) query = query.eq('vip_id', targetVipId);

    const { error } = await query;
    if (error) console.error('Error deleting schedule item:', error);
    return !error;
  },

  // ── Reminders ───────────────────────────────────────────────────────────────
  async getReminders(vipId?: string): Promise<Reminder[]> {
    const targetVipId = vipId || getActiveSessionVipId();
    if (!targetVipId) return [];

    const { data, error } = await supabase
      .from('reminders')
      .select('*')
      .eq('vip_id', targetVipId)
      .order('date', { ascending: true });

    if (error) {
      console.error('Error fetching reminders:', error);
      return [];
    }
    return (data || []).map((row) => ({
      id: row.id,
      vipId: row.vip_id,
      eventId: row.event_id,
      eventTitle: row.event_title,
      daysBeforeEvent: row.days_before_event,
      date: row.date,
      message: row.message,
      read: row.read,
      priority: row.priority,
    }));
  },

  async insertReminder(reminder: Reminder, vipId?: string): Promise<boolean> {
    const targetVipId = vipId || reminder.vipId || getActiveSessionVipId();
    if (!targetVipId) {
      console.error('Cannot insert reminder without vipId');
      return false;
    }

    const { error } = await supabase.from('reminders').upsert({
      id: reminder.id,
      vip_id: targetVipId,
      event_id: reminder.eventId,
      event_title: reminder.eventTitle,
      days_before_event: reminder.daysBeforeEvent,
      date: reminder.date,
      message: reminder.message,
      read: reminder.read,
      priority: reminder.priority,
      created_at: new Date().toISOString(),
    });
    if (error) console.error('Error saving reminder:', error);
    return !error;
  },

  async deleteReminder(id: string, vipId?: string): Promise<boolean> {
    const targetVipId = vipId || getActiveSessionVipId();
    let query = supabase.from('reminders').delete().eq('id', id);
    if (targetVipId) query = query.eq('vip_id', targetVipId);

    const { error } = await query;
    if (error) console.error('Error deleting reminder:', error);
    return !error;
  },

  // ── Activity Logs ───────────────────────────────────────────────────────────
  async getActivityLogs(vipId?: string): Promise<ActivityLog[]> {
    try {
      const targetVipId = vipId || getActiveSessionVipId();
      if (!targetVipId) return [];

      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .eq('vip_id', targetVipId)
        .order('timestamp', { ascending: false })
        .limit(200);

      if (error) {
        console.error('Error fetching activity logs:', error);
        return [];
      }
      return (data || []).map((row) => ({
        id: row.id,
        vipId: row.vip_id,
        userId: row.user_id,
        userName: row.user_name || 'VIP Principal',
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        entityName: row.entity_name || undefined,
        previousValue: row.previous_value || undefined,
        newValue: row.new_value || undefined,
        timestamp: row.timestamp,
      }));
    } catch (err) {
      console.warn('Supabase getActivityLogs exception:', err);
      return [];
    }
  },

  async insertActivityLog(log: ActivityLog, vipId?: string): Promise<boolean> {
    try {
      const targetVipId = vipId || log.vipId || getActiveSessionVipId();
      if (!targetVipId) {
        console.error('Cannot insert activity log without vipId');
        return false;
      }

      const { error } = await supabase.from('activity_logs').upsert({
        id: log.id,
        vip_id: targetVipId,
        user_id: log.userId,
        user_name: log.userName,
        action: log.action,
        entity_type: log.entityType,
        entity_id: log.entityId,
        entity_name: log.entityName || null,
        previous_value: log.previousValue || null,
        new_value: log.newValue || null,
        timestamp: log.timestamp || new Date().toISOString(),
      });
      if (error) console.error('Error saving activity log:', error);
      return !error;
    } catch (err) {
      console.warn('Supabase insertActivityLog exception:', err);
      return false;
    }
  },

  async deleteActivityLog(id: string, vipId?: string): Promise<boolean> {
    try {
      const targetVipId = vipId || getActiveSessionVipId();
      let query = supabase.from('activity_logs').delete().eq('id', id);
      if (targetVipId) query = query.eq('vip_id', targetVipId);

      const { error } = await query;
      if (error) console.error('Error deleting activity log:', error);
      return !error;
    } catch (err) {
      console.warn('Supabase deleteActivityLog exception:', err);
      return false;
    }
  },

  async clearActivityLogs(vipId?: string): Promise<boolean> {
    try {
      const targetVipId = vipId || getActiveSessionVipId();
      if (!targetVipId) return false;

      const { error } = await supabase
        .from('activity_logs')
        .delete()
        .eq('vip_id', targetVipId);

      if (error) console.error('Error clearing activity logs:', error);
      return !error;
    } catch (err) {
      console.warn('Supabase clearActivityLogs exception:', err);
      return false;
    }
  },

  // ── Notifications ───────────────────────────────────────────────────────────
  async getNotifications(vipId?: string): Promise<Notification[]> {
    try {
      const targetVipId = vipId || getActiveSessionVipId();
      if (!targetVipId) return [];

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('vip_id', targetVipId)
        .order('timestamp', { ascending: false })
        .limit(100);

      if (error) {
        console.error('Error fetching notifications:', error);
        return [];
      }
      return (data || []).map((row) => ({
        id: row.id,
        vipId: row.vip_id,
        type: row.type as Notification['type'],
        title: row.title,
        message: row.message,
        read: Boolean(row.read),
        timestamp: row.timestamp,
        actionUrl: row.action_url || undefined,
        relatedEntityId: row.related_entity_id || undefined,
      }));
    } catch (err) {
      console.warn('Supabase getNotifications exception:', err);
      return [];
    }
  },

  async insertNotification(notif: Notification, vipId?: string): Promise<boolean> {
    try {
      const targetVipId = vipId || notif.vipId || getActiveSessionVipId();
      if (!targetVipId) {
        console.error('Cannot insert notification without vipId');
        return false;
      }

      const record = {
        id: notif.id,
        vip_id: targetVipId,
        type: notif.type,
        title: notif.title,
        message: notif.message,
        read: Boolean(notif.read),
        timestamp: notif.timestamp || new Date().toISOString(),
        action_url: notif.actionUrl || null,
        related_entity_id: notif.relatedEntityId || null,
      };

      const { error } = await supabase.from('notifications').upsert(record);
      if (error) {
        console.error('Error saving notification:', error);
        return false;
      }

      // Dispatch cloud push notification scoped to target VIP's registered devices
      supabase.functions.invoke('send-push-notification', {
        body: { record }
      }).then((res) => {
        if (res.error) {
          console.warn('[Push Dispatch] Direct function invocation error:', res.error);
        } else {
          console.log('[Push Dispatch] Direct function response:', res.data);
        }
      }).catch((e) => {
        console.warn('[Push Dispatch] Exception invoking send-push-notification:', e);
      });

      return true;
    } catch (err) {
      console.warn('Supabase insertNotification exception:', err);
      return false;
    }
  },

  async updateNotificationRead(id: string, read: boolean, vipId?: string): Promise<boolean> {
    try {
      const targetVipId = vipId || getActiveSessionVipId();
      let query = supabase
        .from('notifications')
        .update({ read })
        .eq('id', id);
      if (targetVipId) query = query.eq('vip_id', targetVipId);

      const { error } = await query;
      if (error) console.error('Error updating notification read:', error);
      return !error;
    } catch (err) {
      console.warn('Supabase updateNotificationRead exception:', err);
      return false;
    }
  },

  async markAllNotificationsRead(vipId?: string): Promise<boolean> {
    try {
      const targetVipId = vipId || getActiveSessionVipId();
      if (!targetVipId) return false;

      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('vip_id', targetVipId)
        .eq('read', false);

      if (error) console.error('Error marking all notifications read:', error);
      return !error;
    } catch (err) {
      console.warn('Supabase markAllNotificationsRead exception:', err);
      return false;
    }
  },

  async deleteNotification(id: string, vipId?: string): Promise<boolean> {
    try {
      const targetVipId = vipId || getActiveSessionVipId();
      let query = supabase.from('notifications').delete().eq('id', id);
      if (targetVipId) query = query.eq('vip_id', targetVipId);

      const { error } = await query;
      if (error) console.error('Error deleting notification:', error);
      return !error;
    } catch (err) {
      console.warn('Supabase deleteNotification exception:', err);
      return false;
    }
  },

  async clearNotifications(vipId?: string): Promise<boolean> {
    try {
      const targetVipId = vipId || getActiveSessionVipId();
      if (!targetVipId) return false;

      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('vip_id', targetVipId);

      if (error) console.error('Error clearing notifications:', error);
      return !error;
    } catch (err) {
      console.warn('Supabase clearNotifications exception:', err);
      return false;
    }
  },

  // ── User Accounts & Authentication ──────────────────────────────────────────
  async getUserAccount(username: string): Promise<UserAccount | null> {
    try {
      const cleanUsername = username.trim().toLowerCase();
      const { data, error } = await supabase
        .from('user_accounts')
        .select('*')
        .eq('username', cleanUsername)
        .maybeSingle();

      if (error) {
        console.warn('Error fetching user account:', error);
        return null;
      }
      if (!data) return null;

      return this._mapRowToUserAccount(data);
    } catch (err) {
      console.warn('Supabase getUserAccount exception:', err);
      return null;
    }
  },

  // Flexible lookup: search by username, email, name, or phone via secure RPC
  async getUserAccountByIdentifier(identifier: string): Promise<UserAccount | null> {
    try {
      const clean = identifier.trim().toLowerCase();
      if (!clean) return null;

      // 1. Call secure lookup function (allows single-account authentication without exposing entire user_accounts table)
      const { data, error } = await supabase.rpc('lookup_user_account', { p_identifier: clean });
      if (!error && data && Array.isArray(data) && data.length > 0) {
        return this._mapRowToUserAccount(data[0]);
      }

      // 2. Fallback: direct table lookup if caller has active session matching vip_id
      const byUsername = await this.getUserAccount(clean);
      if (byUsername) return byUsername;

      const { data: emailData } = await supabase
        .from('user_accounts')
        .select('*')
        .ilike('email', clean)
        .maybeSingle();
      if (emailData) return this._mapRowToUserAccount(emailData);

      const { data: phoneData } = await supabase
        .from('user_accounts')
        .select('*')
        .eq('phone', clean)
        .maybeSingle();
      if (phoneData) return this._mapRowToUserAccount(phoneData);

      return null;
    } catch (err) {
      console.warn('Supabase getUserAccountByIdentifier exception:', err);
      return null;
    }
  },

  // Get all staff user accounts for a specific VIP
  async getStaffAccounts(vipId?: string): Promise<UserAccount[]> {
    try {
      const targetVipId = vipId || getActiveSessionVipId();
      if (!targetVipId) return [];

      const { data, error } = await supabase
        .from('user_accounts')
        .select('*')
        .eq('role', 'staff')
        .eq('vip_id', targetVipId)
        .order('created_at', { ascending: true });

      if (error) {
        console.warn('Error fetching staff accounts:', error);
        return [];
      }
      return (data || []).map((row: any) => this._mapRowToUserAccount(row));
    } catch (err) {
      console.warn('Supabase getStaffAccounts exception:', err);
      return [];
    }
  },

  // Delete a user account by username, scoped by VIP
  async deleteUserAccount(username: string, vipId?: string): Promise<boolean> {
    try {
      const cleanUsername = username.trim().toLowerCase();
      const targetVipId = vipId || getActiveSessionVipId();
      let query = supabase
        .from('user_accounts')
        .delete()
        .eq('username', cleanUsername);
      if (targetVipId) query = query.eq('vip_id', targetVipId);

      const { error } = await query;
      if (error) console.error('Error deleting user account:', error);
      return !error;
    } catch (err) {
      console.error('Exception deleting user account:', err);
      return false;
    }
  },

  // Update permissions for a user account, scoped by VIP
  async updateUserPermissions(
    username: string,
    permissions: Record<string, boolean>,
    vipId?: string
  ): Promise<boolean> {
    try {
      const cleanUsername = username.trim().toLowerCase();
      const targetVipId = vipId || getActiveSessionVipId();

      // Preserve device push notification metadata if present
      const { data: existingAcc } = await supabase
        .from('user_accounts')
        .select('permissions')
        .eq('username', cleanUsername)
        .maybeSingle();

      const existingPerms = (existingAcc?.permissions || {}) as Record<string, any>;
      const mergedPerms: Record<string, any> = { ...permissions };
      for (const k of ['devicePushToken', 'devicePlatform', 'deviceRegisteredAt', 'deviceRegistration']) {
        if (existingPerms[k] !== undefined) {
          mergedPerms[k] = existingPerms[k];
        }
      }

      let query = supabase
        .from('user_accounts')
        .update({ permissions: mergedPerms, updated_at: new Date().toISOString() })
        .eq('username', cleanUsername);
      if (targetVipId) query = query.eq('vip_id', targetVipId);

      const { error } = await query;
      if (error) console.error('Error updating user permissions:', error);
      return !error;
    } catch (err) {
      console.error('Exception updating permissions:', err);
      return false;
    }
  },

  // Update auth token on user_accounts to establish valid session for RLS
  async updateUserAuthToken(username: string, authToken: string): Promise<boolean> {
    try {
      const cleanUsername = username.trim().toLowerCase();
      const { error } = await supabase
        .from('user_accounts')
        .update({ auth_token: authToken, updated_at: new Date().toISOString() })
        .eq('username', cleanUsername);
      return !error;
    } catch (err) {
      console.warn('Error updating user auth token:', err);
      return false;
    }
  },

  // Save device push token & device registration metadata in user_accounts
  async saveDevicePushToken(
    username: string,
    token: string,
    platform: string,
    registrationData?: any,
    vipId?: string
  ): Promise<boolean> {
    try {
      const cleanUsername = username.trim().toLowerCase();
      const targetVipId = vipId || getActiveSessionVipId();

      const { data: userAcc } = await supabase
        .from('user_accounts')
        .select('permissions')
        .eq('username', cleanUsername)
        .maybeSingle();

      const existingPerms = userAcc?.permissions || {};
      const updatedPerms = {
        ...existingPerms,
        devicePushToken: token,
        devicePlatform: platform,
        deviceRegisteredAt: new Date().toISOString(),
        deviceRegistration: registrationData || null,
      };

      const { error } = await supabase
        .from('user_accounts')
        .update({
          permissions: updatedPerms,
          updated_at: new Date().toISOString(),
        })
        .eq('username', cleanUsername);

      if (error) {
        console.warn('Error saving device push token in Supabase:', error);
        return false;
      }

      // Ensure device_tokens table also gets the active token for cloud push
      if (token && token.length > 20) {
        this.saveDeviceTokenFCM(cleanUsername, token, platform, undefined, targetVipId || undefined).catch((e) =>
          console.warn('[Supabase] Sync to device_tokens table error:', e)
        );
      }

      return true;
    } catch (err) {
      console.warn('Exception saving device push token:', err);
      return false;
    }
  },

  // Query push tokens for targeted usernames
  async getUserPushTokens(usernames?: string[], vipId?: string): Promise<Record<string, string>> {
    try {
      const targetVipId = vipId || getActiveSessionVipId();
      let query = supabase.from('user_accounts').select('username, permissions');
      if (targetVipId) {
        query = query.eq('vip_id', targetVipId);
      }
      if (usernames && usernames.length > 0) {
        query = query.in('username', usernames.map((u) => u.toLowerCase()));
      }
      const { data, error } = await query;
      if (error || !data) return {};

      const map: Record<string, string> = {};
      for (const row of data) {
        const token = row.permissions?.devicePushToken;
        if (token) {
          map[row.username] = token;
        }
      }
      return map;
    } catch (err) {
      return {};
    }
  },

  // ── FCM Device Token Management (device_tokens table) ──────────────────
  async saveDeviceTokenFCM(
    username: string,
    fcmToken: string,
    platform: string,
    deviceId?: string,
    vipId?: string
  ): Promise<boolean> {
    try {
      const cleanUsername = username.trim().toLowerCase();
      const targetVipId = vipId || getActiveSessionVipId();
      const { error } = await supabase
        .from('device_tokens')
        .upsert(
          {
            username: cleanUsername,
            fcm_token: fcmToken,
            platform: platform || 'android',
            device_id: deviceId || null,
            vip_id: targetVipId || null,
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'fcm_token' }
        );

      if (error) {
        console.warn('Error saving FCM device token:', error);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('Exception saving FCM device token:', err);
      return false;
    }
  },

  async deactivateDeviceToken(fcmToken: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('device_tokens')
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq('fcm_token', fcmToken);

      if (error) {
        console.warn('Error deactivating device token:', error);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('Exception deactivating device token:', err);
      return false;
    }
  },

  async deactivateAllUserTokens(username: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('device_tokens')
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq('username', username.trim().toLowerCase());

      if (error) {
        console.warn('Error deactivating all user tokens:', error);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('Exception deactivating all user tokens:', err);
      return false;
    }
  },

  // Helper to map a raw DB row to UserAccount
  _mapRowToUserAccount(data: any): UserAccount {
    return {
      username: data.username,
      vipId: data.vip_id || (data.role === 'vip' ? 'vip_' + data.username : undefined),
      authToken: data.auth_token,
      passwordHash: data.password_hash,
      name: data.name,
      role: data.role as 'vip' | 'staff',
      staffTitle: data.staff_title,
      targetVipUsername: data.target_vip_username,
      approvalStatus: data.approval_status || 'APPROVED',
      phone: data.phone,
      email: data.email,
      phoneVerified: data.phone_verified ?? (data.permissions?.phoneVerified ?? (data.role === 'vip')),
      emailVerified: data.email_verified ?? (data.permissions?.emailVerified ?? false),
      phoneVerifiedAt: data.phone_verified_at ?? data.permissions?.phoneVerifiedAt,
      emailVerifiedAt: data.email_verified_at ?? data.permissions?.emailVerifiedAt,
      pin: data.pin,
      avatar: data.avatar,
      permissions: data.permissions,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      lastLogin: data.last_login,
    };
  },

  // Check if a VIP Principal exists by username (Pre-auth safe RPC)
  async checkVipPrincipalExists(vipUsername: string): Promise<{ exists: boolean; name?: string; username?: string; vipId?: string; error?: string }> {
    try {
      const clean = vipUsername.trim().toLowerCase();
      if (!clean) return { exists: false, error: 'VIP username is required' };

      const { data, error } = await supabase.rpc('check_vip_principal_exists', { p_username: clean });
      if (error) {
        console.warn('Error checking VIP principal existence:', error);
        return { exists: false, error: error.message };
      }
      return data || { exists: false };
    } catch (err: any) {
      console.warn('Exception checking VIP principal existence:', err);
      return { exists: false, error: err.message || 'Network error' };
    }
  },

  // Submit staff registration request to VIP Principal (Creates PENDING_APPROVAL account and VIP notification)
  async submitStaffApprovalRequest(params: {
    username: string;
    passwordHash: string;
    name: string;
    staffTitle: string;
    vipUsername: string;
    phone?: string;
    email?: string;
    pin?: string;
    avatar?: string;
    permissions?: Record<string, boolean>;
  }): Promise<{ success: boolean; error?: string; data?: any }> {
    try {
      const { data, error } = await supabase.rpc('submit_staff_registration_request', {
        p_username: params.username.trim(),
        p_password_hash: params.passwordHash,
        p_name: params.name.trim(),
        p_staff_title: params.staffTitle,
        p_vip_username: params.vipUsername.trim(),
        p_phone: params.phone || null,
        p_email: params.email || null,
        p_pin: params.pin || null,
        p_avatar: params.avatar || null,
        p_permissions: params.permissions || null,
      });

      if (error) {
        return { success: false, error: error.message };
      }
      if (!data?.success) {
        return { success: false, error: data?.error || 'Registration request failed' };
      }

      // Dispatch cloud push notification directly to VIP Principal's registered devices
      const targetVipId = data?.vip_id || `vip_${params.vipUsername.trim().toLowerCase()}`;
      supabase.functions.invoke('send-push-notification', {
        body: {
          record: {
            id: data?.notif_id || `notif_req_${Date.now()}`,
            vip_id: targetVipId,
            type: 'staff_request',
            title: `Staff Request: ${params.name.trim()}`,
            message: `${params.name.trim()} (${params.staffTitle}) requested access. Username: ${params.username.trim()}${params.phone ? ` | Phone: ${params.phone.trim()}` : ''}`,
            read: false,
            timestamp: new Date().toISOString(),
            action_url: '/privileged-users',
            related_entity_id: params.username.trim().toLowerCase(),
          }
        }
      }).catch((e) => {
        console.warn('[Push Dispatch] Exception invoking send-push-notification for staff request:', e);
      });

      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to submit staff registration request' };
    }
  },

  // VIP responds to a staff access request (accept or reject)
  async respondToStaffRequest(staffUsername: string, accept: boolean, vipId?: string): Promise<{ success: boolean; error?: string; status?: string }> {
    try {
      const targetVipId = vipId || getActiveSessionVipId();
      const { data, error } = await supabase.rpc('respond_to_staff_request', {
        p_staff_username: staffUsername.trim().toLowerCase(),
        p_accept: accept,
        p_vip_id: targetVipId || null,
      });

      if (error) {
        console.error('Error responding to staff request:', error);
        return { success: false, error: error.message };
      }
      return { success: data?.success ?? false, error: data?.error, status: data?.approval_status };
    } catch (err: any) {
      console.error('Exception responding to staff request:', err);
      return { success: false, error: err.message || 'Failed to respond to request' };
    }
  },

  // Rejected staff requests a different VIP Principal
  async reassignStaffVipRequest(staffUsername: string, newVipUsername: string): Promise<{ success: boolean; error?: string; data?: any }> {
    try {
      const { data, error } = await supabase.rpc('reassign_staff_vip', {
        p_staff_username: staffUsername.trim().toLowerCase(),
        p_new_vip_username: newVipUsername.trim().toLowerCase(),
      });

      if (error) {
        return { success: false, error: error.message };
      }
      if (!data?.success) {
        return { success: false, error: data?.error || 'Reassignment failed' };
      }
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to reassign VIP' };
    }
  },

  // Verify staff phone OTP code
  async verifyStaffPhone(staffUsername: string, otp: string): Promise<{ success: boolean; error?: string; authToken?: string }> {
    try {
      const { data, error } = await supabase.rpc('verify_staff_phone', {
        p_staff_username: staffUsername.trim().toLowerCase(),
        p_otp: otp.trim(),
      });

      if (error) {
        return { success: false, error: error.message };
      }
      if (!data?.success) {
        return { success: false, error: data?.error || 'Verification failed' };
      }
      return { success: true, authToken: data?.auth_token };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to verify phone' };
    }
  },

  async isUsernameTaken(username: string): Promise<boolean> {
    try {
      const cleanUsername = username.trim().toLowerCase();
      if (!cleanUsername) return false;
      const { data, error } = await supabase.rpc('lookup_user_account', { p_identifier: cleanUsername });
      if (!error && Array.isArray(data) && data.length > 0) {
        return true;
      }
      return false;
    } catch (err) {
      return false;
    }
  },

  async registerUserAccount(account: UserAccount): Promise<{ success: boolean; error?: string }> {
    try {
      const cleanUsername = account.username.trim().toLowerCase();
      const targetVipId = account.vipId || (account.role === 'vip' ? 'vip_' + cleanUsername : 'vip_default');
      const now = new Date().toISOString();
      const enrichedPermissions = {
        ...(account.permissions || {}),
        phoneVerified: account.phoneVerified ?? (account.role === 'vip'),
        emailVerified: account.emailVerified ?? true,
        phoneVerifiedAt: account.phoneVerifiedAt || (account.role === 'vip' ? now : undefined),
        emailVerifiedAt: account.emailVerifiedAt || now,
      };

      // Ensure we only pass columns that exist in public.user_accounts table
      // (email_verified and email_verified_at are safely stored inside the permissions jsonb)
      const basePayload: any = {
        username: cleanUsername,
        vip_id: targetVipId,
        target_vip_username: account.targetVipUsername || null,
        approval_status: account.approvalStatus || (account.role === 'vip' ? 'APPROVED' : 'PENDING_APPROVAL'),
        auth_token: account.authToken || null,
        password_hash: account.passwordHash,
        name: account.name.trim(),
        role: account.role,
        staff_title: account.staffTitle || null,
        phone: account.phone || null,
        email: account.email || null,
        pin: account.pin || null,
        avatar: account.avatar || null,
        permissions: enrichedPermissions,
        phone_verified: account.phoneVerified ?? (account.role === 'vip'),
        phone_verified_at: account.phoneVerifiedAt || (account.role === 'vip' ? now : null),
        created_at: account.createdAt || now,
        updated_at: now,
      };

      console.info(`[Auth Registration] Initiating registration for: ${cleanUsername} (role: ${account.role}, vip_id: ${targetVipId})`);

      // Use INSERT rather than UPSERT to ensure clean RLS policy evaluation without triggering the unauthenticated UPDATE check
      const { error: uaError } = await supabase
        .from('user_accounts')
        .insert(basePayload);

      if (uaError) {
        console.error('[Auth Registration] Failed to insert user_accounts record:', uaError);
        if (uaError.code === '23505') {
          return { success: false, error: `Username "${cleanUsername}" is already registered. Please sign in or choose another username.` };
        }
        return { success: false, error: uaError.message || 'Database error during account registration.' };
      }

      console.info('[Auth Registration] user_accounts record persisted successfully.');

      // If VIP, also insert into vip_users profile table using targetVipId as primary key
      if (account.role === 'vip') {
        const { error: vuError } = await supabase.from('vip_users').insert({
          id: targetVipId,
          username: cleanUsername,
          name: account.name.trim(),
          phone: account.phone || null,
          email: account.email || null,
          pin: account.pin || '1234',
          avatar: account.avatar || null,
          created_at: now,
          updated_at: now,
        });

        if (vuError) {
          console.error('[Auth Registration] Failed to create VIP profile, rolling back user_accounts:', vuError);
          // Rollback orphaned user_accounts record so state remains clean and retriable
          await supabase.from('user_accounts').delete().eq('username', cleanUsername);
          return {
            success: false,
            error: vuError.code === '23505'
              ? `VIP profile for "${cleanUsername}" already exists.`
              : `Failed to create VIP profile: ${vuError.message}`
          };
        }

        console.info('[Auth Registration] vip_users profile record persisted successfully.');
      }

      return { success: true };
    } catch (err: any) {
      console.error('[Auth Registration] Unexpected exception registering user account:', err);
      return { success: false, error: err.message || 'Unexpected registration failure' };
    }
  },

  async updateUserLastLogin(username: string): Promise<void> {
    try {
      const cleanUsername = username.trim().toLowerCase();
      await supabase
        .from('user_accounts')
        .update({ last_login: new Date().toISOString() })
        .eq('username', cleanUsername);
    } catch (err) {
      console.warn('Error updating last login:', err);
    }
  },

  async updateUserPassword(username: string, newPasswordHash: string): Promise<boolean> {
    try {
      const cleanUsername = username.trim().toLowerCase();
      const { error } = await supabase
        .from('user_accounts')
        .update({ password_hash: newPasswordHash, updated_at: new Date().toISOString() })
        .eq('username', cleanUsername);

      return !error;
    } catch (err) {
      console.error('Error updating password:', err);
      return false;
    }
  },

  // ── Scoped Clear Data (Never wipes entire database across other VIPs) ──────
  async clearAllTables(vipId?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const targetVipId = vipId || getActiveSessionVipId();
      if (!targetVipId) {
        return { success: false, error: 'No VIP ID specified for data clear.' };
      }

      const tables = [
        'reminders',
        'invitations',
        'family_events',
        'schedule_items',
        'activity_logs',
        'notifications',
        'people',
        'privileged_users',
      ];

      for (const t of tables) {
        await supabase.from(t).delete().eq('vip_id', targetVipId);
      }

      return { success: true };
    } catch (err: any) {
      console.error('Error clearing database tables:', err);
      return { success: false, error: err.message };
    }
  },

  // ── Health Check / Ping ─────────────────────────────────────────────────────
  async checkConnection(): Promise<{ connected: boolean; tablesFound: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.from('people').select('id').limit(1);
      if (error) {
        if (error.code === 'PGRST205' || error.message.includes('schema cache')) {
          return { connected: true, tablesFound: false, error: 'Tables not yet created in Supabase.' };
        }
        return { connected: false, tablesFound: false, error: error.message };
      }
      return { connected: true, tablesFound: true };
    } catch (e: any) {
      return { connected: false, tablesFound: false, error: e.message };
    }
  },
};
