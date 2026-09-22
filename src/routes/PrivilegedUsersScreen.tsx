import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { ArrowLeft, UserPlus, Shield, Trash2, Clock, AtSign, Lock, CheckCircle2, Copy, Check, Phone, PhoneCall, UserCheck, ChevronRight } from 'lucide-react';
import { getInitials, formatTimeAgo } from '../utils/formatters';
import type { PermissionKey, PrivilegedUser } from '../types';

export default function PrivilegedUsersScreen() {
  const navigate = useNavigate();
  const { privilegedUsers, isVIP, removePrivilegedUser, addPrivilegedUser, activeVipId, currentUser, respondToStaffRequest, syncWithSupabase, refreshStaffAccounts } = useAppStore();

  useEffect(() => {
    if (!isVIP) {
      navigate('/settings', { replace: true });
    }
  }, [isVIP, navigate]);

  useEffect(() => {
    if (activeVipId) {
      refreshStaffAccounts(activeVipId).catch(console.warn);
    }
  }, [activeVipId, refreshStaffAccounts]);

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [createdUser, setCreatedUser] = useState<PrivilegedUser | null>(null);
  const [createdPassword, setCreatedPassword] = useState('');
  const [copiedField, setCopiedField] = useState('');
  const [copiedPhoneId, setCopiedPhoneId] = useState<string | null>(null);

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
        console.warn('navigator.clipboard.writeText failed in PrivilegedUsersScreen:', err);
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
        console.error('execCommand copy failed in PrivilegedUsersScreen:', err);
      }
    }
    setCopiedPhoneId(id);
    setTimeout(() => setCopiedPhoneId(null), 2000);
  };

  // Auto-suggest username from name
  const suggestedUsername = newName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  const effectiveUsername = newUsername || suggestedUsername || '';

  const handleAddUser = async () => {
    if (!newName.trim() || !newRole.trim() || !newPassword.trim() || newPassword.length < 4 || isAdding) return;
    setIsAdding(true);

    const defaultPerms: Record<PermissionKey, boolean> = {
      canAddInvitations: true,
      canConfirmIgnoreInvitations: false,
      canEditEvents: false,
      canChangePriority: false,
      canManageSchedule: false,
      canViewGiftHistory: false,
      canAddPeople: false,
    };

    const passToUse = newPassword.trim();
    const actorVipId = activeVipId || currentUser?.vipId || (currentUser?.username ? `vip_${currentUser.username}` : 'vip_jaison');
    const result = await addPrivilegedUser({
      name: newName.trim(),
      username: effectiveUsername,
      role: newRole.trim(),
      permissions: defaultPerms,
      addedBy: actorVipId,
      password: passToUse,
    } as any);

    setIsAdding(false);

    if (result) {
      setCreatedUser(result);
      setCreatedPassword(passToUse);
      setShowAdd(false);
      setNewName('');
      setNewUsername('');
      setNewRole('');
      setNewPassword('');
    }
  };

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedField(field);
    setTimeout(() => setCopiedField(''), 1500);
  };

  return (
    <div className="screen-no-nav">
      {/* ── Stationary Top Bar ────────────────────────────────────────────── */}
      <div className="screen-stationary-header">
        <div className="top-bar">
          <button className="top-bar-back" onClick={() => navigate(-1)}>
            <ArrowLeft size={18} />
          </button>
          <span className="top-bar-title">Privileged Users</span>
          <div style={{ width: '36px' }} />
        </div>
      </div>

      {/* ── Scrollable Users Content ────────────────────────────────────────── */}
      <div className="screen-scroll-body">
        {/* Count indicator */}
      <div className="glass-card glass-card-gold animate-slide-up" style={{ marginBottom: 'var(--space-4)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield size={18} style={{ color: 'var(--color-gold)' }} />
            <span className="font-heading font-semibold">Access Control</span>
          </div>
          <span className="badge badge-gold">{privilegedUsers.length}/5 Users</span>
        </div>
        <p className="text-xs text-muted mt-2">
          Privileged users can sign in directly from the start page. Maximum 5 users allowed.
        </p>
      </div>

      {/* Pending Requests Alert Banner */}
      {privilegedUsers.some((u) => u.approvalStatus === 'PENDING_APPROVAL') && (
        <div
          className="glass-card animate-slide-up mb-3"
          style={{
            border: '1px solid rgba(245, 158, 11, 0.4)',
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(26, 26, 26, 0.9) 100%)',
            cursor: 'pointer',
            padding: '12px 14px',
          }}
          onClick={() => navigate('/staff-requests')}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'rgba(245, 158, 11, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fbbf24',
                }}
              >
                <UserCheck size={16} />
              </div>
              <div>
                <div className="font-semibold text-white text-sm flex items-center gap-2">
                  <span>Staff Requests Pending</span>
                  <span
                    className="badge badge-warning"
                    style={{ fontSize: '9px', padding: '1px 5px', color: '#fbbf24' }}
                  >
                    {privilegedUsers.filter((u) => u.approvalStatus === 'PENDING_APPROVAL').length} New
                  </span>
                </div>
                <div className="text-xs text-secondary" style={{ marginTop: '1px' }}>
                  Tap to review and authorize access requests
                </div>
              </div>
            </div>
            <ChevronRight size={16} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
          </div>
        </div>
      )}

      {/* Created User Credentials Confirmation */}
      {createdUser && (
        <div className="glass-card glass-card-gold animate-scale-in" style={{ marginBottom: 'var(--space-4)' }}>
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 size={18} style={{ color: 'var(--color-success)' }} />
            <span className="font-semibold text-sm" style={{ color: 'var(--color-success)' }}>
              User Created Successfully!
            </span>
          </div>
          <p className="text-xs text-muted mb-3">
            Share these credentials with <strong>{createdUser.name}</strong> to sign in. Upon first sign-in, they will verify their mobile phone number to access the VIP suite.
          </p>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between" style={{
              background: 'rgba(0,0,0,0.2)',
              borderRadius: 'var(--radius-md)',
              padding: '8px 12px',
            }}>
              <div>
                <div className="text-xs text-muted">Username</div>
                <div className="text-sm font-semibold">@{createdUser.username}</div>
              </div>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => handleCopy(createdUser.username || '', 'username')}
                style={{ padding: '4px 8px' }}
              >
                {copiedField === 'username' ? <CheckCircle2 size={14} /> : <Copy size={14} />}
              </button>
            </div>
            {createdPassword && (
              <div className="flex items-center justify-between" style={{
                background: 'rgba(0,0,0,0.2)',
                borderRadius: 'var(--radius-md)',
                padding: '8px 12px',
              }}>
                <div>
                  <div className="text-xs text-muted">Password</div>
                  <div className="text-sm font-semibold">{createdPassword}</div>
                </div>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => handleCopy(createdPassword, 'password')}
                  style={{ padding: '4px 8px' }}
                >
                  {copiedField === 'password' ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                </button>
              </div>
            )}
          </div>
          <button
            className="btn btn-sm btn-outline w-full mt-3"
            onClick={() => setCreatedUser(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* User List */}
      <div className="flex flex-col gap-3">
        {privilegedUsers.map((user, i) => (
          <div key={user.id} className="glass-card animate-slide-up" style={{ animationDelay: `${i * 0.08}s` }}>
            <div className="flex items-center gap-3">
              <div className="avatar">{getInitials(user.name)}</div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{user.name}</span>
                  {user.approvalStatus === 'PENDING_APPROVAL' && (
                    <span className="badge badge-warning" style={{ fontSize: '8px', padding: '1px 5px', color: '#fbbf24' }}>
                      Pending Approval
                    </span>
                  )}
                  {user.approvalStatus === 'REJECTED' && (
                    <span className="badge badge-danger" style={{ fontSize: '8px', padding: '1px 5px', color: '#f87171' }}>
                      Rejected
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted">{user.role}</div>
                {user.username && (
                  <div className="flex items-center gap-1 mt-1">
                    <span className="badge badge-info" style={{ fontSize: '8px', padding: '1px 5px' }}>
                      @{user.username}
                    </span>
                  </div>
                )}
                {user.phone && (
                  <div className="flex items-center gap-2 mt-1.5 text-xs text-muted">
                    <span className="font-mono">{user.phone}</span>
                    <button
                      type="button"
                      className="btn-icon"
                      style={{
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        background: copiedPhoneId === user.id ? 'rgba(34, 197, 94, 0.25)' : 'rgba(255, 255, 255, 0.08)',
                        color: copiedPhoneId === user.id ? '#4ade80' : 'var(--color-text-secondary)',
                        border: 'none',
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      onClick={(e) => handleCopyPhone(user.phone!, user.id, e)}
                      title={copiedPhoneId === user.id ? 'Copied!' : 'Copy phone number'}
                      aria-label="Copy phone number"
                    >
                      {copiedPhoneId === user.id ? <Check size={11} strokeWidth={2.5} /> : <Copy size={11} />}
                    </button>
                    <a
                      href={`tel:${user.phone.replace(/[^0-9+*#]/g, '')}`}
                      className="btn-icon"
                      style={{
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        background: 'rgba(34, 197, 94, 0.2)',
                        color: '#4ade80',
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
                      <PhoneCall size={11} strokeWidth={2} />
                    </a>
                  </div>
                )}
                {user.lastActive && (
                  <div className="flex items-center gap-1 mt-1 text-xs text-muted">
                    <Clock size={10} /> Last active {formatTimeAgo(user.lastActive)}
                  </div>
                )}
              </div>
              <div className="flex gap-2 items-center">
                {user.approvalStatus === 'PENDING_APPROVAL' ? (
                  <>
                    <button
                      className="btn btn-sm btn-primary"
                      style={{ fontSize: '11px', padding: '4px 8px' }}
                      onClick={() => respondToStaffRequest(user.username || user.name, true)}
                    >
                      Accept
                    </button>
                    <button
                      className="btn btn-sm btn-secondary"
                      style={{ fontSize: '11px', padding: '4px 8px', color: 'var(--color-danger)' }}
                      onClick={() => respondToStaffRequest(user.username || user.name, false)}
                    >
                      Reject
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn btn-sm btn-outline" onClick={() => navigate(`/permissions/${user.id}`)}>
                      Manage
                    </button>
                    {isVIP && (
                      <button className="btn btn-sm btn-danger" onClick={() => removePrivilegedUser(user.id)}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Permission Summary */}
            <div className="flex flex-wrap gap-1 mt-3">
              {Object.entries(user.permissions || {})
                .filter(([key, v]) => key.startsWith('can') && v === true)
                .map(([key]) => (
                  <span key={key} className="badge badge-info" style={{ fontSize: '8px' }}>
                    {key.replace('can', '').replace(/([A-Z])/g, ' $1').trim()}
                  </span>
                ))}
            </div>
          </div>
        ))}
      </div>

      {/* Add User */}
      {isVIP && privilegedUsers.length < 5 && (
        <>
          {!showAdd ? (
            <button className="btn btn-outline w-full mt-4" onClick={() => setShowAdd(true)}>
              <UserPlus size={16} /> Add Privileged User
            </button>
          ) : (
            <div className="glass-card mt-4 animate-scale-in">
              <h4 style={{ marginBottom: 'var(--space-3)' }}>Add New User</h4>
              <div className="flex flex-col gap-3">
                <div>
                  <label className="label">Name</label>
                  <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g., Deepa" />
                </div>
                <div>
                  <label className="label">
                    <AtSign size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                    Username
                  </label>
                  <input
                    className="input"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                    placeholder={suggestedUsername ? `Auto: ${suggestedUsername}` : 'e.g., deepa_pa'}
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                  {!newUsername && suggestedUsername && (
                    <p className="text-muted" style={{ fontSize: '10px', marginTop: '2px' }}>
                      Will use: <strong>@{suggestedUsername}</strong>
                    </p>
                  )}
                </div>
                <div>
                  <label className="label">Role</label>
                  <input className="input" value={newRole} onChange={(e) => setNewRole(e.target.value)} placeholder="e.g., Personal Assistant" />
                </div>
                <div>
                  <label className="label">
                    <Lock size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                    Password (min 4 characters)
                  </label>
                  <input
                    className="input"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter password for staff sign-in"
                    required
                  />
                </div>
                <div className="flex gap-2">
                  <button className="btn btn-ghost flex-1" onClick={() => setShowAdd(false)}>Cancel</button>
                  <button
                    className="btn btn-gold flex-1"
                    onClick={handleAddUser}
                    disabled={!newName.trim() || !newRole.trim() || !newPassword.trim() || newPassword.length < 4 || isAdding}
                  >
                    {isAdding ? 'Creating...' : 'Add User'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
      </div>
    </div>
  );
}
