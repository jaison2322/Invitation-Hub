import { format, formatDistanceToNow, parseISO, isToday, isTomorrow, differenceInDays, differenceInCalendarDays } from 'date-fns';
import { useAppStore } from '../store/useAppStore';
import { translations } from '../i18n/translations';
import type { Priority, EventType, InvitationStatus, GiftCategory, LanguageCode } from '../types';

export function formatDate(dateStr: string): string {
  try {
    const date = parseISO(dateStr);
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'EEE, MMM d');
  } catch {
    return dateStr;
  }
}

export function formatFullDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'EEEE, MMMM d, yyyy');
  } catch {
    return dateStr;
  }
}

export function formatTime(timeStr: string): string {
  if (!timeStr) return '';
  const [hours, minutes] = timeStr.split(':').map(Number);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}

export function formatTimeAgo(dateStr: string): string {
  try {
    return formatDistanceToNow(parseISO(dateStr), { addSuffix: true });
  } catch {
    return '';
  }
}

export function daysUntil(dateStr: string): number {
  if (!dateStr || typeof dateStr !== 'string') return 0;
  try {
    const parsed = parseISO(dateStr);
    const diff = differenceInCalendarDays(parsed, new Date());
    return Number.isNaN(diff) ? 0 : diff;
  } catch {
    return 0;
  }
}

export function getPriorityColor(priority: Priority): string {
  switch (priority) {
    case 'high': return 'var(--color-priority-high)';
    case 'medium': return 'var(--color-priority-medium)';
    case 'low': return 'var(--color-priority-low)';
  }
}

export function getPriorityLabel(priority: Priority, lang?: LanguageCode): string {
  const activeLang = lang || (useAppStore.getState ? useAppStore.getState().language : 'en') || 'en';
  const dict = translations[activeLang]?.protocols || translations.en.protocols;
  return dict[priority] || priority.charAt(0).toUpperCase() + priority.slice(1);
}

export function getStatusLabel(status: InvitationStatus, lang?: LanguageCode): string {
  const activeLang = lang || (useAppStore.getState ? useAppStore.getState().language : 'en') || 'en';
  const dict = translations[activeLang]?.protocols || translations.en.protocols;
  return dict[status] || (status === 'pending' ? 'Pending Review' : status === 'confirmed' ? 'Confirmed' : 'Ignored');
}

export function getEventTypeLabel(type: EventType, lang?: LanguageCode): string {
  const activeLang = lang || (useAppStore.getState ? useAppStore.getState().language : 'en') || 'en';
  const dict = translations[activeLang]?.protocols || translations.en.protocols;
  return (dict as any)[type] || type;
}

export function getEventTypeIcon(_type: EventType): string {
  // Deprecated in favor of EventBadgeIcon component. Returns clean empty string.
  return '';
}

export function getGiftCategoryLabel(cat: GiftCategory, lang?: LanguageCode): string {
  const activeLang = lang || (useAppStore.getState ? useAppStore.getState().language : 'en') || 'en';
  if (cat === 'other') {
    const otherLabels: Record<string, string> = {
      en: 'Other',
      hi: 'अन्य',
      ta: 'மற்றவை',
      te: 'ఇతర',
      kn: 'ಇತರ',
      ml: 'മറ്റുള്ളവ',
      es: 'Otro',
      fr: 'Autre',
    };
    return otherLabels[activeLang] || 'Other';
  }
  const dict = translations[activeLang]?.protocols || translations.en.protocols;
  return (dict as any)[cat] || cat;
}

export function getRelationshipLabel(rel: string, lang?: LanguageCode): string {
  const activeLang = lang || (useAppStore.getState ? useAppStore.getState().language : 'en') || 'en';
  if (rel === 'other') {
    const otherLabels: Record<string, string> = {
      en: 'Other',
      hi: 'अन्य',
      ta: 'மற்றவை',
      te: 'ఇతర',
      kn: 'ಇತರ',
      ml: 'മറ്റുള്ളവ',
      es: 'Otro',
      fr: 'Autre',
    };
    return otherLabels[activeLang] || 'Other';
  }
  const dict = translations[activeLang]?.protocols || translations.en.protocols;
  return (dict as any)[rel] || rel;
}

export function getInitials(name?: string): string {
  if (!name || !name.trim()) return 'VI';
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase()
    .substring(0, 2) || 'VI';
}

export function formatCurrency(value: number): string {
  return `₹${value.toLocaleString('en-IN')}`;
}

/**
 * Returns today's calendar date string in YYYY-MM-DD format using local time.
 */
export function getLocalTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Evaluates whether an invitation is strictly in the Past by calendar date.
 * - Event Date >= Today -> Upcoming (false) - stays in Upcoming for the entire day.
 * - Event Date < Today  -> Past (true) - moved to Past when the calendar day has ended.
 * - Missing/invalid date -> Upcoming (false) - safety fallback so data is not lost or arbitrarily moved.
 */
export function isInvitationPastByDate(
  inv: { date?: string },
  todayStr: string = getLocalTodayDateString()
): boolean {
  if (!inv || !inv.date || typeof inv.date !== 'string') {
    return false;
  }

  const trimmed = inv.date.trim();
  if (!trimmed) return false;

  const datePart = trimmed.includes('T') ? trimmed.split('T')[0] : trimmed;
  const parts = datePart.split('-');
  if (parts.length < 3) return false;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  if (isNaN(year) || isNaN(month) || isNaN(day) || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const normalizedEventDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return normalizedEventDate < todayStr;
}
