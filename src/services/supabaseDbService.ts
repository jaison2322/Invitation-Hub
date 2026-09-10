import { supabase } from '../utils/supabase';
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

// ─── Supabase Database Service ────────────────────────────────────────────────
// Handles all CRUD operations with the live Supabase PostgreSQL database

export const supabaseDbService = {
  // ── People ──────────────────────────────────────────────────────────────────
  async getPeople(): Promise<Person[]> {
    const { data, error } = await supabase
      .from('people')
      .select('*')
      .order('name');
    if (error) {
      console.error('Error fetching people:', error);
      return [];
    }
    return (data || []).map((row) => ({
      id: row.id,
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

  async insertPerson(person: Person): Promise<boolean> {
    const { error } = await supabase.from('people').upsert({
      id: person.id,
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

  async deletePerson(id: string): Promise<boolean> {
    const { error } = await supabase.from('people').delete().eq('id', id);
    if (error) console.error('Error deleting person:', error);
    return !error;
  },

  // ── Invitations ─────────────────────────────────────────────────────────────
  async getInvitations(): Promise<Invitation[]> {
    const { data, error } = await supabase
      .from('invitations')
      .select('*')
      .order('date', { ascending: true });
    if (error) {
      console.error('Error fetching invitations:', error);
      return [];
    }
    return (data || []).map((row) => ({
      id: row.id,
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

  async insertInvitation(inv: Invitation): Promise<boolean> {
    const { error } = await supabase.from('invitations').upsert({
      id: inv.id,
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

  async updateInvitationStatus(id: string, status: string): Promise<boolean> {
    const { error } = await supabase
      .from('invitations')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) console.error('Error updating invitation status:', error);
    return !error;
  },

  async deleteInvitation(id: string): Promise<boolean> {
    const { error } = await supabase.from('invitations').delete().eq('id', id);
    if (error) console.error('Error deleting invitation:', error);
    return !error;
  },

  // ── Family Events ───────────────────────────────────────────────────────────
  async getFamilyEvents(): Promise<FamilyEvent[]> {
    const { data, error } = await supabase
      .from('family_events')
      .select('*')
      .order('date', { ascending: false });
    if (error) {
      console.error('Error fetching family events:', error);
      return [];
    }
    return (data || []).map((row) => ({
      id: row.id,
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

  async insertFamilyEvent(event: FamilyEvent): Promise<boolean> {
    const { error } = await supabase.from('family_events').upsert({
      id: event.id,
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

  // ── Schedule Items ──────────────────────────────────────────────────────────
  async getSchedule(): Promise<ScheduleItem[]> {
    const { data, error } = await supabase
      .from('schedule_items')
      .select('*')
      .order('date', { ascending: true });
    if (error) {
      console.error('Error fetching schedule:', error);
      return [];
    }
    return (data || []).map((row) => ({
      id: row.id,
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

  async insertScheduleItem(item: ScheduleItem): Promise<boolean> {
    const { error } = await supabase.from('schedule_items').upsert({
      id: item.id,
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

  // ── Reminders ───────────────────────────────────────────────────────────────
  async getReminders(): Promise<Reminder[]> {
    const { data, error } = await supabase
      .from('reminders')
      .select('*')
      .order('date', { ascending: true });
    if (error) {
      console.error('Error fetching reminders:', error);
      return [];
    }
    return (data || []).map((row) => ({
      id: row.id,
      eventId: row.event_id,
      eventTitle: row.event_title,
      daysBeforeEvent: row.days_before_event,
      date: row.date,
      message: row.message,
      read: row.read,
      priority: row.priority,
    }));
  },

  // ── Activity Logs ───────────────────────────────────────────────────────────
  async getActivityLogs(): Promise<ActivityLog[]> {
    try {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(200);

      if (error) {
        console.error('Error fetching activity logs:', error);
        return [];
      }
      return (data || []).map((row) => ({
        id: row.id,
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

  async insertActivityLog(log: ActivityLog): Promise<boolean> {
    try {
      const { error } = await supabase.from('activity_logs').upsert({
        id: log.id,
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

  async deleteActivityLog(id: string): Promise<boolean> {
    try {
      const { error } = await supabase.from('activity_logs').delete().eq('id', id);
      if (error) console.error('Error deleting activity log:', error);
      return !error;
    } catch (err) {
      console.warn('Supabase deleteActivityLog exception:', err);
      return false;
    }
  },

  async clearActivityLogs(): Promise<boolean> {
    try {
      const { error } = await supabase.from('activity_logs').delete().neq('id', '__none__');
      if (error) console.error('Error clearing activity logs:', error);
      return !error;
    } catch (err) {
      console.warn('Supabase clearActivityLogs exception:', err);
      return false;
    }
  },

  // ── Notifications ───────────────────────────────────────────────────────────
  async getNotifications(): Promise<Notification[]> {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(100);

      if (error) {
        console.error('Error fetching notifications:', error);
        return [];
      }
      return (data || []).map((row) => ({
        id: row.id,
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

  async insertNotification(notif: Notification): Promise<boolean> {
    try {
      const { error } = await supabase.from('notifications').upsert({
        id: notif.id,
        type: notif.type,
        title: notif.title,
        message: notif.message,
        read: Boolean(notif.read),
        timestamp: notif.timestamp || new Date().toISOString(),
        action_url: notif.actionUrl || null,
        related_entity_id: notif.relatedEntityId || null,
      });
      if (error) console.error('Error saving notification:', error);
      return !error;
    } catch (err) {
      console.warn('Supabase insertNotification exception:', err);
      return false;
    }
  },

  async updateNotificationRead(id: string, read: boolean): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read })
        .eq('id', id);
      if (error) console.error('Error updating notification read:', error);
      return !error;
    } catch (err) {
      console.warn('Supabase updateNotificationRead exception:', err);
      return false;
    }
  },

  async markAllNotificationsRead(): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('read', false);
      if (error) console.error('Error marking all notifications read:', error);
      return !error;
    } catch (err) {
      console.warn('Supabase markAllNotificationsRead exception:', err);
      return false;
    }
  },

  async deleteNotification(id: string): Promise<boolean> {
    try {
      const { error } = await supabase.from('notifications').delete().eq('id', id);
      if (error) console.error('Error deleting notification:', error);
      return !error;
    } catch (err) {
      console.warn('Supabase deleteNotification exception:', err);
      return false;
    }
  },

  async clearNotifications(): Promise<boolean> {
    try {
      const { error } = await supabase.from('notifications').delete().neq('id', '__none__');
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

  // Flexible lookup: search by username, email, name, or phone
  async getUserAccountByIdentifier(identifier: string): Promise<UserAccount | null> {
    try {
      const clean = identifier.trim().toLowerCase();
      if (!clean) return null;

      // 1. Try exact username match first
      const byUsername = await this.getUserAccount(clean);
      if (byUsername) return byUsername;

      // 2. Try email match
      const { data: emailData } = await supabase
        .from('user_accounts')
        .select('*')
        .ilike('email', clean)
        .maybeSingle();
      if (emailData) return this._mapRowToUserAccount(emailData);

      // 3. Try name match (case-insensitive)
      const { data: nameData } = await supabase
        .from('user_accounts')
        .select('*')
        .ilike('name', clean)
        .maybeSingle();
      if (nameData) return this._mapRowToUserAccount(nameData);

      // 4. Try phone match
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

  // Get all staff user accounts
  async getStaffAccounts(): Promise<UserAccount[]> {
    try {
      const { data, error } = await supabase
        .from('user_accounts')
        .select('*')
        .eq('role', 'staff')
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

  // Delete a user account by username
  async deleteUserAccount(username: string): Promise<boolean> {
    try {
      const cleanUsername = username.trim().toLowerCase();
      const { error } = await supabase
        .from('user_accounts')
        .delete()
        .eq('username', cleanUsername);
      if (error) console.error('Error deleting user account:', error);
      return !error;
    } catch (err) {
      console.error('Exception deleting user account:', err);
      return false;
    }
  },

  // Update permissions for a user account
  async updateUserPermissions(username: string, permissions: Record<string, boolean>): Promise<boolean> {
    try {
      const cleanUsername = username.trim().toLowerCase();
      const { error } = await supabase
        .from('user_accounts')
        .update({ permissions, updated_at: new Date().toISOString() })
        .eq('username', cleanUsername);
      if (error) console.error('Error updating user permissions:', error);
      return !error;
    } catch (err) {
      console.error('Exception updating permissions:', err);
      return false;
    }
  },

  // Helper to map a raw DB row to UserAccount
  _mapRowToUserAccount(data: any): UserAccount {
    return {
      username: data.username,
      passwordHash: data.password_hash,
      name: data.name,
      role: data.role as 'vip' | 'staff',
      staffTitle: data.staff_title,
      phone: data.phone,
      email: data.email,
      phoneVerified: data.phone_verified ?? (data.permissions?.phoneVerified ?? false),
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

  async isUsernameTaken(username: string): Promise<boolean> {
    try {
      const cleanUsername = username.trim().toLowerCase();
      const { data, error } = await supabase
        .from('user_accounts')
        .select('username')
        .eq('username', cleanUsername)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.warn('Error checking username availability:', error);
        return false;
      }
      return !!data;
    } catch (err) {
      return false;
    }
  },

  async registerUserAccount(account: UserAccount): Promise<{ success: boolean; error?: string }> {
    try {
      const cleanUsername = account.username.trim().toLowerCase();
      const enrichedPermissions = {
        ...(account.permissions || {}),
        phoneVerified: account.phoneVerified ?? true,
        emailVerified: account.emailVerified ?? true,
        phoneVerifiedAt: account.phoneVerifiedAt || new Date().toISOString(),
        emailVerifiedAt: account.emailVerifiedAt || new Date().toISOString(),
      };

      // Base payload compatible with existing database table
      const basePayload: any = {
        username: cleanUsername,
        password_hash: account.passwordHash,
        name: account.name.trim(),
        role: account.role,
        staff_title: account.staffTitle,
        phone: account.phone,
        email: account.email,
        pin: account.pin,
        avatar: account.avatar,
        permissions: enrichedPermissions,
        created_at: account.createdAt || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Attempt upsert with top-level verification fields
      let { error } = await supabase.from('user_accounts').upsert(
        {
          ...basePayload,
          phone_verified: account.phoneVerified ?? true,
          email_verified: account.emailVerified ?? true,
        },
        { onConflict: 'username' }
      );

      // If columns don't exist yet in remote PostgreSQL, fall back to basePayload (permissions JSON stores it)
      if (error && (error.message?.includes('column') || error.code === 'PGRST204')) {
        const retryResult = await supabase.from('user_accounts').upsert(
          basePayload,
          { onConflict: 'username' }
        );
        error = retryResult.error;
      }

      if (error) {
        console.error('Error registering user in Supabase:', error);
        return { success: false, error: error.message };
      }

      // If VIP, also sync to vip_users table
      if (account.role === 'vip') {
        await supabase.from('vip_users').upsert({
          id: 'vip-main',
          username: cleanUsername,
          name: account.name.trim(),
          phone: account.phone,
          email: account.email,
          pin: account.pin || '1234',
          avatar: account.avatar,
          updated_at: new Date().toISOString(),
        });
      }

      return { success: true };
    } catch (err: any) {
      console.error('Exception registering user account:', err);
      return { success: false, error: err.message || 'Database error occurred' };
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

  // ── Clear All Database Tables ───────────────────────────────────────────────
  async clearAllTables(): Promise<{ success: boolean; error?: string }> {
    try {
      const tables = [
        { name: 'reminders', col: 'id' },
        { name: 'invitations', col: 'id' },
        { name: 'family_events', col: 'id' },
        { name: 'schedule_items', col: 'id' },
        { name: 'activity_logs', col: 'id' },
        { name: 'notifications', col: 'id' },
        { name: 'people', col: 'id' },
        { name: 'privileged_users', col: 'id' },
        { name: 'vip_users', col: 'id' },
        { name: 'user_accounts', col: 'username' },
      ];

      for (const t of tables) {
        await supabase.from(t.name).delete().neq(t.col, '__none__');
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
        // Table does not exist in schema cache yet
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
