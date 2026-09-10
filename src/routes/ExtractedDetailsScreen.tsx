import { useState } from 'react';
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
          Continue to Protocol Review
        </button>
      </div>
    </div>
  );
}
