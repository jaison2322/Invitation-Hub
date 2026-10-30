import React, { useState, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import {
  Calendar,
  MapPin,
  User,
  Search,
  X,
  Plus,
  Edit3,
  Clock,
  Sparkles,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import {
  formatDate,
  formatCurrency,
  getLocalTodayDateString,
  isInvitationPastByDate,
} from '../utils/formatters';
import type { GiftCategory, GiftRecord } from '../types';

export interface SelectedEventSummary {
  id: string;
  title: string;
  date: string;
  hostName?: string;
  venue?: string;
  eventType?: string;
  isPast: boolean;
}

// ─── 1. SELECT EVENT MODAL ───────────────────────────────────────────────────
interface SelectEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectEvent: (event: SelectedEventSummary) => void;
}

export function SelectEventModal({
  isOpen,
  onClose,
  onSelectEvent,
}: SelectEventModalProps) {
  const { invitations, familyEvents } = useAppStore();
  const [search, setSearch] = useState('');
  const [eventFilter, setEventFilter] = useState<'all' | 'past' | 'upcoming'>('past');

  const todayStr = useMemo(() => getLocalTodayDateString(), []);

  // Normalize all available events from invitations and familyEvents
  const allEvents: SelectedEventSummary[] = useMemo(() => {
    const list: SelectedEventSummary[] = [];

    // 1. Invitations (Functions hosted by others)
    invitations.forEach((inv) => {
      const isPast = isInvitationPastByDate(inv, todayStr);
      list.push({
        id: inv.id,
        title: inv.title,
        date: inv.date,
        hostName: inv.hostName || inv.mainPerson || undefined,
        venue: inv.venue || inv.location || undefined,
        eventType: inv.eventType,
        isPast,
      });
    });

    // 2. Family Events (Past functions hosted by family)
    familyEvents.forEach((fe) => {
      list.push({
        id: fe.id,
        title: fe.name,
        date: fe.date,
        hostName: fe.familyMember || 'Family Function',
        venue: fe.venue || undefined,
        eventType: fe.eventType,
        isPast: true, // Family events are past functions
      });
    });

    return list;
  }, [invitations, familyEvents, todayStr]);

  // Filter and sort events: Prioritize Ended/Past events, then sort newest first
  const filteredEvents = useMemo(() => {
    return allEvents
      .filter((ev) => {
        if (eventFilter === 'past' && !ev.isPast) return false;
        if (eventFilter === 'upcoming' && ev.isPast) return false;
        if (search) {
          const q = search.trim().toLowerCase();
          const title = (ev.title || '').toLowerCase();
          const host = (ev.hostName || '').toLowerCase();
          const venue = (ev.venue || '').toLowerCase();
          return title.includes(q) || host.includes(q) || venue.includes(q);
        }
        return true;
      })
      .sort((a, b) => {
        // Prioritize past events when in 'all' view
        if (eventFilter === 'all' && a.isPast !== b.isPast) {
          return a.isPast ? -1 : 1;
        }
        return b.date.localeCompare(a.date);
      });
  }, [allEvents, eventFilter, search]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay modal-centered" onClick={onClose}>
      <div
        className="modal-dialog animate-scale-in"
        style={{ maxWidth: '480px', width: '92%', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-glass-border">
          <div>
            <h3 className="text-base font-bold text-white tracking-tight" style={{ margin: 0 }}>
              Select Event / Function
            </h3>
            <p className="text-xs text-muted mt-0.5" style={{ margin: 0 }}>
              Choose the function for which this gift was given
            </p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Search & Filter Controls */}
        <div className="pt-3 pb-2">
          <div className="search-bar mb-2.5">
            <Search size={15} className="search-bar-icon" />
            <input
              placeholder="Search by event name, host, place..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="segmented-control">
            <button
              type="button"
              className={`segmented-item ${eventFilter === 'past' ? 'active' : ''}`}
              onClick={() => setEventFilter('past')}
              style={{ fontSize: '12px', padding: '6px 8px' }}
            >
              Past Functions ({allEvents.filter((e) => e.isPast).length})
            </button>
            <button
              type="button"
              className={`segmented-item ${eventFilter === 'upcoming' ? 'active' : ''}`}
              onClick={() => setEventFilter('upcoming')}
              style={{ fontSize: '12px', padding: '6px 8px' }}
            >
              Upcoming ({allEvents.filter((e) => !e.isPast).length})
            </button>
            <button
              type="button"
              className={`segmented-item ${eventFilter === 'all' ? 'active' : ''}`}
              onClick={() => setEventFilter('all')}
              style={{ fontSize: '12px', padding: '6px 8px' }}
            >
              All Events ({allEvents.length})
            </button>
          </div>
        </div>

        {/* Scrollable Event List */}
        <div className="overflow-y-auto flex-1 pr-0.5 mt-1" style={{ maxHeight: '52vh' }}>
          {filteredEvents.length === 0 ? (
            <div className="empty-state py-8 text-center">
              <div className="empty-state-icon mb-2">
                <Calendar size={28} />
              </div>
              <div className="empty-state-title text-sm">No Saved Events Found</div>
              <div className="empty-state-text text-xs">
                {search
                  ? 'No events match your search query.'
                  : eventFilter === 'past'
                  ? 'No ended or past events recorded yet. You can view all events or add an invitation first.'
                  : 'No upcoming events found.'}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredEvents.map((ev) => (
                <div
                  key={ev.id}
                  className="glass-card glass-card-interactive p-3 cursor-pointer transition-all hover:border-gold/40"
                  onClick={() => onSelectEvent(ev)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-white truncate">{ev.title}</span>
                        {ev.isPast ? (
                          <span className="badge badge-gold-luxury" style={{ fontSize: '9px', padding: '2px 6px' }}>
                            Past Function
                          </span>
                        ) : (
                          <span className="badge badge-info" style={{ fontSize: '9px', padding: '2px 6px' }}>
                            Upcoming
                          </span>
                        )}
                      </div>

                      {ev.hostName && (
                        <div className="text-xs text-slate-300 flex items-center gap-1.5 mb-1">
                          <User size={12} className="text-muted flex-shrink-0" />
                          <span className="truncate">Hosted by {ev.hostName}</span>
                        </div>
                      )}

                      <div className="text-xs text-muted flex items-center gap-3">
                        <span className="flex items-center gap-1">
                          <Calendar size={12} className="flex-shrink-0" />
                          {formatDate(ev.date)}
                        </span>
                        {ev.venue && (
                          <span className="flex items-center gap-1 truncate">
                            <MapPin size={12} className="flex-shrink-0" />
                            <span className="truncate">{ev.venue}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="btn btn-xs btn-gold flex-shrink-0 mt-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectEvent(ev);
                      }}
                    >
                      Select
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="pt-3 mt-2 border-t border-glass-border flex justify-end">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 2. ADD / EDIT GIFT GIVEN MODAL ──────────────────────────────────────────
interface AddEditGiftGivenModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: SelectedEventSummary | null;
  initialGift?: GiftRecord | null;
  onChangeEvent?: () => void;
  onSaved?: (gift: GiftRecord) => void;
}

export function AddEditGiftGivenModal({
  isOpen,
  onClose,
  event,
  initialGift,
  onChangeEvent,
  onSaved,
}: AddEditGiftGivenModalProps) {
  const { addGiftRecord, updateGiftRecord } = useAppStore();

  const [giftName, setGiftName] = useState(initialGift?.giftName || '');
  const [giftCategory] = useState<GiftCategory>(
    (initialGift?.giftCategory as GiftCategory) || 'other'
  );
  const [estimatedValue, setEstimatedValue] = useState<string>(
    initialGift?.estimatedValue !== undefined ? String(initialGift.estimatedValue) : ''
  );
  const [notes, setNotes] = useState(initialGift?.notes || '');
  const [recipientName, setRecipientName] = useState(
    initialGift?.recipientName || event?.hostName || ''
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync state when modal opens or initialGift/event changes
  React.useEffect(() => {
    if (isOpen) {
      if (initialGift) {
        setGiftName(initialGift.giftName || '');
        setEstimatedValue(
          initialGift.estimatedValue !== undefined ? String(initialGift.estimatedValue) : ''
        );
        setNotes(initialGift.notes || '');
        setRecipientName(initialGift.recipientName || event?.hostName || '');
      } else {
        setGiftName('');
        setEstimatedValue('');
        setNotes('');
        setRecipientName(event?.hostName || '');
      }
      setErrorMessage(null);
      setIsSubmitting(false);
    }
  }, [isOpen, initialGift, event]);

  if (!isOpen || !event) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!giftName.trim()) {
      setErrorMessage('Please enter the gift name or description.');
      return;
    }

    if (isSubmitting) return; // Prevent double submission
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const parsedValue = estimatedValue.trim() ? Number(estimatedValue) : undefined;

      if (initialGift) {
        // Edit mode
        updateGiftRecord(initialGift.id, {
          giftName: giftName.trim(),
          giftCategory,
          estimatedValue: parsedValue && !isNaN(parsedValue) ? parsedValue : undefined,
          notes: notes.trim() || undefined,
          recipientName: recipientName.trim() || undefined,
          eventTitle: event.title,
          eventDate: event.date,
          eventVenue: event.venue,
          eventType: event.eventType,
        });
        if (onSaved) {
          onSaved({
            ...initialGift,
            giftName: giftName.trim(),
            giftCategory,
            estimatedValue: parsedValue && !isNaN(parsedValue) ? parsedValue : undefined,
            notes: notes.trim() || undefined,
            recipientName: recipientName.trim() || undefined,
          });
        }
      } else {
        // Add new mode
        const saved = addGiftRecord({
          direction: 'given',
          eventId: event.id,
          eventTitle: event.title,
          eventDate: event.date,
          eventVenue: event.venue,
          eventType: event.eventType,
          recipientName: recipientName.trim() || event.hostName || undefined,
          giftName: giftName.trim(),
          giftCategory,
          estimatedValue: parsedValue && !isNaN(parsedValue) ? parsedValue : undefined,
          notes: notes.trim() || undefined,
        });
        if (onSaved) onSaved(saved);
      }

      onClose();
    } catch (err: any) {
      console.error('Error saving gift record:', err);
      setErrorMessage(err?.message || 'Failed to save gift record. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay modal-centered" onClick={onClose}>
      <div
        className="modal-dialog animate-scale-in"
        style={{ maxWidth: '440px', width: '92%', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-glass-border">
          <div>
            <h3 className="text-base font-bold text-white tracking-tight" style={{ margin: 0 }}>
              {initialGift ? 'Edit Gift Given' : 'Record Gift Given'}
            </h3>
            <p className="text-xs text-muted mt-0.5" style={{ margin: 0 }}>
              Function Gift Ledger
            </p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Selected Event Context Card */}
        <div
          className="mt-3 p-2.5 rounded-lg border border-glass-border"
          style={{ background: 'rgba(255, 255, 255, 0.03)' }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-gold truncate">{event.title}</div>
              <div className="text-xs text-muted flex items-center gap-2 mt-0.5">
                <span>{formatDate(event.date)}</span>
                {event.hostName && <span>· Hosted by {event.hostName}</span>}
              </div>
              {event.venue && (
                <div className="text-xs text-muted flex items-center gap-1 mt-0.5 truncate">
                  <MapPin size={11} className="flex-shrink-0" />
                  <span className="truncate">{event.venue}</span>
                </div>
              )}
            </div>

            {onChangeEvent && !initialGift && (
              <button
                type="button"
                className="text-xs text-gold hover:underline flex-shrink-0 font-medium"
                onClick={onChangeEvent}
                style={{ background: 'transparent', border: 'none', padding: '2px 4px' }}
              >
                Change
              </button>
            )}
          </div>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mt-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-xs text-red-400">
            <AlertCircle size={14} className="flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 mt-3">
          {/* Gift Given Name/Description (Screenshot 2 field 1) */}
          <div>
            <label className="label" style={{ fontSize: '12px', marginBottom: '4px' }}>
              Gift Given <span className="text-gold">*</span>
            </label>
            <input
              className="input"
              value={giftName}
              onChange={(e) => setGiftName(e.target.value)}
              placeholder="Enter gift"
              required
            />
          </div>

          {/* Estimated Value (₹) */}
          <div>
            <label className="label" style={{ fontSize: '12px', marginBottom: '4px' }}>
              Estimated Value (₹)
            </label>
            <input
              className="input"
              type="number"
              min="0"
              step="1"
              value={estimatedValue}
              onChange={(e) => setEstimatedValue(e.target.value)}
              placeholder="Enter gift value"
            />
          </div>

          {/* Recipient / Host Name */}
          <div>
            <label className="label" style={{ fontSize: '12px', marginBottom: '4px' }}>
              Recipient / Given To
            </label>
            <input
              className="input"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="Enter recipient name"
            />
          </div>

          {/* Notes (Screenshot 2 field 4) */}
          <div>
            <label className="label" style={{ fontSize: '12px', marginBottom: '4px' }}>
              Notes
            </label>
            <textarea
              className="textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Enter notes here..."
              rows={2}
            />
          </div>

          {/* Action Buttons (Screenshot 2 buttons: Cancel & Save Record) */}
          <div className="flex gap-2.5 mt-2">
            <button
              type="button"
              className="btn btn-ghost flex-1"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-gold flex-1 flex items-center justify-center gap-1.5"
              disabled={isSubmitting || !giftName.trim()}
            >
              {isSubmitting ? (
                <span>Saving...</span>
              ) : (
                <span>Save Record</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
