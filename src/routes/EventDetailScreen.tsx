import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import {
  ArrowLeft, Calendar, Clock, MapPin, Sparkles, AlertTriangle,
  History, Gift, User, CheckCircle2, Trash2, ChevronRight,
} from 'lucide-react';
import {
  formatFullDate, formatTime, formatDate,
  getInitials, formatCurrency, getRelationshipLabel,
} from '../utils/formatters';
import EventBadgeIcon from '../components/EventBadgeIcon';
import PriorityBadge from '../components/PriorityBadge';
import { getRelationshipHistory, getGiftHistory, detectScheduleConflicts } from '../services/aiService';

export default function EventDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    invitations,
    people,
    familyEvents,
    schedule,
    updateInvitationStatus,
    removeInvitation,
    isVIP,
    currentPrivilegedUser,
    addActivityLog,
  } = useAppStore();

  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const canManage = isVIP || currentPrivilegedUser?.permissions?.canEditEvents !== false;

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
