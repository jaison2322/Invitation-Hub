import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { ArrowLeft, Search, ArrowRight, Trash2, Shield, Calendar, Users, FileText } from 'lucide-react';
import { formatTimeAgo, getInitials } from '../utils/formatters';

type FilterCategory = 'all' | 'invitation' | 'person' | 'family_event' | 'security';

export default function ActivityHistoryScreen() {
  const navigate = useNavigate();
  const { activityLogs, clearActivityLogs, isVIP } = useAppStore();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<FilterCategory>('all');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const filtered = activityLogs.filter((log) => {
    // Category filter
    if (selectedCategory !== 'all') {
      if (selectedCategory === 'security' && log.entityType !== 'privileged_user' && log.entityType !== 'auth' && log.entityType !== 'security') {
        return false;
      }
      if (selectedCategory === 'invitation' && log.entityType !== 'invitation') {
        return false;
      }
      if (selectedCategory === 'person' && log.entityType !== 'person' && log.entityType !== 'people') {
        return false;
      }
      if (selectedCategory === 'family_event' && log.entityType !== 'family_event' && log.entityType !== 'event') {
        return false;
      }
    }

    // Text search
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const userName = (log.userName || '').toLowerCase();
    const action = (log.action || '').toLowerCase();
    const entityName = (log.entityName || '').toLowerCase();
    const entityType = (log.entityType || '').toLowerCase();

    return (
      userName.includes(q) ||
      action.includes(q) ||
      entityName.includes(q) ||
      entityType.includes(q)
    );
  });

  const handleClearAll = () => {
    clearActivityLogs();
    setShowClearConfirm(false);
  };

  const getCategoryIcon = (entityType?: string) => {
    switch (entityType) {
      case 'invitation':
        return <Calendar size={13} />;
      case 'person':
      case 'people':
        return <Users size={13} />;
      case 'privileged_user':
      case 'security':
      case 'auth':
        return <Shield size={13} />;
      default:
        return <FileText size={13} />;
    }
  };

  return (
    <div className="screen-no-nav">
      <div className="screen-stationary-header">
        <div className="top-bar">
          <button className="top-bar-back" onClick={() => navigate(-1)} aria-label="Go back">
            <ArrowLeft size={18} />
          </button>
          <span className="top-bar-title">Activity History</span>
          {activityLogs.length > 0 && isVIP ? (
            <button
              className="btn btn-sm btn-ghost"
              style={{ color: 'var(--color-danger)' }}
              onClick={() => setShowClearConfirm(true)}
              title="Clear all logs"
            >
              <Trash2 size={16} />
            </button>
          ) : (
            <div style={{ width: '36px' }} />
          )}
        </div>

        <div className="search-bar">
          <Search size={16} className="search-bar-icon" />
          <input
            placeholder="Search activity by user, action, or event..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* ── Category Filters ──────────────────────────────────────────────── */}
        <div className="flex gap-2 overflow-x-auto pb-2" style={{ padding: '0 var(--space-4)' }}>
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'invitation', label: 'Invitations' },
              { id: 'person', label: 'People' },
              { id: 'family_event', label: 'Events' },
              { id: 'security', label: 'Security' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedCategory(tab.id)}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-full)',
                fontSize: '12px',
                fontWeight: 500,
                border: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                background: selectedCategory === tab.id ? 'var(--color-gold)' : 'var(--color-surface)',
                color: selectedCategory === tab.id ? '#000' : 'var(--color-text-secondary)',
                transition: 'all 0.15s ease',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="screen-scroll-body">
        {filtered.length > 0 && (
          <div className="flex items-center justify-between mb-3 text-xs text-muted" style={{ padding: '0 var(--space-2)' }}>
            <span>{filtered.length} log {filtered.length === 1 ? 'entry' : 'entries'}</span>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {filtered.map((log, i) => (
            <div
              key={log.id}
              className="glass-card animate-slide-up"
              style={{
                animationDelay: `${Math.min(i * 0.03, 0.3)}s`,
                padding: 'var(--space-3) var(--space-4)',
                cursor: log.entityType === 'invitation' && log.entityId ? 'pointer' : 'default',
              }}
              onClick={() => {
                if (log.entityType === 'invitation' && log.entityId) {
                  navigate(`/event/${log.entityId}`);
                }
              }}
            >
              <div className="flex items-start gap-3">
                <div className="avatar avatar-sm">{getInitials(log.userName)}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm">
                    <strong style={{ color: 'var(--color-text-primary)' }}>{log.userName || 'VIP Principal'}</strong>{' '}
                    <span className="text-secondary">{log.action}</span>
                  </div>

                  <div className="flex items-center gap-2 mt-1">
                    {log.entityType && (
                      <span
                        className="badge"
                        style={{
                          fontSize: '10px',
                          padding: '1px 6px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                          background: 'var(--color-surface)',
                          color: 'var(--color-text-muted)',
                        }}
                      >
                        {getCategoryIcon(log.entityType)}
                        {log.entityType}
                      </span>
                    )}

                    {log.entityName && (
                      <span className="text-xs text-gold truncate" style={{ maxWidth: '200px' }}>
                        {log.entityName}
                      </span>
                    )}
                  </div>

                  {log.previousValue && log.newValue && (
                    <div className="flex items-center gap-2 mt-2 text-xs">
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-sm)',
                          background: 'rgba(239, 68, 68, 0.1)',
                          color: 'var(--color-danger)',
                        }}
                      >
                        {log.previousValue}
                      </span>
                      <ArrowRight size={12} className="text-muted" />
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-sm)',
                          background: 'rgba(34, 197, 94, 0.1)',
                          color: 'var(--color-confirmed)',
                        }}
                      >
                        {log.newValue}
                      </span>
                    </div>
                  )}
                  <div className="text-xs text-muted mt-1">{formatTimeAgo(log.timestamp)}</div>
                </div>
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-title">No Activity Found</div>
              <div className="empty-state-text">
                {search ? 'No activity logs matching your search.' : 'All activity records will appear here in chronological order.'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Clear Confirmation Modal ────────────────────────────────────────── */}
      {showClearConfirm && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'var(--space-4)',
            zIndex: 1000,
          }}
        >
          <div className="glass-card" style={{ maxWidth: '360px', width: '100%', padding: 'var(--space-5)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Clear Activity History?</h3>
            <p className="text-sm text-secondary" style={{ marginBottom: '20px' }}>
              This will permanently delete all activity log entries from the app and the database.
            </p>
            <div className="flex gap-2 justify-end">
              <button className="btn btn-sm btn-ghost" onClick={() => setShowClearConfirm(false)}>
                Cancel
              </button>
              <button className="btn btn-sm btn-primary" style={{ background: 'var(--color-danger)', borderColor: 'var(--color-danger)' }} onClick={handleClearAll}>
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
