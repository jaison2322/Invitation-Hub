import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import {
  User,
  Lock,
  Bell,
  Palette,
  FileSpreadsheet,
  Info,
  LogOut,
  ChevronRight,
  Shield,
  Trash2,
  Check,
  Moon,
  Sun,
  ShieldAlert,
  Phone,
  Globe,
  History,
  UserCheck,
  AlertCircle,
  FileText,
  Smartphone,
  Minus,
  Plus,
  X,
} from 'lucide-react';
import { getInitials } from '../utils/formatters';
import { exportUpcomingEventsToExcel, exportUpcomingEventsToPdf } from '../services/exportService';
import { useTranslation } from '../i18n/useTranslation';
import { mobileNotificationService } from '../services/mobileNotificationService';
import appLogo from '../assets/icon.png';

export default function SettingsScreen() {
  const navigate = useNavigate();
  const {
    currentUser,
    currentPrivilegedUser,
    isVIP,
    logout,
    privilegedUsers,
    theme,
    setTheme,
    updateProfile,
    changePassword,
    clearAllData,
    invitations,
    people,
    activeVipId,
    syncWithSupabase,
    checkAndTriggerUpcomingReminders,
  } = useAppStore();

  // Auto-sync with Supabase on mount so pending requests and staff counts are always live
  useEffect(() => {
    if (activeVipId) {
      syncWithSupabase(activeVipId).catch(console.warn);
    }
  }, [activeVipId, syncWithSupabase]);

  const pendingRequestsCount = privilegedUsers.filter(
    (u) => u.approvalStatus === 'PENDING_APPROVAL'
  ).length;
  const activeStaffCount = privilegedUsers.filter(
    (u) => !u.approvalStatus || u.approvalStatus === 'APPROVED'
  ).length;

  const activeUser = isVIP ? currentUser : currentPrivilegedUser;
  const activeUserName = activeUser?.name || (isVIP ? 'VIP Principal' : 'Privileged User');
  const activeUsername = activeUser?.username || (isVIP ? 'vip' : 'staff');
  const activeUserRole = isVIP ? 'VIP Master Account' : (currentPrivilegedUser?.role || 'Privileged User');

  const { t, language, setLanguage, currentLanguageOption, supportedLanguages } = useTranslation();

  // Modals state with back-button interception
  type ModalType =
    | 'theme'
    | 'language'
    | 'profile'
    | 'password'
    | 'notifications'
    | 'about'
    | 'clear'
    | 'privileged-info'
    | 'export-confirm'
    | 'export-empty'
    | null;
  const [activeModal, setRawActiveModal] = useState<ModalType>(null);
  const activeModalRef = useRef<ModalType>(null);

  useEffect(() => {
    activeModalRef.current = activeModal;
  }, [activeModal]);

  const setActiveModal = useCallback((modal: ModalType) => {
    if (modal) {
      window.history.pushState({ settingsModal: modal }, '');
      setRawActiveModal(modal);
    } else {
      setRawActiveModal(null);
      if (window.history.state?.settingsModal) {
        window.history.back();
      }
    }
  }, []);

  useEffect(() => {
    const handlePop = () => {
      setRawActiveModal(null);
    };

    const handleHardwareBack = (e: Event) => {
      if (activeModalRef.current) {
        e.preventDefault();
        setActiveModal(null);
      }
    };

    window.addEventListener('popstate', handlePop);
    window.addEventListener('hardwareBackButton', handleHardwareBack);
    return () => {
      window.removeEventListener('popstate', handlePop);
      window.removeEventListener('hardwareBackButton', handleHardwareBack);
    };
  }, [setActiveModal]);

  // Profile Edit Form State
  const [editName, setEditName] = useState(activeUserName);
  const [editPhone, setEditPhone] = useState(activeUser?.phone || '');
  const [profileSuccess, setProfileSuccess] = useState('');

  // Change Password Form State
  const [currentPassInput, setCurrentPassInput] = useState('');
  const [newPassInput, setNewPassInput] = useState('');
  const [confirmPassInput, setConfirmPassInput] = useState('');
  const [passError, setPassError] = useState('');
  const [passSuccess, setPassSuccess] = useState('');

  // Notification Preferences State (Loaded from and saved to localStorage)
  const [notifNewInvitations, setNotifNewInvitations] = useState(() => {
    try {
      const saved = localStorage.getItem('inv_notif_prefs');
      if (saved) return JSON.parse(saved).newInvitations ?? true;
    } catch {}
    return true;
  });
  const [notifConflictAlerts, setNotifConflictAlerts] = useState(() => {
    try {
      const saved = localStorage.getItem('inv_notif_prefs');
      if (saved) return JSON.parse(saved).scheduleConflicts ?? true;
    } catch {}
    return true;
  });
  const [notifScheduleChanges, setNotifScheduleChanges] = useState(() => {
    try {
      const saved = localStorage.getItem('inv_notif_prefs');
      if (saved) return JSON.parse(saved).statusUpdates ?? true;
    } catch {}
    return true;
  });
  const [reminderDays, setReminderDays] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem('inv_notif_prefs');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.reminderDays) && parsed.reminderDays.length > 0) {
          return [...new Set<number>(parsed.reminderDays.map((x: any) => Number(x)))].sort((a: number, b: number) => a - b);
        }
        const initialDays: number[] = [];
        if (parsed.remindDayOf ?? true) initialDays.push(0);
        if (parsed.remind1Day ?? true) initialDays.push(1);
        if (parsed.remind2Days ?? true) initialDays.push(2);
        if (parsed.remind7Days ?? true) initialDays.push(7);
        return initialDays.length > 0 ? initialDays : [0, 1, 2, 7];
      }
    } catch {}
    return [0, 1, 2, 7];
  });
  const [customDaysValue, setCustomDaysValue] = useState<number>(3);
  const [permissionStatus, setPermissionStatus] = useState<'granted' | 'denied' | 'prompt'>('prompt');

  const toggleReminderDay = (day: number) => {
    setReminderDays((prev) => {
      const exists = prev.includes(day);
      const next = exists ? prev.filter((d) => d !== day) : [...prev, day];
      return next.sort((a, b) => a - b);
    });
  };

  const handleAddCustomDay = () => {
    const day = Math.max(0, Math.min(60, customDaysValue));
    if (!reminderDays.includes(day)) {
      setReminderDays((prev) => [...prev, day].sort((a, b) => a - b));
    }
  };

  const PRESET_REMINDER_DAYS = [
    { days: 0, label: 'Same Day' },
    { days: 1, label: '1 Day' },
    { days: 2, label: '2 Days' },
    { days: 3, label: '3 Days' },
    { days: 5, label: '5 Days' },
    { days: 7, label: '7 Days (1 wk)' },
    { days: 14, label: '14 Days (2 wks)' },
  ];

  const handleSaveNotificationPreferences = () => {
    try {
      const sortedDays = [...new Set<number>(reminderDays.map((x: any) => Number(x)))].sort((a: number, b: number) => a - b);
      const prefs = {
        newInvitations: notifNewInvitations,
        scheduleConflicts: notifConflictAlerts,
        statusUpdates: notifScheduleChanges,
        remind7Days: sortedDays.includes(7),
        remind2Days: sortedDays.includes(2),
        remind1Day: sortedDays.includes(1),
        remindDayOf: sortedDays.includes(0),
        reminderDays: sortedDays,
      };
      localStorage.setItem('inv_notif_prefs', JSON.stringify(prefs));
      checkAndTriggerUpcomingReminders();
    } catch {}
    setActiveModal(null);
  };

  useEffect(() => {
    mobileNotificationService.checkPermission().then((res) => {
      setPermissionStatus(res.status);
    });
  }, [activeModal]);

  const handleToggleNotification = async (
    setter: (val: boolean) => void,
    currentVal: boolean
  ) => {
    if (!currentVal) {
      try {
        const check = await mobileNotificationService.checkPermission();
        if (check.granted) {
          setter(true);
          setPermissionStatus('granted');
          return;
        }

        const res = await mobileNotificationService.requestPermission();
        if (res.granted) {
          setter(true);
          setPermissionStatus('granted');
        } else {
          setter(false);
          setPermissionStatus('denied');
          if (!res.canAskAgain) {
            const open = window.confirm(
              'Notification permission is disabled in your device settings. Would you like to open App Settings to enable notifications?'
            );
            if (open) {
              mobileNotificationService.openSettings();
            }
          } else {
            alert('Notification permission was not granted. You will not receive system alerts.');
          }
        }
      } catch (err) {
        console.warn('Notification permission error:', err);
        setter(true);
      }
    } else {
      setter(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<'excel' | 'pdf' | null>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const handleConfirmExportDownload = async (format: 'excel' | 'pdf' = 'excel') => {
    if (isExporting) return;
    try {
      setIsExporting(true);
      setExportFormat(format);
      setExportStatus(null);

      const res = format === 'pdf'
        ? await exportUpcomingEventsToPdf({
          invitations,
          people,
        })
        : await exportUpcomingEventsToExcel({
          invitations,
          people,
        });

      if (!res.success && res.reason === 'NO_UPCOMING_EVENTS') {
        setActiveModal('export-empty');
        return;
      }

      if (!res.success) {
        setActiveModal(null);
        setExportStatus(res.summary || 'Export failed: Unknown error');
        setTimeout(() => setExportStatus(null), 5000);
        return;
      }

      setActiveModal(null);
      setExportStatus(
        res.summary ||
        (format === 'pdf'
          ? 'Upcoming events exported to PDF successfully.'
          : 'Upcoming events exported to Excel successfully.')
      );
      setTimeout(() => setExportStatus(null), 5000);
    } catch (err: any) {
      setActiveModal(null);
      setExportStatus('Export failed: ' + (err?.message || 'Unknown error'));
      setTimeout(() => setExportStatus(null), 5000);
    } finally {
      setIsExporting(false);
      setExportFormat(null);
    }
  };

  const handleClearData = async () => {
    await clearAllData();
    navigate('/login', { replace: true });
    window.location.reload();
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) return;
    updateProfile(editName.trim(), editPhone.trim());
    setProfileSuccess('Profile updated successfully.');
    setTimeout(() => {
      setProfileSuccess('');
      setActiveModal(null);
    }, 800);
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassError('');
    setPassSuccess('');

    if (newPassInput.length < 4) {
      setPassError('Password must be at least 4 characters.');
      return;
    }
    if (newPassInput !== confirmPassInput) {
      setPassError('New passwords do not match.');
      return;
    }

    const result = await changePassword(currentPassInput, newPassInput);
    if (result.success) {
      setPassSuccess(result.message);
      setCurrentPassInput('');
      setNewPassInput('');
      setConfirmPassInput('');
      setTimeout(() => {
        setPassSuccess('');
        setActiveModal(null);
      }, 1000);
    } else {
      setPassError(result.message);
    }
  };

  const themeOptions = [
    {
      id: 'dark' as const,
      name: t('settings.themeDark'),
      desc: t('settings.themeDarkDesc'),
      icon: <Moon size={22} color="#ffffff" style={{ color: '#ffffff', stroke: '#ffffff' }} strokeWidth={2} />,
      previewBg: '#121620',
      previewBorder: 'rgba(255, 255, 255, 0.15)',
    },
    {
      id: 'light' as const,
      name: t('settings.themeLight'),
      desc: t('settings.themeLightDesc'),
      icon: <Sun size={22} color="var(--color-gold)" style={{ color: 'var(--color-gold)', stroke: 'var(--color-gold)' }} strokeWidth={2} />,
      previewBg: '#f8fafc',
      previewBorder: 'rgba(15, 23, 42, 0.12)',
    },
  ];

  const getThemeLabel = (tName: string) => {
    switch (tName) {
      case 'light': return t('settings.themeLight');
      default: return t('settings.themeDark');
    }
  };

  const settingsGroups = [
    {
      title: 'Account',
      items: [
        {
          icon: <User size={18} />,
          label: 'Profile',
          desc: `@${activeUsername} • ${activeUser?.phone || activeUserName}`,
          onClick: () => {
            setEditName(activeUserName);
            setEditPhone(activeUser?.phone || '');
            setActiveModal('profile');
          },
        },
        {
          icon: <Lock size={18} />,
          label: 'Change Password',
          desc: 'Update your account sign-in password',
          onClick: () => {
            setCurrentPassInput('');
            setNewPassInput('');
            setConfirmPassInput('');
            setPassError('');
            setPassSuccess('');
            setActiveModal('password');
          },
        },
        ...(isVIP
          ? [
            {
              icon: <UserCheck size={18} style={{ color: pendingRequestsCount > 0 ? '#fbbf24' : undefined }} />,
              label: 'User Access Requests',
              desc:
                pendingRequestsCount > 0
                  ? `${pendingRequestsCount} pending authorization request${pendingRequestsCount > 1 ? 's' : ''}`
                  : 'Review and authorize User requests',
              onClick: () => navigate('/staff-requests'),
              badge: pendingRequestsCount > 0,
              badgeText: pendingRequestsCount > 0 ? `${pendingRequestsCount} Pending` : undefined,
              badgeVariant: 'warning',
            },
            {
              icon: <Shield size={18} />,
              label: 'User Management',
              desc: `${activeStaffCount}/5 active users`,
              onClick: () => navigate('/privileged-users'),
              badge: true,
              isInfoOnly: false,
            },
          ]
          : [
            {
              icon: <Shield size={18} style={{ color: 'var(--color-info)' }} />,
              label: 'User Access',
              desc: 'You are a user only',
              onClick: () => setActiveModal('privileged-info'),
              badge: false,
              isInfoOnly: true,
            },
          ]),
      ],
    },
    {
      title: t('settings.preferences'),
      items: [
        {
          icon: <Palette size={18} />,
          label: t('settings.appearance'),
          desc: getThemeLabel(theme || 'dark'),
          onClick: () => setActiveModal('theme'),
        },
        {
          icon: <Globe size={18} />,
          label: t('settings.language'),
          desc: `${currentLanguageOption.nativeName}${currentLanguageOption.name !== currentLanguageOption.nativeName
            ? ` (${currentLanguageOption.name})`
            : ''
            }`,
          onClick: () => setActiveModal('language'),
        },
        {
          icon: <Bell size={18} />,
          label: t('settings.notifications'),
          desc: 'Manage alerts & reminders',
          onClick: () => setActiveModal('notifications'),
        },
        {
          icon: <History size={18} />,
          label: 'Activity History',
          desc: 'Changes & action made by the admin',
          onClick: () => navigate('/activity'),
        },
      ],
    },
    {
      title: t('settings.dataSecurity'),
      items: [
        {
          icon: <FileSpreadsheet size={18} />,
          label: t('settings.exportExcel'),
          desc: isExporting
            ? 'Generating Excel spreadsheet...'
            : t('settings.exportDesc'),
          onClick: () => setActiveModal('export-confirm'),
        },
        {
          icon: <Trash2 size={18} />,
          label: t('settings.clearData'),
          desc: t('settings.clearDesc'),
          onClick: () => setActiveModal('clear'),
          danger: true,
        },
      ],
    },
    {
      title: t('settings.about'),
      items: [
        {
          icon: <Info size={18} />,
          label: t('settings.about'),
          desc: 'v2.0 Executive Edition',
          onClick: () => setActiveModal('about'),
        },
      ],
    },
  ];

  return (
    <div className="screen">
      {/* ── Stationary Header ──────────────────────────────────────────────── */}
      <div className="screen-stationary-header" style={{ paddingBottom: '16px' }}>
        {/* ── Apple Large Title Header ───────────────────────────────────────── */}
        <div>
          <h1
            className="font-heading font-bold text-white tracking-tight"
            style={{ fontSize: '32px', letterSpacing: '-0.03em', lineHeight: 1.15 }}
          >
            {t('settings.title')}
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '4px', marginBottom: 0 }}>
            {t('settings.accountSubtitle')}
          </p>
        </div>
      </div>

      {/* ── Scrollable Settings Body ────────────────────────────────────────── */}
      <div className="screen-scroll-body" style={{ paddingTop: '16px' }}>
        {/* ── Export Status Alert Banner ─────────────────────────────────────── */}
        {exportStatus && (
          <div
            className="glass-card animate-fade-in mb-4"
            style={{
              padding: '12px 16px',
              borderRadius: 'var(--radius-lg)',
              background: exportStatus.startsWith('Export failed')
                ? 'rgba(255, 69, 58, 0.15)'
                : 'rgba(48, 209, 88, 0.15)',
              border: exportStatus.startsWith('Export failed')
                ? '1px solid rgba(255, 69, 58, 0.3)'
                : '1px solid rgba(48, 209, 88, 0.3)',
              color: exportStatus.startsWith('Export failed')
                ? 'var(--color-danger)'
                : 'var(--color-confirmed)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            {exportStatus.startsWith('Export failed') ? (
              <ShieldAlert size={16} />
            ) : (
              <Check size={16} />
            )}
            <span>{exportStatus}</span>
          </div>
        )}

        {/* ── Apple Profile Card (iOS Inset Grouped) ─────────────────────────── */}
        <div className="ios-grouped-list mb-5">
          <div
            className="ios-grouped-item"
            style={{ padding: '16px' }}
            onClick={() => {
              setEditName(activeUserName);
              setEditPhone(activeUser?.phone || '');
              setActiveModal('profile');
            }}
          >
            <div className="avatar avatar-lg" style={{ width: '52px', height: '52px', fontSize: '18px' }}>
              {getInitials(activeUserName)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-heading font-semibold" style={{ fontSize: '17px', letterSpacing: '-0.015em', color: 'var(--color-text-primary)' }}>
                {activeUserName}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`badge ${isVIP ? 'badge-gold' : 'badge-info'}`}>
                  {isVIP ? 'Admin' : activeUserRole}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                  @{activeUsername}
                </span>
              </div>
              {activeUser?.phone && (
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px' }} className="truncate">
                  {activeUser.phone}
                </div>
              )}
            </div>
            <ChevronRight size={16} strokeWidth={2} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
          </div>
        </div>

        {/* ── Apple Settings Groups (Inset Grouped Lists) ────────────────────── */}
        {settingsGroups.map((group, gi) => (
          <section key={gi} style={{ marginBottom: '20px' }}>
            <div
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: '6px',
                paddingLeft: '4px',
              }}
            >
              {group.title}
            </div>

            <div className="ios-grouped-list">
              {group.items.map((item: any, ii) => {
                // System squircle color mapping
                const squircleBg = item.danger
                  ? 'rgba(255, 69, 58, 0.15)'
                  : ii % 4 === 0
                    ? 'rgba(10, 132, 255, 0.15)'
                    : ii % 4 === 1
                      ? 'rgba(48, 209, 88, 0.15)'
                      : ii % 4 === 2
                        ? 'rgba(255, 159, 10, 0.15)'
                        : 'rgba(191, 90, 242, 0.15)';

                const iconColor = item.danger
                  ? 'var(--color-danger)'
                  : ii % 4 === 0
                    ? 'var(--color-accent)'
                    : ii % 4 === 1
                      ? 'var(--color-confirmed)'
                      : ii % 4 === 2
                        ? 'var(--color-pending)'
                        : 'var(--color-apple-purple)';

                return (
                  <div
                    key={ii}
                    className="ios-grouped-item"
                    onClick={item.onClick}
                  >
                    <div
                      className="ios-icon-squircle"
                      style={{ background: squircleBg, color: iconColor }}
                    >
                      {item.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div
                        style={{
                          fontSize: '14px',
                          fontWeight: 500,
                          color: item.danger ? 'var(--color-danger)' : 'var(--color-text-primary)',
                        }}
                      >
                        {item.label}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '1px' }} className="truncate">
                        {item.desc}
                      </div>
                    </div>
                    {item.badgeText && (
                      <span
                        className={`badge ${item.badgeVariant === 'warning' ? 'badge-warning' : 'badge-gold'}`}
                        style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          marginRight: '6px',
                          fontWeight: 600,
                          backgroundColor: item.badgeVariant === 'warning' ? 'rgba(245, 158, 11, 0.2)' : undefined,
                          color: item.badgeVariant === 'warning' ? '#fbbf24' : undefined,
                          border: item.badgeVariant === 'warning' ? '0.5px solid rgba(245, 158, 11, 0.4)' : undefined,
                        }}
                      >
                        {item.badgeText}
                      </span>
                    )}
                    {item.isInfoOnly ? (
                      <span className="badge badge-info" style={{ fontSize: '10px' }}>Active</span>
                    ) : (
                      <ChevronRight size={15} strokeWidth={2} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        {/* ── Sign Out Button ────────────────────────────────────────────────── */}
        <div style={{ marginTop: '28px', marginBottom: '20px' }}>
          <button
            type="button"
            className="btn btn-danger w-full"
            onClick={handleLogout}
          >
            <LogOut size={16} strokeWidth={2} />
            <span>{t('settings.signOut')}</span>
          </button>
        </div>
      </div>

      {/* ─── MODAL: THEME SELECTION ────────────────────────────────────────── */}
      {activeModal === 'theme' && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="modal-content animate-scale-in" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px', width: '100%' }}>
            <div className="modal-handle" />
            <div className="flex items-center gap-2 mb-1.5">
              <Palette size={20} className="text-gold" />
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600 }}>{t('settings.selectTheme')}</h3>
            </div>
            <p className="text-xs text-secondary mb-4">
              {t('settings.themeSubtitle')}
            </p>

            <div className="flex flex-col gap-3" style={{ marginBottom: '24px' }}>
              {themeOptions.map((opt) => {
                const isSelected = (theme === 'light' ? 'light' : 'dark') === opt.id;
                return (
                  <div
                    key={opt.id}
                    className={`glass-card flex items-center justify-between p-3.5 ${isSelected ? 'glass-card-gold' : ''
                      }`}
                    style={{
                      cursor: 'pointer',
                      borderRadius: 'var(--radius-xl)',
                      border: isSelected ? '1.5px solid var(--color-gold)' : '1px solid var(--glass-border)',
                      background: isSelected ? 'var(--color-gold-muted)' : undefined,
                      transition: 'all 0.18s ease',
                    }}
                    onClick={() => {
                      setTheme(opt.id);
                    }}
                  >
                    {/* Left: Theme Logo Icon */}
                    <div
                      style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '12px',
                        background: opt.previewBg,
                        border: `1px solid ${opt.previewBorder}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: isSelected ? '0 0 14px rgba(10, 132, 255, 0.25)' : 'none',
                        flexShrink: 0,
                      }}
                    >
                      {opt.icon}
                    </div>

                    {/* Center: Theme Name */}
                    <div
                      className="font-semibold text-center flex-1"
                      style={{
                        fontSize: '1.08rem',
                        color: 'var(--color-text-primary)',
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {opt.name}
                    </div>

                    {/* Right: Select Option Indicator */}
                    <div
                      style={{
                        width: '44px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        flexShrink: 0,
                        paddingRight: '4px',
                      }}
                    >
                      <div
                        style={{
                          width: '22px',
                          height: '22px',
                          borderRadius: '50%',
                          border: isSelected ? '2px solid var(--color-gold)' : '2px solid var(--glass-border)',
                          background: isSelected ? 'var(--color-gold)' : 'transparent',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {isSelected && <Check size={13} strokeWidth={3} />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <button className="btn btn-gold w-full" onClick={() => setActiveModal(null)} style={{ height: '46px', fontWeight: 600 }}>
              {t('common.done')}
            </button>
          </div>
        </div>
      )}

      {/* ─── MODAL: LANGUAGE SELECTION ────────────────────────────────────────── */}
      {activeModal === 'language' && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="modal-content animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="flex items-center gap-2 mb-2">
              <Globe size={20} style={{ color: 'var(--color-gold)' }} />
              <h3 style={{ margin: 0 }}>{t('settings.selectLanguage')}</h3>
            </div>
            <p className="text-xs text-secondary mb-4">
              {t('settings.langSubtitle')}
            </p>

            <div className="flex flex-col gap-2.5 mb-5" style={{ maxHeight: '55vh', overflowY: 'auto' }}>
              {supportedLanguages.map((langOpt) => {
                const isSelected = language === langOpt.code;
                return (
                  <div
                    key={langOpt.code}
                    className={`glass-card flex items-center justify-between p-3 ${isSelected ? 'glass-card-gold' : ''
                      }`}
                    style={{
                      cursor: 'pointer',
                      border: isSelected ? '1px solid var(--color-gold)' : '1px solid var(--glass-border)',
                      background: isSelected ? 'rgba(212, 175, 55, 0.15)' : undefined,
                      borderRadius: 'var(--radius-lg)',
                    }}
                    onClick={() => {
                      setLanguage(langOpt.code);
                      setTimeout(() => setActiveModal(null), 250);
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: 'var(--radius-md)',
                          background: isSelected ? 'rgba(212, 175, 55, 0.18)' : 'rgba(255, 255, 255, 0.05)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: isSelected ? '1px solid var(--color-gold)' : '1px solid var(--glass-border)',
                        }}
                      >
                        <span
                          className="font-mono font-bold"
                          style={{
                            fontSize: '13px',
                            color: isSelected ? 'var(--color-gold)' : 'var(--color-text-secondary)',
                            letterSpacing: '0.04em',
                          }}
                        >
                          {langOpt.code.toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <div
                          className="font-heading font-semibold"
                          style={{
                            fontSize: '15px',
                            color: isSelected ? 'var(--color-accent)' : 'var(--color-text-primary)',
                          }}
                        >
                          {langOpt.nativeName}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '1px' }}>
                          {langOpt.name} • {langOpt.region}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        border: isSelected ? '2px solid var(--color-accent)' : '2px solid var(--glass-border)',
                        background: isSelected ? 'var(--color-accent)' : 'transparent',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {isSelected && <Check size={14} strokeWidth={2.5} />}
                    </div>
                  </div>
                );
              })}
            </div>

            <button className="btn btn-secondary w-full" onClick={() => setActiveModal(null)}>
              {t('common.done')}
            </button>
          </div>
        </div>
      )}

      {/* ─── MODAL: EDIT PROFILE ────────────────────────────────────────────── */}
      {activeModal === 'profile' && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="modal-content animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <h3 style={{ marginBottom: 'var(--space-2)' }}>Edit Profile</h3>
            <p className="text-xs text-secondary mb-4">Update your profile details and contact information</p>

            <form onSubmit={handleSaveProfile} className="flex flex-col gap-3">
              {profileSuccess && (
                <div className="badge badge-success p-2 text-center">{profileSuccess}</div>
              )}

              {/* Username (Read Only in Edit Profile) */}
              <div>
                <label className="label">
                  <span className="text-gold font-semibold">@</span> Username (Account Identifier)
                </label>
                <input
                  className="input"
                  style={{ opacity: 0.75, cursor: 'not-allowed', background: 'rgba(0,0,0,0.2)' }}
                  value={`@${activeUsername}`}
                  disabled
                  readOnly
                />
              </div>

              <div>
                <label className="label">
                  <User size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                  Full Name
                </label>
                <input
                  className="input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="label">
                  <Phone size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                  Phone Number
                </label>
                <input
                  className="input"
                  type="tel"
                  placeholder="Enter phone number"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                />
              </div>

              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  className="btn btn-ghost flex-1"
                  onClick={() => setActiveModal(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-gold flex-1" disabled={!editName.trim()}>
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: CHANGE PASSWORD ────────────────────────────────────────── */}
      {activeModal === 'password' && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="modal-content animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <h3 style={{ marginBottom: 'var(--space-2)' }}>Change Account Password</h3>
            <p className="text-xs text-secondary mb-4">Set a new secure sign-in password for @{activeUsername}</p>

            <form onSubmit={handleSavePassword} className="flex flex-col gap-3">
              {passError && (
                <div
                  style={{
                    color: 'var(--color-danger)',
                    fontSize: 'var(--text-xs)',
                    padding: '8px',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(239, 68, 68, 0.1)',
                  }}
                >
                  {passError}
                </div>
              )}
              {passSuccess && (
                <div
                  style={{
                    color: 'var(--color-confirmed)',
                    fontSize: 'var(--text-xs)',
                    padding: '8px',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(34, 197, 94, 0.1)',
                  }}
                >
                  {passSuccess}
                </div>
              )}

              <div>
                <label className="label">Current Password</label>
                <input
                  className="input"
                  type="password"
                  placeholder="Enter current password"
                  value={currentPassInput}
                  onChange={(e) => setCurrentPassInput(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="label">New Password</label>
                <input
                  className="input"
                  type="password"
                  placeholder="At least 4 characters"
                  value={newPassInput}
                  onChange={(e) => setNewPassInput(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="label">Confirm New Password</label>
                <input
                  className="input"
                  type="password"
                  placeholder="Re-enter new password"
                  value={confirmPassInput}
                  onChange={(e) => setConfirmPassInput(e.target.value)}
                  required
                />
              </div>

              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  className="btn btn-ghost flex-1"
                  onClick={() => setActiveModal(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-gold flex-1"
                  disabled={!currentPassInput || newPassInput.length < 4 || newPassInput !== confirmPassInput}
                >
                  Save Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: NOTIFICATIONS ───────────────────────────────────────────── */}
      {activeModal === 'notifications' && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div
            className="modal-content animate-scale-in"
            onClick={(e) => e.stopPropagation()}
            style={{ maxHeight: '88vh', overflowY: 'auto' }}
          >
            <div className="modal-handle" />
            <div className="flex items-center justify-between" style={{ marginBottom: '4px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Notification Preferences</h3>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-full)',
                  background:
                    permissionStatus === 'granted'
                      ? 'rgba(34, 197, 94, 0.15)'
                      : permissionStatus === 'denied'
                        ? 'rgba(239, 68, 68, 0.15)'
                        : 'rgba(245, 158, 11, 0.15)',
                  color:
                    permissionStatus === 'granted'
                      ? '#22c55e'
                      : permissionStatus === 'denied'
                        ? '#ef4444'
                        : '#f59e0b',
                }}
              >
                {permissionStatus === 'granted'
                  ? 'Active'
                  : permissionStatus === 'denied'
                    ? 'Blocked'
                    : 'Not Allowed'}
              </span>
            </div>
            <p className="text-xs text-secondary" style={{ marginBottom: '16px' }}>
              Choose what notifications and when you want to receive alerts
            </p>

            {permissionStatus === 'denied' && (
              <div
                className="glass-card mb-4"
                style={{
                  padding: 'var(--space-3)',
                  borderColor: 'rgba(239, 68, 68, 0.3)',
                  background: 'rgba(239, 68, 68, 0.05)',
                }}
              >
                <div className="text-xs" style={{ color: '#ef4444', marginBottom: '8px' }}>
                  Notifications are disabled in your OS/browser settings.
                </div>
                <button
                  type="button"
                  className="btn btn-sm w-full"
                  style={{ fontSize: '11px', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', border: 'none' }}
                  onClick={() => mobileNotificationService.openSettings()}
                >
                  Open Device Settings
                </button>
              </div>
            )}

            {/* ── Section 1: WHAT alerts you receive ── */}
            <div style={{ marginBottom: '18px' }}>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  color: 'var(--color-gold)',
                  marginBottom: '8px',
                }}
              >
                What alerts you receive
              </div>

              <div className="flex flex-col gap-2.5">
                {/* New Invitations */}
                <div className="glass-card flex items-center justify-between p-3" style={{ borderRadius: '12px' }}>
                  <div>
                    <div className="text-sm font-semibold">New Invitation Alerts</div>
                    <div className="text-xs text-muted">When a new invitation card is scanned or added</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifNewInvitations}
                    onChange={() => handleToggleNotification(setNotifNewInvitations, notifNewInvitations)}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--color-gold)', cursor: 'pointer' }}
                  />
                </div>

                {/* Schedule Conflicts */}
                <div className="glass-card flex items-center justify-between p-3" style={{ borderRadius: '12px' }}>
                  <div>
                    <div className="text-sm font-semibold">Schedule Overlaps & Conflicts</div>
                    <div className="text-xs text-muted">Immediate alert when events or functions clash</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifConflictAlerts}
                    onChange={() => handleToggleNotification(setNotifConflictAlerts, notifConflictAlerts)}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--color-gold)', cursor: 'pointer' }}
                  />
                </div>

                {/* Status & Modifications */}
                <div className="glass-card flex items-center justify-between p-3" style={{ borderRadius: '12px' }}>
                  <div>
                    <div className="text-sm font-semibold">Status & Approval Updates</div>
                    <div className="text-xs text-muted">When invitations are confirmed, modified, or reviewed</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifScheduleChanges}
                    onChange={() => handleToggleNotification(setNotifScheduleChanges, notifScheduleChanges)}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--color-gold)', cursor: 'pointer' }}
                  />
                </div>
              </div>
            </div>

            {/* ── Section 2: WHEN to receive reminders ── */}
            <div style={{ marginBottom: '20px' }}>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  color: 'var(--color-gold)',
                  marginBottom: '4px',
                }}
              >
                When to receive reminders
              </div>
              <p className="text-xs text-secondary" style={{ marginBottom: '12px' }}>
                Set how many days before an event or function you want to get reminders
              </p>

              {/* Quick Presets */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '6px' }}>
                  Quick Preset Days
                </div>
                <div className="flex flex-wrap gap-2">
                  {PRESET_REMINDER_DAYS.map((p) => {
                    const active = reminderDays.includes(p.days);
                    return (
                      <button
                        key={p.days}
                        type="button"
                        onClick={() => toggleReminderDay(p.days)}
                        className={`badge ${active ? 'badge-gold' : 'badge-ghost'} cursor-pointer`}
                        style={{
                          padding: '6px 12px',
                          fontSize: '12px',
                          fontWeight: active ? 600 : 500,
                          borderRadius: '20px',
                          border: active ? '1px solid var(--color-gold)' : '1px solid var(--glass-border)',
                          background: active ? 'rgba(212, 175, 55, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                          color: active ? 'var(--color-gold)' : 'var(--color-text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                        }}
                      >
                        {active && <Check size={12} strokeWidth={2.5} />}
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Number of Days Stepper */}
              <div
                className="glass-card p-3 mb-3"
                style={{
                  borderRadius: '12px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--glass-border)',
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
                  Custom Days Before Event
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="flex items-center"
                    style={{
                      background: 'rgba(212, 175, 55, 0.05)',
                      borderRadius: '8px',
                      border: '1px solid var(--glass-border)',
                      overflow: 'hidden',
                    }}
                  >
                    <button
                      type="button"
                      className="btn-icon"
                      style={{ width: '36px', height: '36px', color: 'var(--color-gold)' }}
                      onClick={() => setCustomDaysValue((prev) => Math.max(0, prev - 1))}
                    >
                      <Minus size={14} />
                    </button>
                    <input
                      type="number"
                      min="0"
                      max="60"
                      value={customDaysValue}
                      onChange={(e) => setCustomDaysValue(Math.max(0, Math.min(60, parseInt(e.target.value) || 0)))}
                      style={{
                        width: '50px',
                        textAlign: 'center',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--color-text-primary)',
                        fontWeight: 700,
                        fontSize: '15px',
                        fontFamily: 'var(--font-mono)',
                        outline: 'none',
                      }}
                    />
                    <button
                      type="button"
                      className="btn-icon"
                      style={{ width: '36px', height: '36px', color: 'var(--color-gold)' }}
                      onClick={() => setCustomDaysValue((prev) => Math.min(60, prev + 1))}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <span className="text-xs text-secondary flex-1">
                    {customDaysValue === 0
                      ? 'Same day alert'
                      : customDaysValue === 1
                        ? '1 day before'
                        : `${customDaysValue} days before event`}
                  </span>
                  <button
                    type="button"
                    className="btn btn-xs btn-gold"
                    onClick={handleAddCustomDay}
                    disabled={reminderDays.includes(customDaysValue)}
                    style={{ padding: '7px 12px', fontSize: '11px', whiteSpace: 'nowrap' }}
                  >
                    {reminderDays.includes(customDaysValue) ? 'Added' : '+ Add Alert'}
                  </button>
                </div>
              </div>

              {/* Active Reminder Schedule Summary */}
              <div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '6px' }}>
                  Active Reminder Schedule ({reminderDays.length} {reminderDays.length === 1 ? 'alert' : 'alerts'})
                </div>
                {reminderDays.length === 0 ? (
                  <div
                    className="p-3 text-center rounded-lg text-xs"
                    style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.08)' }}
                  >
                    No reminders scheduled. Tap a preset day above to activate alerts.
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {reminderDays.map((days) => {
                      const label =
                        days === 0
                          ? 'Day of Event (Today)'
                          : days === 1
                            ? '1 Day Before (Tomorrow)'
                            : days === 7
                              ? '7 Days Before (1 Week)'
                              : `${days} Days Before Event`;
                      return (
                        <div
                          key={days}
                          className="flex items-center justify-between p-2.5 rounded-lg"
                          style={{
                            background: 'rgba(212, 175, 55, 0.07)',
                            border: '1px solid rgba(212, 175, 55, 0.2)',
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <Bell size={13} style={{ color: 'var(--color-gold)' }} />
                            <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)' }}>{label}</span>
                          </div>
                          <button
                            type="button"
                            className="btn-icon"
                            style={{ width: '24px', height: '24px', color: 'var(--color-text-muted)' }}
                            onClick={() => toggleReminderDay(days)}
                            title="Remove reminder"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <button
              className="btn btn-gold w-full"
              onClick={handleSaveNotificationPreferences}
              style={{ height: '46px', fontWeight: 600, fontSize: '14px' }}
            >
              Save Preferences
            </button>
          </div>
        </div>
      )}

      {/* ─── MODAL: ABOUT ───────────────────────────────────────────────────── */}
      {activeModal === 'about' && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div
            className="modal-content animate-scale-in"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '460px', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}
          >
            <div className="modal-handle" />
            <div className="text-center mb-3">
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '16px',
                  overflow: 'hidden',
                  margin: '0 auto var(--space-2)',
                  border: '1px solid rgba(212, 175, 55, 0.35)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4), 0 0 12px rgba(212, 175, 55, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <img
                  src={appLogo}
                  alt="Invitation Hub"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>About Invitation Hub</h3>
            </div>

            <div
              className="flex flex-col gap-2.5 text-xs text-secondary mb-4"
              style={{ overflowY: 'auto', paddingRight: '4px', flex: 1 }}
            >
              <p style={{ fontSize: '13px', lineHeight: 1.5, color: 'var(--color-text-secondary)', margin: '0 0 4px 0', textAlign: 'center' }}>
                Invitation Hub is a smart and convenient invitation management application designed to help you organize, track, and manage your invitations and events in one place.
              </p>

              <div className="glass-card p-3">
                <div className="font-semibold text-sm mb-1" style={{ color: 'var(--color-text-primary)' }}>
                  Smart Invitation Management
                </div>
                <div style={{ lineHeight: 1.45 }}>
                  Save invitation details, upload or capture invitation card photos, and keep important event information such as event name, date, time, venue, relationship, and other details organized and easily accessible.
                </div>
              </div>

              <div className="glass-card p-3">
                <div className="font-semibold text-sm mb-1" style={{ color: 'var(--color-text-primary)' }}>
                  Invitation Scanning
                </div>
                <div style={{ lineHeight: 1.45 }}>
                  Invitation Hub supports smart invitation scanning to help extract important information from invitation cards and organize it into the appropriate event details.
                </div>
              </div>

              <div className="glass-card p-3">
                <div className="font-semibold text-sm mb-1" style={{ color: 'var(--color-text-primary)' }}>
                  Never Miss an Important Event
                </div>
                <div style={{ lineHeight: 1.45 }}>
                  Keep track of upcoming invitations with reminders and organized event information. Invitations can also be prioritized when multiple events occur on the same day.
                </div>
              </div>

              <div className="glass-card p-3">
                <div className="font-semibold text-sm mb-1" style={{ color: 'var(--color-text-primary)' }}>
                  Past Events &amp; Gifts
                </div>
                <div style={{ lineHeight: 1.45 }}>
                  Keep track of past family functions and associated gifts, making it easier to remember important occasions and relationships.
                </div>
              </div>

              <div className="glass-card p-3">
                <div className="font-semibold text-sm mb-1" style={{ color: 'var(--color-text-primary)' }}>
                  Delegated Access
                </div>
                <div style={{ lineHeight: 1.45 }}>
                  VIP account owners can provide controlled access to trusted users such as personal assistants or other authorized users. The account owner remains in control of the shared access.
                </div>
              </div>

              <div className="glass-card p-3">
                <div className="font-semibold text-sm mb-1" style={{ color: 'var(--color-text-primary)' }}>
                  Everything in One Place
                </div>
                <div style={{ lineHeight: 1.45 }}>
                  From receiving an invitation to attending an event and remembering past occasions, Invitation Hub brings important invitation and event information together in one organized place.
                </div>
              </div>

              <div
                className="text-center font-semibold pt-2 pb-1"
                style={{ fontSize: '12.5px', color: 'var(--color-gold)', letterSpacing: '0.01em', lineHeight: 1.4 }}
              >
                Invitation Hub — Your Invitations. Your Events. One Smart Place.
              </div>
            </div>

            <button
              className="btn btn-gold w-full"
              onClick={() => setActiveModal(null)}
              style={{ height: '46px', fontWeight: 600, flexShrink: 0 }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* ─── MODAL: CLEAR DATA CONFIRMATION ──────────────────────────────────── */}
      {activeModal === 'clear' && (
        <div className="modal-overlay modal-centered" onClick={() => setActiveModal(null)}>
          <div className="modal-dialog animate-scale-in text-center" onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.15)',
                color: 'var(--color-danger)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto var(--space-3)',
              }}
            >
              <Trash2 size={26} />
            </div>
            <h3 style={{ marginBottom: 'var(--space-2)' }}>Clear All Data?</h3>
            <p className="text-xs text-secondary mb-5">
              This will permanently delete all your invitations, contacts, events, and gift records. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button className="btn btn-ghost flex-1" onClick={() => setActiveModal(null)}>
                Cancel
              </button>
              <button className="btn btn-danger flex-1" onClick={handleClearData}>
                Clear Data
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: EXPORT FORMAT SELECTION ─────────────────────────────────── */}
      {activeModal === 'export-confirm' && (
        <div className="modal-overlay modal-centered" onClick={() => !isExporting && setActiveModal(null)}>
          <div className="modal-dialog animate-scale-in text-center" onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '50%',
                background: 'rgba(212, 175, 55, 0.12)',
                color: 'var(--color-gold)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto var(--space-3)',
              }}
            >
              <FileSpreadsheet size={26} />
            </div>
            <h3 style={{ marginBottom: 'var(--space-1)', fontSize: '1.2rem', fontWeight: 600 }}>Export Data</h3>
            <p className="text-xs text-secondary mb-5" style={{ lineHeight: 1.5 }}>
              Choose a format to download your data
            </p>

            <div className="flex flex-col gap-2.5 mb-3">
              <button
                type="button"
                className="btn btn-gold w-full flex items-center justify-center gap-2.5"
                onClick={() => handleConfirmExportDownload('excel')}
                disabled={isExporting}
                style={{ height: '46px', fontWeight: 600, fontSize: '14px' }}
              >
                <FileSpreadsheet size={18} />
                {isExporting && exportFormat === 'excel' ? 'Exporting Excel...' : 'Excel (.xlsx)'}
              </button>

              <button
                type="button"
                className="btn btn-outline w-full flex items-center justify-center gap-2.5"
                onClick={() => handleConfirmExportDownload('pdf')}
                disabled={isExporting}
                style={{
                  height: '46px',
                  fontWeight: 600,
                  fontSize: '14px',
                  border: '1px solid var(--glass-border)',
                  background: 'var(--glass-bg)',
                  color: 'var(--color-text-primary)',
                }}
              >
                <FileText size={18} style={{ color: '#ff453a' }} />
                {isExporting && exportFormat === 'pdf' ? 'Exporting PDF...' : 'PDF (.pdf)'}
              </button>
            </div>

            <button
              type="button"
              className="btn btn-ghost w-full"
              onClick={() => setActiveModal(null)}
              disabled={isExporting}
              style={{ height: '40px', fontWeight: 500 }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ─── MODAL: NO UPCOMING EVENTS TO EXPORT ─────────────────────────────── */}
      {activeModal === 'export-empty' && (
        <div className="modal-overlay modal-centered" onClick={() => setActiveModal(null)}>
          <div className="modal-dialog animate-scale-in text-center" onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '50%',
                background: 'rgba(245, 158, 11, 0.15)',
                color: '#f59e0b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto var(--space-3)',
              }}
            >
              <AlertCircle size={26} />
            </div>
            <h3 style={{ marginBottom: 'var(--space-2)', fontSize: '1.15rem', fontWeight: 600 }}>No Upcoming Events</h3>
            <p className="text-xs text-secondary mb-5" style={{ lineHeight: 1.5 }}>
              No upcoming events available to export.
            </p>
            <button
              className="btn btn-gold w-full"
              onClick={() => setActiveModal(null)}
              style={{ height: '44px', fontWeight: 600 }}
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* ─── MODAL: PRIVILEGED ACCESS INFO ──────────────────────────────────── */}
      {activeModal === 'privileged-info' && (
        <div className="modal-overlay modal-centered" onClick={() => setActiveModal(null)}>
          <div className="modal-dialog animate-scale-in text-center" onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '50%',
                background: 'rgba(96, 165, 250, 0.15)',
                color: 'var(--color-info)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto var(--space-3)',
              }}
            >
              <Shield size={26} />
            </div>
            <h3 style={{ marginBottom: 'var(--space-1)' }}>User Account</h3>
            <p className="text-xs text-secondary mb-4">
              You are a user.
            </p>

            <div className="glass-card text-left p-3 mb-4" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <div className="text-xs text-muted mb-1">Your Role</div>
              <div className="font-semibold text-sm mb-3 text-primary">
                {currentPrivilegedUser?.role || 'User'}
              </div>
              <div className="text-xs text-muted mb-2">Active Permissions</div>
              <div className="flex flex-wrap gap-1">
                {currentPrivilegedUser?.permissions &&
                  Object.entries(currentPrivilegedUser.permissions)
                    .filter(([key, v]) => key.startsWith('can') && v === true)
                    .map(([key]) => (
                      <span key={key} className="badge badge-info" style={{ fontSize: '9px' }}>
                        {key.replace('can', '').replace(/([A-Z])/g, ' $1').trim()}
                      </span>
                    ))}
              </div>
            </div>

            <button className="btn btn-gold w-full" onClick={() => setActiveModal(null)}>
              Understood
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
