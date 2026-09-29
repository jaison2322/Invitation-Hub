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
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Loader2,
  Maximize2,
  Camera,
  Upload,
} from 'lucide-react';
import type { EventType, Priority, InvitationStatus, CanonicalManualInvitationData } from '../types';
import { getEventTypeLabel } from '../utils/formatters';
import { mapScanToManualForm, saveCanonicalInvitation, VALID_EVENT_TYPES } from '../services/scanMappingService';
import { getCachedScanImage } from '../utils/imagePreprocess';
import { permissionService } from '../services/permissionService';

export default function ExtractedDetailsScreen() {
  const navigate = useNavigate();
  const {
    currentScanResult,
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

  const canAdd = isVIP || currentPrivilegedUser?.permissions?.canAddInvitations !== false;
  const canConfirmIgnore = isVIP || currentPrivilegedUser?.permissions?.canConfirmIgnoreInvitations === true;
  const canChangePriority = isVIP || currentPrivilegedUser?.permissions?.canChangePriority === true;

  // Initialize from canonical manual form state
  const rawImage =
    currentScanResult?.imageDataUrl ||
    sessionStorage.getItem('scan-image') ||
    getCachedScanImage() ||
    '';

  const initialCanonical: CanonicalManualInvitationData = (() => {
    if (currentScanResult?.canonicalManualForm) {
      return currentScanResult.canonicalManualForm;
    }
    const cached = sessionStorage.getItem('canonical-manual-form');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {}
    }
    if (currentScanResult?.extractedFields && currentScanResult?.analysis) {
      return mapScanToManualForm(
        currentScanResult.extractedFields,
        currentScanResult.analysis,
        people,
        canConfirmIgnore
      );
    }
    return {
      hostName: '',
      title: '',
      eventType: 'wedding',
      priority: 'medium',
      date: '',
      time: '18:00',
      personId: '',
      venue: '',
      location: '',
      status: canConfirmIgnore ? 'confirmed' : 'pending',
      description: '',
      confidence: {},
    };
  })();

  // ── Canonical Form State (Identical to Manual Add Invitation) ───────────
  const [hostName, setHostName] = useState(initialCanonical.hostName || '');
  const [title, setTitle] = useState(initialCanonical.title || '');
  const [eventType, setEventType] = useState<EventType>(initialCanonical.eventType || 'wedding');
  const [priority, setPriority] = useState<Priority>(initialCanonical.priority || 'medium');
  const [date, setDate] = useState(initialCanonical.date || '');
  const [time, setTime] = useState(initialCanonical.time || '18:00');
  const [personId, setPersonId] = useState(initialCanonical.personId || '');
  const [venue, setVenue] = useState(initialCanonical.venue || '');
  const [location, setLocation] = useState(initialCanonical.location || '');
  const [status, setStatus] = useState<InvitationStatus>(
    canConfirmIgnore ? (initialCanonical.status || 'confirmed') : 'pending'
  );
  const [description, setDescription] = useState(initialCanonical.description || '');
  const [mainPerson, setMainPerson] = useState(initialCanonical.mainPerson || '');
  const [confidence, setConfidence] = useState<Record<string, number>>(initialCanonical.confidence || {});

  const [isSaving, setIsSaving] = useState(false);

  // Quick Add Person inline modal state
  const [showAddPersonModal, setShowAddPersonModal] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');
  const [newPersonNickname, setNewPersonNickname] = useState('');
  const [newPersonPhone, setNewPersonPhone] = useState('');
  const [newPersonRel, setNewPersonRel] = useState<
    'business_partner' | 'client' | 'friend' | 'relative' | 'colleague' | 'family'
  >('friend');

  // Conflict Check
  const hasDateConflict = date
    ? invitations.some((i) => i.date === date && i.status !== 'ignored') ||
      schedule.some((s) => s.date === date)
    : false;

  useEffect(() => {
    if (!currentScanResult && !sessionStorage.getItem('canonical-manual-form')) {
      navigate('/scan', { replace: true });
    }
  }, [currentScanResult, navigate]);

  // Photo State & Fullscreen Modal
  const [scannedPhoto, setScannedPhoto] = useState<string>(rawImage);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
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
          const compressed = canvas.toDataURL('image/jpeg', 0.85);
          setScannedPhoto(compressed);
          sessionStorage.setItem('scan-image', compressed);
        } else {
          setScannedPhoto(rawDataUrl);
          sessionStorage.setItem('scan-image', rawDataUrl);
        }
      };
      img.onerror = () => {
        setScannedPhoto(rawDataUrl);
        sessionStorage.setItem('scan-image', rawDataUrl);
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handlePhotoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
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
            'Camera permission is required to photograph invitation cards. Would you like to open App Settings to grant Camera permission?'
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
      notes: 'Added from scanned invitation review',
    });
    setPersonId(created.id);
    if (!hostName) setHostName(created.name);
    setNewPersonName('');
    setNewPersonNickname('');
    setNewPersonPhone('');
    closeAddPersonModal();
  };

  const buildCurrentCanonicalData = (): CanonicalManualInvitationData => ({
    hostName: hostName.trim(),
    title: (title.trim() || hostName.trim()),
    eventType,
    priority,
    date,
    time: time || '18:00',
    personId: personId || '',
    venue: venue.trim(),
    location: location.trim(),
    status: canConfirmIgnore ? status : 'pending',
    description: description.trim(),
    mainPerson: mainPerson.trim() || undefined,
    confidence,
  });

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const resolvedTitle = title.trim() || hostName.trim();
    if (!resolvedTitle || !date) return;
    if (!canAdd || isSaving) return;

    setIsSaving(true);
    try {
      const canonicalData = buildCurrentCanonicalData();
      const createdInv = await saveCanonicalInvitation({
        formData: canonicalData,
        rawImage: scannedPhoto,
        ocrText: currentScanResult?.ocrText,
        aiReason: currentScanResult?.analysis?.priorityReason,
        isVIP,
        currentPrivilegedUser,
        currentUser,
        activeVipId,
        addInvitation,
        addActivityLog,
        addNotification,
      });

      // Clear scan temporary state
      sessionStorage.removeItem('scan-image');
      sessionStorage.removeItem('canonical-manual-form');
      sessionStorage.removeItem('invitation-nickname');
      sessionStorage.removeItem('edited-fields');

      navigate(`/event/${createdInv.id}`, { replace: true });
    } catch (err) {
      console.error('[ExtractedDetailsScreen] Save failed:', err);
      alert('Could not save invitation. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleContinueToReview = () => {
    const canonicalData = buildCurrentCanonicalData();
    sessionStorage.setItem('canonical-manual-form', JSON.stringify(canonicalData));
    sessionStorage.setItem('edited-fields', JSON.stringify(canonicalData));
    sessionStorage.setItem('invitation-nickname', canonicalData.title);
    if (scannedPhoto) {
      sessionStorage.setItem('scan-image', scannedPhoto);
    }
    navigate('/confirm-ignore');
  };

  const getConfidenceBadge = (field: string) => {
    const score = confidence[field];
    if (score === undefined) return null;
    if (score >= 0.75) {
      return (
        <span
          title={`Detected with high confidence (${Math.round(score * 100)}%)`}
          style={{ display: 'inline-flex', alignItems: 'center', marginLeft: '6px' }}
        >
          <CheckCircle2 size={13} strokeWidth={2} style={{ color: 'var(--color-confirmed)' }} />
        </span>
      );
    }
    return (
      <span
        title={`Predicted from invitation text (${Math.round(score * 100)}%)`}
        style={{ display: 'inline-flex', alignItems: 'center', marginLeft: '6px' }}
      >
        <AlertCircle size={13} strokeWidth={2} style={{ color: 'var(--color-pending)' }} />
      </span>
    );
  };

  if (!canAdd) {
    return (
      <div
        className="screen-no-nav flex flex-col items-center justify-center text-center"
        style={{ minHeight: '100vh', padding: 'var(--space-6)' }}
      >
        <div className="auth-card animate-scale-in">
          <div style={{ color: 'var(--color-danger)', marginBottom: 'var(--space-4)' }}>
            <Shield size={48} style={{ margin: '0 auto' }} />
          </div>
          <h3>Permission Restricted</h3>
          <p
            className="text-secondary text-sm"
            style={{ marginTop: 'var(--space-2)', marginBottom: 'var(--space-6)' }}
          >
            Your account role does not have permission to record invitations. Please contact your VIP
            Principal.
          </p>
          <button className="btn btn-outline w-full" onClick={() => navigate(-1)}>
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const overallConfidence = currentScanResult?.analysis?.confidence ?? 0.88;

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
                navigate('/scan');
              }
            }}
            aria-label="Go Back"
          >
            <ArrowLeft size={18} />
          </button>
          <span className="top-bar-title">Review Scanned Invitation</span>
          <div style={{ width: '36px' }} />
        </div>
      </div>

      <div className="screen-scroll-body" style={{ paddingBottom: '130px' }}>
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
              Logged in as:{' '}
              <strong className="text-primary">
                {isVIP ? currentUser?.name || 'VIP Principal' : currentPrivilegedUser?.name || 'Staff'}
              </strong>
            </span>
            <span className={`badge ${isVIP ? 'badge-gold' : 'badge-info'}`} style={{ fontSize: '0.65rem' }}>
              {isVIP ? 'VIP Access' : currentPrivilegedUser?.role || 'Staff'}
            </span>
          </div>

          {/* Hidden inputs for replacing photo if desired */}
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handlePhotoChange}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={handlePhotoChange}
          />

          {/* Attached Scanned Photo & AI Confidence Card */}
          <div
            className="apple-intelligence-card"
            style={{
              padding: '12px 14px',
              borderRadius: 'var(--radius-lg)',
              background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%)',
              border: '1px solid rgba(100, 210, 255, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            {/* Header row: Status and confidence */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="flex items-center gap-1.5">
                <Sparkles size={14} style={{ color: '#64d2ff', flexShrink: 0 }} />
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>
                  Original Scanned Card
                </span>
              </div>
              <span className="badge badge-info" style={{ flexShrink: 0 }}>
                {Math.round(overallConfidence * 100)}% match
              </span>
            </div>

            {/* Original Invitation Photo Preview (Tappable for full inspection) */}
            {scannedPhoto && (
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
                title="Tap to inspect full original invitation card"
              >
                <img
                  src={scannedPhoto}
                  alt="Original Invitation Card"
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
                  <span>Tap to inspect original card</span>
                </div>
              </div>
            )}

            {/* Photo Action / Replacement Controls */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', paddingTop: '2px' }}>
              <p
                className="text-secondary"
                style={{ fontSize: '11px', margin: 0, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                Original card photo linked to event.
              </p>
              <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={handleOpenCamera}
                  style={{
                    fontSize: '0.7rem',
                    padding: '4px 8px',
                    height: 'auto',
                    minHeight: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    color: '#64d2ff',
                  }}
                >
                  <Camera size={12} />
                  <span>Retake</span>
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={handleOpenGallery}
                  style={{
                    fontSize: '0.7rem',
                    padding: '4px 8px',
                    height: 'auto',
                    minHeight: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    color: '#64d2ff',
                  }}
                >
                  <Upload size={12} />
                  <span>Replace</span>
                </button>
              </div>
            </div>
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
                <strong>Schedule Conflict Notice:</strong> You already have one or more events scheduled on{' '}
                {date}. You can still proceed with recording this invitation.
              </div>
            </div>
          )}

          {/* 1. Host Name - First to Type */}
          <div>
            <label className="label">
              <User size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
              Host Name *
              {getConfidenceBadge('hostName')}
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

          {/* 2. Invitation Title */}
          <div>
            <label className="label">
              <FileText size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
              Invitation Title
              {getConfidenceBadge('title')}
            </label>
            <input
              className="input"
              type="text"
              placeholder="e.g. Ramesh's Son Wedding Reception"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* 3. Event Type & Priority Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <div>
              <label className="label">
                <Tag size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                Event Category
                {getConfidenceBadge('eventType')}
              </label>
              <select
                className="select"
                value={eventType}
                onChange={(e) => setEventType(e.target.value as EventType)}
              >
                {VALID_EVENT_TYPES.map((t) => (
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
                <span
                  style={{
                    fontSize: '0.65rem',
                    color: 'var(--color-text-muted)',
                    marginTop: '2px',
                    display: 'block',
                  }}
                >
                  Priority set by VIP rule
                </span>
              )}
            </div>
          </div>

          {/* 4. Date & Time Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 'var(--space-3)' }}>
            <div>
              <label className="label">
                <Calendar size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                Event Date *
                {getConfidenceBadge('date')}
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
                {getConfidenceBadge('time')}
              </label>
              <input
                className="input"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          {/* 5. Link to Known VIP Person */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label" style={{ margin: 0 }}>
                <User size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                Link to Contact (Optional)
                {personId && (
                  <span
                    style={{
                      fontSize: '0.65rem',
                      color: 'var(--color-confirmed)',
                      marginLeft: '6px',
                      fontWeight: 500,
                    }}
                  >
                    (Contact Linked)
                  </span>
                )}
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

          {/* 6. Venue & Location */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <div>
              <label className="label">
                <Building2 size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                Venue Name
                {getConfidenceBadge('venue')}
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
                {getConfidenceBadge('location')}
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

          {/* 7. Status */}
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

          {/* 8. Description / Notes */}
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

          {/* Secondary Link to AI Protocol Screen */}
          <div className="text-center pt-2">
            <button
              type="button"
              className="btn btn-ghost text-secondary"
              style={{ fontSize: 'var(--text-xs)', gap: '6px' }}
              onClick={handleContinueToReview}
            >
              <span>View AI Protocol Analysis & Conflict Deep-Dive</span>
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Bottom Floating Save Bar */}
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
              style={{
                padding: '14px',
                fontSize: 'var(--text-base)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              {isSaving ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Saving Canonical Invitation...</span>
                </>
              ) : (
                <>
                  <Check size={18} />
                  <span>
                    {canConfirmIgnore ? 'Save & Confirm Invitation' : 'Submit for VIP Approval (Pending)'}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Quick Add Person Modal */}
      {showAddPersonModal && (
        <div className="modal-overlay modal-centered" style={{ zIndex: 100000 }} onClick={closeAddPersonModal}>
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
                <label className="label">Nickname / Short Name</label>
                <input
                  className="input"
                  placeholder="e.g. Rajeshji"
                  value={newPersonNickname}
                  onChange={(e) => setNewPersonNickname(e.target.value)}
                />
              </div>

              <div>
                <label className="label">Relationship to VIP</label>
                <select
                  className="select"
                  value={newPersonRel}
                  onChange={(e) => setNewPersonRel(e.target.value as any)}
                >
                  <option value="business_partner">Business Partner</option>
                  <option value="client">Client</option>
                  <option value="friend">Friend</option>
                  <option value="relative">Relative</option>
                  <option value="colleague">Colleague</option>
                  <option value="family">Family</option>
                </select>
              </div>

              <div>
                <label className="label">Phone Number (Optional)</label>
                <input
                  className="input"
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={newPersonPhone}
                  onChange={(e) => setNewPersonPhone(e.target.value)}
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" className="btn btn-outline flex-1" onClick={closeAddPersonModal}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-gold flex-1"
                  disabled={!newPersonName.trim()}
                  onClick={handleQuickAddPerson}
                >
                  Add & Link
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Fullscreen Invitation Lightbox Modal ────────────────────────────── */}
      {showImageModal && scannedPhoto && (
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
              src={scannedPhoto}
              alt="Original Invitation Card"
              className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl"
              style={{ border: '1px solid rgba(255, 255, 255, 0.15)' }}
            />
            <div className="mt-3 text-center">
              <p className="text-xs text-slate-200 font-medium">
                {title || hostName || 'Scanned Invitation Card'}
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
