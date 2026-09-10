import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { ArrowLeft, Bell, Clock, Calendar } from 'lucide-react';
import { formatDate, daysUntil } from '../utils/formatters';
import EventBadgeIcon from '../components/EventBadgeIcon';
import PriorityBadge from '../components/PriorityBadge';

export default function ReminderCenterScreen() {
  const navigate = useNavigate();
  const { invitations } = useAppStore();

  const confirmed = invitations
    .filter((i) => i.status === 'confirmed' && daysUntil(i.date) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const getUrgencyColor = (days: number): string => {
    if (days === 0) return 'var(--color-danger)';
    if (days <= 2) return 'var(--color-priority-high)';
    if (days <= 5) return 'var(--color-priority-medium)';
    return 'var(--color-priority-low)';
  };

  return (
    <div className="screen-no-nav">
      {/* ── Stationary Top Bar ────────────────────────────────────────────── */}
      <div className="screen-stationary-header">
        <div className="top-bar">
          <button className="top-bar-back" onClick={() => navigate(-1)}>
            <ArrowLeft size={18} />
          </button>
          <span className="top-bar-title">Protocol Reminders</span>
          <div style={{ width: '36px' }} />
        </div>
      </div>

      {/* ── Scrollable Reminders Content ────────────────────────────────────── */}
      <div className="screen-scroll-body">
        {confirmed.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Bell size={28} /></div>
          <div className="empty-state-title">No Upcoming Events</div>
          <div className="empty-state-text">Confirmed invitations will populate protocol briefings and reminders.</div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {confirmed.map((inv, i) => {
            const days = daysUntil(inv.date);
            return (
              <div
                key={inv.id}
                className="glass-card glass-card-interactive animate-slide-up"
                style={{ animationDelay: `${i * 0.06}s`, borderLeft: `3px solid ${getUrgencyColor(days)}` }}
                onClick={() => navigate(`/event/${inv.id}`)}
              >
                <div className="flex items-start gap-3">
                  <div style={{
                    minWidth: '54px', textAlign: 'center', padding: 'var(--space-2)',
                    borderRadius: 'var(--radius-sm)', background: `${getUrgencyColor(days)}15`,
                    border: `1px solid ${getUrgencyColor(days)}30`,
                  }}>
                    <div style={{ fontSize: 'var(--text-xl)', fontWeight: 800, fontFamily: 'var(--font-mono)', color: getUrgencyColor(days), lineHeight: 1 }}>
                      {days}
                    </div>
                    <div style={{ fontSize: '9px', fontWeight: 700, color: getUrgencyColor(days), textTransform: 'uppercase', marginTop: '3px', fontFamily: 'var(--font-mono)' }}>
                      {days === 0 ? 'TODAY' : days === 1 ? '1 DAY' : `${days} DAYS`}
                    </div>
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <EventBadgeIcon type={inv.eventType} size="xs" />
                      <PriorityBadge priority={inv.priority} size="sm" />
                    </div>
                    <div className="font-semibold text-sm text-white">{inv.nickname || inv.title}</div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted font-mono">
                      <span className="flex items-center gap-1">
                        <Calendar size={10} /> {formatDate(inv.date)}
                      </span>
                      {inv.time && (
                        <span className="flex items-center gap-1">
                          <Clock size={10} /> {inv.time}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>
    </div>
  );
}
