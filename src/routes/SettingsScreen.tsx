import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import {
  User,
  Lock,
  Bell,
  Palette,
  Database,
  FileSpreadsheet,
  Info,
  LogOut,
  ChevronRight,
  Shield,
  Trash2,
  Check,
  Moon,
  Sun,
  Sparkles,
  ShieldAlert,
  Phone,
  Globe,
  History,
} from 'lucide-react';
import { getInitials } from '../utils/formatters';
import { exportToExcel } from '../services/exportService';
import { useTranslation } from '../i18n/useTranslation';
import { permissionService } from '../services/permissionService';
import { mobileNotificationService } from '../services/mobileNotificationService';

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
    schedule,
    familyEvents,
  } = useAppStore();

  const activeUser = isVIP ? currentUser : currentPrivilegedUser;
  const activeUserName = activeUser?.name || (isVIP ? 'VIP Principal' : 'Privileged User');
  const activeUsername = activeUser?.username || (isVIP ? 'vip' : 'staff');
  const activeUserRole = isVIP ? 'VIP Master Account' : (currentPrivilegedUser?.role || 'Privileged User');

  const { t, language, setLanguage, currentLanguageOption, supportedLanguages } = useTranslation();

  // Modals state
  const [activeModal, setActiveModal] = useState<
    'theme' | 'language' | 'profile' | 'password' | 'notifications' | 'about' | 'clear' | 'privileged-info' | null
  >(null);

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

  // Notification Preferences State
  const [notifConflictAlerts, setNotifConflictAlerts] = useState(true);
  const [notifNewInvitations, setNotifNewInvitations] = useState(true);
  const [notifScheduleChanges, setNotifScheduleChanges] = useState(true);
  const [notifReminders, setNotifReminders] = useState(true);
  const [permissionStatus, setPermissionStatus] = useState<'granted' | 'denied' | 'prompt'>('prompt');
  const [testNotificationStatus, setTestNotificationStatus] = useState<string | null>(null);

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

  const handleSendTestNotification = async () => {
    try {
      setTestNotificationStatus('Dispatching...');
      const check = await mobileNotificationService.checkPermission();
      if (!check.granted) {
        const req = await mobileNotificationService.requestPermission(true);
        if (!req.granted) {
          setTestNotificationStatus('Permission required');
          setTimeout(() => setTestNotificationStatus(null), 3500);
          return;
        }
        setPermissionStatus('granted');
      }

      const ok = await mobileNotificationService.sendTestNotification();
      if (ok) {
        setTestNotificationStatus('Alert delivered to device!');
      } else {
        setTestNotificationStatus('Delivered to notification shade.');
      }
      setTimeout(() => setTestNotificationStatus(null), 3500);
    } catch (err: any) {
      setTestNotificationStatus('Failed to send test alert');
      setTimeout(() => setTestNotificationStatus(null), 3500);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const handleExportExcel = async () => {
    if (isExporting) return;
    try {
      setIsExporting(true);
      setExportStatus(null);
      const res = await exportToExcel({
        invitations,
        people,
        schedule,
        familyEvents,
        privilegedUsers,
        activeUser,
        isVIP,
      });
      setExportStatus(res.summary);
      setTimeout(() => setExportStatus(null), 5000);
    } catch (err: any) {
      setExportStatus('Export failed: ' + (err?.message || 'Unknown error'));
      setTimeout(() => setExportStatus(null), 5000);
    } finally {
      setIsExporting(false);
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
      id: 'dark',
      name: 'Midnight Gold',
      desc: 'Dark navy glassmorphism with radiant gold',
      icon: <Moon size={20} className="text-gold" />,
      colors: ['#060a13', '#131b2e', '#d4a853'],
    },
    {
      id: 'light',
      name: 'Platinum Ivory',
      desc: 'Clean executive light mode with warm accents',
      icon: <Sun size={20} style={{ color: '#b3821a' }} />,
      colors: ['#f5f7fc', '#ffffff', '#b3821a'],
    },
    {
      id: 'onyx',
      name: 'Royal Onyx',
      desc: 'Pure pitch black OLED with high-contrast gold',
      icon: <Shield size={20} className="text-gold" />,
      colors: ['#000000', '#161616', '#e5b352'],
    },
    {
      id: 'sapphire',
      name: 'Royal Sapphire',
      desc: 'Deep imperial blue glass with champagne gold',
      icon: <Sparkles size={20} style={{ color: '#60a5fa' }} />,
      colors: ['#040916', '#101e40', '#d8ad56'],
    },
  ];

  const getThemeLabel = (t: string) => {
    switch (t) {
      case 'light': return 'Platinum Ivory (Light)';
      case 'onyx': return 'Royal Onyx (Pure Black)';
      case 'sapphire': return 'Royal Sapphire (Deep Blue)';
      default: return 'Midnight Gold (Dark)';
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
                icon: <Shield size={18} />,
                label: 'Privileged Users',
                desc: `${privilegedUsers.length}/5 staff members`,
                onClick: () => navigate('/privileged-users'),
                badge: true,
                isInfoOnly: false,
              },
            ]
          : [
              {
                icon: <Shield size={18} style={{ color: 'var(--color-info)' }} />,
                label: 'Privileged Access',
                desc: 'You are a privileged person only',
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
          desc: `${currentLanguageOption.nativeName}${
            currentLanguageOption.name !== currentLanguageOption.nativeName
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
          desc: 'Audit trail of changes & actions',
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
          onClick: handleExportExcel,
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
      <div className="screen-stationary-header">
        {/* ── Apple Large Title Header ───────────────────────────────────────── */}
        <div style={{ marginBottom: 0 }}>
          <h1
            className="font-heading font-bold text-white tracking-tight"
            style={{ fontSize: '32px', letterSpacing: '-0.03em', lineHeight: 1.15 }}
          >
            {t('settings.title')}
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '3px' }}>
            {t('settings.accountSubtitle')}
          </p>
        </div>
      </div>

      {/* ── Scrollable Settings Body ────────────────────────────────────────── */}
      <div className="screen-scroll-body">
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
                {isVIP ? 'VIP Principal' : activeUserRole}
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
          <div className="modal-content animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="flex items-center gap-2 mb-2">
              <Palette size={20} className="text-gold" />
              <h3 style={{ margin: 0 }}>{t('settings.selectTheme')}</h3>
            </div>
            <p className="text-xs text-secondary mb-4">
              {t('settings.themeSubtitle')}
            </p>

            <div className="flex flex-col gap-3 mb-5">
              {themeOptions.map((t) => {
                const isSelected = (theme || 'dark') === t.id;
                return (
                  <div
                    key={t.id}
                    className={`glass-card flex items-center justify-between p-3 ${
                      isSelected ? 'glass-card-gold' : ''
                    }`}
                    style={{
                      cursor: 'pointer',
                      border: isSelected ? '1px solid var(--color-gold)' : '1px solid var(--glass-border)',
                      background: isSelected ? 'var(--color-gold-muted)' : undefined,
                    }}
                    onClick={() => {
                      setTheme(t.id as any);
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: 'var(--radius-md)',
                          background: t.colors[0],
                          border: `2px solid ${t.colors[2]}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {t.icon}
                      </div>
                      <div>
                        <div className="text-sm font-semibold flex items-center gap-2">
                          {t.name}
                          {t.id === 'light' && (
                            <span className="badge badge-info" style={{ fontSize: '0.6rem' }}>
                              Light Mode
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted">{t.desc}</div>
                      </div>
                    </div>

                    <div
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        border: isSelected ? '2px solid var(--color-gold)' : '2px solid var(--glass-border)',
                        background: isSelected ? 'var(--color-gold)' : 'transparent',
                        color: 'var(--color-text-inverse)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {isSelected && <Check size={14} />}
                    </div>
                  </div>
                );
              })}
            </div>

            <button className="btn btn-gold w-full" onClick={() => setActiveModal(null)}>
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
              <Globe size={20} className="text-apple-blue" />
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
                    className={`glass-card flex items-center justify-between p-3 ${
                      isSelected ? 'glass-card-blue' : ''
                    }`}
                    style={{
                      cursor: 'pointer',
                      border: isSelected ? '1px solid var(--color-accent)' : '1px solid var(--glass-border)',
                      background: isSelected ? 'rgba(10, 132, 255, 0.12)' : undefined,
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
                          background: 'rgba(255, 255, 255, 0.05)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '18px',
                          border: '1px solid var(--glass-border)',
                        }}
                      >
                        {langOpt.flag || '🌐'}
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
                  Full Name / Title
                </label>
                <input
                  className="input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  autoFocus
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
                  placeholder="e.g. +91 98765 43210"
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
          <div className="modal-content animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-2)' }}>
              <h3 style={{ margin: 0 }}>Notification Preferences</h3>
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
            <p className="text-xs text-secondary mb-4">Choose which alerts you receive on this device</p>

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

            <div className="flex flex-col gap-3 mb-5">
              <div className="glass-card flex items-center justify-between p-3">
                <div>
                  <div className="text-sm font-semibold">Schedule Conflict Warnings</div>
                  <div className="text-xs text-muted">Immediate alert when events overlap</div>
                </div>
                <input
                  type="checkbox"
                  checked={notifConflictAlerts}
                  onChange={() => handleToggleNotification(setNotifConflictAlerts, notifConflictAlerts)}
                  style={{ width: '18px', height: '18px', accentColor: 'var(--color-gold)' }}
                />
              </div>

              <div className="glass-card flex items-center justify-between p-3">
                <div>
                  <div className="text-sm font-semibold">New Invitation Alerts</div>
                  <div className="text-xs text-muted">Alerts when staff submits an invitation</div>
                </div>
                <input
                  type="checkbox"
                  checked={notifNewInvitations}
                  onChange={() => handleToggleNotification(setNotifNewInvitations, notifNewInvitations)}
                  style={{ width: '18px', height: '18px', accentColor: 'var(--color-gold)' }}
                />
              </div>

              <div className="glass-card flex items-center justify-between p-3">
                <div>
                  <div className="text-sm font-semibold">Event Reminders</div>
                  <div className="text-xs text-muted">48h & 24h reminders before confirmed events</div>
                </div>
                <input
                  type="checkbox"
                  checked={notifReminders}
                  onChange={() => handleToggleNotification(setNotifReminders, notifReminders)}
                  style={{ width: '18px', height: '18px', accentColor: 'var(--color-gold)' }}
                />
              </div>

              <div className="glass-card flex items-center justify-between p-3">
                <div>
                  <div className="text-sm font-semibold">Schedule Modifications</div>
                  <div className="text-xs text-muted">Changes made by privileged assistants</div>
                </div>
                <input
                  type="checkbox"
                  checked={notifScheduleChanges}
                  onChange={() => handleToggleNotification(setNotifScheduleChanges, notifScheduleChanges)}
                  style={{ width: '18px', height: '18px', accentColor: 'var(--color-gold)' }}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="btn btn-sm btn-ghost w-full"
                style={{ fontSize: '12px', border: '1px solid var(--color-border)' }}
                onClick={handleSendTestNotification}
              >
                {testNotificationStatus || 'Send Test Mobile Alert'}
              </button>

              <button className="btn btn-gold w-full" onClick={() => setActiveModal(null)}>
                Save Preferences
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: ABOUT ───────────────────────────────────────────────────── */}
      {activeModal === 'about' && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="modal-content animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="text-center mb-4">
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '16px',
                  background: 'linear-gradient(135deg, var(--color-gold-light), var(--color-gold))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto var(--space-3)',
                  color: 'var(--color-text-inverse)',
                }}
              >
                <Shield size={28} />
              </div>
              <h3 style={{ marginBottom: '2px' }}>VIP Intelligence</h3>
              <p className="text-xs text-gold">Executive Private Assistant v2.0</p>
            </div>

            <div className="flex flex-col gap-2 text-xs text-secondary mb-5">
              <div className="glass-card p-3">
                <strong>Protocol Intelligence:</strong> Prioritization matrix & family relationship memory ledger.
              </div>
              <div className="glass-card p-3">
                <strong>Security:</strong> Encrypted password isolation & delegated staff role-based permissions.
              </div>
            </div>

            <button className="btn btn-gold w-full" onClick={() => setActiveModal(null)}>
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
            <h3 style={{ marginBottom: 'var(--space-1)' }}>Privileged Account</h3>
            <p className="text-xs text-secondary mb-4">
              You are a privileged person only. Staff member delegation & access permissions are managed exclusively by the VIP Principal.
            </p>

            <div className="glass-card text-left p-3 mb-4" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <div className="text-xs text-muted mb-1">Your Delegated Role</div>
              <div className="font-semibold text-sm mb-3 text-primary">
                {currentPrivilegedUser?.role || 'Personal Assistant'}
              </div>
              <div className="text-xs text-muted mb-2">Active Permissions</div>
              <div className="flex flex-wrap gap-1">
                {currentPrivilegedUser?.permissions &&
                  Object.entries(currentPrivilegedUser.permissions)
                    .filter(([, v]) => v)
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
