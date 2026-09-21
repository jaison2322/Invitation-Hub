import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { ArrowLeft, Calendar, Users, Gift, Plus } from 'lucide-react';
import { formatDate, formatCurrency } from '../utils/formatters';
import EventBadgeIcon from '../components/EventBadgeIcon';
import IconBadge from '../components/IconBadge';

export default function PastFamilyFunctionsScreen() {
  const navigate = useNavigate();
  const { familyEvents } = useAppStore();

  const sorted = [...familyEvents].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="screen">
      {/* ── Stationary Header ──────────────────────────────────────────────── */}
      <div className="screen-stationary-header">
        <div className="screen-header" style={{ paddingBottom: '4px' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button className="btn-icon" onClick={() => navigate(-1)} aria-label="Go Back">
                <ArrowLeft size={18} strokeWidth={2.2} />
              </button>
              <div>
                <h1 className="font-heading font-bold text-2xl text-white tracking-tight leading-tight" style={{ margin: 0 }}>
                  Past Functions
                </h1>
              </div>
            </div>
            <button className="btn btn-sm btn-gold flex items-center gap-1.5" onClick={() => navigate('/add-event')}>
              <Plus size={14} strokeWidth={2.4} />
              <span>Record Function</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Scrollable Functions List ───────────────────────────────────────── */}
      <div className="screen-scroll-body">
        {sorted.length === 0 ? (
          <div className="glass-panel-luxury text-center p-8">
            <div className="flex justify-center mb-3">
              <IconBadge icon={Calendar} variant="gold" size="lg" glow />
            </div>
            <p className="text-sm font-semibold text-white mb-1">No Past Functions Recorded</p>
            <p className="text-xs text-muted mb-4 max-w-xs mx-auto">
              Record weddings, receptions, and family milestones to preserve guest and gift history.
            </p>
            <button className="btn btn-gold inline-flex items-center gap-2" onClick={() => navigate('/add-event')}>
              <Plus size={14} strokeWidth={2.2} />
              <span>Record First Function</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {sorted.map((event, i) => {
              const totalGuests = event.guests.length;
              const attended = event.guests.filter((g) => g.attendance === 'attended').length;
              const totalGifts = event.guests.reduce((s, g) => s + (g.estimatedValue || 0), 0);

              return (
                <div
                  key={event.id}
                  className="glass-panel-luxury p-4 cursor-pointer transition-all animate-slide-up"
                  style={{ animationDelay: `${i * 0.06}s` }}
                  onClick={() => navigate(`/past-event/${event.id}`)}
                >
                  <div className="flex items-start gap-3.5">
                    <EventBadgeIcon type={event.eventType} size="lg" showGlow />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-heading font-semibold text-white text-base truncate">
                          {event.name}
                        </div>
                        <span className="badge badge-gold-luxury text-[9px] uppercase tracking-wider flex-shrink-0">
                          {event.eventType}
                        </span>
                      </div>
                      <div className="text-xs text-secondary mt-0.5 font-medium">
                        Host: <span className="text-slate-300">{event.familyMember}</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mt-2.5">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-xs text-slate-300">
                          <Calendar size={12} strokeWidth={2} style={{ color: 'var(--color-gold)' }} />
                          <span>{formatDate(event.date)}</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-xs text-slate-300">
                          <Users size={12} strokeWidth={2} style={{ color: '#38bdf8' }} />
                          <span>{attended}/{totalGuests} attended</span>
                        </span>
                        {totalGifts > 0 && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-xs text-gradient-gold font-mono font-medium">
                            <Gift size={12} strokeWidth={2} style={{ color: 'var(--color-gold)' }} />
                            <span>{formatCurrency(totalGifts)}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Guest preview */}
                  {event.guests.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-3 pt-2.5" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingLeft: '56px' }}>
                      <span className="text-[11px] text-muted mr-1">Attendees:</span>
                      <div className="flex items-center">
                        {event.guests.slice(0, 5).map((g, gi) => (
                          <div
                            key={gi}
                            className="avatar avatar-xs"
                            style={{
                              marginLeft: gi > 0 ? '-6px' : 0,
                              border: '2px solid var(--color-bg-primary)',
                              boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
                              fontSize: '9px',
                            }}
                            title={g.personName}
                          >
                            {g.personName.charAt(0)}
                          </div>
                        ))}
                      </div>
                      {event.guests.length > 5 && (
                        <span className="text-[10px] text-gold font-semibold ml-1">
                          +{event.guests.length - 5} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
