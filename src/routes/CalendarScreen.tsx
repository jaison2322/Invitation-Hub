import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, MapPin, ArrowLeft } from 'lucide-react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  format, addMonths, subMonths, isSameMonth, isToday, isSameDay,
} from 'date-fns';
import { formatTime } from '../utils/formatters';
import EventBadgeIcon from '../components/EventBadgeIcon';
import PriorityBadge from '../components/PriorityBadge';

export default function CalendarScreen() {
  const navigate = useNavigate();
  const { invitations, schedule } = useAppStore();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [currentMonth]);

  const getEventsForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const dayInvitations = invitations.filter((i) => i.date === dateStr && i.status !== 'ignored');
    const daySchedule = schedule.filter((s) => s.date === dateStr);
    return { invitations: dayInvitations, schedule: daySchedule };
  };

  const selectedEvents = selectedDate ? getEventsForDate(selectedDate) : { invitations: [], schedule: [] };

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="screen">
      <div className="screen-stationary-header">
        <div className="screen-header" style={{ paddingBottom: '4px' }}>
          <div className="flex items-center gap-3">
            <button className="btn-icon" onClick={() => navigate(-1)} aria-label="Go Back">
              <ArrowLeft size={16} />
            </button>
            <div>
              <h2>Calendar Matrix</h2>
              <p className="text-sm text-secondary mt-1">
                Monthly schedule timeline and function invited
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="screen-scroll-body">
        <div className="desktop-grid-2">
        {/* Left Column: Month Navigation & Grid */}
        <div className="glass-card" style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-4)' }}>
          <div className="flex items-center justify-between mb-2">
            <button className="btn-icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
              <ChevronLeft size={18} />
            </button>
            <span className="font-heading font-bold text-lg text-white" style={{ letterSpacing: '-0.02em' }}>
              {format(currentMonth, 'MMMM yyyy')}
            </span>
            <button className="btn-icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Week headers */}
          <div className="calendar-grid" style={{ marginTop: 'var(--space-3)' }}>
            {weekDays.map((day) => (
              <div key={day} className="calendar-header-cell">{day}</div>
            ))}

            {/* Days */}
            {calendarDays.map((day, i) => {
              const events = getEventsForDate(day);
              const hasEvents = events.invitations.length > 0 || events.schedule.length > 0;
              const hasConflict = events.invitations.length + events.schedule.length > 1;
              const isSelected = selectedDate && isSameDay(day, selectedDate);
              const isCurrentMonth = isSameMonth(day, currentMonth);

              return (
                <div
                  key={i}
                  className={`calendar-cell ${isToday(day) ? 'today' : ''} ${isSelected ? 'selected' : ''} ${!isCurrentMonth ? 'other-month' : ''} ${hasEvents ? 'has-events' : ''} ${hasConflict ? 'has-conflict' : ''}`}
                  onClick={() => setSelectedDate(day)}
                >
                  {format(day, 'd')}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Selected Date Agenda */}
        {selectedDate && (
          <div className="animate-slide-up">
            <div className="section-header">
              <span className="section-title flex items-center gap-2">
                <CalendarIcon size={16} style={{ color: 'var(--color-gold)' }} />
                <span>{format(selectedDate, 'EEEE, MMMM d, yyyy')}</span>
              </span>
            </div>

            {selectedEvents.invitations.length === 0 && selectedEvents.schedule.length === 0 ? (
              <div className="glass-card text-center" style={{ padding: 'var(--space-8)' }}>
                <p className="text-sm text-muted">No scheduled commitments or invitations on this day</p>
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {selectedEvents.schedule.map((item) => (
                  <div key={item.id} className="glass-card flex items-center gap-3" style={{ padding: '14px', marginBottom: '14px' }}>
                    <div style={{ width: '4px', height: '40px', borderRadius: '2px', background: 'var(--color-info)' }} />
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-white">{item.title}</div>
                      <div className="text-xs text-muted flex items-center gap-2 mt-1">
                        <span className="flex items-center gap-1 font-mono">
                          <Clock size={11} />
                          {formatTime(item.startTime)}{item.endTime ? ` – ${formatTime(item.endTime)}` : ''}
                        </span>
                        {item.location && (
                          <span className="flex items-center gap-1">
                            <MapPin size={11} />
                            {item.location}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {selectedEvents.invitations.map((inv) => (
                  <div
                    key={inv.id}
                    className="event-card cursor-pointer"
                    style={{ marginBottom: '20px' }}
                    onClick={() => navigate(`/event/${inv.id}`)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <EventBadgeIcon type={inv.eventType} size="xs" />
                        <PriorityBadge priority={inv.priority} size="sm" />
                      </div>
                      <span className={`badge badge-${inv.status}`} style={{ fontSize: '10px' }}>
                        {inv.status}
                      </span>
                    </div>
                    <div className="event-card-title">{inv.nickname || inv.title}</div>
                    <div className="text-xs text-secondary flex items-center gap-3 mt-1.5 font-mono">
                      {inv.time && (
                        <span className="flex items-center gap-1">
                          <Clock size={11} /> {formatTime(inv.time)}
                        </span>
                      )}
                      {inv.venue && (
                        <span className="flex items-center gap-1 truncate font-sans">
                          <MapPin size={11} /> {inv.venue}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
