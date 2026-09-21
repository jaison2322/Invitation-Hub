import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { Calendar, Clock, MapPin, Search, Plus, ChevronRight } from 'lucide-react';
import { formatDate, formatTime } from '../utils/formatters';
import EventBadgeIcon from '../components/EventBadgeIcon';
import PriorityBadge from '../components/PriorityBadge';
import type { InvitationStatus } from '../types';
import { useTranslation } from '../i18n/useTranslation';

export default function UpcomingInvitationsScreen() {
  const navigate = useNavigate();
  const { invitations, updateInvitationStatus, isVIP, currentPrivilegedUser } = useAppStore();
  const { t } = useTranslation();
  const canConfirmIgnore = isVIP || currentPrivilegedUser?.permissions?.canConfirmIgnoreInvitations === true;
  const [activeTab, setActiveTab] = useState<'all' | InvitationStatus>('all');
  const [search, setSearch] = useState('');

  const filtered = invitations
    .filter((inv) => activeTab === 'all' || inv.status === activeTab)
    .filter((inv) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        inv.title.toLowerCase().includes(q) ||
        (inv.nickname || '').toLowerCase().includes(q) ||
        (inv.venue || '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const tabs: { key: typeof activeTab; label: string }[] = [
    { key: 'all', label: t('common.all') },
    { key: 'pending', label: t('events.pending') },
    { key: 'confirmed', label: t('events.confirmed') },
    { key: 'ignored', label: t('events.ignored') },
  ];

  return (
    <div className="screen">
      {/* ── Stationary Header & Controls ───────────────────────────────────── */}
      <div className="screen-stationary-header">
        {/* ── Apple Large Title Header ───────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-2">
          <h1
            className="font-heading font-bold text-white tracking-tight"
            style={{ fontSize: '32px', letterSpacing: '-0.03em', lineHeight: 1.15 }}
          >
            {t('events.title')}
          </h1>
          <button
            type="button"
            className="btn-icon"
            onClick={() => navigate('/add-invitation')}
            aria-label="Add Invitation"
            title="Add Invitation"
          >
            <Plus size={18} strokeWidth={2} />
          </button>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
          {invitations.length} total invitations in the dashboard
        </p>

        {/* ── Apple Search Field ──────────────────────────────────────────────── */}
        <div className="search-bar mb-3">
          <Search size={16} className="search-bar-icon" />
          <input
            placeholder="Search invitations, venues, or hosts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* ── Apple Segmented Control ─────────────────────────────────────────── */}
        <div className="segmented-control">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`segmented-item ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Scrollable Events Content ───────────────────────────────────────── */}
      <div className="screen-scroll-body">
        {/* ── Events List ────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-5">
        {filtered.map((inv) => (
          <div
            key={inv.id}
            className="event-card cursor-pointer"
            style={{ marginBottom: '20px' }}
            onClick={() => navigate(`/event/${inv.id}`)}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2.5">
                <EventBadgeIcon type={inv.eventType} size="sm" />
                <PriorityBadge priority={inv.priority} size="sm" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`badge badge-${inv.status}`}>
                  {inv.status}
                </span>
                <ChevronRight size={14} strokeWidth={2} style={{ color: 'var(--color-text-muted)' }} />
              </div>
            </div>

            <div className="event-card-title">{inv.nickname || inv.title}</div>

            <div className="event-card-meta mt-2">
              <span className="event-card-meta-item">
                <Calendar size={12} strokeWidth={1.8} style={{ color: 'var(--color-accent)' }} />
                <span>{formatDate(inv.date)}</span>
              </span>
              {inv.time && (
                <span className="event-card-meta-item">
                  <Clock size={12} strokeWidth={1.8} style={{ color: 'var(--color-accent)' }} />
                  <span>{formatTime(inv.time)}</span>
                </span>
              )}
              {inv.venue && (
                <span className="event-card-meta-item truncate">
                  <MapPin size={12} strokeWidth={1.8} style={{ color: 'var(--color-accent)' }} />
                  <span className="truncate">{inv.venue}</span>
                </span>
              )}
            </div>

            {/* Quick action buttons for pending */}
            {inv.status === 'pending' && canConfirmIgnore && (
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  className="btn btn-confirm flex-1 font-heading"
                  style={{ fontSize: '12px', padding: '8px 12px' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    updateInvitationStatus(inv.id, 'confirmed');
                  }}
                >
                  {t('events.confirmAttendance')}
                </button>
                <button
                  type="button"
                  className="btn btn-ignore flex-1 font-heading"
                  style={{ fontSize: '12px', padding: '8px 12px' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    updateInvitationStatus(inv.id, 'ignored');
                  }}
                >
                  {t('events.declineIgnore')}
                </button>
              </div>
            )}
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Calendar size={24} strokeWidth={1.8} />
            </div>
            <div className="empty-state-title" style={{ fontSize: '18px' }}>{t('events.noEventsFound')}</div>
            <div className="empty-state-text" style={{ fontSize: '13px' }}>
              {search ? t('events.noEventsFound') : t('events.noEventsFound')}
            </div>
            {!search && (
              <div className="flex gap-2 mt-4" style={{ justifyContent: 'center' }}>
                <button
                  className="btn btn-gold"
                  onClick={() => navigate('/add-invitation')}
                >
                  Add Manually
                </button>
                <button
                  className="btn btn-outline"
                  onClick={() => navigate('/scan')}
                >
                  Scan Card
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
