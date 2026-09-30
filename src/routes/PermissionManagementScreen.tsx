import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { ArrowLeft, Shield } from 'lucide-react';
import { getInitials } from '../utils/formatters';
import type { PermissionKey } from '../types';

const PERMISSION_LABELS: Record<PermissionKey, { label: string; desc: string }> = {
  canAddInvitations: { label: 'Add Invitations', desc: 'Can scan and add new invitations' },
  canConfirmIgnoreInvitations: {
    label: 'Confirm / Ignore Invitations',
    desc: 'Can directly confirm attendance or ignore invitations. When disabled, invitations are saved as Pending.',
  },
  canEditEvents: { label: 'Edit Events', desc: 'Can modify event details and past events' },
  canChangePriority: { label: 'Change Priority', desc: 'Can change event priority levels' },
  canManageSchedule: { label: 'Manage Schedule', desc: 'Can add and modify schedule items' },
  canViewGiftHistory: { label: 'View Gift History', desc: 'Can access gift records and values' },
  canAddPeople: { label: 'Add People', desc: 'Can add new person profiles' },
};

export default function PermissionManagementScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { privilegedUsers, isVIP, updatePrivilegedUser, addActivityLog, currentUser, activeVipId } = useAppStore();

  useEffect(() => {
    if (!isVIP) {
      navigate('/settings', { replace: true });
    }
  }, [isVIP, navigate]);

  const user = privilegedUsers.find((u) => u.id === id);
  if (!user) {
    return (
      <div className="screen-no-nav flex items-center justify-center">
        <p className="text-muted">User not found</p>
      </div>
    );
  }

  const togglePermission = (key: PermissionKey) => {
    const newPerms = { ...user.permissions, [key]: !user.permissions[key] };
    updatePrivilegedUser(user.id, { permissions: newPerms });
    const actorId = activeVipId || currentUser?.vipId || (currentUser?.username ? `vip_${currentUser.username}` : 'vip_jaison');
    const actorName = currentUser?.name || 'VIP Principal';
    addActivityLog({
      userId: actorId,
      userName: actorName,
      action: `${!user.permissions[key] ? 'Granted' : 'Revoked'} permission "${PERMISSION_LABELS[key].label}"`,
      entityType: 'permission',
      entityId: user.id,
      entityName: user.name,
      previousValue: String(user.permissions[key]),
      newValue: String(!user.permissions[key]),
    });
  };

  return (
    <div className="screen-no-nav">
      {/* ── Stationary Top Bar ────────────────────────────────────────────── */}
      <div className="screen-stationary-header">
        <div className="top-bar">
          <button className="top-bar-back" onClick={() => navigate(-1)}>
            <ArrowLeft size={18} />
          </button>
          <span className="top-bar-title">Permissions</span>
          <div style={{ width: '36px' }} />
        </div>
      </div>

      {/* ── Scrollable Permissions Content ──────────────────────────────────── */}
      <div className="screen-scroll-body">
        {/* User Header */}
      <div className="text-center animate-slide-up" style={{ marginBottom: 'var(--space-5)' }}>
        <div className="avatar avatar-lg" style={{ margin: '0 auto var(--space-3)' }}>
          {getInitials(user.name)}
        </div>
        <h3>{user.name}</h3>
        <p className="text-sm text-secondary">{user.role}</p>
      </div>

      {/* Permissions */}
      <div className="flex flex-col gap-2">
        {(Object.entries(PERMISSION_LABELS) as [PermissionKey, { label: string; desc: string }][]).map(
          ([key, { label, desc }], i) => (
            <div
              key={key}
              className="glass-card flex items-center justify-between animate-slide-up"
              style={{ animationDelay: `${i * 0.06}s`, padding: 'var(--space-3) var(--space-4)' }}
            >
              <div>
                <div className="text-sm font-semibold">{label}</div>
                <div className="text-xs text-muted">{desc}</div>
              </div>
              <div
                className={`toggle ${user.permissions[key] ? 'active' : ''}`}
                onClick={() => togglePermission(key)}
              />
            </div>
          )
        )}
      </div>

      <p className="text-xs text-muted text-center mt-6">
        <Shield size={12} style={{ display: 'inline', marginRight: '4px' }} />
        All permission changes are logged in the activity history.
      </p>
      </div>
    </div>
  );
}
