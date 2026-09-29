import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import {
  ArrowLeft, AlertTriangle, Calendar, Clock, MapPin, Sparkles,
  CheckCircle2, XCircle, ArrowRightLeft, ShieldAlert
} from 'lucide-react';
import { formatDate, formatTime } from '../utils/formatters';
import EventBadgeIcon from '../components/EventBadgeIcon';
import PriorityBadge from '../components/PriorityBadge';

export default function ScheduleConflictScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const dateParam = searchParams.get('date');

  const { invitations, schedule, updateInvitationStatus, updateScheduleItem, isVIP, currentPrivilegedUser } = useAppStore();
  const canConfirmIgnore = isVIP || currentPrivilegedUser?.permissions?.canConfirmIgnoreInvitations === true;

  // Find conflicting date or default to first date with conflict
  const dateConflicts = new Map<string, { invitations: typeof invitations; schedule: typeof schedule }>();

  invitations.filter((i) => i.status !== 'ignored').forEach((inv) => {
    const existing = dateConflicts.get(inv.date) || { invitations: [], schedule: [] };
    existing.invitations.push(inv);
    dateConflicts.set(inv.date, existing);
  });

  schedule.forEach((item) => {
    const existing = dateConflicts.get(item.date) || { invitations: [], schedule: [] };
    existing.schedule.push(item);
    dateConflicts.set(item.date, existing);
  });

  const conflictDates = [...dateConflicts.entries()]
    .filter(([, data]) => (data.invitations.length + data.schedule.length) > 1)
    .map(([date, data]) => ({ date, ...data }));

  const [selectedDate, setSelectedDate] = useState<string>(
    dateParam || (conflictDates.length > 0 ? conflictDates[0].date : '2026-08-30')
  );

  const activeConflict = conflictDates.find((c) => c.date === selectedDate) || {
    date: selectedDate,
    invitations: invitations.filter((i) => i.date === selectedDate && i.status !== 'ignored'),
    schedule: schedule.filter((s) => s.date === selectedDate),
  };

  const handleResolveConfirm = (invId: string) => {
    updateInvitationStatus(invId, 'confirmed');
  };

  const handleResolveIgnore = (invId: string) => {
    updateInvitationStatus(invId, 'ignored');
  };

  return (
    <div className="screen-no-nav">
      {/* ── Stationary Top Bar ────────────────────────────────────────────── */}
      <div className="screen-stationary-header">
        <div className="top-bar">
          <button className="top-bar-back" onClick={() => navigate(-1)}>
            <ArrowLeft size={18} />
          </button>
          <span className="top-bar-title">Schedule Conflict Center</span>
          <div style={{ width: '36px' }} />
        </div>
      </div>

      {/* ── Scrollable Conflicts Content ────────────────────────────────────── */}
      <div className="screen-scroll-body" style={{ paddingBottom: 'var(--space-12)' }}>
        {/* Hero Banner */}
      <div className="conflict-card animate-slide-up mb-4" style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)' }}>
        <div className="conflict-icon" style={{ width: '36px', height: '36px' }}>
          <ShieldAlert size={20} />
        </div>
        <div>
          <div className="font-heading font-semibold" style={{ color: 'var(--color-danger)', fontSize: 'var(--text-base)' }}>
            {conflictDates.length} Schedule Conflict Day{conflictDates.length > 1 ? 's' : ''} Detected
          </div>
          <p className="text-xs text-secondary mt-1">
            Multiple high-stakes commitments or overlapping time slots require VIP decision.
          </p>
        </div>
      </div>

      {/* Date Selector Tabs */}
      {conflictDates.length > 1 && (
        <div className="overflow-x-auto mb-4" style={{ margin: '0 calc(-1 * var(--space-4)) var(--space-4)', padding: '0 var(--space-4)' }}>
          <div className="tabs" style={{ width: 'max-content' }}>
            {conflictDates.map((c) => (
              <button
                key={c.date}
                className={`tab ${selectedDate === c.date ? 'active' : ''}`}
                onClick={() => setSelectedDate(c.date)}
              >
                <AlertTriangle size={12} style={{ display: 'inline', marginRight: '4px', color: 'var(--color-danger)' }} />
                {formatDate(c.date)} ({c.invitations.length + c.schedule.length} events)
              </button>
            ))}
          </div>
        </div>
      )}

      {/* AI Conflict Analysis & Recommendation */}
      <div className="glass-card glass-card-gold animate-slide-up delay-1 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={16} style={{ color: 'var(--color-gold)' }} />
          <span className="font-heading font-semibold text-sm">AI Conflict Resolution Strategy</span>
        </div>
        <div className="text-sm text-secondary" style={{ lineHeight: '1.6' }}>
          {activeConflict.invitations.some((i) => i.priority === 'high') ? (
            <p>
              <strong className="text-gold">Priority Recommendation:</strong> The wedding invitation from your high-tier connection{' '}
              <span style={{ color: 'var(--color-priority-high)', fontWeight: 600 }}>High Priority</span> is socially critical due to historical reciprocal gifts. Consider rescheduling earlier business meetings by 1 hour or attending the ceremony reception after 6:30 PM.
            </p>
          ) : (
            <p>
              Both commitments can be attended sequentially if travel time between venues is under 30 minutes.
            </p>
          )}
        </div>
      </div>

      {/* Visual Timeline Comparison */}
      <div className="section-header">
        <span className="section-title">Timeline for {formatDate(selectedDate)}</span>
      </div>

      <div className="flex flex-col gap-3 animate-slide-up delay-2">
        {/* Schedule Meetings */}
        {activeConflict.schedule.map((item) => (
          <div key={item.id} className="glass-card" style={{ borderLeft: '3px solid var(--color-info)' }}>
            <div className="flex items-start justify-between">
              <div>
                <span className="badge badge-info" style={{ fontSize: '9px', marginBottom: '6px' }}>
                  Calendar Event
                </span>
                <div className="font-heading font-semibold text-base">{item.title}</div>
                <div className="flex items-center gap-3 mt-2 text-xs text-secondary">
                  <span className="flex items-center gap-1">
                    <Clock size={12} /> {formatTime(item.startTime)}{item.endTime ? ` - ${formatTime(item.endTime)}` : ''}
                  </span>
                  {item.location && (
                    <span className="flex items-center gap-1">
                      <MapPin size={12} /> {item.location}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Invitations on same day */}
        {activeConflict.invitations.map((inv) => (
          <div
            key={inv.id}
            className="event-card"
            style={{ borderLeft: `3px solid var(--color-priority-${inv.priority})` }}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <EventBadgeIcon type={inv.eventType} size="xs" />
                <PriorityBadge priority={inv.priority} size="sm" />
              </div>
              <span className={`badge badge-${inv.status}`} style={{ fontSize: '10px' }}>
                {inv.status}
              </span>
            </div>

            <div className="event-card-title">{inv.nickname || inv.title}</div>
            <div className="flex items-center gap-3 mt-2 text-xs text-secondary">
              <span className="flex items-center gap-1">
                <Clock size={12} /> {inv.time ? formatTime(inv.time) : 'Time TBD'}
              </span>
              {(inv.venue || inv.location) && (
                <span className="flex items-center gap-1">
                  <MapPin size={12} />
                  {inv.venue && inv.location ? `${inv.venue}, ${inv.location}` : (inv.venue || inv.location)}
                </span>
              )}
            </div>

            {/* Quick Actions */}
            {canConfirmIgnore && (
              <div className="flex gap-2 mt-3 pt-3" style={{ borderTop: '1px solid var(--glass-border)' }}>
                <button
                  className="btn btn-sm btn-confirm flex-1"
                  onClick={() => handleResolveConfirm(inv.id)}
                >
                  <CheckCircle2 size={14} /> Prioritize & Confirm
                </button>
                <button
                  className="btn btn-sm btn-ignore flex-1"
                  onClick={() => handleResolveIgnore(inv.id)}
                >
                  <XCircle size={14} /> Decline / Ignore
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}
