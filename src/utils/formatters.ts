import { format, formatDistanceToNow, parseISO, isToday, isTomorrow, differenceInDays } from 'date-fns';
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
  try {
    return differenceInDays(parseISO(dateStr), new Date());
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
  const dict = translations[activeLang]?.protocols || translations.en.protocols;
  return (dict as any)[cat] || cat;
}

export function getRelationshipLabel(rel: string, lang?: LanguageCode): string {
  const activeLang = lang || (useAppStore.getState ? useAppStore.getState().language : 'en') || 'en';
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
