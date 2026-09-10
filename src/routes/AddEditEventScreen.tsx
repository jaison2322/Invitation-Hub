import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import {
  ArrowLeft,
  Plus,
  Trash2,
  UserPlus,
  Users,
  Sparkles,
  Link2,
  X,
  ShieldAlert,
  Edit3,
} from 'lucide-react';
import type { EventType, GuestRecord, GiftCategory, RelationshipType } from '../types';
import { getEventTypeLabel, getRelationshipLabel, getInitials } from '../utils/formatters';
import { generateId } from '../utils/id';

export default function AddEditEventScreen() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const isEditing = Boolean(id);

  const {
    addFamilyEvent,
    updateFamilyEvent,
    removeFamilyEvent,
    addPerson,
    people,
    familyEvents,
    isVIP,
    currentPrivilegedUser,
    addActivityLog,
  } = useAppStore();

  const canEditEvents = isVIP || !!currentPrivilegedUser?.permissions?.canEditEvents;

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [name, setName] = useState('');
  const [eventType, setEventType] = useState<EventType>('wedding');
  const [date, setDate] = useState('');
  const [familyMember, setFamilyMember] = useState('');
  const [venue, setVenue] = useState('');
  const [notes, setNotes] = useState('');
  const [guests, setGuests] = useState<GuestRecord[]>([]);

  // Track active autocomplete dropdown for each guest
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState<number | null>(null);

  // Pre-populate when in edit mode
  useEffect(() => {
    if (id) {
      const existing = familyEvents.find((e) => e.id === id);
      if (existing) {
        setName(existing.name);
        setEventType(existing.eventType);
        setDate(existing.date);
        setFamilyMember(existing.familyMember || '');
        setVenue(existing.venue || '');
        setNotes(existing.notes || '');
        setGuests(existing.guests || []);
      }
    }
  }, [id, familyEvents]);

  const eventTypes: EventType[] = [
    'wedding',
    'engagement',
    'birthday',
    'anniversary',
    'house_warming',
    'baby_shower',
    'graduation',
    'retirement',
    'reception',
    'religious',
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

  const addGuest = () => {
    const newGuest: GuestRecord = {
      id: generateId('guest'),
      personId: '',
      personName: '',
      relationship: 'friend',
      attendance: 'attended',
      gift: '',
      giftDescription: '',
      giftCategory: 'other',
      estimatedValue: undefined,
      notes: '',
    };
    setGuests([...guests, newGuest]);
    setActiveSuggestionIndex(guests.length);
  };

  const updateGuest = (index: number, field: keyof GuestRecord, value: any) => {
    const updated = [...guests];
    (updated[index] as any)[field] = value;
    setGuests(updated);
  };

  const selectExistingPerson = (index: number, person: typeof people[0]) => {
    const updated = [...guests];
    updated[index].personId = person.id;
    updated[index].personName = person.name;
    updated[index].relationship = person.relationship;
    setGuests(updated);
    setActiveSuggestionIndex(null);
  };

  const unlinkPerson = (index: number) => {
    const updated = [...guests];
    updated[index].personId = '';
    setGuests(updated);
  };

  const removeGuest = (index: number) => {
    setGuests(guests.filter((_, i) => i !== index));
    if (activeSuggestionIndex === index) {
      setActiveSuggestionIndex(null);
    }
  };

  const handleSave = () => {
    if (!name.trim() || !date) return;
    if (!canEditEvents) return;

    // Process guests: if a guest is not linked to an existing person, automatically add them to People directory
    const finalizedGuests: GuestRecord[] = guests.map((guest) => {
      const trimmedName = guest.personName.trim();
      if (!trimmedName) return guest;

      let finalPersonId = guest.personId;

      // Check if person exists in people directory
      const existingPerson = people.find(
        (p) => p.id === finalPersonId || p.name.toLowerCase() === trimmedName.toLowerCase()
      );

      if (existingPerson) {
        finalPersonId = existingPerson.id;
      } else {
        // Auto-create new person in People contacts
        const newPerson = addPerson({
          name: trimmedName,
          nickname: trimmedName,
          relationship: guest.relationship || 'other',
          notes: `Added from event: ${name.trim()}`,
        });
        finalPersonId = newPerson.id;
      }

      return {
        ...guest,
        personId: finalPersonId,
        personName: trimmedName,
      };
    });

    if (isEditing && id) {
      updateFamilyEvent(id, {
        name: name.trim(),
        eventType,
        date,
        familyMember: familyMember.trim(),
        venue: venue.trim() || undefined,
        guests: finalizedGuests,
        notes: notes.trim() || undefined,
      });

      addActivityLog({
        userId: isVIP ? 'vip' : currentPrivilegedUser?.id || 'staff',
        userName: isVIP ? 'VIP Principal' : currentPrivilegedUser?.name || 'Staff User',
        action: `updated past function & guest list for "${name.trim()}"`,
        entityType: 'event',
        entityId: id,
        entityName: name.trim(),
      });
    } else {
      addFamilyEvent({
        name: name.trim(),
        eventType,
        date,
        familyMember: familyMember.trim(),
        description: '',
        venue: venue.trim() || undefined,
        guests: finalizedGuests,
        notes: notes.trim() || undefined,
      });

      addActivityLog({
        userId: isVIP ? 'vip' : currentPrivilegedUser?.id || 'staff',
        userName: isVIP ? 'VIP Principal' : currentPrivilegedUser?.name || 'Staff User',
        action: `recorded new past function & guests "${name.trim()}"`,
        entityType: 'event',
        entityId: 'new',
        entityName: name.trim(),
      });
    }

    navigate(-1);
  };

  const handleDelete = () => {
    if (!id) return;
    const existing = familyEvents.find((e) => e.id === id);
    removeFamilyEvent(id);
    addActivityLog({
      userId: isVIP ? 'vip' : currentPrivilegedUser?.id || 'staff',
      userName: isVIP ? 'VIP Principal' : currentPrivilegedUser?.name || 'Staff User',
      action: `deleted past function "${existing?.name || name}"`,
      entityType: 'event',
      entityId: id,
      entityName: existing?.name || name,
    });
    navigate('/past-events', { replace: true });
  };

  if (!canEditEvents) {
    return (
      <div className="screen-no-nav flex items-center justify-center p-6 text-center">
        <div className="glass-card p-6 max-w-sm">
          <ShieldAlert size={36} className="text-danger mb-3" style={{ margin: '0 auto 12px' }} />
          <h3 className="mb-2">Permission Required</h3>
          <p className="text-xs text-muted mb-4">
            You do not have permission to edit past functions and guest lists. Please contact the VIP Principal.
          </p>
          <button className="btn btn-gold w-full" onClick={() => navigate(-1)}>
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen-no-nav">
      {/* ── Stationary Top Bar ────────────────────────────────────────────── */}
      <div className="screen-stationary-header">
        <div className="top-bar">
          <button className="top-bar-back" onClick={() => navigate(-1)}>
            <ArrowLeft size={18} />
          </button>
          <span className="top-bar-title">
            {isEditing ? 'Edit Function & Guests' : 'Add Family Function'}
          </span>
          {isEditing && canEditEvents ? (
            <button
              type="button"
              className="btn btn-sm btn-ghost text-danger"
              style={{ padding: '6px', color: 'var(--color-danger)' }}
              onClick={() => setShowDeleteModal(true)}
              title="Delete Event"
            >
              <Trash2 size={16} />
            </button>
          ) : (
            <div style={{ width: '36px' }} />
          )}
        </div>
      </div>

      {/* ── Scrollable Event Form Body ──────────────────────────────────────── */}
      <div className="screen-scroll-body" style={{ paddingBottom: '120px' }}>
        <div className="flex flex-col gap-4 animate-slide-up">
        {/* Event Name */}
        <div>
          <label className="label">Event Name *</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Daughter's Wedding"
            required
          />
        </div>

        {/* Event Type */}
        <div>
          <label className="label">Event Type</label>
          <select
            className="select"
            value={eventType}
            onChange={(e) => setEventType(e.target.value as EventType)}
          >
            {eventTypes.map((t) => (
              <option key={t} value={t}>
                {getEventTypeLabel(t)}
              </option>
            ))}
          </select>
        </div>

        {/* Date */}
        <div>
          <label className="label">Date *</label>
          <input
            className="input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>

        {/* Family Member */}
        <div>
          <label className="label">Family Member</label>
          <input
            className="input"
            value={familyMember}
            onChange={(e) => setFamilyMember(e.target.value)}
            placeholder="e.g., Daughter - Meera"
          />
        </div>

        {/* Venue */}
        <div>
          <label className="label">Venue / Location</label>
          <input
            className="input"
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            placeholder="e.g., ITC Grand Chola, Chennai"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="label">Notes</label>
          <textarea
            className="textarea"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional details, VIP attendees, notes..."
            rows={2}
          />
        </div>

        {/* ── Guest List ─────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <label className="label" style={{ margin: 0 }}>
                Guest List ({guests.length})
              </label>
              <div className="text-xs text-muted">
                Add missed guests, modify attendance, edit gifts, or search contacts
              </div>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-gold"
              onClick={addGuest}
              style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <Plus size={14} /> Add Guest
            </button>
          </div>

          {guests.length === 0 ? (
            <div
              className="glass-card text-center p-5"
              style={{
                border: '1px dashed var(--glass-border)',
                borderRadius: 'var(--radius-lg)',
              }}
            >
              <Users size={28} className="text-muted mb-2" style={{ margin: '0 auto 8px' }} />
              <div className="text-sm font-semibold text-primary">No Guests Recorded Yet</div>
              <p className="text-xs text-muted mb-3">
                Track attendees, reciprocal gifts, and link or auto-add them to your People contacts.
              </p>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={addGuest}
              >
                <UserPlus size={14} /> + Add First Guest
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {guests.map((guest, i) => {
                const isLinked = !!guest.personId;
                const typedQuery = guest.personName.trim().toLowerCase();

                // Suggestions from People contacts matching typed letters
                const matchingContacts =
                  typedQuery.length > 0 && !isLinked
                    ? people.filter(
                        (p) =>
                          p.name.toLowerCase().includes(typedQuery) ||
                          p.nickname.toLowerCase().includes(typedQuery)
                      )
                    : [];

                const showSuggestions =
                  activeSuggestionIndex === i &&
                  typedQuery.length > 0 &&
                  !isLinked &&
                  matchingContacts.length > 0;

                return (
                  <div
                    key={guest.id}
                    className="glass-card animate-slide-up"
                    style={{ padding: 'var(--space-3)', position: 'relative' }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gold uppercase tracking-wider">
                          Guest #{i + 1}
                        </span>
                        {isLinked && (
                          <span
                            className="badge badge-success"
                            style={{ fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: '3px' }}
                          >
                            <Link2 size={10} /> Linked Contact
                          </span>
                        )}
                        {!isLinked && guest.personName.trim().length > 0 && (
                          <span
                            className="badge badge-info"
                            style={{ fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: '3px' }}
                          >
                            <Sparkles size={10} /> Auto-saves to People
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost text-muted"
                        style={{ padding: '4px', height: 'auto' }}
                        onClick={() => removeGuest(i)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <div className="flex flex-col gap-2">
                      {/* 1. Smart Name / Auto-Suggest Input */}
                      <div style={{ position: 'relative' }}>
                        <div className="flex items-center gap-2">
                          <div style={{ position: 'relative', flex: 1 }}>
                            <input
                              className="input"
                              value={guest.personName}
                              onChange={(e) => {
                                updateGuest(i, 'personName', e.target.value);
                                if (guest.personId) {
                                  updateGuest(i, 'personId', '');
                                }
                                setActiveSuggestionIndex(i);
                              }}
                              onFocus={() => setActiveSuggestionIndex(i)}
                              placeholder="Type guest name (e.g. Ramesh, Priya)..."
                              style={{ paddingRight: isLinked ? '30px' : undefined }}
                              required
                            />
                            {isLinked && (
                              <button
                                type="button"
                                onClick={() => unlinkPerson(i)}
                                title="Unlink contact"
                                style={{
                                  position: 'absolute',
                                  right: '8px',
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
                        </div>

                        {/* Autocomplete Suggestions Dropdown */}
                        {showSuggestions && (
                          <div
                            className="glass-card animate-scale-in"
                            style={{
                              position: 'absolute',
                              top: '100%',
                              left: 0,
                              right: 0,
                              zIndex: 50,
                              marginTop: '4px',
                              maxHeight: '200px',
                              overflowY: 'auto',
                              padding: '4px',
                              boxShadow: 'var(--shadow-xl)',
                              border: '1px solid var(--color-gold)',
                              background: 'var(--color-bg-elevated)',
                            }}
                          >
                            <div
                              style={{
                                padding: '4px 8px',
                                fontSize: '0.65rem',
                                color: 'var(--color-gold)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                                fontWeight: 600,
                              }}
                            >
                              Matching People Contacts
                            </div>
                            {matchingContacts.map((person) => (
                              <div
                                key={person.id}
                                className="flex items-center justify-between p-2 rounded cursor-pointer"
                                style={{
                                  borderBottom: '1px solid var(--glass-border)',
                                }}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  selectExistingPerson(i, person);
                                }}
                              >
                                <div className="flex items-center gap-2">
                                  <div className="avatar avatar-sm">
                                    {getInitials(person.name)}
                                  </div>
                                  <div>
                                    <div className="text-xs font-semibold text-primary">
                                      {person.name}
                                    </div>
                                    <div className="text-xs text-muted">
                                      {getRelationshipLabel(person.relationship)}
                                    </div>
                                  </div>
                                </div>
                                <span className="badge badge-gold" style={{ fontSize: '0.6rem' }}>
                                  Select
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* 2. Relationship Selector */}
                      <div>
                        <label className="text-xs text-muted mb-1 block">Relationship</label>
                        <select
                          className="select"
                          value={guest.relationship || 'friend'}
                          onChange={(e) =>
                            updateGuest(i, 'relationship', e.target.value as RelationshipType)
                          }
                        >
                          {relationships.map((r) => (
                            <option key={r} value={r}>
                              {getRelationshipLabel(r)}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* 3. Attendance Status */}
                      <div>
                        <label className="text-xs text-muted mb-1 block">Attendance Status</label>
                        <select
                          className="select"
                          value={guest.attendance}
                          onChange={(e) => updateGuest(i, 'attendance', e.target.value)}
                        >
                          <option value="attended">Attended</option>
                          <option value="invited_not_attended">Invited (didn&apos;t attend)</option>
                          <option value="unknown">Unknown</option>
                        </select>
                      </div>

                      {/* 4. Gift Description */}
                      <div>
                        <label className="text-xs text-muted mb-1 block">Gift Received / Given</label>
                        <input
                          className="input"
                          value={guest.gift || ''}
                          onChange={(e) => updateGuest(i, 'gift', e.target.value)}
                          placeholder="Gift (e.g., Gold Coin, Cash Envelope, Watch)"
                        />
                      </div>

                      {/* 5. Gift Category & Estimated Value */}
                      <div className="grid-2">
                        <div>
                          <label className="text-xs text-muted mb-1 block">Category</label>
                          <select
                            className="select"
                            value={guest.giftCategory || 'other'}
                            onChange={(e) => updateGuest(i, 'giftCategory', e.target.value)}
                          >
                            {giftCategories.map((c) => (
                              <option key={c} value={c}>
                                {c.charAt(0).toUpperCase() + c.slice(1)}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-xs text-muted mb-1 block">Estimated Value (₹)</label>
                          <input
                            className="input"
                            type="number"
                            value={guest.estimatedValue || ''}
                            onChange={(e) =>
                              updateGuest(
                                i,
                                'estimatedValue',
                                parseInt(e.target.value) || undefined
                              )
                            }
                            placeholder="Value ₹"
                          />
                        </div>
                      </div>

                      {/* 6. Notes */}
                      <div>
                        <label className="text-xs text-muted mb-1 block">Guest Notes</label>
                        <input
                          className="input"
                          value={guest.notes || ''}
                          onChange={(e) => updateGuest(i, 'notes', e.target.value)}
                          placeholder="Special seating, memory notes, etc."
                        />
                      </div>
                    </div>
                  </div>
                );
              })}

              {guests.length > 0 && (
                <button
                  type="button"
                  className="btn btn-outline w-full mt-2"
                  onClick={addGuest}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  <Plus size={16} /> Add Another Guest
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      </div>

      {/* Save Button */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          padding: 'var(--space-4) var(--space-6)',
          paddingBottom: 'calc(var(--space-6) + var(--safe-area-bottom))',
          background: 'rgba(6, 10, 19, 0.95)',
          backdropFilter: 'blur(20px)',
          borderTop: '1px solid var(--glass-border)',
          zIndex: 40,
        }}
      >
        <button
          type="button"
          className="btn btn-gold w-full"
          onClick={handleSave}
          disabled={!name.trim() || !date}
        >
          {isEditing ? 'Save Changes & Update Function' : 'Save Event & Sync Contacts'}
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="modal-overlay modal-centered" onClick={() => setShowDeleteModal(false)}>
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
              }}
            >
              <Trash2 size={24} />
            </div>
            <h3 style={{ marginBottom: 'var(--space-1)' }}>Delete Event Function?</h3>
            <p className="text-xs text-secondary mb-4">
              Are you sure you want to delete "{name}"? All guest records under this function will also be removed.
            </p>
            <div className="flex gap-2">
              <button className="btn btn-ghost flex-1" onClick={() => setShowDeleteModal(false)}>
                Cancel
              </button>
              <button className="btn btn-danger flex-1" onClick={handleDelete}>
                Delete Function
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
