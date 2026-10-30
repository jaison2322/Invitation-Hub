import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import {
  ArrowLeft, Calendar, Clock, MapPin, Sparkles, AlertTriangle,
  History, Gift, User, CheckCircle2, Trash2, ChevronRight,
  Edit3, X, FileText, Maximize2, Upload, Loader2, Camera, Plus,
  Minus, Bell, Check,
} from 'lucide-react';
import {
  formatFullDate, formatTime, formatDate, daysUntil,
  getInitials, formatCurrency, getRelationshipLabel, getGiftCategoryLabel,
  isInvitationPastByDate, getLocalTodayDateString,
} from '../utils/formatters';
import EventBadgeIcon from '../components/EventBadgeIcon';
import PriorityBadge from '../components/PriorityBadge';
import type { EventType, Priority, InvitationStatus } from '../types';
import { getRelationshipHistory, getGiftHistory, detectScheduleConflicts } from '../services/aiService';
import { storageService } from '../services/storageService';
import { permissionService } from '../services/permissionService';

export default function EventDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    invitations,
    people,
    familyEvents,
    schedule,
    giftRecords,
    updateInvitation,
    updateInvitationStatus,
    removeInvitation,
    isVIP,
    currentPrivilegedUser,
    activeVipId,
    addActivityLog,
    checkAndTriggerUpcomingReminders,
  } = useAppStore();

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const handleOpenRecordGift = (giftToEdit?: any) => {
    if (!invitation) return;
    const today = getLocalTodayDateString();
    navigate('/record-gift', {
      state: {
        giftRecord: giftToEdit,
        event: {
          id: invitation.id,
          title: invitation.title,
          date: invitation.date,
          hostName: invitation.hostName || invitation.mainPerson,
          venue: invitation.venue || invitation.location,
          eventType: invitation.eventType,
          isPast: isInvitationPastByDate(invitation, today),
        },
      },
    });
  };

  // Photo display & lightbox state
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [showImageModal, setShowImageModal] = useState(false);

  // Edit photo state
  const [editPhotoFile, setEditPhotoFile] = useState<File | null>(null);
  const [editPhotoPreview, setEditPhotoPreview] = useState<string | null>(null);
  const [isUpdatingPhoto, setIsUpdatingPhoto] = useState(false);
  const [showPhotoSourceModal, setShowPhotoSourceModal] = useState(false);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Edit state
  const [editTitle, setEditTitle] = useState('');
  const [editEventType, setEditEventType] = useState<EventType>('wedding');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editPriority, setEditPriority] = useState<Priority>('medium');
  const [editStatus, setEditStatus] = useState<InvitationStatus>('pending');
  const [editVenue, setEditVenue] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editHostName, setEditHostName] = useState('');
  const [editPersonId, setEditPersonId] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const canManage = isVIP || currentPrivilegedUser?.permissions?.canEditEvents !== false;
  const canConfirmIgnore = isVIP || currentPrivilegedUser?.permissions?.canConfirmIgnoreInvitations === true;

  const invitation = invitations.find((i) => i.id === id);
  if (!invitation) {
    return (
      <div className="screen-no-nav flex items-center justify-center">
        <div className="text-center">
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '15px' }}>Event record not found</p>
          <button className="btn btn-ghost mt-4" onClick={() => navigate(-1)}>Go Back</button>
        </div>
      </div>
    );
  }

  const person = invitation.personId ? people.find((p) => p.id === invitation.personId) : null;
  const relHistory = person ? getRelationshipHistory(person.id, familyEvents) : [];
  const giftHist = person ? getGiftHistory(person.id, familyEvents) : [];
  const eventGiftsGiven = giftRecords.filter(
    (g) => g.eventId === invitation.id && g.direction === 'given'
  );
  const conflicts = detectScheduleConflicts(invitation.date, invitation.time, schedule, invitations.filter((i) => i.id !== invitation.id));

  // ── Active reminder days for this event (custom or from global preferences) ──
  const defaultGlobalReminderDays: number[] = (() => {
    try {
      const saved = localStorage.getItem('inv_notif_prefs');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.reminderDays) && parsed.reminderDays.length > 0) {
          return [...new Set<number>(parsed.reminderDays.map((x: any) => Number(x)))].sort((a: number, b: number) => a - b);
        }
      }
    } catch {}
    return [0, 1, 2, 7];
  })();

  const activeEventReminderDays: number[] = Array.isArray(invitation.reminderDays) && invitation.reminderDays.length > 0
    ? invitation.reminderDays
    : defaultGlobalReminderDays;

  const [eventCustomDayInput, setEventCustomDayInput] = useState<number>(3);
  const [reminderToast, setReminderToast] = useState<string | null>(null);

  const PRESET_EVENT_REMINDERS = [
    { days: 0, label: 'Same Day', desc: 'Day of event' },
    { days: 1, label: '1 Day Before', desc: '24h advance' },
    { days: 2, label: '2 Days Before', desc: '48h advance' },
    { days: 3, label: '3 Days Before', desc: '72h advance' },
    { days: 7, label: '1 Week Before', desc: '7 days advance' },
    { days: 14, label: '2 Weeks Before', desc: '14 days advance' },
  ];

  const [editReminderDays, setEditReminderDays] = useState<number[]>([0, 1, 2, 7]);
  const [editCustomDaysValue, setEditCustomDaysValue] = useState<number>(3);

  const toggleEditReminderDay = (day: number) => {
    setEditReminderDays((prev) => {
      const exists = prev.includes(day);
      const next = exists ? prev.filter((d) => d !== day) : [...prev, day];
      return next.sort((a, b) => a - b);
    });
  };

  const handleAddEditCustomDay = () => {
    const day = Math.max(0, Math.min(60, editCustomDaysValue));
    if (!editReminderDays.includes(day)) {
      setEditReminderDays((prev) => [...prev, day].sort((a, b) => a - b));
    }
  };

  const handleToggleEventReminderDay = (day: number) => {
    const current = Array.isArray(invitation.reminderDays) && invitation.reminderDays.length > 0
      ? [...invitation.reminderDays]
      : [...defaultGlobalReminderDays];
    const exists = current.includes(day);
    const updated = exists ? current.filter((d) => d !== day) : [...current, day].sort((a, b) => a - b);

    updateInvitation(invitation.id, { reminderDays: updated });
    setReminderToast(exists ? `Removed ${day}d reminder` : `Alert scheduled for ${day === 0 ? 'event day' : `${day} days before`}`);
    setTimeout(() => setReminderToast(null), 3000);
    checkAndTriggerUpcomingReminders();
  };

  const handleAddEventCustomDay = () => {
    const valid = Math.max(0, Math.min(60, eventCustomDayInput));
    const current = Array.isArray(invitation.reminderDays) && invitation.reminderDays.length > 0
      ? [...invitation.reminderDays]
      : [...defaultGlobalReminderDays];
    if (!current.includes(valid)) {
      const updated = [...current, valid].sort((a, b) => a - b);
      updateInvitation(invitation.id, { reminderDays: updated });
      setReminderToast(`Alert scheduled for ${valid === 0 ? 'event day' : `${valid} days before`}`);
      setTimeout(() => setReminderToast(null), 3000);
      checkAndTriggerUpcomingReminders();
    }
  };

  // Resolve photo URL from storage or direct URL
  useEffect(() => {
    let isMounted = true;
    if (invitation?.imageUrl) {
      setPhotoUrl(invitation.imageUrl);
    } else if (invitation?.imageId) {
      storageService.getInvitationImageUrl(invitation.imageId).then((url) => {
        if (isMounted && url) {
          setPhotoUrl(url);
        }
      });
    } else {
      setPhotoUrl(null);
    }
    return () => {
      isMounted = false;
    };
  }, [invitation?.imageId, invitation?.imageUrl]);

  const handleOpenEditModal = () => {
    if (!invitation) return;
    setEditTitle(invitation.nickname || invitation.title || '');
    setEditEventType(invitation.eventType || 'wedding');
    setEditDate(invitation.date || '');
    setEditTime(invitation.time || '');
    setEditPriority(invitation.priority || 'medium');
    setEditStatus(invitation.status || 'pending');
    setEditVenue(invitation.venue || '');
    setEditLocation(invitation.location || '');
    setEditHostName(invitation.hostName || '');
    setEditPersonId(invitation.personId || '');
    setEditDescription(invitation.description || '');
    setEditPhotoPreview(photoUrl);
    setEditPhotoFile(null);
    setEditReminderDays(
      Array.isArray(invitation.reminderDays) && invitation.reminderDays.length > 0
        ? [...invitation.reminderDays]
        : defaultGlobalReminderDays
    );
    setShowPhotoSourceModal(false);
    setShowEditModal(true);
  };

  const processSelectedImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rawDataUrl = ev.target?.result as string;
      if (!rawDataUrl) return;

      const img = new Image();
      img.onload = () => {
        const maxDim = 1600;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          canvas.toBlob(
            (blob) => {
              if (blob) {
                const optimizedFile = new File(
                  [blob],
                  file.name.replace(/\.[^/.]+$/, '') + '.jpg',
                  { type: 'image/jpeg', lastModified: Date.now() }
                );
                setEditPhotoFile(optimizedFile);
                setEditPhotoPreview(canvas.toDataURL('image/jpeg', 0.90));
              } else {
                setEditPhotoFile(file);
                setEditPhotoPreview(rawDataUrl);
              }
            },
            'image/jpeg',
            0.90
          );
        } else {
          setEditPhotoFile(file);
          setEditPhotoPreview(rawDataUrl);
        }
      };
      img.onerror = () => {
        setEditPhotoFile(file);
        setEditPhotoPreview(rawDataUrl);
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleOpenCamera = async () => {
    setShowPhotoSourceModal(false);
    try {
      const check = await permissionService.checkCamera();
      if (check.granted) {
        cameraInputRef.current?.click();
        return;
      }

      const res = await permissionService.requestCamera();
      if (res.granted) {
        cameraInputRef.current?.click();
      } else {
        if (!res.canAskAgain) {
          const open = window.confirm(
            'Camera permission is required to capture invitation cards. Would you like to open App Settings to grant Camera permission?'
          );
          if (open) {
            permissionService.openSettings();
          }
        } else {
          alert('Camera permission was not granted. You can still choose an existing photo from your gallery.');
        }
      }
    } catch (err) {
      console.warn('Camera permission check fallback:', err);
      cameraInputRef.current?.click();
    }
  };

  const handleOpenGallery = () => {
    setShowPhotoSourceModal(false);
    galleryInputRef.current?.click();
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTitle.trim() || !editDate) return;

    let finalImageId = invitation.imageId;
    let finalImageUrl = invitation.imageUrl;

    // Handle replacement photo upload if user selected a new file
    if (editPhotoFile) {
      setIsUpdatingPhoto(true);
      try {
        const targetVipId = activeVipId || invitation.vipId || 'vip_default';
        const uploadRes = await storageService.uploadInvitationImage(editPhotoFile, targetVipId, invitation.id);
        if (uploadRes) {
          // If replacing previous file in storage, clean up old file safely
          if (invitation.imageId && invitation.imageId !== uploadRes.path) {
            storageService.deleteInvitationImage(invitation.imageId, targetVipId).catch(console.warn);
          }
          finalImageId = uploadRes.path;
          finalImageUrl = uploadRes.signedUrl;
          setPhotoUrl(uploadRes.signedUrl || null);
        }
      } catch (err) {
        console.warn('[EventDetailScreen] Failed to upload replacement photo:', err);
      } finally {
        setIsUpdatingPhoto(false);
      }
    }

    updateInvitation(invitation.id, {
      title: editTitle.trim(),
      nickname: undefined,
      eventType: editEventType,
      date: editDate,
      time: editTime || undefined,
      priority: editPriority,
      status: canConfirmIgnore ? editStatus : invitation.status,
      venue: editVenue.trim() || undefined,
      location: editLocation.trim() || undefined,
      hostName: editHostName.trim() || undefined,
      mainPerson: invitation.mainPerson,
      personId: editPersonId || undefined,
      description: editDescription.trim() || undefined,
      reminderDays: editReminderDays.length > 0 ? editReminderDays : undefined,
      imageId: finalImageId,
      imageUrl: finalImageUrl,
    });

    checkAndTriggerUpcomingReminders();

    addActivityLog({
      userId: isVIP ? 'vip' : currentPrivilegedUser?.id || 'staff',
      userName: isVIP ? 'VIP Principal' : currentPrivilegedUser?.name || 'Staff User',
      action: `Updated details for event "${editTitle.trim()}"`,
      entityType: 'invitation',
      entityId: invitation.id,
      entityName: editTitle.trim(),
    });

    setShowEditModal(false);
  };

  const handleDelete = () => {
    removeInvitation(invitation.id);
    addActivityLog({
      userId: isVIP ? 'vip' : currentPrivilegedUser?.id || 'staff',
      userName: isVIP ? 'VIP Principal' : currentPrivilegedUser?.name || 'Staff User',
      action: `deleted invitation "${invitation.nickname || invitation.title}"`,
      entityType: 'invitation',
      entityId: invitation.id,
      entityName: invitation.nickname || invitation.title,
    });
    navigate('/upcoming', { replace: true });
  };

  return (
    <div className="screen-no-nav">
      {/* ── Stationary Navigation Header ───────────────────────────────────── */}
      <div className="screen-stationary-header">
        <div className="top-bar">
          <button className="top-bar-back" onClick={() => navigate(-1)} aria-label="Go Back">
            <ArrowLeft size={16} strokeWidth={2} />
          </button>
          <span className="top-bar-title">Event Overview</span>
          {canManage ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="btn-icon"
                style={{ color: 'var(--color-accent)' }}
                onClick={handleOpenEditModal}
                title="Edit Event Details"
                aria-label="Edit Event"
              >
                <Edit3 size={16} strokeWidth={1.8} />
              </button>
              <button
                type="button"
                className="btn-icon"
                style={{ color: 'var(--color-danger)' }}
                onClick={() => setShowDeleteModal(true)}
                title="Delete Invitation"
                aria-label="Delete Event"
              >
                <Trash2 size={16} strokeWidth={1.8} />
              </button>
            </div>
          ) : (
            <div style={{ width: '36px' }} />
          )}
        </div>
      </div>

      {/* ── Scrollable Event Content ────────────────────────────────────────── */}
      <div className="screen-scroll-body" style={{ paddingBottom: invitation.status === 'pending' ? '100px' : '32px' }}>
        {/* ── Executive Protocol Dossier Pass ─────────────────────────────────── */}
        <div className="hero-event-card mb-4">
          <div className="flex items-start justify-between mb-3">
            <EventBadgeIcon type={invitation.eventType} size="hero" showGlow />
            <div className="flex items-center gap-2">
              <PriorityBadge priority={invitation.priority} />
              <span className={`badge badge-${invitation.status}`}>
                {invitation.status}
              </span>
              {canManage && (
                <button
                  type="button"
                  onClick={handleOpenEditModal}
                  className="badge cursor-pointer flex items-center gap-1"
                  style={{
                    background: 'rgba(212, 168, 83, 0.15)',
                    color: 'var(--color-accent)',
                    border: '1px solid rgba(212, 168, 83, 0.3)',
                    padding: '3px 8px',
                    fontSize: '11px',
                  }}
                >
                  <Edit3 size={11} strokeWidth={2} /> Edit
                </button>
              )}
            </div>
          </div>

          <h1
            className="font-heading font-semibold text-white tracking-tight"
            style={{ fontSize: '20px', letterSpacing: '-0.02em', marginBottom: '4px' }}
          >
            {invitation.nickname || invitation.title}
          </h1>
          {invitation.nickname && invitation.nickname !== invitation.title && (
            <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '12px' }}>
              {invitation.title}
            </p>
          )}

          <div style={{ height: '0.5px', background: 'var(--color-separator)', margin: '12px 0' }} />

          {/* Metadata Details */}
          <div className="flex flex-col gap-2.5" style={{ fontSize: '13px' }}>
            <div className="flex items-center gap-2.5 text-slate-200">
              <Calendar size={15} strokeWidth={1.8} style={{ color: 'var(--color-accent)' }} />
              <span>{formatFullDate(invitation.date)}</span>
            </div>
            {invitation.time && (
              <div className="flex items-center gap-2.5 text-slate-200">
                <Clock size={15} strokeWidth={1.8} style={{ color: 'var(--color-accent)' }} />
                <span>{formatTime(invitation.time)}</span>
              </div>
            )}
            {(invitation.venue || invitation.location) && (
              <div className="flex items-center gap-2.5 text-slate-200">
                <MapPin size={15} strokeWidth={1.8} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
                <span className="break-words">
                  {invitation.venue && invitation.location
                    ? `${invitation.venue}, ${invitation.location}`
                    : (invitation.venue || invitation.location)}
                </span>
              </div>
            )}
            {invitation.mainPerson && (
              <div className="flex items-center gap-2.5 text-slate-200">
                <User size={15} strokeWidth={1.8} style={{ color: 'var(--color-accent)' }} />
                <span>Hosted by {invitation.mainPerson}</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Original Invitation Photo Card ─────────────────────────────────── */}
        {photoUrl && (
          <div className="glass-card mb-4" style={{ padding: '16px', overflow: 'hidden' }}>
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <FileText size={15} style={{ color: 'var(--color-accent)' }} />
                <span className="text-xs font-semibold text-white tracking-wide uppercase">
                  Original Invitation Photo
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowImageModal(true)}
                className="text-xs flex items-center gap-1 cursor-pointer"
                style={{ color: 'var(--color-accent)', background: 'transparent', border: 'none', padding: 0 }}
                aria-label="View Full Invitation"
              >
                <Maximize2 size={13} /> View Full
              </button>
            </div>
            <div
              style={{
                position: 'relative',
                maxHeight: '220px',
                height: '220px',
                width: '100%',
                overflow: 'hidden',
                borderRadius: '12px',
                background: 'rgba(0, 0, 0, 0.5)',
                border: '1px solid var(--glass-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
              onClick={() => setShowImageModal(true)}
            >
              <img
                src={photoUrl}
                alt={invitation.title}
                style={{
                  width: '100%',
                  height: '100%',
                  maxHeight: '220px',
                  objectFit: 'contain',
                  display: 'block',
                  borderRadius: '12px',
                }}
                loading="lazy"
              />
              <div
                style={{
                  position: 'absolute',
                  bottom: '8px',
                  right: '8px',
                  background: 'rgba(0, 0, 0, 0.75)',
                  backdropFilter: 'blur(4px)',
                  borderRadius: '12px',
                  padding: '4px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '11px',
                  color: '#fff',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  pointerEvents: 'none',
                  zIndex: 2,
                }}
              >
                <Maximize2 size={12} style={{ color: 'var(--color-accent)' }} />
                <span>Tap to view full size</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Apple Intelligence Analysis ────────────────────────────────────── */}
        {invitation.aiReason && (
          <div className="apple-intelligence-card mb-4">
            <div className="flex items-start gap-2.5">
              <Sparkles size={16} strokeWidth={2} style={{ color: '#64d2ff', flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: '13px', lineHeight: '1.45', color: 'var(--color-text-secondary)' }}>
                <strong style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>Strategic Briefing: </strong>
                {invitation.aiReason}
              </div>
            </div>
          </div>
        )}

        {/* ── Schedule Conflicts ──────────────────────────────────────────────── */}
        {conflicts.length > 0 && (
          <div className="mb-4">
            {conflicts.map((c, i) => (
              <div key={i} className="conflict-card mb-2">
                <div className="conflict-icon">
                  <AlertTriangle size={14} strokeWidth={2} />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-danger)' }}>
                    {c.type === 'time_overlap' ? 'Time Overlap Conflict' : 'Same Day Event'}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                    {c.conflictingItemTitle} at {c.conflictingTime}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Host Profile Inset Link ────────────────────────────────────────── */}
        {person && (
          <div className="ios-grouped-list mb-4">
            <div
              className="ios-grouped-item"
              onClick={() => navigate(`/person/${person.id}`)}
            >
              <div className="avatar avatar-sm">
                {getInitials(person.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: '14px', fontWeight: 600 }}>{person.nickname}</div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                  {person.name} · {getRelationshipLabel(person.relationship)}
                </div>
              </div>
              <ChevronRight size={16} strokeWidth={2} style={{ color: 'var(--color-text-muted)' }} />
            </div>
          </div>
        )}

        {/* ── Relationship History ───────────────────────────────────────────── */}
        {relHistory.length > 0 && (
          <section className="mb-4">
            <div className="section-header">
              <span className="section-title">Protocol History</span>
            </div>

            <div className="ios-grouped-list">
              {relHistory.map((item, i) => (
                <div key={i} className="ios-grouped-item" style={{ cursor: 'default' }}>
                  <div className="ios-icon-squircle" style={{ background: 'rgba(212, 175, 55, 0.18)', color: 'var(--color-gold)' }}>
                    <History size={16} strokeWidth={2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)' }}>
                      {item.role} — {item.eventName}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '1px' }}>
                      {formatDate(item.eventDate)}
                    </div>
                  </div>
                  <CheckCircle2 size={15} strokeWidth={2} style={{ color: 'var(--color-confirmed)', flexShrink: 0 }} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Gift History ───────────────────────────────────────────────────── */}
        {giftHist.length > 0 && (
          <section className="mb-4">
            <div className="section-header">
              <span className="section-title">Gift Registry Record</span>
            </div>

            <div className="ios-grouped-list">
              {giftHist.map((g, i) => (
                <div key={i} className="ios-grouped-item" style={{ cursor: 'default' }}>
                  <div className="ios-icon-squircle" style={{ background: 'rgba(255, 159, 10, 0.15)', color: '#ff9f0a' }}>
                    <Gift size={16} strokeWidth={2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: '13px', fontWeight: 500 }}>{g.gift}</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '1px' }}>
                      {g.eventName}
                    </div>
                  </div>
                  {g.estimatedValue && (
                    <span className="badge badge-gold" style={{ flexShrink: 0 }}>
                      {formatCurrency(g.estimatedValue)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Gifts Given for this Event ──────────────────────────────────────── */}
        <section className="mb-4">
          <div className="section-header flex items-center justify-between">
            <span className="section-title">Gifts Given for this Event</span>
            {canManage && (
              <button
                type="button"
                className="btn btn-xs btn-gold flex items-center gap-1 shadow-sm"
                onClick={() => handleOpenRecordGift()}
              >
                <Plus size={12} strokeWidth={2.4} />
                <span>Record Gift</span>
              </button>
            )}
          </div>

          {eventGiftsGiven.length > 0 ? (
            <div className="ios-grouped-list">
              {eventGiftsGiven.map((g) => (
                <div
                  key={g.id}
                  className="ios-grouped-item cursor-pointer hover:bg-white/5 transition-all"
                  onClick={() => handleOpenRecordGift(g)}
                  title="Click to edit gift details"
                >
                  <div
                    className="ios-icon-squircle"
                    style={{ background: 'rgba(255, 159, 10, 0.15)', color: '#ff9f0a' }}
                  >
                    <Gift size={16} strokeWidth={2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      {g.giftName}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '1px' }}>
                      {g.recipientName ? `Given to ${g.recipientName}` : getGiftCategoryLabel(g.giftCategory)}
                    </div>
                    {g.notes && (
                      <div
                        style={{
                          fontSize: '11px',
                          color: 'var(--color-text-muted)',
                          marginTop: '2px',
                          fontStyle: 'italic',
                        }}
                      >
                        "{g.notes}"
                      </div>
                    )}
                  </div>
                  {g.estimatedValue !== undefined && g.estimatedValue > 0 && (
                    <span className="badge badge-gold" style={{ flexShrink: 0 }}>
                      {formatCurrency(g.estimatedValue)}
                    </span>
                  )}
                  <ChevronRight size={14} className="text-muted flex-shrink-0 ml-1" />
                </div>
              ))}
            </div>
          ) : (
            <div
              className="p-3.5 rounded-lg border border-glass-border text-center"
              style={{ background: 'rgba(255, 255, 255, 0.02)' }}
            >
              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                No gifts recorded as given for this function yet.
              </div>
              {canManage && (
                <button
                  type="button"
                  className="btn btn-xs btn-gold mt-2 inline-flex items-center gap-1"
                  onClick={() => handleOpenRecordGift()}
                >
                  <Plus size={12} strokeWidth={2.4} />
                  <span>Record Gift Given</span>
                </button>
              )}
            </div>
          )}
        </section>

        {/* ── Protocol Reminders & Alert Schedule ────────────────────────────── */}
        <section className="mb-4">
          <div className="section-header flex items-center justify-between">
            <span className="section-title">Reminder Schedule</span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--color-accent)',
                background: 'rgba(212, 175, 55, 0.12)',
                padding: '2px 8px',
                borderRadius: '12px',
                border: '1px solid rgba(212, 175, 55, 0.25)',
              }}
            >
              {daysUntil(invitation.date) < 0
                ? 'Past Event'
                : daysUntil(invitation.date) === 0
                  ? 'Event is Today'
                  : daysUntil(invitation.date) === 1
                    ? 'Event is Tomorrow'
                    : `In ${daysUntil(invitation.date)} Days`}
            </span>
          </div>

          <div className="glass-card" style={{ padding: '16px' }}>
            <div className="flex items-center gap-2 mb-1.5">
              <Bell size={15} style={{ color: 'var(--color-accent)' }} />
              <span className="text-xs font-semibold text-white tracking-wide uppercase">
                Alert Timing Before Event
              </span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '12px' }}>
              Set how many days before this event you want to receive reminder notifications.
            </p>

            {reminderToast && (
              <div
                className="mb-3 p-2 rounded-lg text-center text-xs font-medium"
                style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.3)' }}
              >
                {reminderToast}
              </div>
            )}

            {/* Structured 2-Column Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
              {PRESET_EVENT_REMINDERS.map((p) => {
                const active = activeEventReminderDays.includes(p.days);
                return (
                  <button
                    key={p.days}
                    type="button"
                    onClick={() => handleToggleEventReminderDay(p.days)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 10px',
                      borderRadius: '10px',
                      border: active ? '1.5px solid var(--color-gold)' : '1px solid var(--glass-border)',
                      background: active ? 'rgba(212, 175, 55, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div
                      style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        background: active ? 'var(--color-gold)' : 'transparent',
                        border: active ? 'none' : '1.5px solid var(--color-text-muted)',
                        color: active ? '#000000' : 'transparent',
                      }}
                    >
                      {active && <Check size={11} strokeWidth={3} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: '12.5px',
                          fontWeight: active ? 600 : 500,
                          color: active ? 'var(--color-gold)' : 'var(--color-text-primary)',
                          lineHeight: 1.2,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {p.label}
                      </div>
                      <div
                        style={{
                          fontSize: '10px',
                          color: 'var(--color-text-muted)',
                          marginTop: '2px',
                          lineHeight: 1.1,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {p.desc}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Stepper for custom days before */}
            <div
              style={{
                padding: '8px 10px',
                borderRadius: '10px',
                background: 'rgba(212, 175, 55, 0.04)',
                border: '1px solid var(--glass-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                marginBottom: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                  Custom:
                </span>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    background: 'var(--color-bg-primary)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '7px',
                    overflow: 'hidden',
                  }}
                >
                  <button
                    type="button"
                    style={{
                      width: '28px',
                      height: '28px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--color-gold)',
                      cursor: 'pointer',
                    }}
                    onClick={() => setEventCustomDayInput((prev) => Math.max(0, prev - 1))}
                    aria-label="Decrease days"
                  >
                    <Minus size={12} strokeWidth={2.5} />
                  </button>
                  <div
                    style={{
                      width: '32px',
                      textAlign: 'center',
                      fontWeight: 700,
                      fontSize: '12px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--color-text-primary)',
                    }}
                  >
                    {eventCustomDayInput}d
                  </div>
                  <button
                    type="button"
                    style={{
                      width: '28px',
                      height: '28px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--color-gold)',
                      cursor: 'pointer',
                    }}
                    onClick={() => setEventCustomDayInput((prev) => Math.min(60, prev + 1))}
                    aria-label="Increase days"
                  >
                    <Plus size={12} strokeWidth={2.5} />
                  </button>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                  {eventCustomDayInput === 0
                    ? 'Day-of'
                    : eventCustomDayInput === 1
                      ? '1 day prior'
                      : `${eventCustomDayInput}d prior`}
                </span>
              </div>

              <button
                type="button"
                className="btn btn-xs btn-gold"
                style={{
                  padding: '6px 12px',
                  fontSize: '11px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  borderRadius: '7px',
                }}
                onClick={handleAddEventCustomDay}
                disabled={activeEventReminderDays.includes(eventCustomDayInput)}
              >
                {activeEventReminderDays.includes(eventCustomDayInput) ? '✓ Scheduled' : '+ Add Alert'}
              </button>
            </div>

            {/* Active scheduled alert times */}
            <div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '6px' }}>
                Scheduled Reminders ({activeEventReminderDays.length})
              </div>
              {activeEventReminderDays.length === 0 ? (
                <div
                  className="p-2.5 text-center rounded-lg text-xs"
                  style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.08)' }}
                >
                  No reminders scheduled for this event. Tap a preset day above.
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {activeEventReminderDays.map((d) => {
                    const label =
                      d === 0
                        ? 'Day of Event (Today)'
                        : d === 1
                          ? '1 Day Before Event'
                          : d === 7
                            ? '7 Days Before (1 Week)'
                            : `${d} Days Before Event`;
                    return (
                      <div
                        key={d}
                        className="flex items-center justify-between p-2 rounded-lg"
                        style={{
                          background: 'rgba(212, 175, 55, 0.07)',
                          border: '1px solid rgba(212, 175, 55, 0.2)',
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <Bell size={12} style={{ color: 'var(--color-accent)' }} />
                          <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-primary)' }}>{label}</span>
                        </div>
                        <button
                          type="button"
                          className="btn-icon"
                          style={{ width: '22px', height: '22px', color: 'var(--color-text-muted)' }}
                          onClick={() => handleToggleEventReminderDay(d)}
                          title="Remove alert"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* ── Decision Bar for Pending Events ────────────────────────────────── */}
      {invitation.status === 'pending' && (
        canConfirmIgnore ? (
          <div className="decision-bar">
            <button
              type="button"
              className="btn btn-confirm flex-1 font-heading"
              onClick={() => {
                updateInvitationStatus(invitation.id, 'confirmed');
                navigate(-1);
              }}
            >
              Confirm Attendance
            </button>
            <button
              type="button"
              className="btn btn-ignore flex-1 font-heading"
              onClick={() => {
                updateInvitationStatus(invitation.id, 'ignored');
                navigate(-1);
              }}
            >
              Ignored
            </button>
          </div>
        ) : (
          <div className="decision-bar" style={{ justifyContent: 'center' }}>
            <div
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '10px',
                background: 'rgba(255, 179, 64, 0.08)',
                border: '1px solid rgba(255, 179, 64, 0.2)',
                textAlign: 'center',
                fontSize: '12.5px',
                color: '#ffb340',
                fontWeight: 500,
              }}
            >
              Pending VIP Principal RSVP Decision
            </div>
          </div>
        )
      )}

      {/* ── Edit Event Details Modal ─────────────────────────────────────── */}
      {showEditModal && (
        <div className="modal-overlay modal-centered" onClick={() => setShowEditModal(false)}>
          <div
            className="modal-dialog animate-scale-in"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxHeight: '88vh',
              overflowY: 'auto',
              padding: '22px',
              textAlign: 'left',
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-heading font-semibold text-white" style={{ fontSize: '18px' }}>
                  Edit Event Details
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                  Update event timing, address, priority, or status.
                </p>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setShowEditModal(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="flex flex-col gap-3">
              {/* 1. Host Name */}
              <div>
                <label className="label">Host Name</label>
                <input
                  type="text"
                  className="input"
                  value={editHostName}
                  onChange={(e) => setEditHostName(e.target.value)}
                  placeholder="e.g. Rajesh Kumar"
                />
              </div>

              {/* 2. Event Category */}
              <div>
                <label className="label">Event Category</label>
                <select
                  className="select"
                  value={editEventType}
                  onChange={(e) => setEditEventType(e.target.value as EventType)}
                >
                  <option value="wedding">Wedding</option>
                  <option value="engagement">Engagement</option>
                  <option value="reception">Reception</option>
                  <option value="birthday">Birthday</option>
                  <option value="anniversary">Anniversary</option>
                  <option value="house_warming">House Warming</option>
                  <option value="baby_shower">Baby Shower</option>
                  <option value="business_event">Business Event</option>
                  <option value="cultural">Cultural</option>
                  <option value="religious">Religious</option>
                  <option value="graduation">Graduation</option>
                  <option value="retirement">Retirement</option>
                  <option value="funeral">Funeral</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* 3. Event Title */}
              <div>
                <label className="label">Event Title *</label>
                <input
                  type="text"
                  className="input"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="e.g. Wedding Reception"
                  required
                />
              </div>

              {/* 4. Date & Time */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="label">Date *</label>
                  <input
                    type="date"
                    className="input"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="label">Time</label>
                  <input
                    type="time"
                    className="input"
                    value={editTime}
                    onChange={(e) => setEditTime(e.target.value)}
                  />
                </div>
              </div>

              {/* 4. Priority Level */}
              <div>
                <label className="label">Priority Level</label>
                <div className="flex gap-2">
                  {(['high', 'medium', 'low'] as Priority[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`btn flex-1 text-xs capitalize ${editPriority === p ? 'btn-gold' : 'btn-outline'
                        }`}
                      style={{ padding: '8px 6px' }}
                      onClick={() => setEditPriority(p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* 5. Event Status (Authorized users can change status before or after confirm) */}
              {canConfirmIgnore && (
                <div>
                  <label className="label">Event Status</label>
                  <div className="flex gap-2">
                    {(['confirmed', 'pending', 'ignored'] as InvitationStatus[]).map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={`btn flex-1 text-xs capitalize ${editStatus === s
                          ? s === 'confirmed'
                            ? 'btn-confirm'
                            : s === 'ignored'
                              ? 'btn-ignore'
                              : 'btn-gold'
                          : 'btn-outline'
                          }`}
                        style={{ padding: '8px 6px' }}
                        onClick={() => setEditStatus(s)}
                      >
                        {s === 'ignored' ? 'Ignored' : s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 6. Venue Name */}
              <div>
                <label className="label">Venue Name</label>
                <input
                  type="text"
                  className="input"
                  value={editVenue}
                  onChange={(e) => setEditVenue(e.target.value)}
                  placeholder="e.g. Grand Palace Hall"
                />
              </div>

              {/* 7. City / Area */}
              <div>
                <label className="label">Location</label>
                <input
                  type="text"
                  className="input"
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  placeholder="e.g. Guindy, Chennai"
                />
              </div>

              {/* 8. Link Contact */}
              <div>
                <label className="label">Link Contact</label>
                <select
                  className="select"
                  value={editPersonId}
                  onChange={(e) => setEditPersonId(e.target.value)}
                >
                  <option value="">No Contact Linked</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nickname} ({p.name})
                    </option>
                  ))}
                </select>
              </div>

              {/* Reminder Schedule */}
              <div className="glass-card p-3.5" style={{ borderRadius: '14px' }}>
                <div className="flex items-center justify-between mb-1">
                  <label className="label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Bell size={14} style={{ color: 'var(--color-gold)' }} />
                    <span style={{ fontWeight: 600, fontSize: '13.5px' }}>Reminder Schedule</span>
                  </label>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '12px',
                      background: editReminderDays.length > 0 ? 'rgba(212, 175, 55, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                      color: editReminderDays.length > 0 ? 'var(--color-gold)' : '#ef4444',
                      border: editReminderDays.length > 0 ? '1px solid rgba(212, 175, 55, 0.3)' : '1px solid rgba(239, 68, 68, 0.2)',
                    }}
                  >
                    {editReminderDays.length} {editReminderDays.length === 1 ? 'alert set' : 'alerts set'}
                  </span>
                </div>
                <p className="text-secondary" style={{ fontSize: '11.5px', marginBottom: '12px' }}>
                  Choose advance notification milestones before the event date
                </p>

                {/* Structured 2-Column Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                  {PRESET_EVENT_REMINDERS.map((p) => {
                    const active = editReminderDays.includes(p.days);
                    return (
                      <button
                        key={p.days}
                        type="button"
                        onClick={() => toggleEditReminderDay(p.days)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '10px 10px',
                          borderRadius: '10px',
                          border: active ? '1.5px solid var(--color-gold)' : '1px solid var(--glass-border)',
                          background: active ? 'rgba(212, 175, 55, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div
                          style={{
                            width: '18px',
                            height: '18px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            background: active ? 'var(--color-gold)' : 'transparent',
                            border: active ? 'none' : '1.5px solid var(--color-text-muted)',
                            color: active ? '#000000' : 'transparent',
                          }}
                        >
                          {active && <Check size={11} strokeWidth={3} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: '12.5px',
                              fontWeight: active ? 600 : 500,
                              color: active ? 'var(--color-gold)' : 'var(--color-text-primary)',
                              lineHeight: 1.2,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {p.label}
                          </div>
                          <div
                            style={{
                              fontSize: '10px',
                              color: 'var(--color-text-muted)',
                              marginTop: '2px',
                              lineHeight: 1.1,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {p.desc}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Custom Days Stepper */}
                <div
                  style={{
                    padding: '8px 10px',
                    borderRadius: '10px',
                    background: 'rgba(212, 175, 55, 0.04)',
                    border: '1px solid var(--glass-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                      Custom:
                    </span>
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        background: 'var(--color-bg-primary)',
                        border: '1px solid var(--glass-border)',
                        borderRadius: '7px',
                        overflow: 'hidden',
                      }}
                    >
                      <button
                        type="button"
                        style={{
                          width: '28px',
                          height: '28px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: 'none',
                          background: 'transparent',
                          color: 'var(--color-gold)',
                          cursor: 'pointer',
                        }}
                        onClick={() => setEditCustomDaysValue((prev) => Math.max(0, prev - 1))}
                        aria-label="Decrease days"
                      >
                        <Minus size={12} strokeWidth={2.5} />
                      </button>
                      <div
                        style={{
                          width: '32px',
                          textAlign: 'center',
                          fontWeight: 700,
                          fontSize: '12px',
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--color-text-primary)',
                        }}
                      >
                        {editCustomDaysValue}d
                      </div>
                      <button
                        type="button"
                        style={{
                          width: '28px',
                          height: '28px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: 'none',
                          background: 'transparent',
                          color: 'var(--color-gold)',
                          cursor: 'pointer',
                        }}
                        onClick={() => setEditCustomDaysValue((prev) => Math.min(60, prev + 1))}
                        aria-label="Increase days"
                      >
                        <Plus size={12} strokeWidth={2.5} />
                      </button>
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                      {editCustomDaysValue === 0
                        ? 'Day-of'
                        : editCustomDaysValue === 1
                          ? '1 day prior'
                          : `${editCustomDaysValue}d prior`}
                    </span>
                  </div>

                  <button
                    type="button"
                    className="btn btn-xs btn-gold"
                    onClick={handleAddEditCustomDay}
                    disabled={editReminderDays.includes(editCustomDaysValue)}
                    style={{
                      padding: '6px 12px',
                      fontSize: '11px',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      borderRadius: '7px',
                    }}
                  >
                    {editReminderDays.includes(editCustomDaysValue) ? '✓ Added' : '+ Add Alert'}
                  </button>
                </div>

                {/* Active Schedule Badges */}
                {editReminderDays.length > 0 ? (
                  <div style={{ marginTop: '10px' }}>
                    <div style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '5px' }}>
                      Active Schedule:
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {editReminderDays.map((d) => (
                        <span
                          key={d}
                          className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs"
                          style={{
                            background: 'rgba(212, 175, 55, 0.12)',
                            border: '1px solid rgba(212, 175, 55, 0.3)',
                            color: 'var(--color-gold)',
                            fontSize: '11px',
                            fontWeight: 500,
                          }}
                        >
                          <Bell size={10} />
                          {d === 0 ? 'Same Day' : d === 1 ? '1 Day Prior' : d === 7 ? '1 Week Prior' : d === 14 ? '2 Weeks Prior' : `${d}d Prior`}
                          <button
                            type="button"
                            onClick={() => toggleEditReminderDay(d)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--color-text-muted)',
                              cursor: 'pointer',
                              padding: '0 2px',
                              display: 'flex',
                              alignItems: 'center',
                            }}
                            title="Remove alert"
                          >
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      marginTop: '8px',
                      padding: '8px',
                      borderRadius: '8px',
                      background: 'rgba(239, 68, 68, 0.08)',
                      color: '#ef4444',
                      fontSize: '11px',
                      textAlign: 'center',
                    }}
                  >
                    No reminders scheduled. Tap any option above to set alert timings.
                  </div>
                )}
              </div>

              {/* 9. Notes / Description */}
              <div>
                <label className="label">Notes / Description</label>
                <textarea
                  className="input"
                  rows={2}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Add any specific instructions or details..."
                  style={{ resize: 'vertical' }}
                />
              </div>

              {/* Original Invitation Photo Section in Edit Modal */}
              <div>
                <label className="label">Original Invitation Photo</label>
                {/* Hidden gallery and camera inputs */}
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) processSelectedImage(file);
                    e.target.value = '';
                  }}
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) processSelectedImage(file);
                    e.target.value = '';
                  }}
                />

                {editPhotoPreview ? (
                  <div
                    className="flex items-center gap-3 p-2.5 rounded-lg"
                    style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
                  >
                    <img
                      src={editPhotoPreview}
                      alt="Invitation preview"
                      style={{
                        width: '56px',
                        height: '56px',
                        objectFit: 'cover',
                        borderRadius: '8px',
                        flexShrink: 0,
                        cursor: 'pointer',
                        border: '1px solid var(--glass-border)',
                        display: 'block',
                      }}
                      onClick={() => setShowImageModal(true)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white truncate font-medium">
                        {editPhotoFile ? editPhotoFile.name : 'Attached Invitation'}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {editPhotoFile
                          ? `${(editPhotoFile.size / 1024).toFixed(0)} KB (Will be uploaded on save)`
                          : 'Original photo on file'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPhotoSourceModal(true)}
                      className="btn btn-outline text-xs px-2.5 py-1.5"
                    >
                      Replace
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowPhotoSourceModal(true)}
                    className="btn btn-outline w-full flex items-center justify-center gap-2 py-2 text-xs"
                  >
                    <Upload size={14} /> Attach Invitation Photo
                  </button>
                )}
              </div>

              {/* Modal Actions */}
              <div className="flex gap-2 mt-3 pt-2" style={{ borderTop: '1px solid var(--glass-border)' }}>
                <button
                  type="button"
                  className="btn btn-ghost flex-1"
                  onClick={() => setShowEditModal(false)}
                  disabled={isUpdatingPhoto}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-gold flex-1 font-heading flex items-center justify-center gap-2"
                  disabled={isUpdatingPhoto}
                >
                  {isUpdatingPhoto ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Saving Photo...</span>
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ──────────────────────────────────────── */}
      {showDeleteModal && (
        <div className="modal-overlay modal-centered" onClick={() => setShowDeleteModal(false)}>
          <div className="modal-dialog text-center" onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                background: 'rgba(255, 69, 58, 0.15)',
                color: 'var(--color-danger)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 12px',
              }}
            >
              <Trash2 size={20} strokeWidth={1.8} />
            </div>
            <h3 className="font-heading font-semibold text-white mb-1" style={{ fontSize: '17px' }}>
              Delete Invitation?
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
              Are you sure you want to remove &ldquo;{invitation.nickname || invitation.title}&rdquo;? This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-ignore flex-1"
                onClick={() => setShowDeleteModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger flex-1"
                onClick={handleDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Fullscreen Invitation Lightbox Modal ────────────────────────────── */}
      {showImageModal && photoUrl && (
        <div
          className="modal-overlay modal-centered"
          style={{ zIndex: 9999, background: 'rgba(0, 0, 0, 0.88)', backdropFilter: 'blur(8px)' }}
          onClick={() => setShowImageModal(false)}
        >
          <div
            className="relative max-w-lg w-full max-h-[92vh] flex flex-col items-center justify-center p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowImageModal(false)}
              className="absolute top-4 right-4 z-10 p-2 rounded-full text-white bg-black/60 hover:bg-black/80 transition-colors"
              aria-label="Close image preview"
            >
              <X size={20} />
            </button>
            <img
              src={photoUrl}
              alt={invitation.title}
              style={{
                maxWidth: '100%',
                maxHeight: '78vh',
                objectFit: 'contain',
                borderRadius: '12px',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
                display: 'block',
              }}
            />
            <div className="mt-3 text-center">
              <p className="text-xs text-slate-200 font-medium">
                {invitation.nickname || invitation.title}
              </p>
              <p className="text-[11px] text-slate-400">
                Original Invitation Attachment
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Photo Source Selection Modal (Upload Photo vs Take Photo) ────────── */}
      {showPhotoSourceModal && (
        <div
          className="modal-overlay modal-centered"
          style={{ zIndex: 10000, background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(6px)' }}
          onClick={() => setShowPhotoSourceModal(false)}
        >
          <div
            className="modal-dialog"
            style={{ maxWidth: '340px', width: '90%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-heading font-semibold text-white" style={{ fontSize: '16px' }}>
                Select Invitation Photo
              </h3>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setShowPhotoSourceModal(false)}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
              Choose how you would like to add the invitation photo for this event:
            </p>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={handleOpenGallery}
                className="btn btn-outline w-full flex items-center justify-start gap-3 py-3 px-4 text-left cursor-pointer"
                style={{ borderColor: 'var(--glass-border)' }}
              >
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: 'rgba(212, 168, 83, 0.15)',
                    color: 'var(--color-accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Upload size={18} strokeWidth={2} />
                </div>
                <div>
                  <div className="text-white text-xs font-semibold">Upload Photo</div>
                  <div className="text-[11px] text-slate-400">Choose from device gallery or files</div>
                </div>
              </button>

              <button
                type="button"
                onClick={handleOpenCamera}
                className="btn btn-outline w-full flex items-center justify-start gap-3 py-3 px-4 text-left cursor-pointer"
                style={{ borderColor: 'var(--glass-border)' }}
              >
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: 'rgba(52, 199, 89, 0.15)',
                    color: '#34c759',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Camera size={18} strokeWidth={2} />
                </div>
                <div>
                  <div className="text-white text-xs font-semibold">Take Photo</div>
                  <div className="text-[11px] text-slate-400">Capture card with device camera</div>
                </div>
              </button>
            </div>

            <div className="mt-4 pt-2" style={{ borderTop: '1px solid var(--glass-border)' }}>
              <button
                type="button"
                className="btn btn-ghost w-full text-xs"
                onClick={() => setShowPhotoSourceModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
