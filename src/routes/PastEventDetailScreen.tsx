import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import {
  ArrowLeft,
  Calendar,
  Users,
  Gift,
  MapPin,
  Edit3,
  Plus,
  Trash2,
  X,
  Sparkles,
  Link2,
  UserPlus,
  UserCheck,
  CheckCircle2,
  Clock,
  Award,
  Coins,
} from 'lucide-react';
import {
  formatFullDate,
  formatCurrency,
  getInitials,
  getGiftCategoryLabel,
  getRelationshipLabel,
} from '../utils/formatters';
import EventBadgeIcon from '../components/EventBadgeIcon';
import GiftBadgeIcon from '../components/GiftBadgeIcon';
import IconBadge from '../components/IconBadge';
import type { GuestRecord, GiftCategory, RelationshipType } from '../types';
import { generateId } from '../utils/id';

export default function PastEventDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    familyEvents,
    updateFamilyEvent,
    removeFamilyEvent,
    addPerson,
    people,
    isVIP,
    currentPrivilegedUser,
    addActivityLog,
  } = useAppStore();

  const canEdit = isVIP || !!currentPrivilegedUser?.permissions?.canEditEvents;

  // Delete event confirmation modal state
  const [showDeleteEventModal, setShowDeleteEventModal] = useState(false);

  // Active modal: 'addGuest' | 'editGuest' | null
  const [modalType, setModalType] = useState<'addGuest' | 'editGuest' | null>(null);
  const [selectedGuestIndex, setSelectedGuestIndex] = useState<number | null>(null);

  // Modal form state
  const [guestName, setGuestName] = useState('');
  const [guestPersonId, setGuestPersonId] = useState('');
  const [guestRelationship, setGuestRelationship] = useState<RelationshipType>('friend');
  const [guestAttendance, setGuestAttendance] = useState<'attended' | 'invited_not_attended' | 'unknown'>('attended');
  const [guestGift, setGuestGift] = useState('');
  const [guestCategory, setGuestCategory] = useState<GiftCategory>('other');
  const [guestValue, setGuestValue] = useState<number | undefined>(undefined);
  const [guestNotes, setGuestNotes] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const event = familyEvents.find((e) => e.id === id);

  const handleDeleteEvent = () => {
    if (!event) return;
    removeFamilyEvent(event.id);
    addActivityLog({
      userId: isVIP ? 'vip' : currentPrivilegedUser?.id || 'staff',
      userName: isVIP ? 'VIP Principal' : currentPrivilegedUser?.name || 'Staff User',
      action: `deleted past family function "${event.name}"`,
      entityType: 'event',
      entityId: event.id,
      entityName: event.name,
    });
    navigate('/past-events', { replace: true });
  };

  if (!event) {
    return (
      <div className="screen-no-nav flex items-center justify-center p-6 text-center" style={{ minHeight: '80vh' }}>
        <div className="glass-panel-luxury p-8 max-w-sm w-full mx-auto">
          <div className="flex justify-center mb-4">
            <IconBadge icon={Award} variant="gold" size="lg" glow />
          </div>
          <h3 className="font-heading font-semibold text-white mb-2">Record Not Found</h3>
          <p className="text-xs text-secondary mb-5">
            This past family function dossier does not exist or has been relocated in the protocol archive.
          </p>
          <button className="btn btn-gold w-full flex items-center justify-center gap-2" onClick={() => navigate('/past-events')}>
            <ArrowLeft size={16} />
            <span>Return to Archive</span>
          </button>
        </div>
      </div>
    );
  }

  const attended = event.guests.filter((g) => g.attendance === 'attended');
  const totalGiftValue = event.guests.reduce((s, g) => s + (g.estimatedValue || 0), 0);
  const attendanceRate = event.guests.length > 0 ? Math.round((attended.length / event.guests.length) * 100) : 0;

  const giftCategories: GiftCategory[] = [
    'gold',
    'silver',
    'cash',
    'clothing',
    'electronics',
    'household',
    'jewelry',
    'other',
  ];

  const relationships: RelationshipType[] = [
    'family',
    'relative',
    'friend',
    'business_partner',
    'client',
    'colleague',
    'neighbor',
    'acquaintance',
    'other',
  ];

  // Open modal to add a missed guest
  const handleOpenAddGuest = () => {
    setGuestName('');
    setGuestPersonId('');
    setGuestRelationship('friend');
    setGuestAttendance('attended');
    setGuestGift('');
    setGuestCategory('other');
    setGuestValue(undefined);
    setGuestNotes('');
    setSelectedGuestIndex(null);
    setShowSuggestions(false);
    setModalType('addGuest');
  };

  // Open modal to edit an existing guest
  const handleOpenEditGuest = (guest: GuestRecord, index: number) => {
    const linkedPerson = people.find((p) => p.id === guest.personId);
    setGuestName(guest.personName);
    setGuestPersonId(guest.personId || '');
    setGuestRelationship(guest.relationship || linkedPerson?.relationship || 'friend');
    setGuestAttendance(guest.attendance);
    setGuestGift(guest.gift || '');
    setGuestCategory(guest.giftCategory || 'other');
    setGuestValue(guest.estimatedValue);
    setGuestNotes(guest.notes || '');
    setSelectedGuestIndex(index);
    setShowSuggestions(false);
    setModalType('editGuest');
  };

  // Autocomplete matching contacts
  const matchingContacts =
    guestName.trim().length > 0 && !guestPersonId
      ? people.filter(
          (p) =>
            p.name.toLowerCase().includes(guestName.trim().toLowerCase()) ||
            p.nickname.toLowerCase().includes(guestName.trim().toLowerCase())
        )
      : [];

  const handleSelectPerson = (person: typeof people[0]) => {
    setGuestPersonId(person.id);
    setGuestName(person.name);
    setGuestRelationship(person.relationship);
    setShowSuggestions(false);
  };

  // Save guest from modal (add or edit)
  const handleSaveGuestModal = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = guestName.trim();
    if (!trimmedName || !event) return;

    let finalPersonId = guestPersonId;

    // Check if person exists or create new contact
    const existing = people.find(
      (p) => p.id === finalPersonId || p.name.toLowerCase() === trimmedName.toLowerCase()
    );

    if (existing) {
      finalPersonId = existing.id;
    } else {
      const newPerson = addPerson({
        name: trimmedName,
        nickname: trimmedName,
        relationship: guestRelationship,
        notes: `Added from past event: ${event.name}`,
      });
      finalPersonId = newPerson.id;
    }

    const updatedGuests = [...event.guests];

    const guestPayload: GuestRecord = {
      id: modalType === 'editGuest' && selectedGuestIndex !== null ? updatedGuests[selectedGuestIndex].id : generateId('guest'),
      personId: finalPersonId,
      personName: trimmedName,
      relationship: guestRelationship,
      attendance: guestAttendance,
      gift: guestGift.trim() || undefined,
      giftCategory: guestCategory,
      estimatedValue: guestValue ? Number(guestValue) : undefined,
      notes: guestNotes.trim() || undefined,
    };

    if (modalType === 'editGuest' && selectedGuestIndex !== null) {
      updatedGuests[selectedGuestIndex] = guestPayload;
    } else {
      updatedGuests.push(guestPayload);
    }

    updateFamilyEvent(event.id, { guests: updatedGuests });

    addActivityLog({
      userId: isVIP ? 'vip' : currentPrivilegedUser?.id || 'staff',
      userName: isVIP ? 'VIP Principal' : currentPrivilegedUser?.name || 'Staff User',
      action: modalType === 'editGuest'
        ? `updated guest details for "${trimmedName}" in event "${event.name}"`
        : `added missed guest "${trimmedName}" to past event "${event.name}"`,
      entityType: 'event',
      entityId: event.id,
      entityName: event.name,
    });

    setModalType(null);
  };

  // Delete guest from event
  const handleDeleteGuest = (index: number) => {
    if (!event) return;
    const removedGuestName = event.guests[index]?.personName || 'Guest';
    const updatedGuests = event.guests.filter((_, i) => i !== index);
    updateFamilyEvent(event.id, { guests: updatedGuests });

    addActivityLog({
      userId: isVIP ? 'vip' : currentPrivilegedUser?.id || 'staff',
      userName: isVIP ? 'VIP Principal' : currentPrivilegedUser?.name || 'Staff User',
      action: `removed guest "${removedGuestName}" from past event "${event.name}"`,
      entityType: 'event',
      entityId: event.id,
      entityName: event.name,
    });

    setModalType(null);
  };

  return (
    <div className="screen-no-nav">
      {/* ── Stationary Top Navigation Bar ──────────────────────────────────── */}
      <div className="screen-stationary-header">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              className="btn-icon"
              onClick={() => navigate(-1)}
              aria-label="Go Back"
            >
              <ArrowLeft size={18} strokeWidth={2.2} />
            </button>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-gold)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Protocol Archive
              </div>
              <h2 className="font-heading font-semibold text-white tracking-tight" style={{ fontSize: '17px', margin: 0 }}>
                Event Dossier
              </h2>
            </div>
          </div>

          {canEdit ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline flex items-center gap-1.5"
                onClick={() => navigate(`/edit-event/${event.id}`)}
                style={{ padding: '6px 12px', fontSize: '12px' }}
              >
                <Edit3 size={13} strokeWidth={2} />
                <span>Edit</span>
              </button>
              <button
                type="button"
                className="btn-icon text-danger"
                style={{ color: 'var(--color-danger)', border: '1px solid rgba(248, 113, 113, 0.25)' }}
                onClick={() => setShowDeleteEventModal(true)}
                title="Delete Function"
              >
                <Trash2 size={16} strokeWidth={2} />
              </button>
            </div>
          ) : (
            <div style={{ width: '36px' }} />
          )}
        </div>
      </div>

      {/* ── Scrollable Event Dossier Content ────────────────────────────────── */}
      <div className="screen-scroll-body">
        {/* ── Executive Hero Banner ─────────────────────────────────────────── */}
        <div className="glass-panel-luxury p-5 md:p-6 mb-5 relative overflow-hidden animate-slide-up">
        {/* Subtle Ambient Background Gradient */}
        <div
          style={{
            position: 'absolute',
            top: '-40px',
            right: '-40px',
            width: '200px',
            height: '200px',
            background: 'radial-gradient(circle, rgba(212, 168, 83, 0.15) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <EventBadgeIcon type={event.eventType} size="hero" showGlow />
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Completed Function
                </span>
                <span className="text-[11px] font-mono text-muted uppercase">
                  {event.eventType}
                </span>
              </div>
              <h1 className="font-heading font-bold text-xl md:text-2xl text-white tracking-tight leading-tight">
                {event.name}
              </h1>
              <p className="text-xs text-secondary mt-1 font-medium">
                Host / Principal: <span className="text-white">{event.familyMember}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Date & Venue Tags */}
        <div className="flex flex-wrap gap-2.5 mt-4 pt-3.5" style={{ borderTop: '1px solid rgba(212, 168, 83, 0.12)' }}>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-slate-300">
            <Calendar size={13} strokeWidth={2} style={{ color: 'var(--color-gold)' }} />
            <span className="font-medium">{formatFullDate(event.date)}</span>
          </div>

          {event.venue && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-slate-300">
              <MapPin size={13} strokeWidth={2} style={{ color: 'var(--color-gold)' }} />
              <span className="truncate max-w-[220px]">{event.venue}</span>
            </div>
          )}
        </div>

        {/* Action Buttons inside Hero */}
        {canEdit && (
          <div className="flex items-center gap-2.5 mt-4">
            <button
              type="button"
              className="btn btn-sm btn-gold flex items-center gap-2 text-xs"
              onClick={handleOpenAddGuest}
            >
              <UserPlus size={14} strokeWidth={2.4} />
              <span>Record Missed Guest</span>
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline flex items-center gap-2 text-xs"
              onClick={() => navigate(`/edit-event/${event.id}`)}
            >
              <Edit3 size={13} strokeWidth={2} />
              <span>Edit Details</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Executive Stats Grid ───────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-6 animate-slide-up delay-1">
        {/* Total Guests */}
        <div className="stat-card-luxury">
          <div className="flex justify-center mb-1.5">
            <IconBadge icon={Users} variant="cyan" size="xs" />
          </div>
          <div className="stat-value">{event.guests.length}</div>
          <div className="stat-label">Total Guests</div>
        </div>

        {/* Attended & Attendance Rate */}
        <div className="stat-card-luxury">
          <div className="flex justify-center mb-1.5">
            <IconBadge icon={UserCheck} variant="emerald" size="xs" />
          </div>
          <div className="stat-value" style={{ color: '#34d399' }}>
            {attended.length}
          </div>
          <div className="stat-label">
            Attended {event.guests.length > 0 && `(${attendanceRate}%)`}
          </div>
        </div>

        {/* Gift Ledger Total */}
        <div className="stat-card-luxury">
          <div className="flex justify-center mb-1.5">
            <IconBadge icon={Coins} variant="gold" size="xs" glow />
          </div>
          <div className="stat-value text-gradient-gold" style={{ fontSize: totalGiftValue > 99999 ? '18px' : '22px' }}>
            {totalGiftValue > 0 ? formatCurrency(totalGiftValue) : '—'}
          </div>
          <div className="stat-label">Gift Total</div>
        </div>
      </div>

      {/* ── Guest Ledger Section ────────────────────────────────────────────── */}
      <div className="animate-slide-up delay-2">
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2">
            <IconBadge icon={Users} variant="gold" size="xs" />
            <h3 className="font-heading font-semibold text-white tracking-tight" style={{ fontSize: '16px', margin: 0 }}>
              Guest & Gift Ledger ({event.guests.length})
            </h3>
          </div>

          {canEdit && (
            <button
              type="button"
              className="btn btn-sm btn-gold flex items-center gap-1.5"
              style={{ fontSize: '11px', padding: '5px 10px' }}
              onClick={handleOpenAddGuest}
            >
              <Plus size={13} strokeWidth={2.4} />
              <span>Add Guest</span>
            </button>
          )}
        </div>

        {event.guests.length === 0 ? (
          <div className="glass-panel-luxury text-center p-8 mb-4">
            <div className="flex justify-center mb-3">
              <IconBadge icon={Users} variant="slate" size="md" />
            </div>
            <p className="text-sm font-medium text-white mb-1">No Guests Recorded Yet</p>
            <p className="text-xs text-muted mb-4 max-w-xs mx-auto">
              Record past attendees and gifts received to preserve executive relationship memory.
            </p>
            {canEdit && (
              <button
                type="button"
                className="btn btn-sm btn-gold inline-flex items-center gap-2"
                onClick={handleOpenAddGuest}
              >
                <Plus size={14} strokeWidth={2.2} />
                <span>Add First Attendee</span>
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {event.guests.map((guest, i) => {
              const linkedPerson = people.find((p) => p.id === guest.personId);
              const relationship = guest.relationship || linkedPerson?.relationship;

              return (
                <div
                  key={guest.id}
                  className="glass-panel-luxury p-3.5 flex flex-col gap-2 transition-all cursor-pointer"
                  onClick={() => {
                    if (canEdit) {
                      handleOpenEditGuest(guest, i);
                    } else if (guest.personId) {
                      navigate(`/person/${guest.personId}`);
                    }
                  }}
                >
                  <div className="flex items-center gap-3">
                    {/* High-Level Avatar */}
                    <div
                      className="avatar avatar-sm cursor-pointer"
                      style={{
                        border: linkedPerson ? '1.5px solid var(--color-gold)' : '1px solid rgba(255, 255, 255, 0.15)',
                        boxShadow: linkedPerson ? '0 0 10px rgba(212, 168, 83, 0.25)' : 'none',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (guest.personId) navigate(`/person/${guest.personId}`);
                      }}
                    >
                      {getInitials(guest.personName)}
                    </div>

                    {/* Guest Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-white truncate">
                          {guest.personName}
                        </span>
                        {relationship && (
                          <span className="badge badge-gold-luxury" style={{ fontSize: '9px', padding: '1px 6px' }}>
                            {getRelationshipLabel(relationship)}
                          </span>
                        )}
                        {guest.personId && (
                          <span className="inline-flex items-center gap-1 text-[9px] text-gold font-medium">
                            <Link2 size={10} /> Linked VIP
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider ${
                            guest.attendance === 'attended'
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : guest.attendance === 'invited_not_attended'
                              ? 'bg-slate-500/15 text-slate-400 border border-slate-500/25'
                              : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                          }`}
                        >
                          <span
                            className={`w-1 h-1 rounded-full ${
                              guest.attendance === 'attended'
                                ? 'bg-emerald-400'
                                : guest.attendance === 'invited_not_attended'
                                ? 'bg-slate-400'
                                : 'bg-amber-400'
                            }`}
                          />
                          {guest.attendance === 'attended'
                            ? 'Attended'
                            : guest.attendance === 'invited_not_attended'
                            ? 'Not Attended'
                            : 'Unknown'}
                        </span>
                      </div>
                    </div>

                    {/* Gift & Value High-Level Pill */}
                    <div className="text-right flex items-center gap-2 flex-shrink-0">
                      {guest.gift && (
                        <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10">
                          <GiftBadgeIcon category={guest.giftCategory || 'other'} size="xs" />
                          <div className="text-left">
                            <div className="text-xs font-semibold text-white truncate max-w-[120px]">
                              {guest.gift}
                            </div>
                            {guest.estimatedValue && (
                              <div className="text-[10px] text-gradient-gold font-mono font-medium">
                                {formatCurrency(guest.estimatedValue)}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {canEdit && (
                        <button
                          type="button"
                          className="btn-icon"
                          title="Edit guest & gift details"
                          style={{ width: '30px', height: '30px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEditGuest(guest, i);
                          }}
                        >
                          <Edit3 size={13} strokeWidth={1.8} />
                        </button>
                      )}
                    </div>
                  </div>

                  {guest.notes && (
                    <div
                      className="text-xs text-secondary mt-1 pt-2 px-2 rounded bg-black/20"
                      style={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}
                    >
                      <span className="text-muted mr-1">Note:</span> {guest.notes}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Notes Section ─────────────────────────────────────────────────── */}
      {event.notes && (
        <div className="glass-panel-luxury p-4 mt-5 animate-slide-up delay-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-gold mb-1.5 uppercase tracking-wider">
            <Sparkles size={13} />
            <span>Event Protocol Notes</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">{event.notes}</p>
        </div>
      )}
      </div>

      {/* ─── MODAL: ADD / EDIT GUEST ─────────────────────────────────────────── */}
      {modalType !== null && (
        <div className="modal-overlay" onClick={() => setModalType(null)}>
          <div className="modal-content animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />

            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <IconBadge icon={modalType === 'editGuest' ? Edit3 : UserPlus} variant="gold" size="xs" />
                <h3 className="font-heading font-semibold text-white" style={{ margin: 0, fontSize: '18px' }}>
                  {modalType === 'editGuest' ? 'Edit Guest Record' : 'Record Missed Guest'}
                </h3>
              </div>

              {modalType === 'editGuest' && selectedGuestIndex !== null && (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost text-danger flex items-center gap-1"
                  onClick={() => handleDeleteGuest(selectedGuestIndex)}
                  title="Remove Guest"
                  style={{ fontSize: '12px', padding: '4px 8px' }}
                >
                  <Trash2 size={13} />
                  <span>Remove</span>
                </button>
              )}
            </div>

            <p className="text-xs text-secondary mb-4">
              {modalType === 'editGuest'
                ? 'Update attendee status, relationship ties, and gift ledger reciprocity.'
                : 'Add a past attendee and save their relationship profile to the executive contact ledger.'}
            </p>

            <form onSubmit={handleSaveGuestModal} className="flex flex-col gap-3.5">
              {/* Guest Name & Autocomplete */}
              <div style={{ position: 'relative' }}>
                <label className="label" style={{ fontSize: '12px', marginBottom: '4px' }}>
                  Attendee Full Name *
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="input"
                    value={guestName}
                    onChange={(e) => {
                      setGuestName(e.target.value);
                      if (guestPersonId) setGuestPersonId('');
                      setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    placeholder="Enter full name (e.g. Ramesh Chandra, Priya Sharma)..."
                    required
                  />
                  {guestPersonId && (
                    <button
                      type="button"
                      onClick={() => setGuestPersonId('')}
                      title="Unlink contact"
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: 'var(--color-text-muted)',
                        cursor: 'pointer',
                        padding: '4px',
                      }}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Suggestions Dropdown */}
                {showSuggestions && matchingContacts.length > 0 && !guestPersonId && (
                  <div
                    className="glass-panel-luxury animate-scale-in"
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      zIndex: 50,
                      marginTop: '6px',
                      maxHeight: '180px',
                      overflowY: 'auto',
                      padding: '6px',
                      boxShadow: 'var(--shadow-xl)',
                      border: '1px solid var(--color-gold)',
                      background: 'rgba(12, 18, 32, 0.98)',
                    }}
                  >
                    <div
                      style={{
                        padding: '4px 8px',
                        fontSize: '10px',
                        color: 'var(--color-gold)',
                        textTransform: 'uppercase',
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                      }}
                    >
                      Matching VIP Directory Contacts
                    </div>
                    {matchingContacts.map((person) => (
                      <div
                        key={person.id}
                        className="flex items-center justify-between p-2 rounded-lg cursor-pointer hover:bg-white/10 transition-colors"
                        style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectPerson(person);
                        }}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="avatar avatar-sm">{getInitials(person.name)}</div>
                          <div>
                            <div className="text-xs font-semibold text-white">{person.name}</div>
                            <div className="text-[10px] text-muted">
                              {getRelationshipLabel(person.relationship)}
                            </div>
                          </div>
                        </div>
                        <span className="badge badge-gold-luxury" style={{ fontSize: '9px' }}>
                          Select Contact
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {guestPersonId ? (
                  <div className="badge badge-confirmed mt-1.5 inline-flex items-center gap-1.5" style={{ fontSize: '11px' }}>
                    <Link2 size={11} />
                    <span>Linked to VIP Directory Contact</span>
                  </div>
                ) : guestName.trim() ? (
                  <div className="badge badge-info mt-1.5 inline-flex items-center gap-1.5" style={{ fontSize: '11px' }}>
                    <Sparkles size={11} />
                    <span>Will be registered as new VIP Contact</span>
                  </div>
                ) : null}
              </div>

              {/* Attendance Status (High-Level Segmented Control) */}
              <div>
                <label className="label" style={{ fontSize: '12px', marginBottom: '4px' }}>
                  Attendance Status
                </label>
                <div className="segmented-control">
                  <button
                    type="button"
                    className={`segmented-item ${guestAttendance === 'attended' ? 'active' : ''}`}
                    onClick={() => setGuestAttendance('attended')}
                  >
                    Attended
                  </button>
                  <button
                    type="button"
                    className={`segmented-item ${guestAttendance === 'invited_not_attended' ? 'active' : ''}`}
                    onClick={() => setGuestAttendance('invited_not_attended')}
                  >
                    Did Not Attend
                  </button>
                  <button
                    type="button"
                    className={`segmented-item ${guestAttendance === 'unknown' ? 'active' : ''}`}
                    onClick={() => setGuestAttendance('unknown')}
                  >
                    Unknown
                  </button>
                </div>
              </div>

              {/* Relationship */}
              <div>
                <label className="label" style={{ fontSize: '12px', marginBottom: '4px' }}>
                  Relationship Tie
                </label>
                <select
                  className="select"
                  value={guestRelationship}
                  onChange={(e) => setGuestRelationship(e.target.value as RelationshipType)}
                >
                  {relationships.map((r) => (
                    <option key={r} value={r}>
                      {getRelationshipLabel(r)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Gift description */}
              <div>
                <label className="label" style={{ fontSize: '12px', marginBottom: '4px' }}>
                  Gift Given / Received
                </label>
                <input
                  className="input"
                  value={guestGift}
                  onChange={(e) => setGuestGift(e.target.value)}
                  placeholder="e.g. Gold Coin 10g, Cash Envelope ₹5,000, Luxury Hamper"
                />
              </div>

              {/* Gift Category & Estimated Value */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" style={{ fontSize: '12px', marginBottom: '4px' }}>
                    Gift Category
                  </label>
                  <select
                    className="select"
                    value={guestCategory}
                    onChange={(e) => setGuestCategory(e.target.value as GiftCategory)}
                  >
                    {giftCategories.map((c) => (
                      <option key={c} value={c}>
                        {getGiftCategoryLabel(c)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label" style={{ fontSize: '12px', marginBottom: '4px' }}>
                    Estimated Value (₹)
                  </label>
                  <input
                    className="input"
                    type="number"
                    value={guestValue ?? ''}
                    onChange={(e) => setGuestValue(e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="e.g. 10000"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="label" style={{ fontSize: '12px', marginBottom: '4px' }}>
                  Protocol Notes & Seating
                </label>
                <textarea
                  className="textarea"
                  value={guestNotes}
                  onChange={(e) => setGuestNotes(e.target.value)}
                  placeholder="Table seating, accompanying family members, conversational notes..."
                  rows={2}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2.5 mt-3">
                <button
                  type="button"
                  className="btn btn-ghost flex-1"
                  onClick={() => setModalType(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-gold flex-1"
                  disabled={!guestName.trim()}
                >
                  {modalType === 'editGuest' ? 'Save Record' : 'Record Attendee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Event Confirmation Modal */}
      {showDeleteEventModal && (
        <div className="modal-overlay modal-centered" onClick={() => setShowDeleteEventModal(false)}>
          <div className="modal-dialog animate-scale-in text-center" onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.15)',
                color: 'var(--color-danger)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto var(--space-3)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
              }}
            >
              <Trash2 size={22} strokeWidth={2} />
            </div>
            <h3 className="font-heading font-semibold text-white mb-1.5" style={{ fontSize: '18px' }}>
              Archive Event Deletion
            </h3>
            <p className="text-xs text-secondary mb-5 leading-relaxed">
              Are you sure you want to permanently remove &ldquo;{event.name}&rdquo; and all {event.guests.length} guest records from the executive archive? This action cannot be undone.
            </p>
            <div className="flex gap-2.5">
              <button
                type="button"
                className="btn btn-ghost flex-1"
                onClick={() => setShowDeleteEventModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger flex-1"
                onClick={handleDeleteEvent}
              >
                Delete Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
