import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  Building2,
  User,
  Tag,
  AlertTriangle,
  Check,
  Crown,
  Shield,
  FileText,
  UserPlus,
  X,
  Camera,
  Upload,
  Loader2,
  Maximize2,
} from 'lucide-react';
import type { EventType, Priority, InvitationStatus } from '../types';
import { getEventTypeLabel } from '../utils/formatters';
import { permissionService } from '../services/permissionService';
import { storageService } from '../services/storageService';
import { generateId } from '../utils/id';

export default function AddInvitationScreen() {
  const navigate = useNavigate();
  const {
    isVIP,
    currentPrivilegedUser,
    currentUser,
    activeVipId,
    addInvitation,
    addActivityLog,
    addNotification,
    people,
    addPerson,
    invitations,
    schedule,
  } = useAppStore();

  // Permission check for Privileged User
  const canAdd = isVIP || currentPrivilegedUser?.permissions?.canAddInvitations !== false;
  const canConfirmIgnore = isVIP || currentPrivilegedUser?.permissions?.canConfirmIgnoreInvitations === true;
  const canChangePriority = isVIP || currentPrivilegedUser?.permissions?.canChangePriority === true;

  // Form State
  const [title, setTitle] = useState('');
  const [eventType, setEventType] = useState<EventType>('wedding');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('18:00');
  const [venue, setVenue] = useState('');
  const [location, setLocation] = useState('');
  const [hostName, setHostName] = useState('');
  const [mainPerson, setMainPerson] = useState('');
  const [personId, setPersonId] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [status, setStatus] = useState<InvitationStatus>(canConfirmIgnore ? 'confirmed' : 'pending');
  const [description, setDescription] = useState('');

  // Photo State
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);

  // Quick Add Person inline modal state
  const [showAddPersonModal, setShowAddPersonModal] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');
  const [newPersonNickname, setNewPersonNickname] = useState('');
  const [newPersonPhone, setNewPersonPhone] = useState('');
  const [newPersonRel, setNewPersonRel] = useState<'business_partner' | 'client' | 'friend' | 'relative' | 'colleague' | 'family'>('friend');

  const eventTypes: EventType[] = [
    'wedding',
    'engagement',
    'reception',
    'birthday',
    'anniversary',
    'house_warming',
    'baby_shower',
    'business_event',
    'cultural',
    'religious',
    'graduation',
    'retirement',
    'other',
  ];

  // Conflict Check
  const hasDateConflict = date ? invitations.some((i) => i.date === date && i.status !== 'ignored') || schedule.some((s) => s.date === date) : false;

  // Fullscreen photo inspection modal state
  const [showImageModal, setShowImageModal] = useState(false);

  const openImageModal = () => {
    setShowImageModal(true);
    window.history.pushState({ modal: 'imagePreview' }, '');
  };

  const closeImageModal = () => {
    setShowImageModal(false);
    if (window.history.state?.modal === 'imagePreview') {
      window.history.back();
    }
  };

  const openAddPersonModal = () => {
    setShowAddPersonModal(true);
    window.history.pushState({ modal: 'quickAddContact' }, '');
  };

  const closeAddPersonModal = () => {
    setShowAddPersonModal(false);
    setNewPersonName('');
    setNewPersonNickname('');
    setNewPersonPhone('');
    if (window.history.state?.modal === 'quickAddContact') {
      window.history.back();
    }
  };

  useEffect(() => {
    const handlePop = () => {
      setShowAddPersonModal(false);
      setShowImageModal(false);
    };
    window.addEventListener('popstate', handlePop);
    return () => {
      window.removeEventListener('popstate', handlePop);
    };
  }, []);

  const handleQuickAddPerson = () => {
    if (!newPersonName.trim()) return;
    const created = addPerson({
      name: newPersonName.trim(),
      nickname: newPersonNickname.trim() || newPersonName.trim(),
      relationship: newPersonRel,
      phone: newPersonPhone.trim() || undefined,
      notes: 'Added from manual invitation entry',
    });
    setPersonId(created.id);
    if (!hostName) setHostName(created.name);
    setNewPersonName('');
    setNewPersonNickname('');
    setNewPersonPhone('');
    closeAddPersonModal();
  };

  const handleFile = (file: File) => {
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
          const optimized = canvas.toDataURL('image/jpeg', 0.90);
          setPhotoPreview(optimized);
        } else {
          setPhotoPreview(rawDataUrl);
        }
      };
      img.onerror = () => {
        setPhotoPreview(rawDataUrl);
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleOpenCamera = async () => {
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
    galleryInputRef.current?.click();
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const resolvedTitle = title.trim() || hostName.trim();
    if (!resolvedTitle || !date) return;
    if (!canAdd || isSavingRef.current) return;

    isSavingRef.current = true;
    setIsSaving(true);

    try {
      const invId = generateId('inv');
      const targetVipId =
        activeVipId ||
        (isVIP
          ? currentUser?.vipId || (currentUser?.username ? `vip_${currentUser.username}` : undefined)
          : currentPrivilegedUser?.vipId) ||
        'vip_default';

      let imageId: string | undefined;
      let imageUrl: string | undefined;

      // Upload original invitation card photo to Supabase storage if provided
      if (photoPreview) {
        try {
          const uploadRes = await storageService.uploadInvitationImage(photoPreview, targetVipId, invId);
          if (uploadRes?.path) {
            imageId = uploadRes.path;
            imageUrl = uploadRes.signedUrl || uploadRes.path;
          } else {
            throw new Error('Storage service returned no upload path');
          }
        } catch (uploadErr) {
          console.error('[AddInvitationScreen] Photo upload failed:', uploadErr);
          alert('Failed to upload invitation card photo. Please check your connection and try again.');
          setIsSaving(false);
          isSavingRef.current = false;
          return;
        }
      }

      const creatorLabel = isVIP ? 'VIP Principal' : (currentPrivilegedUser?.name || 'Staff');
      const creatorId = isVIP ? 'vip' : (currentPrivilegedUser?.id || 'staff');

      const createdInv = addInvitation({
        id: invId,
        title: resolvedTitle,
        eventType,
        date,
        time: time || undefined,
        venue: venue.trim() || undefined,
        location: location.trim() || undefined,
        hostName: hostName.trim() || undefined,
        mainPerson: mainPerson.trim() || undefined,
        personId: personId || undefined,
        priority,
        status: canConfirmIgnore ? status : 'pending',
        description: description.trim() || undefined,
        imageId,
        imageUrl,
        createdBy: creatorId,
      });

      // Add Activity Log
      addActivityLog({
        vipId: targetVipId,
        userId: creatorId,
        userName: creatorLabel,
        action: `Added new invitation manually${photoPreview ? ' with invitation card photo' : ''}`,
        entityType: 'invitation',
        entityId: createdInv.id,
        entityName: createdInv.title,
      });

      // Notify other users under this VIP account
      if (!isVIP) {
        addNotification({
          type: 'new_invitation',
          title: 'New Invitation Submitted',
          message: `${createdInv.title} was added manually by ${creatorLabel}. Awaiting review.`,
          read: false,
          relatedEntityId: createdInv.id,
        });
      } else {
        addNotification({
          type: 'new_invitation',
          title: 'New Invitation Added',
          message: `${createdInv.title} was added by VIP Principal.`,
          read: false,
          relatedEntityId: createdInv.id,
        });
      }

      navigate(`/event/${createdInv.id}`, { replace: true });
    } catch (err) {
      console.error('[AddInvitationScreen] Save failed:', err);
      alert('An error occurred while saving the invitation. Please try again.');
    } finally {
      setIsSaving(false);
      isSavingRef.current = false;
    }
  };

  if (!canAdd) {
    return (
      <div className="screen-no-nav flex flex-col items-center justify-center text-center" style={{ minHeight: '100vh', padding: 'var(--space-6)' }}>
        <div className="auth-card animate-scale-in">
          <div style={{ color: 'var(--color-danger)', marginBottom: 'var(--space-4)' }}>
            <Shield size={48} style={{ margin: '0 auto' }} />
          </div>
          <h3>Permission Restricted</h3>
          <p className="text-secondary text-sm" style={{ marginTop: 'var(--space-2)', marginBottom: 'var(--space-6)' }}>
            Your account role does not have permission to add new invitations. Please contact your VIP Principal to adjust your permissions.
          </p>
          <button className="btn btn-outline w-full" onClick={() => navigate(-1)}>
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen-no-nav">
      {/* ── Stationary Top Bar ────────────────────────────────────────────── */}
      <div className="screen-stationary-header">
        <div className="top-bar">
          <button
            className="top-bar-back"
            onClick={() => {
              if (showImageModal) {
                closeImageModal();
              } else if (showAddPersonModal) {
                closeAddPersonModal();
              } else {
                navigate(-1);
              }
            }}
            aria-label="Go Back"
          >
            <ArrowLeft size={18} />
          </button>
          <span className="top-bar-title">Add Invitation Manually</span>
          <div style={{ width: '36px' }} />
        </div>
      </div>

      <div className="screen-scroll-body" style={{ paddingBottom: '120px' }}>
        <form onSubmit={handleSave} className="flex flex-col gap-4 animate-slide-up">
        {/* Creator Info Pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            borderRadius: 'var(--radius-lg)',
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid var(--glass-border)',
            fontSize: 'var(--text-xs)',
          }}
        >
          <span className="text-secondary flex items-center gap-2">
            {isVIP ? <Crown size={14} className="text-gold" /> : <Shield size={14} className="text-info" />}
            Logged in as: <strong className="text-primary">{isVIP ? (currentUser?.name || 'VIP Principal') : (currentPrivilegedUser?.name || 'Staff')}</strong>
          </span>
          <span className={`badge ${isVIP ? 'badge-gold' : 'badge-info'}`} style={{ fontSize: '0.65rem' }}>
            {isVIP ? 'VIP Access' : (currentPrivilegedUser?.role || 'Staff')}
          </span>
        </div>

        {/* Schedule Conflict Warning Banner */}
        {hasDateConflict && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 14px',
              borderRadius: 'var(--radius-lg)',
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              color: 'var(--color-warning)',
              fontSize: 'var(--text-xs)',
            }}
          >
            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
            <div>
              <strong>Schedule Conflict Notice:</strong> You already have one or more events scheduled on {date}. You can still proceed with adding this invitation.
            </div>
          </div>
        )}

        {/* Invitation Card Photo (Optional) */}
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 'var(--radius-lg)',
            background: 'rgba(15, 23, 42, 0.55)',
            border: '1px dashed var(--glass-border)',
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <label className="label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Camera size={13} style={{ color: 'var(--color-gold)' }} />
              <span>Invitation Card Photo</span>
              <span className="text-secondary" style={{ fontSize: '0.7rem', fontWeight: 400 }}>(Optional)</span>
            </label>
            {photoPreview && (
              <span className="badge badge-gold" style={{ fontSize: '0.65rem' }}>
                Card Attached
              </span>
            )}
          </div>

          {!photoPreview ? (
            <div className="flex flex-col gap-2">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleOpenCamera}
                  style={{
                    fontSize: 'var(--text-xs)',
                    padding: '10px 8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  <Camera size={15} style={{ color: 'var(--color-gold)' }} />
                  <span>Take Photo</span>
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleOpenGallery}
                  style={{
                    fontSize: 'var(--text-xs)',
                    padding: '10px 8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  <Upload size={15} style={{ color: '#64d2ff' }} />
                  <span>Upload Photo</span>
                </button>
              </div>
              <p className="text-secondary" style={{ fontSize: '0.7rem', margin: 0, textAlign: 'center' }}>
                Capture with camera or choose invitation card from gallery
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div
                style={{
                  position: 'relative',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  maxHeight: '180px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
                onClick={openImageModal}
                title="Tap to inspect full invitation photo"
              >
                <img
                  src={photoPreview}
                  alt="Invitation Card Preview"
                  style={{ width: '100%', maxHeight: '180px', objectFit: 'contain' }}
                />
                <div
                  style={{
                    position: 'absolute',
                    bottom: '8px',
                    left: '8px',
                    background: 'rgba(0, 0, 0, 0.75)',
                    backdropFilter: 'blur(4px)',
                    borderRadius: '12px',
                    padding: '3px 9px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '11px',
                    color: '#fff',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    pointerEvents: 'none',
                  }}
                >
                  <Maximize2 size={12} style={{ color: '#64d2ff' }} />
                  <span>Tap to inspect</span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPhotoPreview(null);
                  }}
                  title="Remove photo"
                  style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    background: 'rgba(0, 0, 0, 0.75)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '50%',
                    width: '28px',
                    height: '28px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                  aria-label="Remove photo"
                >
                  <X size={15} />
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleOpenCamera}
                  style={{
                    fontSize: 'var(--text-xs)',
                    padding: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  <Camera size={13} />
                  <span>Retake</span>
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleOpenGallery}
                  style={{
                    fontSize: 'var(--text-xs)',
                    padding: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  <Upload size={13} />
                  <span>Replace Photo</span>
                </button>
              </div>
            </div>
          )}

          {/* Hidden inputs */}
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileInput}
            style={{ display: 'none' }}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileInput}
            style={{ display: 'none' }}
          />
        </div>

        {/* Host Name - First to Type */}
        <div>
          <label className="label">
            <User size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
            Host Name *
          </label>
          <input
            className="input"
            type="text"
            placeholder="e.g. Ramesh Kumar"
            value={hostName}
            onChange={(e) => {
              const val = e.target.value;
              setHostName(val);
              if (!title || title === hostName) {
                setTitle(val);
              }
            }}
            autoFocus
          />
        </div>

        {/* Event Title */}
        <div>
          <label className="label">
            <FileText size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
            Invitation Title
          </label>
          <input
            className="input"
            type="text"
            placeholder="e.g. Ramesh's Son Wedding Reception"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        {/* Event Type & Priority Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
          <div>
            <label className="label">
              <Tag size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
              Event Category
            </label>
            <select
              className="select"
              value={eventType}
              onChange={(e) => setEventType(e.target.value as EventType)}
            >
              {eventTypes.map((t) => (
                <option key={t} value={t}>
                  {getEventTypeLabel(t)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">
              <Shield size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
              Priority
            </label>
            <select
              className="select"
              value={priority}
              disabled={!canChangePriority}
              onChange={(e) => setPriority(e.target.value as Priority)}
            >
              <option value="high">Tier 1 · Critical Priority</option>
              <option value="medium">Tier 2 · Priority Attendance</option>
              <option value="low">Tier 3 · Routine / Courtesy</option>
            </select>
            {!canChangePriority && (
              <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', marginTop: '2px', display: 'block' }}>
                Priority set by VIP rule
              </span>
            )}
          </div>
        </div>

        {/* Date & Time Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 'var(--space-3)' }}>
          <div>
            <label className="label">
              <Calendar size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
              Event Date *
            </label>
            <input
              className="input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="label">
              <Clock size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
              Time
            </label>
            <input
              className="input"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
        </div>

        {/* Link to Known VIP Person */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="label" style={{ margin: 0 }}>
              <User size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
              Link to Contact (Optional)
            </label>
            <button
              type="button"
              className="btn btn-sm btn-ghost text-gold"
              style={{ fontSize: 'var(--text-xs)', padding: '2px 8px' }}
              onClick={openAddPersonModal}
            >
              <UserPlus size={12} /> + New Contact
            </button>
          </div>
          <select
            className="select"
            value={personId}
            onChange={(e) => {
              const val = e.target.value;
              setPersonId(val);
              const selected = people.find((p) => p.id === val);
              if (selected && !hostName) {
                setHostName(selected.name);
              }
            }}
          >
            <option value="">No Contact Linked / Select Contact...</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nickname} ({p.name}) — {p.relationship}
              </option>
            ))}
          </select>
        </div>

        {/* Venue & Location */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
          <div>
            <label className="label">
              <Building2 size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
              Venue Name
            </label>
            <input
              className="input"
              type="text"
              placeholder="e.g. ITC Grand Chola"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
            />
          </div>

          <div>
            <label className="label">
              <MapPin size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
              City / Area
            </label>
            <input
              className="input"
              type="text"
              placeholder="e.g. Guindy, Chennai"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
        </div>

        {/* Status */}
        <div>
          <label className="label">Invitation Status</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
            <button
              type="button"
              className={`btn ${status === 'confirmed' ? 'btn-gold' : 'btn-outline'}`}
              onClick={() => setStatus('confirmed')}
            >
              <Check size={16} />
              Confirmed
            </button>
            <button
              type="button"
              className={`btn ${status === 'pending' ? 'btn-gold' : 'btn-outline'}`}
              onClick={() => setStatus('pending')}
            >
              <Clock size={16} />
              Pending Review
            </button>
          </div>
        </div>

        {/* Description / Notes */}
        <div>
          <label className="label">Notes / Dress Code / Gift Context</label>
          <textarea
            className="textarea"
            rows={3}
            placeholder="e.g. Traditional attire requested. Close family function, gift recommended."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* Save Bar */}
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            padding: 'var(--space-4) var(--space-6)',
            paddingBottom: 'calc(var(--space-6) + var(--safe-area-bottom))',
            background: 'rgba(6, 10, 19, 0.95)',
            backdropFilter: 'blur(20px)',
            borderTop: '1px solid var(--glass-border)',
            zIndex: 10,
          }}
        >
          <button
            type="submit"
            className="btn btn-gold w-full"
            disabled={!(title.trim() || hostName.trim()) || !date || isSaving}
            style={{ padding: '14px', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            {isSaving ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Saving Invitation & Photo...</span>
              </>
            ) : (
              <>
                <Check size={18} />
                <span>{canConfirmIgnore ? 'Save & Confirm Invitation' : 'Submit for VIP Approval (Pending)'}</span>
              </>
            )}
          </button>
        </div>
      </form>
      </div>

      {/* Quick Add Person Modal */}
      {showAddPersonModal && (
        <div
          className="modal-overlay modal-centered"
          style={{ zIndex: 100000 }}
          onClick={closeAddPersonModal}
        >
          <div
            className="modal-dialog animate-scale-in"
            style={{
              maxWidth: '360px',
              maxHeight: '85vh',
              overflowY: 'auto',
              padding: '20px',
              textAlign: 'left',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 style={{ fontSize: '17px', fontWeight: 600, color: '#fff', margin: 0 }}>
                Quick Add Contact
              </h3>
              <button
                type="button"
                className="btn-icon"
                style={{ width: '30px', height: '30px' }}
                onClick={closeAddPersonModal}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="label">Full Name *</label>
                <input
                  className="input"
                  placeholder="e.g. Rajesh Sharma"
                  value={newPersonName}
                  onChange={(e) => setNewPersonName(e.target.value)}
                  autoFocus
                />
              </div>

              <div>
                <label className="label">Nickname / Identifier</label>
                <input
                  className="input"
                  placeholder="e.g. Business Partner Rajesh"
                  value={newPersonNickname}
                  onChange={(e) => setNewPersonNickname(e.target.value)}
                />
              </div>

              <div>
                <label className="label">Relationship</label>
                <select
                  className="select"
                  value={newPersonRel}
                  onChange={(e) => setNewPersonRel(e.target.value as any)}
                >
                  <option value="business_partner">Business Partner</option>
                  <option value="client">Client</option>
                  <option value="friend">Friend</option>
                  <option value="relative">Relative</option>
                  <option value="family">Family</option>
                  <option value="colleague">Colleague</option>
                </select>
              </div>

              <div>
                <label className="label">Phone Number (Optional)</label>
                <input
                  className="input"
                  type="tel"
                  placeholder="e.g. +91 98765 43210"
                  value={newPersonPhone}
                  onChange={(e) => setNewPersonPhone(e.target.value)}
                />
              </div>

              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  className="btn btn-ghost flex-1"
                  onClick={closeAddPersonModal}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-gold flex-1"
                  disabled={!newPersonName.trim()}
                  onClick={handleQuickAddPerson}
                >
                  Add Contact
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Fullscreen Invitation Lightbox Modal ────────────────────────────── */}
      {showImageModal && photoPreview && (
        <div
          className="modal-overlay modal-centered"
          style={{ zIndex: 9999, background: 'rgba(0, 0, 0, 0.9)', backdropFilter: 'blur(8px)' }}
          onClick={closeImageModal}
        >
          <div
            className="relative max-w-lg w-full max-h-[92vh] flex flex-col items-center justify-center p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={closeImageModal}
              className="absolute top-4 right-4 z-10 p-2 rounded-full text-white bg-black/60 hover:bg-black/80 transition-colors"
              aria-label="Close image preview"
              style={{
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={20} />
            </button>
            <img
              src={photoPreview}
              alt="Original Invitation Card"
              className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl"
              style={{ border: '1px solid rgba(255, 255, 255, 0.15)' }}
            />
            <div className="mt-3 text-center">
              <p className="text-xs text-slate-200 font-medium">
                {title || hostName || 'Invitation Card Preview'}
              </p>
              <p className="text-[11px] text-slate-400">
                Original Invitation Photo (Pre-Save Verification)
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
