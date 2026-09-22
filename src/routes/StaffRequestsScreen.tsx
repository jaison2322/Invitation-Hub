import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  UserCheck,
  Shield,
  CheckCircle2,
  XCircle,
  Clock,
  Copy,
  Check,
  PhoneCall,
  RefreshCw,
  AlertCircle,
  Users,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { getInitials, formatTimeAgo } from '../utils/formatters';

export default function StaffRequestsScreen() {
  const navigate = useNavigate();
  const {
    privilegedUsers,
    isVIP,
    activeVipId,
    syncWithSupabase,
    refreshStaffAccounts,
    respondToStaffRequest,
  } = useAppStore();

  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [processingUsername, setProcessingUsername] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [copiedPhoneId, setCopiedPhoneId] = useState<string | null>(null);

  // VIP session gate
  useEffect(() => {
    if (!isVIP) {
      navigate('/settings', { replace: true });
    }
  }, [isVIP, navigate]);

  // Sync latest data on mount via dedicated secure RPC
  useEffect(() => {
    let isMounted = true;
    const loadStaff = async () => {
      if (!activeVipId) {
        setIsLoading(false);
        return;
      }
      try {
        await refreshStaffAccounts(activeVipId);
      } catch (err) {
        console.warn('Initial staff refresh warning:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    loadStaff();
    return () => {
      isMounted = false;
    };
  }, [activeVipId, refreshStaffAccounts]);

  const handleRefresh = async () => {
    if (!activeVipId) return;
    setIsRefreshing(true);
    setActionFeedback(null);
    try {
      await refreshStaffAccounts(activeVipId);
    } catch (err: any) {
      console.warn('Refresh error in StaffRequestsScreen:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRespond = async (username: string, accept: boolean) => {
    setProcessingUsername(username);
    setActionFeedback(null);
    try {
      const result = await respondToStaffRequest(username, accept);
      if (result.success) {
        setActionFeedback({
          type: 'success',
          message: accept
            ? `Staff request for @${username} has been approved.`
            : `Staff request for @${username} has been declined.`,
        });
      } else {
        setActionFeedback({
          type: 'error',
          message: result.error || 'Failed to update staff request status.',
        });
      }
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: err?.message || 'An error occurred while processing the request.',
      });
    } finally {
      setProcessingUsername(null);
      // Auto-clear feedback after 4 seconds
      setTimeout(() => setActionFeedback(null), 4000);
    }
  };

  const handleCopyPhone = async (phone: string, id: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    let copied = false;
    if (navigator?.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(phone);
        copied = true;
      } catch (err) {
        console.warn('navigator.clipboard failed:', err);
      }
    }
    if (!copied) {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = phone;
        textArea.setAttribute('readonly', '');
        textArea.style.position = 'fixed';
        textArea.style.top = '0';
        textArea.style.left = '0';
        textArea.style.width = '2em';
        textArea.style.height = '2em';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        textArea.setSelectionRange(0, 99999);
        copied = document.execCommand('copy');
        document.body.removeChild(textArea);
      } catch (err) {
        console.warn('execCommand copy failed:', err);
      }
    }
    if (copied) {
      setCopiedPhoneId(id);
      setTimeout(() => setCopiedPhoneId(null), 2000);
    }
  };

  const pendingRequests = privilegedUsers.filter(
    (u) => u.approvalStatus === 'PENDING_APPROVAL'
  );
  const activeStaff = privilegedUsers.filter(
    (u) => !u.approvalStatus || u.approvalStatus === 'APPROVED'
  );
  const displayedRequests =
    filter === 'pending'
      ? pendingRequests
      : privilegedUsers;

  return (
    <div className="screen-no-nav">
      {/* ── Stationary Top Bar ────────────────────────────────────────────── */}
      <div className="screen-stationary-header">
        <div className="top-bar">
          <button
            type="button"
            className="top-bar-back"
            onClick={() => navigate('/settings')}
            aria-label="Back to Settings"
          >
            <ArrowLeft size={18} />
          </button>
          <span className="top-bar-title">Staff Access Requests</span>
          <button
            type="button"
            className="btn-icon"
            onClick={handleRefresh}
            disabled={isRefreshing}
            aria-label="Refresh requests"
            style={{ width: '36px', height: '36px' }}
          >
            <RefreshCw
              size={16}
              className={isRefreshing ? 'animate-spin' : ''}
              style={{ color: isRefreshing ? 'var(--color-gold)' : 'var(--color-text-secondary)' }}
            />
          </button>
        </div>
      </div>

      {/* ── Scrollable Body ───────────────────────────────────────────────── */}
      <div className="screen-scroll-body">
        {/* Status Feedback Toast */}
        {actionFeedback && (
          <div
            className="animate-slide-down"
            style={{
              marginBottom: '14px',
              padding: '10px 14px',
              borderRadius: '12px',
              background:
                actionFeedback.type === 'success'
                  ? 'rgba(48, 209, 88, 0.15)'
                  : 'rgba(255, 69, 58, 0.15)',
              border:
                actionFeedback.type === 'success'
                  ? '1px solid rgba(48, 209, 88, 0.35)'
                  : '1px solid rgba(255, 69, 58, 0.35)',
              color:
                actionFeedback.type === 'success'
                  ? 'var(--color-confirmed, #30d158)'
                  : 'var(--color-danger, #ff453a)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            {actionFeedback.type === 'success' ? (
              <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
            ) : (
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
            )}
            <span>{actionFeedback.message}</span>
          </div>
        )}

        {/* Executive Overview Card */}
        <div className="glass-card glass-card-gold animate-slide-up" style={{ marginBottom: '14px' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <UserCheck size={20} style={{ color: 'var(--color-gold)' }} />
              <div>
                <span className="font-heading font-semibold text-white" style={{ fontSize: '15px' }}>
                  Authorization Control
                </span>
                <div className="text-xs text-secondary" style={{ marginTop: '1px' }}>
                  Review staff requesting access to your schedule & contacts
                </div>
              </div>
            </div>
            <span
              className={`badge ${pendingRequests.length > 0 ? 'badge-warning' : 'badge-gold'}`}
              style={{ fontSize: '11px', padding: '3px 8px' }}
            >
              {pendingRequests.length > 0
                ? `${pendingRequests.length} Pending`
                : 'All Reviewed'}
            </span>
          </div>
          <div
            className="flex items-center justify-between mt-3 pt-3"
            style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', fontSize: '12px', color: 'var(--color-text-secondary)' }}
          >
            <span>Active Privileged Staff:</span>
            <span className="font-semibold text-white">{activeStaff.length} / 5</span>
          </div>
        </div>

        {/* Segmented Filter Control */}
        <div className="segmented-control mb-4">
          <button
            type="button"
            className={`segmented-item ${filter === 'pending' ? 'active' : ''}`}
            onClick={() => setFilter('pending')}
          >
            Pending ({pendingRequests.length})
          </button>
          <button
            type="button"
            className={`segmented-item ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All Accounts ({privilegedUsers.length})
          </button>
        </div>

        {/* Loading State Skeleton */}
        {isLoading && displayedRequests.length === 0 && (
          <div className="flex flex-col gap-3 animate-fade-in" style={{ marginTop: '6px' }}>
            {[1, 2].map((idx) => (
              <div
                key={idx}
                className="glass-card"
                style={{
                  padding: '16px',
                  border: '1px solid rgba(255, 215, 0, 0.15)',
                  background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0%, rgba(26, 26, 26, 0.6) 100%)',
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '50%',
                      background: 'rgba(255, 255, 255, 0.08)',
                      animation: 'pulse 1.5s infinite ease-in-out',
                    }}
                  />
                  <div className="flex-1">
                    <div
                      style={{
                        width: '45%',
                        height: '14px',
                        borderRadius: '4px',
                        background: 'rgba(255, 255, 255, 0.12)',
                        marginBottom: '8px',
                      }}
                    />
                    <div
                      style={{
                        width: '30%',
                        height: '11px',
                        borderRadius: '4px',
                        background: 'rgba(255, 255, 255, 0.06)',
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
            <div className="text-center text-xs text-muted mt-2">
              Synchronizing staff access requests from secure ledger...
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && displayedRequests.length === 0 && (
          <div
            className="glass-card text-center animate-fade-in"
            style={{ padding: '36px 20px', marginTop: '10px' }}
          >
            <div className="flex justify-center mb-3">
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: 'rgba(255, 215, 0, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-gold)',
                }}
              >
                <Shield size={24} />
              </div>
            </div>
            <div className="font-semibold text-white mb-1" style={{ fontSize: '15px' }}>
              {filter === 'pending' ? 'No Pending Requests' : 'No Staff Accounts Found'}
            </div>
            <p className="text-xs text-secondary" style={{ maxWidth: '280px', margin: '0 auto' }}>
              {filter === 'pending'
                ? 'All staff access requests have been reviewed. When an assistant registers to assist you, their request will appear here.'
                : 'You currently have no registered privileged users or pending staff requests.'}
            </p>
          </div>
        )}

        {/* Requests List */}
        <div className="flex flex-col gap-3">
          {displayedRequests.map((user, i) => {
            const isPending = user.approvalStatus === 'PENDING_APPROVAL';
            const isRejected = user.approvalStatus === 'REJECTED';
            const isApproved = !user.approvalStatus || user.approvalStatus === 'APPROVED';
            const isProcessing = processingUsername === (user.username || user.name);

            return (
              <div
                key={user.id || user.username || i}
                className="glass-card animate-slide-up"
                style={{
                  animationDelay: `${i * 0.05}s`,
                  border: isPending
                    ? '1px solid rgba(245, 158, 11, 0.35)'
                    : undefined,
                  background: isPending
                    ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.04) 0%, rgba(26, 26, 26, 0.8) 100%)'
                    : undefined,
                }}
              >
                {/* Header info */}
                <div className="flex items-start gap-3">
                  <div
                    className="avatar"
                    style={{
                      width: '42px',
                      height: '42px',
                      fontSize: '15px',
                      background: isPending
                        ? 'linear-gradient(135deg, #d97706, #b45309)'
                        : undefined,
                    }}
                  >
                    {getInitials(user.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-white text-sm truncate">
                        {user.name}
                      </span>
                      {isPending && (
                        <span
                          className="badge badge-warning"
                          style={{
                            fontSize: '9px',
                            padding: '2px 6px',
                            fontWeight: 600,
                            backgroundColor: 'rgba(245, 158, 11, 0.2)',
                            color: '#fbbf24',
                            border: '0.5px solid rgba(245, 158, 11, 0.4)',
                          }}
                        >
                          Pending Authorization
                        </span>
                      )}
                      {isApproved && (
                        <span
                          className="badge badge-success"
                          style={{
                            fontSize: '9px',
                            padding: '2px 6px',
                            backgroundColor: 'rgba(48, 209, 88, 0.15)',
                            color: '#30d158',
                          }}
                        >
                          Authorized
                        </span>
                      )}
                      {isRejected && (
                        <span
                          className="badge badge-danger"
                          style={{
                            fontSize: '9px',
                            padding: '2px 6px',
                            backgroundColor: 'rgba(255, 69, 58, 0.15)',
                            color: '#ff453a',
                          }}
                        >
                          Declined
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-secondary mt-0.5">
                      {user.role || user.staffTitle || 'Personal Assistant'}
                    </div>

                    {user.username && (
                      <div className="flex items-center gap-1 mt-1">
                        <span
                          className="badge badge-info"
                          style={{ fontSize: '9px', padding: '1px 6px' }}
                        >
                          @{user.username}
                        </span>
                      </div>
                    )}

                    {/* Phone Row */}
                    {user.phone && (
                      <div className="flex items-center gap-2 mt-2 text-xs text-secondary">
                        <span className="font-mono text-white" style={{ fontSize: '12px' }}>
                          {user.phone}
                        </span>
                        <button
                          type="button"
                          className="btn-icon"
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            background:
                              copiedPhoneId === user.id
                                ? 'rgba(34, 197, 94, 0.25)'
                                : 'rgba(255, 255, 255, 0.08)',
                            color:
                              copiedPhoneId === user.id
                                ? '#4ade80'
                                : 'var(--color-text-secondary)',
                            border: 'none',
                            padding: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          onClick={(e) => handleCopyPhone(user.phone!, user.id || user.username || '', e)}
                          title={copiedPhoneId === user.id ? 'Copied!' : 'Copy phone number'}
                          aria-label="Copy phone number"
                        >
                          {copiedPhoneId === user.id ? (
                            <Check size={12} strokeWidth={2.5} />
                          ) : (
                            <Copy size={12} />
                          )}
                        </button>
                        <a
                          href={`tel:${user.phone.replace(/[^0-9+*#]/g, '')}`}
                          className="btn-icon"
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            background: 'rgba(48, 209, 88, 0.2)',
                            color: '#30d158',
                            border: 'none',
                            padding: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            textDecoration: 'none',
                          }}
                          title="Call phone number"
                          aria-label="Call phone number"
                        >
                          <PhoneCall size={12} strokeWidth={2} />
                        </a>
                      </div>
                    )}

                    {/* Timestamp */}
                    {user.addedAt && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-muted">
                        <Clock size={11} /> Requested {formatTimeAgo(user.addedAt)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions Footer */}
                {isPending ? (
                  <div
                    className="flex items-center gap-2 mt-3 pt-3"
                    style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}
                  >
                    <button
                      type="button"
                      className="btn btn-sm btn-primary flex-1 flex items-center justify-center gap-1.5"
                      style={{ padding: '8px 12px', fontSize: '13px' }}
                      onClick={() => handleRespond(user.username || user.name, true)}
                      disabled={isProcessing}
                    >
                      <CheckCircle2 size={15} strokeWidth={2} />
                      <span>Authorize & Accept</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary flex-1 flex items-center justify-center gap-1.5"
                      style={{ padding: '8px 12px', fontSize: '13px', color: 'var(--color-danger, #ff453a)' }}
                      onClick={() => handleRespond(user.username || user.name, false)}
                      disabled={isProcessing}
                    >
                      <XCircle size={15} strokeWidth={2} />
                      <span>Decline</span>
                    </button>
                  </div>
                ) : (
                  <div
                    className="flex items-center justify-between mt-2 pt-2"
                    style={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)', fontSize: '11px', color: 'var(--color-text-muted)' }}
                  >
                    <span>Status: {isApproved ? 'Authorized Privileged User' : 'Declined Request'}</span>
                    <button
                      type="button"
                      className="btn-ghost"
                      style={{ fontSize: '11px', padding: '2px 8px', color: 'var(--color-text-secondary)' }}
                      onClick={() => navigate(`/privileged-users`)}
                    >
                      Manage Access
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
