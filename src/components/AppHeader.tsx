import { useNavigate, useLocation } from 'react-router-dom';
import {
  Shield,
  LayoutDashboard,
  Calendar,
  ScanLine,
  Users,
  Gift,
  Settings,
  Bell,
  Plus,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { getInitials } from '../utils/formatters';
import IconBadge from './IconBadge';
import { useTranslation } from '../i18n/useTranslation';

export default function AppHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    currentUser,
    currentPrivilegedUser,
    isVIP,
    notifications,
    getUnreadCount,
  } = useAppStore();

  const { t } = useTranslation();

  const activeUser = isVIP ? currentUser : currentPrivilegedUser;
  const activeUserName = activeUser?.name || (isVIP ? 'VIP Principal' : 'Staff User');
  const activeUserRole = isVIP ? 'Executive Principal' : (currentPrivilegedUser?.role || 'Staff');
  const unreadCount = getUnreadCount();

  // Hide header on splash or auth pages
  const isAuthPage =
    location.pathname === '/' ||
    location.pathname === '/login' ||
    location.pathname === '/waiting-approval' ||
    location.pathname === '/approval-rejected';
  if (isAuthPage) return null;

  const navItems = [
    { label: t('nav.briefing'), path: '/dashboard', icon: LayoutDashboard },
    { label: t('nav.events'), path: '/upcoming', icon: Calendar },
    { label: t('nav.scanner'), path: '/scan', icon: ScanLine },
    { label: t('nav.contacts'), path: '/people', icon: Users },
    { label: t('nav.calendar'), path: '/calendar', icon: Calendar },
    { label: t('nav.gifts'), path: '/gifts', icon: Gift },
    { label: t('nav.settings'), path: '/settings', icon: Settings },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="desktop-app-header">
      <div className="desktop-header-inner">
        {/* Brand Crest */}
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/dashboard')}>
          <Shield className="text-apple-blue" size={24} strokeWidth={2} />
          <div>
            <div className="font-bold text-[15px] tracking-tight" style={{ color: 'var(--color-text-primary)' }}>INVITATION HUB</div>
            <div className="text-[12px] font-medium tracking-tight" style={{ color: 'var(--color-text-secondary)' }}>{t('dashboard.protocolLedger')}</div>
          </div>
        </div>

        {/* Desktop Nav Links */}
        <nav className="desktop-nav-links" aria-label="Desktop Navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <button
                key={item.path}
                type="button"
                className={`desktop-nav-btn ${active ? 'active' : ''}`}
                onClick={() => navigate(item.path)}
              >
                <Icon size={15} strokeWidth={active ? 2.2 : 1.8} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right Actions: Quick Add + Notification + User */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            className="btn btn-sm btn-gold desktop-quick-add"
            onClick={() => navigate('/add-invitation')}
          >
            <Plus size={14} strokeWidth={2.4} />
            <span>{t('nav.addEvent')}</span>
          </button>

          <button
            type="button"
            className="btn-icon desktop-notif-btn"
            onClick={() => navigate('/notifications')}
            aria-label={t('nav.notifications')}
          >
            <Bell size={16} strokeWidth={1.8} />
            {unreadCount > 0 && (
              <span className="desktop-notif-dot" />
            )}
          </button>

          <div
            className="desktop-user-badge"
            onClick={() => navigate('/settings')}
          >
            <div className="avatar avatar-xs">
              {getInitials(activeUserName)}
            </div>
            <div className="desktop-user-meta">
              <span className="desktop-user-name">{activeUserName}</span>
              <span className="desktop-user-role">{activeUserRole}</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
