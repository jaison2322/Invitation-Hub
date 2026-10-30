import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import {
  ArrowLeft,
  Calendar,
  MapPin,
  User,
  Search,
  X,
  Plus,
  Edit3,
  Check,
  AlertCircle,
  Sparkles,
  Gift,
  Shield,
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

export default function RecordGiftScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: routeGiftId } = useParams<{ id?: string }>();

  const {
    invitations,
    familyEvents,
    giftRecords,
    isVIP,
    currentPrivilegedUser,
    addGiftRecord,
    updateGiftRecord,
  } = useAppStore();

  const locationState = location.state as {
    giftRecord?: GiftRecord;
    event?: SelectedEventSummary;
    eventId?: string;
    defaultDirection?: 'received' | 'given';
    tab?: 'received' | 'given';
  } | null;

  // Identify if we are in Edit Mode
  const existingGift = useMemo(() => {
    if (locationState?.giftRecord) return locationState.giftRecord;
    if (routeGiftId) return giftRecords.find((g) => g.id === routeGiftId) || null;
    return null;
  }, [locationState?.giftRecord, routeGiftId, giftRecords]);

  const isEditing = Boolean(existingGift);

  // Direction: 'given' vs 'received'
  const [direction, setDirection] = useState<'given' | 'received'>(
    existingGift?.direction ||
    locationState?.defaultDirection ||
    (locationState?.tab === 'received' ? 'received' : 'given')
  );

  // Today's ISO Date
  const todayStr = useMemo(() => getLocalTodayDateString(), []);

  // Determine initial selected event
  const initialEvent: SelectedEventSummary | null = useMemo(() => {
    if (existingGift) {
      return {
        id: existingGift.eventId,
        title: existingGift.eventTitle,
        date: existingGift.eventDate,
        hostName: existingGift.recipientName,
        venue: existingGift.eventVenue,
        eventType: existingGift.eventType as string,
        isPast: true,
      };
    }
    if (locationState?.event) {
      return locationState.event;
    }
    if (locationState?.eventId) {
      const inv = invitations.find((i) => i.id === locationState.eventId);
      if (inv) {
        return {
          id: inv.id,
          title: inv.title,
          date: inv.date,
          hostName: inv.hostName || inv.mainPerson || undefined,
          venue: inv.venue || inv.location || undefined,
          eventType: inv.eventType,
          isPast: isInvitationPastByDate(inv, todayStr),
        };
      }
      const fam = familyEvents.find((f) => f.id === locationState.eventId);
      if (fam) {
        return {
          id: fam.id,
          title: fam.name,
          date: fam.date,
          hostName: fam.familyMember || 'Family Function',
          venue: fam.venue || undefined,
          eventType: fam.eventType,
          isPast: true,
        };
      }
    }
    return null;
  }, [existingGift, locationState, invitations, familyEvents, todayStr]);

  // Current Step: 'select_event' (Step 1) vs 'enter_gift' (Step 2)
  const [selectedEvent, setSelectedEvent] = useState<SelectedEventSummary | null>(initialEvent);
  const [step, setStep] = useState<'select_event' | 'enter_gift'>(
    initialEvent ? 'enter_gift' : 'select_event'
  );
  // Track if event was picked within this screen session (to know if back button returns to Step 1)
  const [pickedInCurrentSession, setPickedInCurrentSession] = useState(false);

  // ── Step 1 State: Search, Filter, Custom Function ──────────────────────────
  const [search, setSearch] = useState('');
  const [eventFilter, setEventFilter] = useState<'past' | 'upcoming' | 'all'>('past');
  const [showManualEventForm, setShowManualEventForm] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualHost, setManualHost] = useState('');
  const [manualDate, setManualDate] = useState(todayStr);
  const [manualVenue, setManualVenue] = useState('');

  // ── Step 2 State: Gift Form ────────────────────────────────────────────────
  const [giftName, setGiftName] = useState(existingGift?.giftName || '');
  const [giftCategory] = useState<GiftCategory>(
    existingGift?.giftCategory || 'other'
  );
  const [estimatedValue, setEstimatedValue] = useState<string>(
    existingGift?.estimatedValue !== undefined ? String(existingGift.estimatedValue) : ''
  );
  const [recipientName, setRecipientName] = useState<string>(
    existingGift?.recipientName || initialEvent?.hostName || ''
  );
  const [notes, setNotes] = useState<string>(existingGift?.notes || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync recipient name if event changes and recipient wasn't manually typed
  useEffect(() => {
    if (selectedEvent?.hostName && !recipientName && !existingGift) {
      setRecipientName(selectedEvent.hostName);
    }
  }, [selectedEvent, recipientName, existingGift]);

  // Permission Checks
  const canManageGifts =
    isVIP ||
    currentPrivilegedUser?.permissions?.canEditEvents !== false ||
    currentPrivilegedUser?.permissions?.canViewGiftHistory !== false;

  // Flatten all available events
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
        isPast: true,
      });
    });

    return list;
  }, [invitations, familyEvents, todayStr]);

  // Filter and sort events
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
        if (eventFilter === 'all' && a.isPast !== b.isPast) {
          return a.isPast ? -1 : 1;
        }
        return b.date.localeCompare(a.date);
      });
  }, [allEvents, eventFilter, search]);

  const pastCount = useMemo(() => allEvents.filter((e) => e.isPast).length, [allEvents]);
  const upcomingCount = useMemo(() => allEvents.filter((e) => !e.isPast).length, [allEvents]);

  // ── Event Selection Handlers ───────────────────────────────────────────────
  const handleSelectEvent = (ev: SelectedEventSummary) => {
    setSelectedEvent(ev);
    if (!recipientName) {
      setRecipientName(ev.hostName || '');
    }
    setPickedInCurrentSession(true);
    setStep('enter_gift');
  };

  const handleApplyManualEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTitle.trim()) return;

    const customEvent: SelectedEventSummary = {
      id: `custom_${Date.now()}`,
      title: manualTitle.trim(),
      date: manualDate || todayStr,
      hostName: manualHost.trim() || undefined,
      venue: manualVenue.trim() || undefined,
      eventType: 'custom',
      isPast: manualDate <= todayStr,
    };

    handleSelectEvent(customEvent);
    setShowManualEventForm(false);
  };

  const handleChangeEvent = () => {
    setStep('select_event');
  };

  // Back button handler
  const handleBack = () => {
    if (step === 'enter_gift' && (pickedInCurrentSession || !initialEvent)) {
      setStep('select_event');
    } else {
      navigate(-1);
    }
  };

  // ── Form Submission ────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current || isSubmitting) return;
    setErrorMessage(null);

    if (!selectedEvent) {
      setErrorMessage('Please select a function or event first.');
      setStep('select_event');
      return;
    }

    if (!giftName.trim()) {
      setErrorMessage('Please enter the gift name or description.');
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      const parsedValue = estimatedValue.trim()
        ? parseFloat(estimatedValue.replace(/,/g, ''))
        : undefined;

      if (isEditing && existingGift) {
        // Update existing gift
        updateGiftRecord(existingGift.id, {
          direction,
          giftName: giftName.trim(),
          giftCategory,
          estimatedValue: parsedValue && !isNaN(parsedValue) ? parsedValue : undefined,
          notes: notes.trim() || undefined,
          recipientName: recipientName.trim() || undefined,
          eventTitle: selectedEvent.title,
          eventDate: selectedEvent.date,
          eventVenue: selectedEvent.venue,
          eventType: selectedEvent.eventType,
        });
      } else {
        // Add new gift record (given or received)
        addGiftRecord({
          direction,
          eventId: selectedEvent.id,
          eventTitle: selectedEvent.title,
          eventDate: selectedEvent.date,
          eventVenue: selectedEvent.venue,
          eventType: selectedEvent.eventType,
          recipientName: recipientName.trim() || selectedEvent.hostName || undefined,
          giftName: giftName.trim(),
          giftCategory,
          estimatedValue: parsedValue && !isNaN(parsedValue) ? parsedValue : undefined,
          notes: notes.trim() || undefined,
        });
      }

      // Return to Gift History (matching active tab)
      navigate('/gifts', { state: { tab: direction }, replace: true });
    } catch (err: any) {
      console.error('Error saving gift record:', err);
      setErrorMessage(err?.message || 'Failed to save gift record. Please try again.');
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  // Access check fallback
  if (!canManageGifts) {
    return (
      <div className="screen screen-no-nav flex flex-col items-center justify-center text-center p-6">
        <div className="empty-state-icon mb-3">
          <Shield size={36} style={{ color: 'var(--color-danger)' }} />
        </div>
        <h2 className="text-lg font-bold text-white mb-1">Access Restricted</h2>
        <p className="text-sm text-muted mb-4 max-w-xs">
          You do not have permission to record gifts given for functions.
        </p>
        <button className="btn btn-gold" onClick={() => navigate('/gifts')}>
          Back to Gift History
        </button>
      </div>
    );
  }

  return (
    <div className="screen screen-no-nav">
      {/* ── Stationary Top Header ────────────────────────────────────────────── */}
      <div className="screen-stationary-header" style={{ paddingBottom: '12px' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="btn-icon"
              onClick={handleBack}
              aria-label="Go Back"
              title="Go Back"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1
                className="font-heading font-bold text-white tracking-tight leading-tight"
                style={{ fontSize: '20px', margin: 0 }}
              >
                {isEditing
                  ? (direction === 'received' ? 'Edit Gift Received' : 'Edit Gift Given')
                  : step === 'select_event'
                  ? 'Select Function'
                  : (direction === 'received' ? 'Record Gift Received' : 'Record Gift Given')}
              </h1>
              <p className="text-xs text-muted" style={{ margin: 0 }}>
                {isEditing
                  ? 'Update gift details'
                  : step === 'select_event'
                  ? 'Step 1 of 2 · Choose Event'
                  : 'Step 2 of 2 · Gift Details'}
              </p>
            </div>
          </div>

          {/* Step Pill */}
          {!isEditing && (
            <div className="badge badge-gold-luxury" style={{ fontSize: '11px', padding: '3px 9px' }}>
              {step === 'select_event' ? 'Step 1 / 2' : 'Step 2 / 2'}
            </div>
          )}
        </div>
      </div>

      {/* ── Scrollable Body ──────────────────────────────────────────────────── */}
      <div className="screen-scroll-body" style={{ paddingTop: '12px', paddingBottom: '32px' }}>
        {/* ══════════════════════════════════════════════════════════════════════ */}
        {/* STEP 1: SELECT EVENT / FUNCTION                                       */}
        {/* ══════════════════════════════════════════════════════════════════════ */}
        {step === 'select_event' && (
          <div className="animate-fade-in flex flex-col gap-3">

            {/* Search Bar */}
            <div className="search-bar">
              <Search size={16} className="search-bar-icon" />
              <input
                placeholder="Search by event name, host, place..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  className="btn-icon btn-icon-xs text-muted hover:text-white"
                  onClick={() => setSearch('')}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Segmented Filter Pills */}
            <div className="segmented-control">
              <button
                type="button"
                className={`segmented-item ${eventFilter === 'past' ? 'active' : ''}`}
                onClick={() => setEventFilter('past')}
                style={{ fontSize: '12px', padding: '7px 8px', fontWeight: 600 }}
              >
                Past Functions ({pastCount})
              </button>
              <button
                type="button"
                className={`segmented-item ${eventFilter === 'upcoming' ? 'active' : ''}`}
                onClick={() => setEventFilter('upcoming')}
                style={{ fontSize: '12px', padding: '7px 8px', fontWeight: 600 }}
              >
                Upcoming ({upcomingCount})
              </button>
              <button
                type="button"
                className={`segmented-item ${eventFilter === 'all' ? 'active' : ''}`}
                onClick={() => setEventFilter('all')}
                style={{ fontSize: '12px', padding: '7px 8px', fontWeight: 600 }}
              >
                All Events ({allEvents.length})
              </button>
            </div>

            {/* Manual Function Entry Toggle / Card */}
            <div
              className="p-3 rounded-lg border border-glass-border transition-all"
              style={{ background: 'rgba(255, 255, 255, 0.02)' }}
            >
              {!showManualEventForm ? (
                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-300">
                    Can't find the function in the saved list?
                  </div>
                  <button
                    type="button"
                    className="btn btn-xs btn-ghost text-gold flex items-center gap-1 font-semibold"
                    onClick={() => setShowManualEventForm(true)}
                  >
                    <Plus size={13} />
                    <span>Enter Manually</span>
                  </button>
                </div>
              ) : (
                <form onSubmit={handleApplyManualEvent} className="flex flex-col gap-2.5 pt-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-gold">
                      Enter Function Details Manually
                    </span>
                    <button
                      type="button"
                      className="text-xs text-muted hover:text-white"
                      onClick={() => setShowManualEventForm(false)}
                    >
                      <X size={14} />
                    </button>
                  </div>

                  <div>
                    <label className="label">
                      Event / Function Name *
                    </label>
                    <input
                      className="input"
                      placeholder="enter the event or function name"
                      value={manualTitle}
                      onChange={(e) => setManualTitle(e.target.value)}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="label">
                        Host Name
                      </label>
                      <input
                        className="input"
                        placeholder="enter the host name"
                        value={manualHost}
                        onChange={(e) => setManualHost(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label">
                        Function Date
                      </label>
                      <input
                        type="date"
                        className="input cursor-pointer"
                        value={manualDate}
                        onChange={(e) => setManualDate(e.target.value)}
                        onClick={(e) => {
                          try {
                            e.currentTarget.showPicker();
                          } catch {}
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="label">
                      Venue / Place
                    </label>
                    <input
                      className="input"
                      placeholder="enter the venue or place"
                      value={manualVenue}
                      onChange={(e) => setManualVenue(e.target.value)}
                    />
                  </div>

                  <div className="flex justify-end gap-2 mt-1">
                    <button
                      type="button"
                      className="btn btn-xs btn-ghost"
                      onClick={() => setShowManualEventForm(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-xs btn-gold flex items-center gap-1 font-semibold"
                      disabled={!manualTitle.trim()}
                    >
                      <Check size={13} />
                      <span>Use This Function</span>
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* List of Available Functions */}
            <div className="flex flex-col gap-2 mt-1">
              <div className="text-xs font-semibold text-muted uppercase tracking-wider px-1">
                Select from Saved Functions ({filteredEvents.length})
              </div>

              {filteredEvents.map((ev, i) => (
                <div
                  key={ev.id}
                  className="glass-card glass-card-interactive p-3.5 cursor-pointer animate-slide-up transition-all hover:border-gold/50"
                  style={{ animationDelay: `${i * 0.02}s` }}
                  onClick={() => handleSelectEvent(ev)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-white truncate">
                          {ev.title}
                        </span>
                        {ev.isPast ? (
                          <span
                            className="badge badge-gold-luxury flex-shrink-0"
                            style={{ fontSize: '9px', padding: '2px 6px' }}
                          >
                            Past Function
                          </span>
                        ) : (
                          <span
                            className="badge badge-info flex-shrink-0"
                            style={{ fontSize: '9px', padding: '2px 6px' }}
                          >
                            Upcoming
                          </span>
                        )}
                      </div>

                      {ev.hostName && (
                        <div className="text-xs text-slate-300 flex items-center gap-1.5 mb-1 truncate">
                          <User size={12} className="text-gold flex-shrink-0" />
                          <span className="truncate">Hosted by: <strong>{ev.hostName}</strong></span>
                        </div>
                      )}

                      <div className="text-xs text-muted flex items-center gap-3 mt-1 flex-wrap">
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
                      className="btn btn-sm btn-gold flex-shrink-0 mt-0.5"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectEvent(ev);
                      }}
                    >
                      Select
                    </button>
                  </div>
                </div>
              ))}

              {filteredEvents.length === 0 && (
                <div className="empty-state py-8 text-center">
                  <div className="empty-state-icon mb-2">
                    <Calendar size={30} />
                  </div>
                  <div className="empty-state-title text-sm">No Saved Functions Found</div>
                  <div className="empty-state-text text-xs max-w-xs mx-auto">
                    {search
                      ? 'No events match your search query.'
                      : eventFilter === 'past'
                      ? 'No ended or past events recorded yet. You can switch to Upcoming or enter details manually above.'
                      : 'No upcoming events found.'}
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-gold mt-3 inline-flex items-center gap-1"
                    onClick={() => setShowManualEventForm(true)}
                  >
                    <Plus size={14} />
                    <span>Enter Function Manually</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════ */}
        {/* STEP 2: GIFT ENTRY FORM                                              */}
        {/* ══════════════════════════════════════════════════════════════════════ */}
        {step === 'enter_gift' && selectedEvent && (
          <form onSubmit={handleSubmit} className="animate-fade-in flex flex-col gap-4">
            {/* Direction Toggle: Gift Received vs Gift Given */}
            <div className="segmented-control">
              <button
                type="button"
                className={`segmented-item ${direction === 'received' ? 'active' : ''}`}
                onClick={() => setDirection('received')}
                style={{ fontWeight: 600, padding: '7px 12px', fontSize: '13px' }}
              >
                Gift Received
              </button>
              <button
                type="button"
                className={`segmented-item ${direction === 'given' ? 'active' : ''}`}
                onClick={() => setDirection('given')}
                style={{ fontWeight: 600, padding: '7px 12px', fontSize: '13px' }}
              >
                Gift Given
              </button>
            </div>

            {/* Selected Event Context Card */}
            <div
              className="glass-card p-3.5 rounded-xl border border-glass-border shadow-sm flex items-start justify-between gap-3"
              style={{
                borderLeft: '4px solid var(--color-gold)',
              }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="badge badge-gold-luxury"
                    style={{ fontSize: '10px', padding: '1px 7px', fontWeight: 600 }}
                  >
                    Associated Function
                  </span>
                  {selectedEvent.isPast && (
                    <span
                      className="badge badge-neutral"
                      style={{ fontSize: '10px', padding: '1px 7px' }}
                    >
                      Past
                    </span>
                  )}
                </div>

                <div
                  className="text-base font-bold truncate capitalize"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  {selectedEvent.title}
                </div>

                <div
                  className="flex items-center gap-3 mt-1.5 flex-wrap text-xs"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  <span className="flex items-center gap-1">
                    <Calendar size={12} className="text-gold flex-shrink-0" />
                    <span>{formatDate(selectedEvent.date)}</span>
                  </span>
                  {selectedEvent.hostName && (
                    <span className="flex items-center gap-1 truncate">
                      <User size={12} className="text-gold flex-shrink-0" />
                      <span className="truncate">Host: {selectedEvent.hostName}</span>
                    </span>
                  )}
                  {selectedEvent.venue && (
                    <span className="flex items-center gap-1 truncate">
                      <MapPin size={12} className="text-gold flex-shrink-0" />
                      <span className="truncate">{selectedEvent.venue}</span>
                    </span>
                  )}
                </div>
              </div>

              {!isEditing && (
                <button
                  type="button"
                  className="btn btn-xs btn-ghost flex items-center gap-1 flex-shrink-0 mt-0.5 text-gold hover:text-white"
                  onClick={handleChangeEvent}
                  title="Change Selected Function"
                  style={{
                    border: '1px solid rgba(212, 175, 55, 0.35)',
                    borderRadius: '8px',
                    padding: '4px 10px',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                >
                  <Edit3 size={12} />
                  <span>Change</span>
                </button>
              )}
            </div>

            {/* Error Banner */}
            {errorMessage && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-2.5 text-xs text-red-300">
                <AlertCircle size={15} className="flex-shrink-0 text-red-400" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* 1. Gift Item */}
            <div>
              <label className="label">
                {direction === 'received' ? 'Gift Received' : 'Gift Given'} <span className="text-gold">*</span>
              </label>
              <input
                className="input"
                value={giftName}
                onChange={(e) => setGiftName(e.target.value)}
                placeholder={direction === 'received' ? 'Enter gift received (e.g. Gold Coin, Cash, Silk Saree)' : 'Enter gift given'}
                required
              />
            </div>

            {/* 3. Gift Value */}
            <div>
              <label className="label">
                Gift Value
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

            {/* 4. Given To / Received From */}
            <div>
              <label className="label">
                {direction === 'received' ? 'Received From (Guest / Giver)' : 'Given To (Recipient / Host)'}
              </label>
              <input
                className="input"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder={direction === 'received' ? 'Received from...' : 'Given to...'}
              />
            </div>

            {/* 5. Notes */}
            <div>
              <label className="label">
                Notes
              </label>
              <textarea
                className="textarea"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Write a notes"
              />
            </div>

            {/* 5. Sticky Action Buttons */}
            <div className="pt-2 flex items-center gap-3">
              <button
                type="button"
                className="btn btn-ghost flex-1 py-2.5"
                onClick={() => navigate('/gifts')}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-gold flex-1 py-2.5 flex items-center justify-center gap-2 font-semibold shadow-lg"
                disabled={isSubmitting || !giftName.trim()}
              >
                {isSubmitting ? (
                  <span>Saving...</span>
                ) : (
                  <>
                    <Check size={16} strokeWidth={2.4} />
                    <span>{isEditing ? 'Save Changes' : 'Record Gift'}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
