import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import {
  ArrowLeft, Calendar, Clock, MapPin, Sparkles, AlertTriangle,
  History, Gift, User, CheckCircle2, Trash2, ChevronRight,
  Edit3, X, Building2, Tag,
} from 'lucide-react';
import {
  formatFullDate, formatTime, formatDate,
  getInitials, formatCurrency, getRelationshipLabel, getEventTypeLabel,
} from '../utils/formatters';
import EventBadgeIcon from '../components/EventBadgeIcon';
import PriorityBadge from '../components/PriorityBadge';
import type { EventType, Priority, InvitationStatus } from '../types';
import { getRelationshipHistory, getGiftHistory, detectScheduleConflicts } from '../services/aiService';

export default function EventDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    invitations,
    people,
    familyEvents,
    schedule,
    updateInvitation,
    updateInvitationStatus,
    removeInvitation,
    isVIP,
    currentPrivilegedUser,
    addActivityLog,
  } = useAppStore();

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  // Edit state
  const [editTitle, setEditTitle] = useState('');
  const [editNickname, setEditNickname] = useState('');
  const [editEventType, setEditEventType] = useState<EventType>('wedding');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editPriority, setEditPriority] = useState<Priority>('medium');
  const [editStatus, setEditStatus] = useState<InvitationStatus>('pending');
  const [editVenue, setEditVenue] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editHostName, setEditHostName] = useState('');
  const [editMainPerson, setEditMainPerson] = useState('');
  const [editPersonId, setEditPersonId] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const canManage = isVIP || currentPrivilegedUser?.permissions?.canEditEvents !== false;
  const canConfirmIgnore = isVIP || currentPrivilegedUser?.permissions?.canConfirmIgnoreInvitations === true;

  const invitation = invitations.find((i) => i.id === id);
  if (!invitation) {
    return (
      <div className="screen-no-nav flex items-center justify-center">
        <div className="text-center">
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '15px' }}>Event record not found</p>
          <button className="btn btn-ghost mt-4" onClick={() => navigate(-1)}>Go Back</button>
        </div>
      </div>
    );
  }

  const person = invitation.personId ? people.find((p) => p.id === invitation.personId) : null;
  const relHistory = person ? getRelationshipHistory(person.id, familyEvents) : [];
  const giftHist = person ? getGiftHistory(person.id, familyEvents) : [];
  const conflicts = detectScheduleConflicts(invitation.date, invitation.time, schedule, invitations.filter((i) => i.id !== invitation.id));

  const handleOpenEditModal = () => {
    if (!invitation) return;
    setEditTitle(invitation.title || '');
    setEditNickname(invitation.nickname || '');
    setEditEventType(invitation.eventType || 'wedding');
    setEditDate(invitation.date || '');
    setEditTime(invitation.time || '');
    setEditPriority(invitation.priority || 'medium');
    setEditStatus(invitation.status || 'pending');
    setEditVenue(invitation.venue || '');
    setEditLocation(invitation.location || '');
    setEditHostName(invitation.hostName || '');
    setEditMainPerson(invitation.mainPerson || '');
    setEditPersonId(invitation.personId || '');
    setEditDescription(invitation.description || '');
    setShowEditModal(true);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTitle.trim() || !editDate) return;

    updateInvitation(invitation.id, {
      title: editTitle.trim(),
      nickname: editNickname.trim() || undefined,
      eventType: editEventType,
      date: editDate,
      time: editTime || undefined,
      priority: editPriority,
      status: canConfirmIgnore ? editStatus : invitation.status,
      venue: editVenue.trim() || undefined,
      location: editLocation.trim() || undefined,
      hostName: editHostName.trim() || undefined,
      mainPerson: editMainPerson.trim() || undefined,
      personId: editPersonId || undefined,
      description: editDescription.trim() || undefined,
    });

    addActivityLog({
      userId: isVIP ? 'vip' : currentPrivilegedUser?.id || 'staff',
      userName: isVIP ? 'VIP Principal' : currentPrivilegedUser?.name || 'Staff User',
      action: `Updated details for event "${editTitle.trim()}"`,
      entityType: 'invitation',
      entityId: invitation.id,
      entityName: editTitle.trim(),
    });

    setShowEditModal(false);
  };

  const handleDelete = () => {
    removeInvitation(invitation.id);
    addActivityLog({
      userId: isVIP ? 'vip' : currentPrivilegedUser?.id || 'staff',
      userName: isVIP ? 'VIP Principal' : currentPrivilegedUser?.name || 'Staff User',
      action: `deleted invitation "${invitation.nickname || invitation.title}"`,
      entityType: 'invitation',
      entityId: invitation.id,
      entityName: invitation.nickname || invitation.title,
    });
    navigate('/upcoming', { replace: true });
  };

  return (
    <div className="screen-no-nav">
      {/* ── Stationary Navigation Header ───────────────────────────────────── */}
      <div className="screen-stationary-header">
        <div className="top-bar">
          <button className="top-bar-back" onClick={() => navigate(-1)} aria-label="Go Back">
            <ArrowLeft size={16} strokeWidth={2} />
          </button>
          <span className="top-bar-title">Event Overview</span>
          {canManage ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="btn-icon"
                style={{ color: 'var(--color-accent)' }}
                onClick={handleOpenEditModal}
                title="Edit Event Details"
                aria-label="Edit Event"
              >
                <Edit3 size={16} strokeWidth={1.8} />
              </button>
              <button
                type="button"
                className="btn-icon"
                style={{ color: 'var(--color-danger)' }}
                onClick={() => setShowDeleteModal(true)}
                title="Delete Invitation"
                aria-label="Delete Event"
              >
                <Trash2 size={16} strokeWidth={1.8} />
              </button>
            </div>
          ) : (
            <div style={{ width: '36px' }} />
          )}
        </div>
      </div>

      {/* ── Scrollable Event Content ────────────────────────────────────────── */}
      <div className="screen-scroll-body" style={{ paddingBottom: invitation.status === 'pending' ? '100px' : '32px' }}>
        {/* ── Executive Protocol Dossier Pass ─────────────────────────────────── */}
        <div className="hero-event-card mb-4">
        <div className="flex items-start justify-between mb-3">
          <EventBadgeIcon type={invitation.eventType} size="hero" showGlow />
          <div className="flex items-center gap-2">
            <PriorityBadge priority={invitation.priority} />
            <span className={`badge badge-${invitation.status}`}>
              {invitation.status}
            </span>
            {canManage && (
              <button
                type="button"
                onClick={handleOpenEditModal}
                className="badge cursor-pointer flex items-center gap-1"
                style={{
                  background: 'rgba(212, 168, 83, 0.15)',
                  color: 'var(--color-accent)',
                  border: '1px solid rgba(212, 168, 83, 0.3)',
                  padding: '3px 8px',
                  fontSize: '11px',
                }}
              >
                <Edit3 size={11} strokeWidth={2} /> Edit
              </button>
            )}
          </div>
        </div>

        <h1
          className="font-heading font-semibold text-white tracking-tight"
          style={{ fontSize: '20px', letterSpacing: '-0.02em', marginBottom: '4px' }}
        >
          {invitation.nickname || invitation.title}
        </h1>
        {invitation.nickname && (
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '12px' }}>
            {invitation.title}
          </p>
        )}

        <div style={{ height: '0.5px', background: 'var(--color-separator)', margin: '12px 0' }} />

        {/* Metadata Details */}
        <div className="flex flex-col gap-2.5" style={{ fontSize: '13px' }}>
          <div className="flex items-center gap-2.5 text-slate-200">
            <Calendar size={15} strokeWidth={1.8} style={{ color: 'var(--color-accent)' }} />
            <span>{formatFullDate(invitation.date)}</span>
          </div>
          {invitation.time && (
            <div className="flex items-center gap-2.5 text-slate-200">
              <Clock size={15} strokeWidth={1.8} style={{ color: 'var(--color-accent)' }} />
              <span>{formatTime(invitation.time)}</span>
            </div>
          )}
          {invitation.venue && (
            <div className="flex items-center gap-2.5 text-slate-200">
              <MapPin size={15} strokeWidth={1.8} style={{ color: 'var(--color-accent)' }} />
              <span className="truncate">{invitation.venue}</span>
            </div>
          )}
          {invitation.mainPerson && (
            <div className="flex items-center gap-2.5 text-slate-200">
              <User size={15} strokeWidth={1.8} style={{ color: 'var(--color-accent)' }} />
              <span>Hosted by {invitation.mainPerson}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Apple Intelligence Analysis ────────────────────────────────────── */}
      {invitation.aiReason && (
        <div className="apple-intelligence-card mb-4">
          <div className="flex items-start gap-2.5">
            <Sparkles size={16} strokeWidth={2} style={{ color: '#64d2ff', flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '13px', lineHeight: '1.45', color: 'var(--color-text-secondary)' }}>
              <strong style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>Strategic Briefing: </strong>
              {invitation.aiReason}
            </div>
          </div>
        </div>
      )}

      {/* ── Schedule Conflicts ──────────────────────────────────────────────── */}
      {conflicts.length > 0 && (
        <div className="mb-4">
          {conflicts.map((c, i) => (
            <div key={i} className="conflict-card mb-2">
              <div className="conflict-icon">
                <AlertTriangle size={14} strokeWidth={2} />
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-danger)' }}>
                  {c.type === 'time_overlap' ? 'Time Overlap Conflict' : 'Same Day Event'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                  {c.conflictingItemTitle} at {c.conflictingTime}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Host Profile Inset Link ────────────────────────────────────────── */}
      {person && (
        <div className="ios-grouped-list mb-4">
          <div
            className="ios-grouped-item"
            onClick={() => navigate(`/person/${person.id}`)}
          >
            <div className="avatar avatar-sm">
              {getInitials(person.name)}
            </div>
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: '14px', fontWeight: 600 }}>{person.nickname}</div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                {person.name} · {getRelationshipLabel(person.relationship)}
              </div>
            </div>
            <ChevronRight size={16} strokeWidth={2} style={{ color: 'var(--color-text-muted)' }} />
          </div>
        </div>
      )}

      {/* ── Relationship History ───────────────────────────────────────────── */}
      {relHistory.length > 0 && (
        <section className="mb-4">
          <div className="section-header">
            <span className="section-title">Protocol History</span>
          </div>

          <div className="ios-grouped-list">
            {relHistory.map((item, i) => (
              <div key={i} className="ios-grouped-item" style={{ cursor: 'default' }}>
                <div className="ios-icon-squircle" style={{ background: 'rgba(10, 132, 255, 0.15)', color: '#0a84ff' }}>
                  <History size={16} strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)' }}>
                    {item.role} — {item.eventName}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '1px' }}>
                    {formatDate(item.eventDate)}
                  </div>
                </div>
                <CheckCircle2 size={15} strokeWidth={2} style={{ color: 'var(--color-confirmed)', flexShrink: 0 }} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Gift History ───────────────────────────────────────────────────── */}
      {giftHist.length > 0 && (
        <section className="mb-4">
          <div className="section-header">
            <span className="section-title">Gift Registry Record</span>
          </div>

          <div className="ios-grouped-list">
            {giftHist.map((g, i) => (
              <div key={i} className="ios-grouped-item" style={{ cursor: 'default' }}>
                <div className="ios-icon-squircle" style={{ background: 'rgba(255, 159, 10, 0.15)', color: '#ff9f0a' }}>
                  <Gift size={16} strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>{g.gift}</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '1px' }}>
                    {g.eventName}
                  </div>
                </div>
                {g.estimatedValue && (
                  <span className="badge badge-gold" style={{ flexShrink: 0 }}>
                    {formatCurrency(g.estimatedValue)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
      </div>

      {/* ── Decision Bar for Pending Events ────────────────────────────────── */}
      {invitation.status === 'pending' && (
        canConfirmIgnore ? (
          <div className="decision-bar">
            <button
              type="button"
              className="btn btn-confirm flex-1 font-heading"
              onClick={() => {
                updateInvitationStatus(invitation.id, 'confirmed');
                navigate(-1);
              }}
            >
              Confirm Attendance
            </button>
            <button
              type="button"
              className="btn btn-ignore flex-1 font-heading"
              onClick={() => {
                updateInvitationStatus(invitation.id, 'ignored');
                navigate(-1);
              }}
            >
              Decline
            </button>
          </div>
        ) : (
          <div className="decision-bar" style={{ justifyContent: 'center' }}>
            <div
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '10px',
                background: 'rgba(255, 179, 64, 0.08)',
                border: '1px solid rgba(255, 179, 64, 0.2)',
                textAlign: 'center',
                fontSize: '12.5px',
                color: '#ffb340',
                fontWeight: 500,
              }}
            >
              Pending VIP Principal RSVP Decision
            </div>
          </div>
        )
      )}

      {/* ── Edit Event Details Modal ─────────────────────────────────────── */}
      {showEditModal && (
        <div className="modal-overlay modal-centered" onClick={() => setShowEditModal(false)}>
          <div
            className="modal-dialog animate-scale-in"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxHeight: '88vh',
              overflowY: 'auto',
              padding: '22px',
              textAlign: 'left',
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-heading font-semibold text-white" style={{ fontSize: '18px' }}>
                  Edit Event Details
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                  Update event timing, address, priority, or status.
                </p>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setShowEditModal(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="flex flex-col gap-3">
              {/* Title / Event Name */}
              <div>
                <label className="label">Event Title *</label>
                <input
                  type="text"
                  className="input"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="e.g. Wedding Reception"
                  required
                />
              </div>

              {/* Display Nickname */}
              <div>
                <label className="label">Display Nickname</label>
                <input
                  type="text"
                  className="input"
                  value={editNickname}
                  onChange={(e) => setEditNickname(e.target.value)}
                  placeholder="e.g. Arun Prakash — Wedding"
                />
              </div>

              {/* Event Type / Category */}
              <div>
                <label className="label">Event Category</label>
                <select
                  className="select"
                  value={editEventType}
                  onChange={(e) => setEditEventType(e.target.value as EventType)}
                >
                  <option value="wedding">Wedding</option>
                  <option value="engagement">Engagement</option>
                  <option value="reception">Reception</option>
                  <option value="birthday">Birthday</option>
                  <option value="anniversary">Anniversary</option>
                  <option value="house_warming">House Warming</option>
                  <option value="baby_shower">Baby Shower</option>
                  <option value="business_event">Business Event</option>
                  <option value="cultural">Cultural</option>
                  <option value="religious">Religious</option>
                  <option value="graduation">Graduation</option>
                  <option value="retirement">Retirement</option>
                  <option value="funeral">Funeral</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* Date & Time */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="label">Date *</label>
                  <input
                    type="date"
                    className="input"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="label">Time</label>
                  <input
                    type="time"
                    className="input"
                    value={editTime}
                    onChange={(e) => setEditTime(e.target.value)}
                  />
                </div>
              </div>

              {/* Priority Selector */}
              <div>
                <label className="label">Priority Level</label>
                <div className="flex gap-2">
                  {(['high', 'medium', 'low'] as Priority[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`btn flex-1 text-xs capitalize ${
                        editPriority === p ? 'btn-gold' : 'btn-outline'
                      }`}
                      style={{ padding: '8px 6px' }}
                      onClick={() => setEditPriority(p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status Selector (Authorized users can change status before or after confirm) */}
              {canConfirmIgnore && (
                <div>
                  <label className="label">Event Status</label>
                  <div className="flex gap-2">
                    {(['confirmed', 'pending', 'ignored'] as InvitationStatus[]).map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={`btn flex-1 text-xs capitalize ${
                          editStatus === s
                            ? s === 'confirmed'
                              ? 'btn-confirm'
                              : s === 'ignored'
                              ? 'btn-ignore'
                              : 'btn-gold'
                            : 'btn-outline'
                        }`}
                        style={{ padding: '8px 6px' }}
                        onClick={() => setEditStatus(s)}
                      >
                        {s === 'ignored' ? 'Declined' : s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Venue & Location / Address */}
              <div>
                <label className="label">Venue Name</label>
                <input
                  type="text"
                  className="input"
                  value={editVenue}
                  onChange={(e) => setEditVenue(e.target.value)}
                  placeholder="e.g. Grand Palace Hall"
                />
              </div>

              <div>
                <label className="label">Location / Address</label>
                <input
                  type="text"
                  className="input"
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  placeholder="e.g. 12 Anna Salai, Chennai"
                />
              </div>

              {/* Host & Principal Couple */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="label">Host Name</label>
                  <input
                    type="text"
                    className="input"
                    value={editHostName}
                    onChange={(e) => setEditHostName(e.target.value)}
                    placeholder="e.g. Rajesh Kumar"
                  />
                </div>
                <div>
                  <label className="label">Couple / Principal</label>
                  <input
                    type="text"
                    className="input"
                    value={editMainPerson}
                    onChange={(e) => setEditMainPerson(e.target.value)}
                    placeholder="e.g. Sneha & Rajesh"
                  />
                </div>
              </div>

              {/* Link to VIP Contact */}
              <div>
                <label className="label">Link VIP Contact</label>
                <select
                  className="select"
                  value={editPersonId}
                  onChange={(e) => setEditPersonId(e.target.value)}
                >
                  <option value="">No VIP Contact Linked</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nickname} ({p.name})
                    </option>
                  ))}
                </select>
              </div>

              {/* Notes / Description */}
              <div>
                <label className="label">Notes / Description</label>
                <textarea
                  className="input"
                  rows={2}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Add any specific instructions or details..."
                  style={{ resize: 'vertical' }}
                />
              </div>

              {/* Modal Actions */}
              <div className="flex gap-2 mt-3 pt-2" style={{ borderTop: '1px solid var(--glass-border)' }}>
                <button
                  type="button"
                  className="btn btn-ghost flex-1"
                  onClick={() => setShowEditModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-gold flex-1 font-heading"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ──────────────────────────────────────── */}
      {showDeleteModal && (
        <div className="modal-overlay modal-centered" onClick={() => setShowDeleteModal(false)}>
          <div className="modal-dialog text-center" onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                background: 'rgba(255, 69, 58, 0.15)',
                color: 'var(--color-danger)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 12px',
              }}
            >
              <Trash2 size={20} strokeWidth={1.8} />
            </div>
            <h3 className="font-heading font-semibold text-white mb-1" style={{ fontSize: '17px' }}>
              Delete Invitation?
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
              Are you sure you want to remove &ldquo;{invitation.nickname || invitation.title}&rdquo;? This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-ignore flex-1"
                onClick={() => setShowDeleteModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger flex-1"
                onClick={handleDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
