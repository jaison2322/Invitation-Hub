import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import {
  ArrowLeft,
  Calendar,
  Gift,
  History,
  Edit3,
  User,
  Trash2,
  Phone,
  FileText,
} from 'lucide-react';
import {
  getInitials,
  getRelationshipLabel,
  formatDate,
  formatCurrency,
} from '../utils/formatters';
import EventBadgeIcon from '../components/EventBadgeIcon';
import { getRelationshipHistory, getGiftHistory } from '../services/aiService';
import type { RelationshipType } from '../types';

export default function PersonProfileScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    people,
    familyEvents,
    invitations,
    updatePerson,
    removePerson,
    isVIP,
    currentPrivilegedUser,
    addActivityLog,
  } = useAppStore();

  const canManagePeople = isVIP || !!currentPrivilegedUser?.permissions?.canAddPeople;

  // Edit Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const person = people.find((p) => p.id === id);

  // Form Fields
  const [editName, setEditName] = useState(person?.name || '');
  const [editNickname, setEditNickname] = useState(person?.nickname || '');
  const [editRelationship, setEditRelationship] = useState<RelationshipType>(
    person?.relationship || 'friend'
  );
  const [editPhone, setEditPhone] = useState(person?.phone || '');
  const [editNotes, setEditNotes] = useState(person?.notes || '');

  if (!person) {
    return (
      <div className="screen-no-nav flex items-center justify-center p-6 text-center">
        <div>
          <p className="text-muted mb-4">VIP Contact not found</p>
          <button className="btn btn-gold" onClick={() => navigate('/people')}>
            Go to People
          </button>
        </div>
      </div>
    );
  }

  const relHistory = getRelationshipHistory(person.id, familyEvents);
  const giftHist = getGiftHistory(person.id, familyEvents);
  const personInvitations = invitations.filter((i) => i.personId === person.id);
  const totalGiftValue = giftHist.reduce((sum, g) => sum + (g.estimatedValue || 0), 0);

  const relationships: RelationshipType[] = [
    'family',
    'relative',
    'friend',
    'business_partner',
    'client',
    'colleague',
    'neighbor',
    'acquaintance',
    'other',
  ];

  const handleOpenEdit = () => {
    setEditName(person.name);
    setEditNickname(person.nickname || person.name);
    setEditRelationship(person.relationship);
    setEditPhone(person.phone || '');
    setEditNotes(person.notes || '');
    setShowDeleteConfirm(false);
    setShowEditModal(true);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = editName.trim();
    if (!trimmedName) return;

    updatePerson(person.id, {
      name: trimmedName,
      nickname: editNickname.trim() || trimmedName,
      relationship: editRelationship,
      phone: editPhone.trim() || undefined,
      notes: editNotes.trim() || undefined,
    });

    addActivityLog({
      userId: isVIP ? 'vip' : currentPrivilegedUser?.id || 'staff',
      userName: isVIP ? 'VIP Principal' : currentPrivilegedUser?.name || 'Staff User',
      action: `updated profile for contact "${trimmedName}"`,
      entityType: 'person',
      entityId: person.id,
      entityName: trimmedName,
    });

    setShowEditModal(false);
  };

  const handleDelete = () => {
    removePerson(person.id);

    addActivityLog({
      userId: isVIP ? 'vip' : currentPrivilegedUser?.id || 'staff',
      userName: isVIP ? 'VIP Principal' : currentPrivilegedUser?.name || 'Staff User',
      action: `deleted contact "${person.name}"`,
      entityType: 'person',
      entityId: person.id,
      entityName: person.name,
    });

    navigate('/people', { replace: true });
  };

  return (
    <div className="screen-no-nav">
      {/* ── Stationary Top Bar ────────────────────────────────────────────── */}
      <div className="screen-stationary-header">
        <div className="top-bar">
          <button className="top-bar-back" onClick={() => navigate(-1)}>
            <ArrowLeft size={18} />
          </button>
          <span className="top-bar-title">Person Profile</span>
          {canManagePeople ? (
            <button
              className="btn btn-sm btn-outline"
              style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', fontSize: 'var(--text-xs)' }}
              onClick={handleOpenEdit}
            >
              <Edit3 size={13} />
              <span>Edit</span>
            </button>
          ) : (
            <div style={{ width: '36px' }} />
          )}
        </div>
      </div>

      {/* ── Scrollable Profile Content ──────────────────────────────────────── */}
      <div className="screen-scroll-body" style={{ paddingBottom: '80px' }}>
        {/* Profile Header */}
        <div className="text-center animate-slide-up" style={{ marginBottom: 'var(--space-5)' }}>
        <div className="avatar avatar-xl" style={{ margin: '0 auto var(--space-3)' }}>
          {getInitials(person.name)}
        </div>
        <h2>{person.nickname || person.name}</h2>
        {person.nickname && person.nickname !== person.name && (
          <p className="text-secondary text-sm mt-0.5">{person.name}</p>
        )}
        <div className="flex items-center justify-center gap-2 mt-2">
          <span className="badge badge-gold">{getRelationshipLabel(person.relationship)}</span>
        </div>

        {/* Contact info badges */}
        {person.phone && (
          <div className="flex items-center justify-center gap-3 mt-3 text-xs text-muted">
            <span className="flex items-center gap-1">
              <Phone size={12} className="text-gold" /> {person.phone}
            </span>
          </div>
        )}

        {canManagePeople && (
          <button
            className="btn btn-sm btn-ghost text-gold mt-3"
            style={{ fontSize: 'var(--text-xs)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            onClick={handleOpenEdit}
          >
            <Edit3 size={12} /> Edit Contact Details
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="stat-grid animate-slide-up delay-1" style={{ marginBottom: 'var(--space-5)' }}>
        <div className="stat-card">
          <div className="stat-value">{relHistory.filter((h) => h.role === 'Attended').length}</div>
          <div className="stat-label">Events Attended</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{giftHist.length}</div>
          <div className="stat-label">Gifts Given</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ fontSize: 'var(--text-lg)' }}>
            {totalGiftValue > 0 ? formatCurrency(totalGiftValue) : '—'}
          </div>
          <div className="stat-label">Total Value</div>
        </div>
      </div>

      {/* Notes */}
      {person.notes && (
        <div className="glass-card animate-slide-up delay-1" style={{ marginBottom: 'var(--space-4)' }}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-gold" />
              <span className="text-sm font-semibold">VIP Relationship Notes</span>
            </div>
            {canManagePeople && (
              <button
                className="btn btn-sm btn-ghost text-muted"
                style={{ padding: '2px' }}
                onClick={handleOpenEdit}
              >
                <Edit3 size={12} />
              </button>
            )}
          </div>
          <p className="text-sm text-secondary">{person.notes}</p>
        </div>
      )}

      {/* Interaction History */}
      {relHistory.length > 0 && (
        <div className="glass-card animate-slide-up delay-2" style={{ marginBottom: 'var(--space-4)' }}>
          <div className="flex items-center gap-2 mb-3">
            <History size={16} style={{ color: 'var(--color-info)' }} />
            <span className="font-heading font-semibold text-sm">Events Attended</span>
          </div>
          <div className="timeline">
            {relHistory.map((item, i) => (
              <div key={i} className="timeline-item">
                <div className="timeline-date">{formatDate(item.eventDate)}</div>
                <div className="text-sm flex items-center gap-2">
                  <EventBadgeIcon type={item.eventType} size="xs" />
                  <span className="text-white font-medium">{item.role}</span>
                  <span className="text-muted">—</span>
                  <span>{item.eventName}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gift History */}
      {giftHist.length > 0 && (
        <div className="glass-card animate-slide-up delay-3" style={{ marginBottom: 'var(--space-4)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Gift size={16} style={{ color: 'var(--color-gold)' }} />
            <span className="font-heading font-semibold text-sm">Gift History</span>
          </div>
          <div className="flex flex-col gap-2">
            {giftHist.map((g, i) => (
              <div
                key={i}
                className="flex items-center justify-between"
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  background: 'rgba(212, 168, 83, 0.04)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <div>
                  <div className="text-sm">{g.gift}</div>
                  <div className="text-xs text-muted">
                    {g.eventName} · {formatDate(g.eventDate)}
                  </div>
                </div>
                {g.estimatedValue && (
                  <span className="badge badge-gold">{formatCurrency(g.estimatedValue)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invitations from this person */}
      {personInvitations.length > 0 && (
        <div className="glass-card animate-slide-up delay-4" style={{ marginBottom: 'var(--space-6)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Calendar size={16} style={{ color: 'var(--color-pending)' }} />
            <span className="font-heading font-semibold text-sm">Invitations Received</span>
          </div>
          <div className="flex flex-col gap-2">
            {personInvitations.map((inv) => (
              <div
                key={inv.id}
                className="glass-card glass-card-interactive"
                style={{ padding: 'var(--space-3)' }}
                onClick={() => navigate(`/event/${inv.id}`)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">{inv.nickname || inv.title}</div>
                    <div className="text-xs text-muted">{formatDate(inv.date)}</div>
                  </div>
                  <span className={`badge badge-${inv.status}`} style={{ fontSize: '9px' }}>
                    {inv.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>

      {/* ─── MODAL: EDIT PERSON ──────────────────────────────────────────────── */}
      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="flex items-center justify-between mb-2">
              <h3 style={{ margin: 0 }}>Edit VIP Contact</h3>
              <button
                type="button"
                className="btn btn-sm btn-ghost text-danger"
                onClick={() => {
                  setShowEditModal(false);
                  setShowDeleteConfirm(true);
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px' }}
              >
                <Trash2 size={14} /> Remove
              </button>
            </div>
            <p className="text-xs text-secondary mb-4">
              Update relationship tier, nickname, and notes
            </p>

            <form onSubmit={handleSaveEdit} className="flex flex-col gap-3">
              <div>
                <label className="label">Full Name *</label>
                <input
                  className="input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Full Name"
                  required
                />
              </div>

              <div>
                <label className="label">Display Name / Nickname</label>
                <input
                  className="input"
                  value={editNickname}
                  onChange={(e) => setEditNickname(e.target.value)}
                  placeholder="Display Name"
                />
              </div>

              <div>
                <label className="label">Relationship Tier *</label>
                <select
                  className="select"
                  value={editRelationship}
                  onChange={(e) => setEditRelationship(e.target.value as RelationshipType)}
                >
                  {relationships.map((r) => (
                    <option key={r} value={r}>
                      {getRelationshipLabel(r)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Phone Number</label>
                <input
                  className="input"
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                />
              </div>

              <div>
                <label className="label">VIP Notes / Background</label>
                <textarea
                  className="textarea"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Relationship notes, preferences, family ties..."
                  rows={2}
                />
              </div>

              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  className="btn btn-ghost flex-1"
                  onClick={() => setShowEditModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-gold flex-1"
                  disabled={!editName.trim()}
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: DELETE CONFIRMATION ──────────────────────────────────────── */}
      {showDeleteConfirm && (
        <div className="modal-overlay modal-centered" onClick={() => setShowDeleteConfirm(false)}>
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
            <h3 style={{ marginBottom: 'var(--space-2)' }}>Delete Contact?</h3>
            <p className="text-xs text-secondary mb-5">
              Are you sure you want to delete <strong>{person.name}</strong> from your VIP directory? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                className="btn btn-ghost flex-1"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setShowEditModal(true);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger flex-1"
                onClick={handleDelete}
              >
                Delete Contact
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
