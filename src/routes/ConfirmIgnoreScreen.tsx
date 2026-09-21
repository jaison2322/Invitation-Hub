import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import {
  Calendar, Clock, MapPin, Sparkles, AlertTriangle,
  History, Gift, CheckCircle2, ArrowLeft,
} from 'lucide-react';
import {
  formatDate, formatTime, formatFullDate,
  formatCurrency, getInitials,
} from '../utils/formatters';
import EventBadgeIcon from '../components/EventBadgeIcon';
import PriorityBadge from '../components/PriorityBadge';
import type { ExtractedFields, InvitationStatus } from '../types';

export default function ConfirmIgnoreScreen() {
  const navigate = useNavigate();
  const { currentScanResult, addInvitation, setScanResult, addActivityLog, addNotification, isVIP, currentUser, currentPrivilegedUser } = useAppStore();

  if (!currentScanResult) {
    navigate('/scan', { replace: true });
    return null;
  }

  const { analysis } = currentScanResult;
  const editedFieldsStr = sessionStorage.getItem('edited-fields');
  const fields: ExtractedFields = editedFieldsStr
    ? JSON.parse(editedFieldsStr)
    : analysis.extractedFields;
  const nickname = sessionStorage.getItem('invitation-nickname') || '';

  const canConfirmIgnore = isVIP || currentPrivilegedUser?.permissions?.canConfirmIgnoreInvitations === true;

  const handleDecision = (status: 'confirmed' | 'ignored' | 'pending') => {
    const effectiveStatus: InvitationStatus = canConfirmIgnore ? status : 'pending';

    const created = addInvitation({
      personId: analysis.relatedPerson?.id,
      eventType: fields.eventType || 'other',
      title: fields.title || 'New Event',
      nickname: nickname || undefined,
      mainPerson: fields.mainPerson,
      hostName: fields.hostName,
      date: fields.date || new Date().toISOString().split('T')[0],
      time: fields.time,
      venue: fields.venue,
      location: fields.location,
      description: fields.description,
      priority: analysis.suggestedPriority,
      aiSuggestedPriority: analysis.suggestedPriority,
      aiReason: analysis.priorityReason,
      status: effectiveStatus,
      ocrText: analysis.ocrText,
      createdBy: isVIP ? 'vip' : (currentPrivilegedUser?.id || 'staff'),
    });

    const userName = isVIP
      ? (currentUser?.name || 'VIP Principal')
      : (currentPrivilegedUser?.name || 'Staff User');
    const userId = isVIP
      ? (currentUser?.username || 'vip')
      : (currentPrivilegedUser?.id || 'staff');

    // Add Activity Log
    addActivityLog({
      userId,
      userName,
      action: `Scanned & recorded invitation "${created.title}" as ${effectiveStatus}`,
      entityType: 'invitation',
      entityId: created.id,
      entityName: created.title,
    });

    // Add Notification
    if (analysis.scheduleConflicts && analysis.scheduleConflicts.length > 0) {
      addNotification({
        type: 'conflict_warning',
        title: `Schedule Conflict: ${created.title}`,
        message: `Invitation conflicts with ${analysis.scheduleConflicts.length} existing event(s) on ${created.date}.`,
        read: false,
        relatedEntityId: created.id,
        actionUrl: `/conflicts`,
      });
    } else {
      addNotification({
        type: 'new_invitation',
        title: effectiveStatus === 'pending'
          ? `New Invitation Awaiting Review: ${created.title}`
          : `New Invitation Scanned: ${created.title}`,
        message: effectiveStatus === 'pending'
          ? `Scanned by ${userName} and queued for VIP Principal decision.`
          : `Scanned and recorded as ${effectiveStatus.toUpperCase()} for ${created.date}.`,
        read: false,
        relatedEntityId: created.id,
        actionUrl: `/event/${created.id}`,
      });
    }

    // Clean up
    setScanResult(null);
    sessionStorage.removeItem('scan-image');
    sessionStorage.removeItem('invitation-nickname');
    sessionStorage.removeItem('edited-fields');

    navigate('/dashboard', { replace: true });
  };

  return (
    <div className="screen-no-nav">
      {/* ── Stationary Top Bar ────────────────────────────────────────────── */}
      <div className="screen-stationary-header">
        <div className="top-bar">
          <button className="top-bar-back" onClick={() => navigate(-1)} aria-label="Go Back">
            <ArrowLeft size={16} strokeWidth={2} />
          </button>
          <span className="top-bar-title">Protocol Decision</span>
          <div style={{ width: '36px' }} />
        </div>
      </div>

      {/* ── Scrollable Decision Content ─────────────────────────────────────── */}
      <div className="screen-scroll-body" style={{ paddingBottom: '90px' }}>
        {/* ── Executive Briefing Event Pass ─────────────────────────────────── */}
        <div className="hero-event-card mb-3">
        <div className="flex items-start justify-between mb-3">
          <EventBadgeIcon type={fields.eventType || 'other'} size="hero" showGlow />
          <PriorityBadge priority={analysis.suggestedPriority} />
        </div>

        <h1
          className="font-heading font-semibold text-white tracking-tight"
          style={{ fontSize: '20px', letterSpacing: '-0.02em', marginBottom: '2px' }}
        >
          {nickname || fields.title || 'New Event'}
        </h1>
        {nickname && fields.title && nickname !== fields.title && (
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '10px' }}>
            {fields.title}
          </p>
        )}

        <div style={{ height: '0.5px', background: 'var(--color-separator)', margin: '10px 0' }} />

        <div className="flex flex-col gap-2" style={{ fontSize: '13px' }}>
          <div className="flex items-center gap-2 text-slate-200">
            <Calendar size={14} strokeWidth={1.8} style={{ color: 'var(--color-accent)' }} />
            <span>{fields.date ? formatFullDate(fields.date) : 'Date not specified'}</span>
          </div>
          {fields.time && (
            <div className="flex items-center gap-2 text-slate-200">
              <Clock size={14} strokeWidth={1.8} style={{ color: 'var(--color-accent)' }} />
              <span>{formatTime(fields.time)}</span>
            </div>
          )}
          {fields.venue && (
            <div className="flex items-center gap-2 text-slate-200">
              <MapPin size={14} strokeWidth={1.8} style={{ color: 'var(--color-accent)' }} />
              <span className="truncate">{fields.venue}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Apple Intelligence Recommendation ──────────────────────────────── */}
      <div className="apple-intelligence-card mb-3">
        <div className="flex items-center gap-2 mb-1.5">
          <Sparkles size={16} strokeWidth={2} style={{ color: '#64d2ff' }} />
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            AI Suggested Priority: {analysis.suggestedPriority.toUpperCase()}
          </span>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: '1.45' }}>
          {analysis.priorityReason}
        </p>
      </div>

      {/* ── Schedule Conflicts ──────────────────────────────────────────────── */}
      {analysis.scheduleConflicts.length > 0 && (
        <div className="mb-3">
          {analysis.scheduleConflicts.map((conflict, i) => (
            <div key={i} className="conflict-card mb-2">
              <div className="conflict-icon">
                <AlertTriangle size={14} strokeWidth={2} />
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-danger)' }}>
                  {conflict.type === 'time_overlap' ? 'Time Overlap Conflict' : 'Same Day Event'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '1px' }}>
                  {conflict.conflictingItemTitle} at {conflict.conflictingTime}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Protocol History (Grouped List) ─────────────────────────────────── */}
      {analysis.relationshipHistory.length > 0 && (
        <div className="ios-grouped-list mb-3">
          {analysis.relatedPerson && (
            <div className="ios-grouped-item" style={{ cursor: 'default' }}>
              <div className="avatar avatar-sm">
                {getInitials(analysis.relatedPerson.name)}
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {analysis.relatedPerson.nickname}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                  {analysis.relatedPerson.name}
                </div>
              </div>
            </div>
          )}

          {analysis.relationshipHistory.map((item, i) => (
            <div key={i} className="ios-grouped-item" style={{ cursor: 'default' }}>
              <div className="ios-icon-squircle" style={{ background: 'rgba(10, 132, 255, 0.15)', color: '#0a84ff' }}>
                <History size={15} strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>
                  {item.role} — {item.eventName}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                  {formatDate(item.eventDate)}
                </div>
              </div>
              <CheckCircle2 size={14} strokeWidth={2} style={{ color: 'var(--color-confirmed)', flexShrink: 0 }} />
            </div>
          ))}
        </div>
      )}

      {/* ── Gift History ───────────────────────────────────────────────────── */}
      {analysis.giftHistory.length > 0 && (
        <div className="ios-grouped-list mb-3">
          {analysis.giftHistory.map((gift, i) => (
            <div key={i} className="ios-grouped-item" style={{ cursor: 'default' }}>
              <div className="ios-icon-squircle" style={{ background: 'rgba(255, 159, 10, 0.15)', color: '#ff9f0a' }}>
                <Gift size={15} strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: '13px', fontWeight: 500 }}>{gift.gift}</div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{gift.eventName}</div>
              </div>
              {gift.estimatedValue && (
                <span className="badge badge-gold" style={{ flexShrink: 0 }}>
                  {formatCurrency(gift.estimatedValue)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      </div>

      {/* ── Decision Bar ────────────────────────────────────────────────────── */}
      {canConfirmIgnore ? (
        <div className="decision-bar" style={{ flexDirection: 'column', gap: '8px' }}>
          <div className="flex gap-2 w-full">
            <button
              type="button"
              className="btn btn-confirm flex-1 font-heading"
              onClick={() => handleDecision('confirmed')}
            >
              Confirm Attendance
            </button>
            <button
              type="button"
              className="btn btn-ignore flex-1 font-heading"
              onClick={() => handleDecision('ignored')}
            >
              Decline
            </button>
          </div>
          <button
            type="button"
            className="btn btn-ghost w-full font-heading text-xs"
            style={{ padding: '8px', color: 'var(--color-text-secondary)', border: '1px solid var(--glass-border)' }}
            onClick={() => handleDecision('pending')}
          >
            Save to Pending Queue
          </button>
        </div>
      ) : (
        <div className="decision-bar" style={{ flexDirection: 'column', gap: '10px' }}>
          <div
            style={{
              fontSize: '11.5px',
              color: 'var(--color-text-secondary)',
              textAlign: 'center',
              lineHeight: 1.35,
            }}
          >
            <span style={{ color: 'var(--color-pending)', fontWeight: 600 }}>Authorization Notice:</span> RSVP confirmation is reserved for VIP Principal. This event will be queued as Pending.
          </div>
          <button
            type="button"
            className="btn btn-gold w-full font-heading"
            style={{ padding: '13px', fontSize: '15px' }}
            onClick={() => handleDecision('pending')}
          >
            Submit for VIP Review (Pending)
          </button>
        </div>
      )}
    </div>
  );
}
