import type {
  ExtractedFields,
  AIAnalysis,
  Person,
  EventType,
  Priority,
  InvitationStatus,
  Invitation,
  CanonicalManualInvitationData,
} from '../types';
import { getEventTypeLabel } from '../utils/formatters';
import { generateId } from '../utils/id';
import { storageService } from './storageService';

export type { CanonicalManualInvitationData };

export const VALID_EVENT_TYPES: EventType[] = [
  'wedding',
  'engagement',
  'reception',
  'birthday',
  'anniversary',
  'house_warming',
  'baby_shower',
  'business_event',
  'cultural',
  'religious',
  'graduation',
  'retirement',
  'other',
];

/**
 * Normalizes raw AI/OCR extraction into the exact Manual Add Invitation format.
 * No information is invented: unextracted fields remain empty or receive standard defaults.
 */
export function mapScanToManualForm(
  extracted: ExtractedFields,
  analysis: AIAnalysis,
  people: Person[] = [],
  canConfirmIgnore: boolean = true
): CanonicalManualInvitationData {
  // 1. Host Name: host/family from card or matched person
  const detectedHost = (extracted.hostName || '').trim();
  const matchedPerson = analysis.relatedPerson || (detectedHost ? people.find((p) => p.name.toLowerCase() === detectedHost.toLowerCase() || p.nickname.toLowerCase() === detectedHost.toLowerCase()) : undefined);
  const hostName = detectedHost || (matchedPerson ? matchedPerson.name : '');

  // 2. Event Category: normalize to valid EventType or default to 'wedding'
  let eventType: EventType = 'wedding';
  if (extracted.eventType && VALID_EVENT_TYPES.includes(extracted.eventType)) {
    eventType = extracted.eventType;
  }

  // 3. Main Person (couple / principal)
  const mainPerson = (extracted.mainPerson || '').trim();

  // 4. Invitation Title:
  // If AI extracted a descriptive title, use it.
  // Otherwise generate from hostName / mainPerson + eventType, matching manual format.
  let title = (extracted.title || '').trim();
  if (!title || title.toLowerCase() === 'new event' || title.toLowerCase() === 'invitation') {
    if (hostName) {
      title = `${hostName}'s ${getEventTypeLabel(eventType)}`;
    } else if (mainPerson) {
      title = `${mainPerson}'s ${getEventTypeLabel(eventType)}`;
    } else {
      title = getEventTypeLabel(eventType);
    }
  }

  // 5. Priority: from AI suggested priority or default 'medium' (Tier 2)
  const priority: Priority = analysis.suggestedPriority || 'medium';

  // 6. Date: YYYY-MM-DD validation (do not invent dates)
  let date = '';
  if (extracted.date && /^\d{4}-\d{2}-\d{2}$/.test(extracted.date.trim())) {
    date = extracted.date.trim();
  }

  // 7. Time: HH:mm 24-hr format (default '18:00' like manual form)
  let time = '18:00';
  if (extracted.time && /^\d{1,2}:\d{2}$/.test(extracted.time.trim())) {
    const parts = extracted.time.trim().split(':');
    const hh = parts[0].padStart(2, '0');
    const mm = parts[1];
    time = `${hh}:${mm}`;
  }

  // 8. Contact Link (personId): matched contact ID if found
  const personId = matchedPerson?.id || (analysis.relatedPerson?.id || '');

  // 9. Venue & Location
  const venue = (extracted.venue || '').trim();
  const location = (extracted.location || '').trim();

  // 10. Status: default according to privileges ('confirmed' for VIP/manager, 'pending' for staff)
  const status: InvitationStatus = canConfirmIgnore ? 'confirmed' : 'pending';

  // 11. Description / Notes / Dress Code / Gift Context
  const description = (extracted.description || '').trim();

  // 12. Confidence map
  const confidence = extracted.confidence || {};

  return {
    hostName,
    title,
    eventType,
    priority,
    date,
    time,
    personId,
    venue,
    location,
    status,
    description,
    mainPerson: mainPerson || undefined,
    confidence,
  };
}

export interface SaveCanonicalInvitationParams {
  formData: CanonicalManualInvitationData;
  rawImage?: string | null;
  ocrText?: string;
  aiReason?: string;
  isVIP: boolean;
  currentPrivilegedUser: any;
  currentUser: any;
  activeVipId?: string | null;
  addInvitation: (invData: Omit<Invitation, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Invitation;
  addActivityLog: (log: any) => void;
  addNotification: (notif: any) => void;
}

/**
 * Shared canonical save logic used by both Scan and Manual flows.
 * Persists the exact same database structure and preserves the invitation photo.
 */
export async function saveCanonicalInvitation(
  params: SaveCanonicalInvitationParams
): Promise<Invitation> {
  const {
    formData,
    rawImage,
    ocrText,
    aiReason,
    isVIP,
    currentPrivilegedUser,
    currentUser,
    activeVipId,
    addInvitation,
    addActivityLog,
    addNotification,
  } = params;

  const canConfirmIgnore = isVIP || currentPrivilegedUser?.permissions?.canConfirmIgnoreInvitations === true;
  const effectiveStatus: InvitationStatus = canConfirmIgnore ? formData.status : 'pending';
  const resolvedTitle = (formData.title.trim() || formData.hostName.trim() || 'New Invitation');
  const invId = generateId('inv');

  const targetVipId =
    activeVipId ||
    (isVIP
      ? currentUser?.vipId || (currentUser?.username ? `vip_${currentUser.username}` : undefined)
      : currentPrivilegedUser?.vipId) ||
    'vip_default';

  let imageId: string | undefined;
  let imageUrl: string | undefined;

  // Upload original invitation photo to Supabase Storage with VIP isolation
  if (rawImage) {
    try {
      const uploadRes = await storageService.uploadInvitationImage(rawImage, targetVipId, invId);
      if (uploadRes) {
        imageId = uploadRes.path;
        imageUrl = uploadRes.signedUrl;
      } else {
        imageUrl = rawImage;
      }
    } catch (uploadErr) {
      console.warn('[SaveCanonicalInvitation] Photo upload failed, using fallback:', uploadErr);
      imageUrl = rawImage;
    }
  }

  const creatorLabel = isVIP ? 'VIP Principal' : (currentPrivilegedUser?.name || 'Staff');
  const creatorId = isVIP ? 'vip' : (currentPrivilegedUser?.id || 'staff');

  const createdInv = addInvitation({
    id: invId,
    title: resolvedTitle,
    eventType: formData.eventType,
    date: formData.date || new Date().toISOString().split('T')[0],
    time: formData.time || undefined,
    venue: formData.venue.trim() || undefined,
    location: formData.location.trim() || undefined,
    hostName: formData.hostName.trim() || undefined,
    mainPerson: formData.mainPerson?.trim() || undefined,
    personId: formData.personId || undefined,
    priority: formData.priority,
    aiSuggestedPriority: formData.priority,
    aiReason: aiReason || undefined,
    status: effectiveStatus,
    description: formData.description.trim() || undefined,
    imageId,
    imageUrl,
    ocrText: ocrText || undefined,
    createdBy: creatorId,
  });

  // Record Activity Log
  addActivityLog({
    vipId: targetVipId,
    userId: creatorId,
    userName: creatorLabel,
    action: `Added invitation "${createdInv.title}" (${effectiveStatus.toUpperCase()})`,
    entityType: 'invitation',
    entityId: createdInv.id,
    entityName: createdInv.title,
  });

  // Record Notification
  addNotification({
    type: 'new_invitation',
    title: effectiveStatus === 'pending'
      ? `New Invitation Submitted: ${createdInv.title}`
      : `New Invitation Added: ${createdInv.title}`,
    message: effectiveStatus === 'pending'
      ? `${createdInv.title} was submitted by ${creatorLabel}. Awaiting VIP decision.`
      : `${createdInv.title} recorded for ${createdInv.date}.`,
    read: false,
    relatedEntityId: createdInv.id,
    actionUrl: `/event/${createdInv.id}`,
  });

  return createdInv;
}
