import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import {
  Calendar, Clock, MapPin, Sparkles, AlertTriangle,
  History, Gift, CheckCircle2, ArrowLeft, FileText, Loader2,
  Maximize2, X,
} from 'lucide-react';
import {
  formatDate, formatTime, formatFullDate,
  formatCurrency, getInitials,
} from '../utils/formatters';
import EventBadgeIcon from '../components/EventBadgeIcon';
import PriorityBadge from '../components/PriorityBadge';
import type { ExtractedFields, InvitationStatus, CanonicalManualInvitationData } from '../types';
import { storageService } from '../services/storageService';
import { generateId } from '../utils/id';
import { getCachedScanImage } from '../utils/imagePreprocess';
import { mapScanToManualForm } from '../services/scanMappingService';

export default function ConfirmIgnoreScreen() {
  const navigate = useNavigate();
  const {
    currentScanResult,
    addInvitation,
    setScanResult,
    addActivityLog,
    addNotification,
    isVIP,
    currentUser,
    currentPrivilegedUser,
    activeVipId,
    people,
  } = useAppStore();

  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);

  if (!currentScanResult) {
    navigate('/scan', { replace: true });
    return null;
  }

  const { analysis } = currentScanResult;
  const canConfirmIgnore = isVIP || currentPrivilegedUser?.permissions?.canConfirmIgnoreInvitations === true;

  const canonicalCached = sessionStorage.getItem('canonical-manual-form');
  const formData: CanonicalManualInvitationData = canonicalCached
    ? JSON.parse(canonicalCached)
    : (currentScanResult.canonicalManualForm ||
      mapScanToManualForm(currentScanResult.extractedFields, analysis, people, canConfirmIgnore));

  const rawImage = currentScanResult?.imageDataUrl || sessionStorage.getItem('scan-image') || getCachedScanImage() || '';

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

  useEffect(() => {
    const handlePop = () => {
      setShowImageModal(false);
    };
    window.addEventListener('popstate', handlePop);
    return () => {
      window.removeEventListener('popstate', handlePop);
    };
  }, []);

  const handleDecision = async (status: 'confirmed' | 'ignored' | 'pending') => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    setIsSaving(true);

    try {
      const effectiveStatus: InvitationStatus = canConfirmIgnore ? status : 'pending';
      const invId = generateId('inv');
      const targetVipId =
        activeVipId ||
        (isVIP
          ? currentUser?.vipId || (currentUser?.username ? `vip_${currentUser.username}` : undefined)
          : currentPrivilegedUser?.vipId) ||
        'vip_default';

      let imageId: string | undefined;
      let imageUrl: string | undefined;

      // Upload original invitation photo to secure Supabase storage
      if (rawImage) {
        try {
          const uploadRes = await storageService.uploadInvitationImage(rawImage, targetVipId, invId);
          if (uploadRes) {
            imageId = uploadRes.path;
            imageUrl = uploadRes.signedUrl;
          } else {
            // Local fallback if offline
            imageUrl = rawImage;
          }
        } catch (uploadErr) {
          console.warn('[ConfirmIgnoreScreen] Image upload failed, falling back to local image:', uploadErr);
          imageUrl = rawImage;
        }
      }

      const resolvedTitle = formData.title.trim() || formData.hostName.trim() || 'New Invitation';

      const created = addInvitation({
        id: invId,
        personId: formData.personId || analysis.relatedPerson?.id || undefined,
        eventType: formData.eventType || 'other',
        title: resolvedTitle,
        mainPerson: formData.mainPerson?.trim() || undefined,
        hostName: formData.hostName?.trim() || undefined,
        date: formData.date || new Date().toISOString().split('T')[0],
        time: formData.time || undefined,
        venue: formData.venue?.trim() || undefined,
        location: formData.location?.trim() || undefined,
        description: formData.description?.trim() || undefined,
        priority: formData.priority || analysis.suggestedPriority || 'medium',
        aiSuggestedPriority: analysis.suggestedPriority,
        aiReason: analysis.priorityReason,
        status: effectiveStatus,
        ocrText: analysis.ocrText,
        imageId,
        imageUrl,
        createdBy: isVIP ? 'vip' : (currentPrivilegedUser?.id || 'staff'),
      });

      const userName = isVIP
        ? (currentUser?.name || 'VIP Principal')
        : (currentPrivilegedUser?.name || 'Staff User');
      const userId = isVIP
        ? (currentUser?.username || 'vip')
        : (currentPrivilegedUser?.id || 'staff');

      // Add Activity Log
      addActivityLog({
        userId,
        userName,
        action: `Scanned & recorded invitation "${created.title}" as ${effectiveStatus}`,
        entityType: 'invitation',
        entityId: created.id,
        entityName: created.title,
      });

      // Add Notification
      if (analysis.scheduleConflicts && analysis.scheduleConflicts.length > 0) {
        addNotification({
          type: 'conflict_warning',
          title: `Schedule Conflict: ${created.title}`,
          message: `Invitation conflicts with ${analysis.scheduleConflicts.length} existing event(s) on ${created.date}.`,
          read: false,
          relatedEntityId: created.id,
          actionUrl: `/conflicts`,
        });
      } else {
        addNotification({
          type: 'new_invitation',
          title: effectiveStatus === 'pending'
            ? `New Invitation Awaiting Review: ${created.title}`
            : `New Invitation Scanned: ${created.title}`,
          message: effectiveStatus === 'pending'
            ? `Scanned by ${userName} and queued for VIP Principal decision.`
            : `Scanned and recorded as ${effectiveStatus.toUpperCase()} for ${created.date}.`,
          read: false,
          relatedEntityId: created.id,
          actionUrl: `/event/${created.id}`,
        });
      }

      // Clean up
      setScanResult(null);
      sessionStorage.removeItem('scan-image');
      sessionStorage.removeItem('canonical-manual-form');
      sessionStorage.removeItem('invitation-nickname');
      sessionStorage.removeItem('edited-fields');

      navigate('/dashboard', { replace: true });
    } catch (err) {
      console.error('[ConfirmIgnoreScreen] Error saving event:', err);
      alert('An error occurred while saving the event. Please try again.');
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

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
              } else {
                navigate(-1);
              }
            }}
            aria-label="Go Back"
          >
            <ArrowLeft size={16} strokeWidth={2} />
          </button>
          <span className="top-bar-title">Protocol Decision</span>
          <div style={{ width: '36px' }} />
        </div>
      </div>

      {/* ── Scrollable Decision Content ─────────────────────────────────────── */}
      <div className="screen-scroll-body" style={{ paddingBottom: '90px' }}>
        {/* ── Scanned Original Invitation Card ─────────────────────────────── */}
        {rawImage && (
          <div className="ios-card mb-3 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <FileText size={13} style={{ color: 'var(--color-accent)' }} />
                Original Invitation Card
              </span>
              <span className="badge badge-info" style={{ fontSize: '10px' }}>Attached</span>
            </div>
            <div
              style={{
                position: 'relative',
                maxHeight: '180px',
                overflow: 'hidden',
                borderRadius: '10px',
                background: 'rgba(0, 0, 0, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                cursor: 'pointer',
              }}
              onClick={openImageModal}
              title="Tap to inspect full original invitation card"
            >
              <img
                src={rawImage}
                alt="Invitation Card"
                style={{ width: '100%', maxHeight: '180px', objectFit: 'contain', borderRadius: '10px' }}
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
            </div>
          </div>
        )}

        {/* ── Executive Briefing Event Pass ─────────────────────────────────── */}
        <div className="hero-event-card mb-3">
          <div className="flex items-start justify-between mb-3">
            <EventBadgeIcon type={formData.eventType || 'other'} size="hero" showGlow />
            <PriorityBadge priority={formData.priority || analysis.suggestedPriority} />
          </div>

          <h1
            className="font-heading font-semibold text-white tracking-tight"
            style={{ fontSize: '20px', letterSpacing: '-0.02em', marginBottom: '2px' }}
          >
            {formData.title || formData.hostName || 'New Event'}
          </h1>
          {formData.hostName && formData.hostName !== formData.title && (
            <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '10px' }}>
              Host: {formData.hostName}
            </p>
          )}

          <div style={{ height: '0.5px', background: 'var(--color-separator)', margin: '10px 0' }} />

          <div className="flex flex-col gap-2" style={{ fontSize: '13px' }}>
            <div className="flex items-center gap-2 text-slate-200">
              <Calendar size={14} strokeWidth={1.8} style={{ color: 'var(--color-accent)' }} />
              <span>{formData.date ? formatFullDate(formData.date) : 'Date not specified'}</span>
            </div>
            {formData.time && (
              <div className="flex items-center gap-2 text-slate-200">
                <Clock size={14} strokeWidth={1.8} style={{ color: 'var(--color-accent)' }} />
                <span>{formatTime(formData.time)}</span>
              </div>
            )}
            {(formData.venue || formData.location) && (
              <div className="flex items-center gap-2 text-slate-200">
                <MapPin size={14} strokeWidth={1.8} style={{ color: 'var(--color-accent)' }} />
                <span className="truncate">
                  {formData.venue && formData.location ? `${formData.venue}, ${formData.location}` : (formData.venue || formData.location)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Apple Intelligence Recommendation ──────────────────────────────── */}
        <div className="apple-intelligence-card mb-3">
          <div className="flex items-center gap-2 mb-1.5">
            <Sparkles size={16} strokeWidth={2} style={{ color: '#64d2ff' }} />
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              AI Suggested Priority: {analysis.suggestedPriority.toUpperCase()}
            </span>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: '1.45' }}>
            {analysis.priorityReason}
          </p>
        </div>

        {/* ── Schedule Conflicts ──────────────────────────────────────────────── */}
        {analysis.scheduleConflicts.length > 0 && (
          <div className="mb-3">
            {analysis.scheduleConflicts.map((conflict, i) => (
              <div key={i} className="conflict-card mb-2">
                <div className="conflict-icon">
                  <AlertTriangle size={14} strokeWidth={2} />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-danger)' }}>
                    {conflict.type === 'time_overlap' ? 'Time Overlap Conflict' : 'Same Day Event'}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '1px' }}>
                    {conflict.conflictingItemTitle} at {conflict.conflictingTime}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Protocol History (Grouped List) ─────────────────────────────────── */}
        {analysis.relationshipHistory.length > 0 && (
          <div className="ios-grouped-list mb-3">
            {analysis.relatedPerson && (
              <div className="ios-grouped-item" style={{ cursor: 'default' }}>
                <div className="avatar avatar-sm">
                  {getInitials(analysis.relatedPerson.name)}
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {analysis.relatedPerson.nickname}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                    {analysis.relatedPerson.name}
                  </div>
                </div>
              </div>
            )}

            {analysis.relationshipHistory.map((item, i) => (
              <div key={i} className="ios-grouped-item" style={{ cursor: 'default' }}>
                <div className="ios-icon-squircle" style={{ background: 'rgba(10, 132, 255, 0.15)', color: '#0a84ff' }}>
                  <History size={15} strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>
                    {item.role} — {item.eventName}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                    {formatDate(item.eventDate)}
                  </div>
                </div>
                <CheckCircle2 size={14} strokeWidth={2} style={{ color: 'var(--color-confirmed)', flexShrink: 0 }} />
              </div>
            ))}
          </div>
        )}

        {/* ── Gift History ───────────────────────────────────────────────────── */}
        {analysis.giftHistory.length > 0 && (
          <div className="ios-grouped-list mb-3">
            {analysis.giftHistory.map((gift, i) => (
              <div key={i} className="ios-grouped-item" style={{ cursor: 'default' }}>
                <div className="ios-icon-squircle" style={{ background: 'rgba(255, 159, 10, 0.15)', color: '#ff9f0a' }}>
                  <Gift size={15} strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>{gift.gift}</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{gift.eventName}</div>
                </div>
                {gift.estimatedValue && (
                  <span className="badge badge-gold" style={{ flexShrink: 0 }}>
                    {formatCurrency(gift.estimatedValue)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Decision Bar ────────────────────────────────────────────────────── */}
      {canConfirmIgnore ? (
        <div className="decision-bar" style={{ flexDirection: 'column', gap: '8px' }}>
          <div className="flex gap-2 w-full">
            <button
              type="button"
              className="btn btn-confirm flex-1 font-heading flex items-center justify-center gap-1.5"
              disabled={isSaving}
              onClick={() => handleDecision('confirmed')}
            >
              {isSaving ? <Loader2 size={15} className="animate-spin" /> : null}
              Confirm Attendance
            </button>
            <button
              type="button"
              className="btn btn-ignore flex-1 font-heading"
              disabled={isSaving}
              onClick={() => handleDecision('ignored')}
            >
              Ignored
            </button>
          </div>
          <button
            type="button"
            className="btn btn-ghost w-full font-heading text-xs"
            disabled={isSaving}
            style={{ padding: '8px', color: 'var(--color-text-secondary)', border: '1px solid var(--glass-border)' }}
            onClick={() => handleDecision('pending')}
          >
            Save to Pending Queue
          </button>
        </div>
      ) : (
        <div className="decision-bar" style={{ flexDirection: 'column', gap: '10px' }}>
          <div
            style={{
              fontSize: '11.5px',
              color: 'var(--color-text-secondary)',
              textAlign: 'center',
              lineHeight: 1.35,
            }}
          >
            <span style={{ color: 'var(--color-pending)', fontWeight: 600 }}>Authorization Notice:</span> RSVP confirmation is reserved for VIP Principal. This event will be queued as Pending.
          </div>
          <button
            type="button"
            className="btn btn-gold w-full font-heading flex items-center justify-center gap-2"
            disabled={isSaving}
            style={{ padding: '13px', fontSize: '15px' }}
            onClick={() => handleDecision('pending')}
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : null}
            Submit for VIP Review (Pending)
          </button>
        </div>
      )}

      {/* ── Fullscreen Invitation Lightbox Modal ────────────────────────────── */}
      {showImageModal && rawImage && (
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
              src={rawImage}
              alt="Original Invitation Card"
              className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl"
              style={{ border: '1px solid rgba(255, 255, 255, 0.15)' }}
            />
            <div className="mt-3 text-center">
              <p className="text-xs text-slate-200 font-medium">
                {formData.title || formData.hostName || 'Invitation Card Preview'}
              </p>
              <p className="text-[11px] text-slate-400">
                Original Scanned Invitation Card
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
