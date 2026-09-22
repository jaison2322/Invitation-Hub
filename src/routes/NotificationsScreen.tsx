import { useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { ArrowLeft, Bell, AlertTriangle, Calendar, UserCheck, CheckCheck, Trash2, X } from 'lucide-react';
import { formatTimeAgo } from '../utils/formatters';

const TYPE_ICONS: Record<string, ReactNode> = {
  change_alert: <UserCheck size={16} />,
  new_invitation: <Calendar size={16} />,
  reminder: <Bell size={16} />,
  conflict_warning: <AlertTriangle size={16} />,
  system: <Bell size={16} />,
  staff_request: <UserCheck size={16} />,
};

const TYPE_COLORS: Record<string, string> = {
  change_alert: 'var(--color-pending)',
  new_invitation: 'var(--color-gold)',
  reminder: 'var(--color-info)',
  conflict_warning: 'var(--color-danger)',
  system: 'var(--color-text-muted)',
  staff_request: 'var(--color-gold)',
};

export default function NotificationsScreen() {
  const navigate = useNavigate();
  const {
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotification,
    clearNotifications,
    respondToStaffRequest,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const filtered = activeTab === 'unread' ? notifications.filter((n) => !n.read) : notifications;

  const handleNotificationClick = (notif: (typeof notifications)[0]) => {
    markNotificationRead(notif.id);
    if (notif.type === 'staff_request') {
      navigate('/staff-requests');
    } else if (notif.actionUrl) {
      const targetUrl =
        notif.actionUrl === '/settings/privileged-users' || notif.actionUrl === '/privileged-users'
          ? '/staff-requests'
          : notif.actionUrl;
      navigate(targetUrl);
    } else if (notif.relatedEntityId) {
      navigate(`/event/${notif.relatedEntityId}`);
    }
  };

  const handleClearAll = () => {
    clearNotifications();
    setShowClearConfirm(false);
  };

  return (
    <div className="screen-no-nav">
      <div className="screen-stationary-header">
        <div className="top-bar">
          <button className="top-bar-back" onClick={() => navigate(-1)} aria-label="Go back">
            <ArrowLeft size={18} />
          </button>
          <span className="top-bar-title">Notifications</span>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                className="btn btn-sm btn-ghost"
                onClick={markAllNotificationsRead}
                title="Mark all as read"
                style={{ fontSize: '12px', padding: '4px 8px' }}
              >
                <CheckCheck size={15} /> Read All
              </button>
            )}
            {notifications.length > 0 && (
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setShowClearConfirm(true)}
                title="Clear all notifications"
                style={{ color: 'var(--color-danger)', padding: '4px 8px' }}
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        </div>

        {/* ── Tabs ──────────────────────────────────────────────────────────── */}
        <div className="flex gap-2" style={{ padding: '0 var(--space-4) var(--space-3)' }}>
          <button
            onClick={() => setActiveTab('all')}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-full)',
              fontSize: '12px',
              fontWeight: 500,
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'all' ? 'var(--color-gold)' : 'var(--color-surface)',
              color: activeTab === 'all' ? '#000' : 'var(--color-text-secondary)',
              transition: 'all 0.15s ease',
            }}
          >
            All ({notifications.length})
          </button>
          <button
            onClick={() => setActiveTab('unread')}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-full)',
              fontSize: '12px',
              fontWeight: 500,
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'unread' ? 'var(--color-gold)' : 'var(--color-surface)',
              color: activeTab === 'unread' ? '#000' : 'var(--color-text-secondary)',
              transition: 'all 0.15s ease',
            }}
          >
            Unread {unreadCount > 0 ? `(${unreadCount})` : ''}
          </button>
        </div>
      </div>

      <div className="screen-scroll-body">
        <div className="flex flex-col gap-2">
          {filtered.map((notif, i) => (
            <div
              key={notif.id}
              className={`glass-card animate-slide-up ${!notif.read ? 'glass-card-gold' : ''}`}
              style={{
                animationDelay: `${Math.min(i * 0.03, 0.3)}s`,
                padding: 'var(--space-3) var(--space-4)',
                opacity: notif.read ? 0.75 : 1,
                position: 'relative',
              }}
            >
              <div className="flex items-start gap-3">
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: 'var(--radius-sm)',
                    background: `${TYPE_COLORS[notif.type] || 'var(--color-text-muted)'}15`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: TYPE_COLORS[notif.type] || 'var(--color-text-muted)',
                    flexShrink: 0,
                  }}
                >
                  {TYPE_ICONS[notif.type] || <Bell size={16} />}
                </div>

                <div
                  className="flex-1 min-w-0"
                  style={{ cursor: notif.actionUrl || notif.relatedEntityId ? 'pointer' : 'default' }}
                  onClick={() => handleNotificationClick(notif)}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
                      {notif.title}
                    </span>
                    {!notif.read && (
                      <div
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: 'var(--color-gold)',
                          flexShrink: 0,
                          marginLeft: '8px',
                        }}
                      />
                    )}
                  </div>
                  <p className="text-sm text-secondary" style={{ marginTop: '2px', lineHeight: '1.4' }}>
                    {notif.message}
                  </p>

                  {notif.type === 'staff_request' && !notif.read && (
                    <div className="flex items-center gap-2 mt-3 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        style={{ fontSize: '11px', padding: '4px 10px' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          const targetUser = notif.relatedEntityId || notif.message.match(/Username:\s*([a-zA-Z0-9_-]+)/i)?.[1];
                          if (targetUser) {
                            respondToStaffRequest(targetUser, true);
                          }
                        }}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        style={{ fontSize: '11px', padding: '4px 10px', color: 'var(--color-danger)' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          const targetUser = notif.relatedEntityId || notif.message.match(/Username:\s*([a-zA-Z0-9_-]+)/i)?.[1];
                          if (targetUser) {
                            respondToStaffRequest(targetUser, false);
                          }
                        }}
                      >
                        Reject
                      </button>
                    </div>
                  )}

                  <div className="text-xs text-muted mt-1">{formatTimeAgo(notif.timestamp)}</div>
                </div>

                <button
                  className="btn-ghost"
                  style={{
                    padding: '4px',
                    color: 'var(--color-text-muted)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                  title="Dismiss notification"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteNotification(notif.id);
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon"><Bell size={28} /></div>
              <div className="empty-state-title">
                {activeTab === 'unread' ? 'No Unread Notifications' : 'No Notifications'}
              </div>
              <div className="empty-state-text">
                {activeTab === 'unread' ? 'You have read all your alerts.' : "You're completely up to date!"}
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
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Clear All Notifications?</h3>
            <p className="text-sm text-secondary" style={{ marginBottom: '20px' }}>
              This will remove all notifications from your notification center and database.
            </p>
            <div className="flex gap-2 justify-end">
              <button className="btn btn-sm btn-ghost" onClick={() => setShowClearConfirm(false)}>
                Cancel
              </button>
              <button
                className="btn btn-sm btn-primary"
                style={{ background: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}
                onClick={handleClearAll}
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
