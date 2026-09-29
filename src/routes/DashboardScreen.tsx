import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import {
  Bell, Calendar, Clock, MapPin, AlertTriangle,
  ChevronRight, Sparkles, Users, Gift, Plus,
  CheckCircle2, TrendingUp, Compass,
} from 'lucide-react';
import { formatDate, formatTime, daysUntil, getInitials, formatTimeAgo } from '../utils/formatters';
import EventBadgeIcon from '../components/EventBadgeIcon';
import PriorityBadge from '../components/PriorityBadge';
import IconBadge from '../components/IconBadge';
import type { Invitation } from '../types';
import { useTranslation } from '../i18n/useTranslation';

export default function DashboardScreen() {
  const navigate = useNavigate();
  const {
    currentUser, currentPrivilegedUser, isVIP, invitations, schedule, notifications,
    activityLogs, people, familyEvents, updateInvitationStatus,
  } = useAppStore();
  const { t } = useTranslation();

  const activeUser = isVIP ? currentUser : currentPrivilegedUser;
  const activeUserName = activeUser?.name || (isVIP ? t('dashboard.vipPrincipal') : t('dashboard.privilegedStaff'));
  const activeUserRole = isVIP ? t('dashboard.vipPrincipal') : (currentPrivilegedUser?.role || t('dashboard.privilegedStaff'));
  const canConfirmIgnore = isVIP || currentPrivilegedUser?.permissions?.canConfirmIgnoreInvitations === true;

  const pendingInvitations = invitations.filter((i) => i.status === 'pending');
  const confirmedInvitations = invitations.filter((i) => i.status === 'confirmed');
  const unreadNotifications = notifications.filter((n) => !n.read).length;

  // Today's events
  const today = new Date().toISOString().split('T')[0];
  const todaySchedule = schedule.filter((s) => s.date === today);
  const todayInvitations = invitations.filter((i) => i.date === today && i.status === 'confirmed');

  // Next important event (first pending sorted by date)
  const nextPending = [...pendingInvitations].sort(
    (a, b) => a.date.localeCompare(b.date)
  )[0];

  // Upcoming confirmed (next 7 days)
  const upcomingConfirmed = confirmedInvitations
    .filter((i) => daysUntil(i.date) >= 0 && daysUntil(i.date) <= 7)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Conflicts detection
  const dateConflicts = new Map<string, Invitation[]>();
  invitations
    .filter((i) => i.status !== 'ignored')
    .forEach((inv) => {
      const existing = dateConflicts.get(inv.date) || [];
      existing.push(inv);
      dateConflicts.set(inv.date, existing);
    });
  const conflictDates = [...dateConflicts.entries()].filter(
    ([date, invs]) => invs.length > 1 || schedule.some((s) => s.date === date)
  );

  const handleConfirm = (id: string) => {
    updateInvitationStatus(id, 'confirmed');
  };

  const handleIgnore = (id: string) => {
    updateInvitationStatus(id, 'ignored');
  };

  return (
    <div className="screen">
      {/* ── Stationary Top Profile Header Bar ───────────────────────────────── */}
      <div className="screen-stationary-header">
        <header
          className="flex items-center justify-between"
          style={{ paddingBottom: '14px' }}
        >
          <div
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => navigate('/settings')}
          >
            <div
              className="avatar avatar-sm"
              style={{ width: '38px', height: '38px', fontSize: '16px' }}
            >
              {getInitials(activeUserName)}
            </div>
            <div>
              <div
                style={{
                  fontSize: '15px',
                  fontWeight: 500,
                  color: 'var(--color-text-secondary)',
                  letterSpacing: '-0.01em',
                }}
              >
                {isVIP ? 'Executive Principal' : activeUserRole}
              </div>
              <div
                className="font-heading font-semibold text-white truncate"
                style={{ fontSize: '21px', maxWidth: '200px', letterSpacing: '-0.01em' }}
              >
                {activeUserName}
              </div>
            </div>
          </div>

          {/* Notifications Icon Button */}
          <button
            type="button"
            className="btn-icon"
            onClick={() => navigate('/notifications')}
            aria-label="Notifications"
            style={{ position: 'relative', width: '40px', height: '40px' }}
          >
            <Bell size={20} strokeWidth={1.8} />
            {unreadNotifications > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: '7px',
                  right: '7px',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: 'var(--color-danger)',
                }}
              />
            )}
          </button>
        </header>
      </div>

      {/* ── Scrollable Lower Content Area ───────────────────────────────────── */}
      <div className="screen-scroll-body">
        {/* ── Apple iOS Large Title ───────────────────────────────────────────── */}
        <div style={{ marginBottom: '18px' }}>
          <h1
            className="font-heading font-bold text-white tracking-tight"
            style={{ fontSize: '30px', letterSpacing: '-0.03em', lineHeight: 1.15 }}
          >
            {t('dashboard.executiveBriefing')}
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '3px' }}>
            {t('dashboard.protocolLedger')}
          </p>
        </div>

      {/* ── Executive Metric Widgets ──────────────────────────── */}
      <section style={{ marginBottom: '22px' }}>
        <div className="grid grid-cols-3 gap-2.5">
          <div
            className="stat-card-luxury cursor-pointer"
            onClick={() => navigate('/upcoming')}
          >
            <div className="flex justify-center mb-1.5">
              <IconBadge icon={Clock} variant="amber" size="xs" />
            </div>
            <div className="stat-value" style={{ color: '#fbbf24', fontSize: '22px' }}>
              {pendingInvitations.length}
            </div>
            <div className="stat-label">{t('events.pending')}</div>
          </div>

          <div
            className="stat-card-luxury cursor-pointer"
            onClick={() => navigate('/upcoming')}
          >
            <div className="flex justify-center mb-1.5">
              <IconBadge icon={CheckCircle2} variant="emerald" size="xs" />
            </div>
            <div className="stat-value" style={{ color: '#34d399', fontSize: '22px' }}>
              {confirmedInvitations.length}
            </div>
            <div className="stat-label">{t('events.confirmed')}</div>
          </div>

          <div
            className="stat-card-luxury cursor-pointer"
            onClick={() => navigate('/people')}
          >
            <div className="flex justify-center mb-1.5">
              <IconBadge icon={Users} variant="cyan" size="xs" />
            </div>
            <div className="stat-value text-white" style={{ fontSize: '22px' }}>
              {people.length}
            </div>
            <div className="stat-label">{t('contacts.title')}</div>
          </div>
        </div>
      </section>

      {/* ── Executive Briefing Layout (2-Column on Desktop) ──────────────── */}
      <div className="desktop-grid-2">
        {/* ── Column 1: Priority Decisions & Queue ──────────────────────────── */}
        <div className="flex flex-col gap-5">
          {/* ── Priority Decision Pass ──────────────────────────────────────── */}
          {nextPending && (
            <section>
              <div className="section-header">
                <span className="section-title">{t('dashboard.upcomingProtocols')}</span>
                <span
                  className="section-action flex items-center gap-1 cursor-pointer"
                  onClick={() => navigate(`/event/${nextPending.id}`)}
                >
                  {t('common.details')}
                  <ChevronRight size={13} strokeWidth={2} />
                </span>
              </div>

              <div
                className="hero-event-card cursor-pointer"
                onClick={() => navigate(`/event/${nextPending.id}`)}
              >
                {/* Top Pass Header */}
                <div className="flex items-start justify-between" style={{ marginBottom: '14px' }}>
                  <EventBadgeIcon type={nextPending.eventType} size="hero" showGlow />
                  <div className="flex items-center gap-2">
                    <PriorityBadge priority={nextPending.priority} />
                    {daysUntil(nextPending.date) <= 3 && (
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: 'rgba(245, 158, 11, 0.15)',
                          color: '#fbbf24',
                          border: '1px solid rgba(245, 158, 11, 0.3)',
                          fontFamily: 'var(--font-mono)',
                          letterSpacing: '0.04em',
                        }}
                      >
                        {daysUntil(nextPending.date) === 0
                          ? 'TODAY'
                          : `${daysUntil(nextPending.date)}D LEFT`}
                      </span>
                    )}
                  </div>
                </div>

                {/* Event Headline */}
                <h2
                  className="font-heading font-semibold text-white tracking-tight"
                  style={{ fontSize: '19px', letterSpacing: '-0.02em', marginBottom: '8px' }}
                >
                  {nextPending.nickname || nextPending.title}
                </h2>

                {/* Event Metadata */}
                <div
                  className="flex flex-col gap-2"
                  style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}
                >
                  <div className="flex items-center gap-2 text-slate-300">
                    <Calendar size={14} strokeWidth={1.8} style={{ color: 'var(--color-accent)' }} />
                    <span>{formatDate(nextPending.date)}</span>
                    {nextPending.time && (
                      <>
                        <span style={{ color: 'var(--color-text-quaternary)' }}>•</span>
                        <Clock size={14} strokeWidth={1.8} style={{ color: 'var(--color-accent)' }} />
                        <span>{formatTime(nextPending.time)}</span>
                      </>
                    )}
                  </div>
                  {(nextPending.venue || nextPending.location) && (
                    <div className="flex items-center gap-2 text-slate-300">
                      <MapPin size={14} strokeWidth={1.8} style={{ color: 'var(--color-accent)' }} />
                      <span className="truncate">
                        {nextPending.venue && nextPending.location
                          ? `${nextPending.venue}, ${nextPending.location}`
                          : (nextPending.venue || nextPending.location)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Executive Protocol Intelligence Briefing */}
                {nextPending.aiReason && (
                  <div className="apple-intelligence-card" style={{ marginTop: '14px' }}>
                    <div className="flex items-start gap-2.5">
                      <IconBadge icon={Sparkles} variant="cyan" size="xs" glow />
                      <div style={{ fontSize: '12px', lineHeight: '1.45', color: 'var(--color-text-secondary)', alignSelf: 'center' }}>
                        <strong style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>Protocol Analysis: </strong>
                        {nextPending.aiReason}
                      </div>
                    </div>
                  </div>
                )}

                {/* Conflict Warning Pill */}
                {schedule.some((s) => s.date === nextPending.date) && (
                  <div className="conflict-card" style={{ marginTop: '12px' }}>
                    <div className="conflict-icon">
                      <AlertTriangle size={14} strokeWidth={2} />
                    </div>
                    <div style={{ fontSize: '12px', color: '#ff453a' }}>
                      <strong>Conflict Detected: </strong>
                      {schedule.filter((s) => s.date === nextPending.date).map((s) => s.title).join(', ')}
                    </div>
                  </div>
                )}

                {/* Action Bar / Pending VIP Notice */}
                {canConfirmIgnore ? (
                  <div className="flex gap-2.5" style={{ marginTop: '16px' }}>
                    <button
                      type="button"
                      className="btn btn-confirm flex-1 font-heading flex items-center justify-center gap-1.5"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleConfirm(nextPending.id);
                      }}
                      style={{ fontSize: '13px', padding: '10px 14px' }}
                    >
                      <CheckCircle2 size={15} strokeWidth={2.4} />
                      <span>Confirm</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-ignore flex-1 font-heading flex items-center justify-center gap-1.5"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleIgnore(nextPending.id);
                      }}
                      style={{ fontSize: '13px', padding: '10px 14px' }}
                    >
                      <span>Decline</span>
                    </button>
                  </div>
                ) : (
                  <div
                    className="flex items-center justify-between"
                    style={{
                      marginTop: '16px',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      background: 'rgba(255, 179, 64, 0.08)',
                      border: '1px solid rgba(255, 179, 64, 0.2)',
                    }}
                  >
                    <span style={{ fontSize: '12.5px', color: '#ffb340', fontWeight: 500 }}>
                      Pending VIP Principal Review
                    </span>
                    <span
                      style={{
                        fontSize: '12px',
                        color: 'var(--color-text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px',
                      }}
                    >
                      View <ChevronRight size={12} />
                    </span>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ── Upcoming Queue (Apple Horizontal Carousel) ─────────────────────── */}
          {pendingInvitations.length > 1 && (
            <section style={{ marginBottom: '24px' }}>
              <div className="section-header">
                <span className="section-title">Pending Queue</span>
                <span
                  className="section-action flex items-center gap-1"
                  onClick={() => navigate('/upcoming')}
                >
                  <span>See All</span>
                  <ChevronRight size={13} strokeWidth={2} />
                </span>
              </div>

              <div
                className="flex overflow-x-auto gap-3 pb-2 hide-scrollbar snap-x snap-mandatory"
                style={{ margin: '0 calc(-1 * var(--space-4))', padding: '0 var(--space-4)' }}
              >
                {pendingInvitations.slice(1, 6).map((inv) => (
                  <div
                    key={inv.id}
                    className="event-card flex flex-col justify-between snap-start"
                    onClick={() => navigate(`/event/${inv.id}`)}
                    style={{
                      minWidth: '220px',
                      maxWidth: '240px',
                      flexShrink: 0,
                      padding: '14px',
                    }}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <EventBadgeIcon type={inv.eventType} size="sm" />
                      <PriorityBadge priority={inv.priority} size="sm" showLabel={false} />
                    </div>
                    <div>
                      <h3
                        className="font-heading font-semibold text-white truncate"
                        style={{ fontSize: '14px', marginBottom: '4px', letterSpacing: '-0.01em' }}
                      >
                        {inv.nickname || inv.title}
                      </h3>
                      <div
                        className="flex items-center gap-2"
                        style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}
                      >
                        <span className="flex items-center gap-1">
                          <Calendar size={12} strokeWidth={1.8} style={{ color: 'var(--color-text-muted)' }} />
                          {formatDate(inv.date)}
                        </span>
                        {inv.time && (
                          <span className="flex items-center gap-1">
                            <Clock size={12} strokeWidth={1.8} style={{ color: 'var(--color-text-muted)' }} />
                            {formatTime(inv.time)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* ── Column 2: Today's Schedule, Protocol Ledger & Audit Trail ──────── */}
        <div className="flex flex-col gap-5">
          {/* ── Today's Schedule (Apple Grouped List) ─────────────────────────── */}
          {(todaySchedule.length > 0 || todayInvitations.length > 0) && (
            <section>
              <div className="section-header">
                <span className="section-title">{t('dashboard.todayAgenda')}</span>
              </div>

              <div className="ios-grouped-list">
                {todaySchedule.map((item) => (
                  <div key={item.id} className="ios-grouped-item">
                    <div className="ios-icon-squircle" style={{ background: 'rgba(10, 132, 255, 0.15)', color: '#0a84ff' }}>
                      <Calendar size={16} strokeWidth={2} />
                    </div>
                    <div className="flex-1">
                      <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-text-primary)' }}>{item.title}</div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                        {formatTime(item.startTime)}{item.endTime ? ` – ${formatTime(item.endTime)}` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Apple Inset Grouped Vault / Navigation ─────────────────────────── */}
          <section>
            <div className="section-header">
              <span className="section-title">Event Vault</span>
            </div>

            <div className="ios-grouped-list">
              <div
                className="ios-grouped-item"
                onClick={() => navigate('/calendar')}
              >
                <div className="ios-icon-squircle" style={{ background: 'rgba(255, 69, 58, 0.15)', color: '#ff453a' }}>
                  <Calendar size={16} strokeWidth={2} />
                </div>
                <div className="flex-1">
                  <div style={{ fontSize: '14px', fontWeight: 500 }}>Event Calendar</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Monthly timeline & schedules</div>
                </div>
                <ChevronRight size={16} strokeWidth={2} style={{ color: 'var(--color-text-muted)' }} />
              </div>

              <div
                className="ios-grouped-item"
                onClick={() => navigate('/gifts')}
              >
                <div className="ios-icon-squircle" style={{ background: 'rgba(255, 159, 10, 0.15)', color: '#ff9f0a' }}>
                  <Gift size={16} strokeWidth={2} />
                </div>
                <div className="flex-1">
                  <div style={{ fontSize: '14px', fontWeight: 500 }}>Gift History</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Gift exchanges & history</div>
                </div>
                <ChevronRight size={16} strokeWidth={2} style={{ color: 'var(--color-text-muted)' }} />
              </div>

              <div
                className="ios-grouped-item"
                onClick={() => navigate('/past-events')}
              >
                <div className="ios-icon-squircle" style={{ background: 'rgba(10, 132, 255, 0.15)', color: '#0a84ff' }}>
                  <Users size={16} strokeWidth={2} />
                </div>
                <div className="flex-1">
                  <div style={{ fontSize: '14px', fontWeight: 500 }}>Past Functions</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Archive of attended events</div>
                </div>
                <ChevronRight size={16} strokeWidth={2} style={{ color: 'var(--color-text-muted)' }} />
              </div>

              <div
                className="ios-grouped-item"
                onClick={() => navigate('/add-event')}
              >
                <div className="ios-icon-squircle" style={{ background: 'rgba(48, 209, 88, 0.15)', color: '#30d158' }}>
                  <Plus size={16} strokeWidth={2} />
                </div>
                <div className="flex-1">
                  <div style={{ fontSize: '14px', fontWeight: 500 }}>Record Function</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Directly register a new event</div>
                </div>
                <ChevronRight size={16} strokeWidth={2} style={{ color: 'var(--color-text-muted)' }} />
              </div>
            </div>
          </section>

          {/* ── Apple Audit Trail (Recent Activity) ────────────────────────────── */}
          {activityLogs.length > 0 && (
            <section>
              <div className="section-header">
                <span className="section-title">History/ Logs</span>
                <span className="section-action" onClick={() => navigate('/activity')}>
                  View All
                </span>
              </div>

              <div className="ios-grouped-list">
                {activityLogs.slice(0, 3).map((log) => (
                  <div key={log.id} className="ios-grouped-item" style={{ cursor: 'default' }}>
                    <div className="avatar avatar-sm">
                      {getInitials(log.userName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>
                        <span style={{ fontWeight: 600 }}>{log.userName}</span>{' '}
                        <span style={{ color: 'var(--color-text-secondary)' }}>{log.action}</span>
                      </div>
                      {log.entityName && (
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }} className="truncate">
                          {log.entityName}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', flexShrink: 0 }}>
                      {formatTimeAgo(log.timestamp)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* ── Empty State ────────────────────────────────────────────────────── */}
      {pendingInvitations.length === 0 && confirmedInvitations.length === 0 && (
        <div className="empty-state" style={{ marginTop: '40px' }}>
          <div className="empty-state-title" style={{ fontSize: '20px', fontWeight: 600 }}>All Caught Up</div>
          <div className="empty-state-text" style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            No pending invitations in the ledger.
          </div>
          <div className="flex gap-2 mt-4" style={{ maxWidth: '300px', margin: '16px auto 0' }}>
            <button className="btn btn-gold flex-1" onClick={() => navigate('/scan')}>
              Scan
            </button>
            <button className="btn btn-outline flex-1" onClick={() => navigate('/add-invitation')}>
              Manual
            </button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
