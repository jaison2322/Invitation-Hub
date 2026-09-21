import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { ArrowLeft, AlertCircle, CheckCircle2, Sparkles } from 'lucide-react';
import type { EventType } from '../types';
import { getEventTypeLabel } from '../utils/formatters';

export default function ExtractedDetailsScreen() {
  const navigate = useNavigate();
  const { currentScanResult } = useAppStore();

  if (!currentScanResult) {
    navigate('/scan', { replace: true });
    return null;
  }

  const { extractedFields, analysis } = currentScanResult;
  const [fields, setFields] = useState({ ...extractedFields });
  const [nickname, setNickname] = useState(
    analysis.relatedPerson
      ? `${analysis.relatedPerson.nickname} — ${getEventTypeLabel(fields.eventType || 'other')}`
      : (fields.title || '')
  );

  useEffect(() => {
    if (currentScanResult?.extractedFields) {
      setFields({ ...currentScanResult.extractedFields });
      setNickname(
        currentScanResult.analysis.relatedPerson
          ? `${currentScanResult.analysis.relatedPerson.nickname} — ${getEventTypeLabel(currentScanResult.extractedFields.eventType || 'other')}`
          : (currentScanResult.extractedFields.title || '')
      );
    }
  }, [currentScanResult]);

  const updateField = (key: string, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  };

  const getConfidenceColor = (field: string): string => {
    const confidence = fields.confidence[field] || 0;
    if (confidence >= 0.7) return '';
    return 'input-uncertain';
  };

  const getConfidenceIcon = (field: string) => {
    const confidence = fields.confidence[field] || 0;
    if (confidence >= 0.7) {
      return <CheckCircle2 size={13} strokeWidth={2} style={{ color: 'var(--color-confirmed)' }} />;
    }
    return <AlertCircle size={13} strokeWidth={2} style={{ color: 'var(--color-pending)' }} />;
  };

  const handleContinue = () => {
    sessionStorage.setItem('invitation-nickname', nickname);
    sessionStorage.setItem('edited-fields', JSON.stringify(fields));
    navigate('/confirm-ignore');
  };

  const eventTypes: EventType[] = [
    'wedding', 'engagement', 'birthday', 'anniversary', 'house_warming',
    'baby_shower', 'graduation', 'retirement', 'business_event', 'reception',
    'cultural', 'religious', 'other',
  ];

  return (
    <div className="screen-no-nav">
      {/* ── Stationary Top Bar ────────────────────────────────────────────── */}
      <div className="screen-stationary-header">
        <div className="top-bar">
          <button className="top-bar-back" onClick={() => navigate('/scan')} aria-label="Go Back">
            <ArrowLeft size={16} strokeWidth={2} />
          </button>
          <span className="top-bar-title">Extracted Details</span>
          <div style={{ width: '36px' }} />
        </div>
      </div>

      {/* ── Scrollable Details Content ──────────────────────────────────────── */}
      <div className="screen-scroll-body" style={{ paddingBottom: '90px' }}>
        {/* ── Apple Intelligence Confidence Card ──────────────────────────────── */}
      <div className="apple-intelligence-card mb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={16} strokeWidth={2} style={{ color: '#64d2ff' }} />
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Recognition Confidence</span>
          </div>
          <span className="badge badge-info">
            {Math.round(analysis.confidence * 100)}%
          </span>
        </div>
        <p style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
          Amber highlighted fields were predicted with lower confidence. Tap to edit.
        </p>
      </div>

      {/* ── Low Confidence Warning Banner ──────────────────────────────────── */}
      {(() => {
        const fieldKeys = ['eventType', 'date', 'time', 'venue', 'mainPerson'];
        const lowConfCount = fieldKeys.filter(
          (k) => (fields.confidence[k] || 0) < 0.5
        ).length;
        const emptyCount = fieldKeys.filter(
          (k) => !fields[k as keyof typeof fields]
        ).length;

        if (lowConfCount >= 3 || emptyCount >= 3) {
          return (
            <div
              className="mb-3"
              style={{
                padding: '10px 12px',
                borderRadius: '12px',
                background: 'rgba(255, 159, 10, 0.1)',
                border: '1px solid rgba(255, 159, 10, 0.25)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
              }}
            >
              <AlertCircle size={16} strokeWidth={2} style={{ color: '#ff9f0a', marginTop: '1px', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#ff9f0a' }}>
                  Several fields could not be extracted
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                  The image may be blurry or in an unsupported format. Please review and fill in the missing details manually.
                </div>
              </div>
            </div>
          );
        }
        return null;
      })()}

      {/* ── Matched Person Badge ───────────────────────────────────────────── */}
      {analysis.relatedPerson && (
        <div className="ios-grouped-list mb-3">
          <div className="ios-grouped-item" style={{ cursor: 'default' }}>
            <div className="ios-icon-squircle" style={{ background: 'rgba(48, 209, 88, 0.15)', color: '#30d158' }}>
              <CheckCircle2 size={16} strokeWidth={2} />
            </div>
            <div className="flex-1">
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>VIP Contact Recognized</div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                {analysis.relatedPerson.nickname} ({analysis.relatedPerson.name})
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Form Fields ────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div>
          <label className="label flex items-center justify-between" style={{ fontSize: '12px', marginBottom: '4px' }}>
            <span>Event Display Title</span>
            <span className="badge badge-gold" style={{ fontSize: '9px' }}>Suggested</span>
          </label>
          <input
            className="input"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="e.g., Business Partner Ramesh — Son's Wedding"
          />
        </div>

        <div>
          <label className="label flex items-center gap-1.5" style={{ fontSize: '12px', marginBottom: '4px' }}>
            <span>Event Category</span>
            {getConfidenceIcon('eventType')}
          </label>
          <select
            className={`select ${getConfidenceColor('eventType')}`}
            value={fields.eventType || 'other'}
            onChange={(e) => updateField('eventType', e.target.value)}
          >
            {eventTypes.map((type) => (
              <option key={type} value={type}>
                {getEventTypeLabel(type)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label flex items-center gap-1.5" style={{ fontSize: '12px', marginBottom: '4px' }}>
            <span>Principal / Couple</span>
            {getConfidenceIcon('mainPerson')}
          </label>
          <input
            className={`input ${getConfidenceColor('mainPerson')}`}
            value={fields.mainPerson || ''}
            onChange={(e) => updateField('mainPerson', e.target.value)}
            placeholder="Person or couple name"
          />
        </div>

        <div>
          <label className="label flex items-center gap-1.5" style={{ fontSize: '12px', marginBottom: '4px' }}>
            <span>Host Name</span>
            {getConfidenceIcon('hostName')}
          </label>
          <input
            className={`input ${getConfidenceColor('hostName')}`}
            value={fields.hostName || ''}
            onChange={(e) => updateField('hostName', e.target.value)}
            placeholder="Who is hosting the function"
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div>
            <label className="label flex items-center gap-1.5" style={{ fontSize: '12px', marginBottom: '4px' }}>
              <span>Date</span>
              {getConfidenceIcon('date')}
            </label>
            <input
              className={`input ${getConfidenceColor('date')}`}
              type="date"
              value={fields.date || ''}
              onChange={(e) => updateField('date', e.target.value)}
            />
          </div>

          <div>
            <label className="label flex items-center gap-1.5" style={{ fontSize: '12px', marginBottom: '4px' }}>
              <span>Time</span>
              {getConfidenceIcon('time')}
            </label>
            <input
              className={`input ${getConfidenceColor('time')}`}
              type="time"
              value={fields.time || ''}
              onChange={(e) => updateField('time', e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="label flex items-center gap-1.5" style={{ fontSize: '12px', marginBottom: '4px' }}>
            <span>Venue</span>
            {getConfidenceIcon('venue')}
          </label>
          <input
            className={`input ${getConfidenceColor('venue')}`}
            value={fields.venue || ''}
            onChange={(e) => updateField('venue', e.target.value)}
            placeholder="Grand Ballroom, Hotel..."
          />
        </div>
      </div>
      </div>

      {/* ── Apple Floating Continue Bar ─────────────────────────────────────── */}
      <div className="decision-bar">
        <button
          type="button"
          className="btn btn-gold w-full"
          onClick={handleContinue}
        >
          Continue to Review
        </button>
      </div>
    </div>
  );
}
