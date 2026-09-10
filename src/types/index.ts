// ─── Priority & Status Enums ─────────────────────────────────────────────────

export type Priority = 'high' | 'medium' | 'low';
export type InvitationStatus = 'pending' | 'confirmed' | 'ignored';
export type GiftCategory = 'gold' | 'silver' | 'cash' | 'clothing' | 'electronics' | 'household' | 'jewelry' | 'other';
export type RelationshipType =
  | 'business_partner'
  | 'client'
  | 'colleague'
  | 'friend'
  | 'family'
  | 'relative'
  | 'neighbor'
  | 'acquaintance'
  | 'other';

export type PermissionKey =
  | 'canAddInvitations'
  | 'canEditEvents'
  | 'canChangePriority'
  | 'canManageSchedule'
  | 'canViewGiftHistory'
  | 'canAddPeople';

export type EventType =
  | 'wedding'
  | 'engagement'
  | 'birthday'
  | 'anniversary'
  | 'house_warming'
  | 'baby_shower'
  | 'graduation'
  | 'retirement'
  | 'funeral'
  | 'business_event'
  | 'reception'
  | 'cultural'
  | 'religious'
  | 'other';

// ─── Core Entities ───────────────────────────────────────────────────────────

export interface UserAccount {
  username: string; // Primary key in database
  passwordHash: string;
  name: string;
  role: 'vip' | 'staff';
  staffTitle?: string;
  phone?: string;
  email?: string;
  phoneVerified?: boolean;
  emailVerified?: boolean;
  phoneVerifiedAt?: string;
  emailVerifiedAt?: string;
  pin?: string;
  avatar?: string;
  permissions?: Record<PermissionKey, boolean>;
  createdAt: string;
  updatedAt?: string;
  lastLogin?: string;
}

export interface VIPUser {
  id: string;
  username?: string;
  passwordHash?: string;
  name: string;
  phone?: string;
  email?: string;
  phoneVerified?: boolean;
  emailVerified?: boolean;
  phoneVerifiedAt?: string;
  emailVerifiedAt?: string;
  pin?: string;
  avatar?: string;
  createdAt: string;
}

export interface PrivilegedUser {
  id: string;
  username?: string;
  passwordHash?: string;
  name: string;
  role: string;
  pin?: string;
  phone?: string;
  email?: string;
  phoneVerified?: boolean;
  emailVerified?: boolean;
  phoneVerifiedAt?: string;
  emailVerifiedAt?: string;
  permissions: Record<PermissionKey, boolean>;
  addedBy: string;
  addedAt: string;
  lastActive?: string;
}

export type VerificationChannel = 'phone' | 'email';

export interface VerificationSession {
  target: string;
  channel: VerificationChannel;
  code: string;
  expiresAt: number;
  attemptsLeft: number;
  verified: boolean;
  lastSentAt: number;
  isSupabaseLive?: boolean;
  supabaseMessage?: string;
  supabaseUserId?: string;
}

export interface Person {
  id: string;
  name: string;
  nickname: string;
  relationship: RelationshipType;
  phone?: string;
  email?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Invitation {
  id: string;
  personId?: string;
  eventType: EventType;
  title: string;
  nickname?: string;
  mainPerson?: string;
  hostName?: string;
  date: string; // ISO date string
  time?: string;
  venue?: string;
  location?: string;
  description?: string;
  priority: Priority;
  aiSuggestedPriority?: Priority;
  aiReason?: string;
  status: InvitationStatus;
  imageId?: string;
  ocrText?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

export interface FamilyEvent {
  id: string;
  name: string;
  eventType: EventType;
  date: string;
  familyMember: string;
  description?: string;
  venue?: string;
  guests: GuestRecord[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GuestRecord {
  id: string;
  personId: string;
  personName: string;
  relationship?: RelationshipType;
  attendance: 'attended' | 'invited_not_attended' | 'unknown';
  gift?: string;
  giftDescription?: string;
  giftCategory?: GiftCategory;
  estimatedValue?: number;
  notes?: string;
}

export interface ScheduleItem {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime?: string;
  type: 'meeting' | 'event' | 'personal' | 'travel' | 'other';
  location?: string;
  notes?: string;
  createdAt: string;
}

export interface Reminder {
  id: string;
  eventId: string;
  eventTitle: string;
  daysBeforeEvent: number;
  date: string;
  message: string;
  read: boolean;
  priority: Priority;
}

export interface ActivityLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  entityType: string;
  entityId: string;
  entityName?: string;
  previousValue?: string;
  newValue?: string;
  timestamp: string;
}

export interface Notification {
  id: string;
  type: 'change_alert' | 'new_invitation' | 'reminder' | 'conflict_warning' | 'system';
  title: string;
  message: string;
  read: boolean;
  timestamp: string;
  actionUrl?: string;
  relatedEntityId?: string;
}

export interface AIAnalysis {
  id: string;
  invitationId: string;
  ocrText: string;
  extractedFields: ExtractedFields;
  confidence: number;
  relatedPerson?: Person;
  relationshipHistory: RelationshipHistoryItem[];
  giftHistory: GiftHistoryItem[];
  scheduleConflicts: ScheduleConflict[];
  suggestedPriority: Priority;
  priorityReason: string;
}

export interface ExtractedFields {
  eventType?: EventType;
  title?: string;
  mainPerson?: string;
  hostName?: string;
  date?: string;
  time?: string;
  venue?: string;
  location?: string;
  description?: string;
  confidence: Record<string, number>; // field name → confidence 0-1
}

export interface RelationshipHistoryItem {
  eventName: string;
  eventDate: string;
  eventType: EventType;
  role: string; // 'attended', 'invited', etc.
}

export interface GiftHistoryItem {
  eventName: string;
  eventDate: string;
  gift: string;
  giftCategory?: GiftCategory;
  estimatedValue?: number;
}

export interface ScheduleConflict {
  conflictingItemId: string;
  conflictingItemTitle: string;
  conflictingTime: string;
  type: 'time_overlap' | 'same_day';
}

// ─── UI State Types ──────────────────────────────────────────────────────────

export type Screen =
  | 'splash'
  | 'login'
  | 'dashboard'
  | 'scan'
  | 'ai-processing'
  | 'extracted-details'
  | 'confirm-ignore'
  | 'upcoming'
  | 'calendar'
  | 'event-detail'
  | 'person-profile'
  | 'past-events'
  | 'gift-history'
  | 'add-edit-event'
  | 'schedule-conflict'
  | 'reminders'
  | 'privileged-users'
  | 'permissions'
  | 'notifications'
  | 'activity-history'
  | 'settings';

export interface ScanResult {
  imageDataUrl: string;
  ocrText: string;
  extractedFields: ExtractedFields;
  analysis: AIAnalysis;
}

// ─── Multilingual Localization Types ──────────────────────────────────────────

export type LanguageCode = 'en' | 'hi' | 'ta' | 'te' | 'kn' | 'ml' | 'es' | 'fr';

export interface LanguageOption {
  code: LanguageCode;
  name: string;
  nativeName: string;
  region: string;
  flag?: string;
}

