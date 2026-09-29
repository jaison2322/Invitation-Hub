import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import {
  Search,
  Plus,
  Users,
  Edit3,
  Trash2,
  ChevronRight,
} from 'lucide-react';
import { getInitials, getRelationshipLabel } from '../utils/formatters';
import type { RelationshipType, Person } from '../types';

export default function PeopleListScreen() {
  const navigate = useNavigate();
  const {
    people,
    addPerson,
    updatePerson,
    removePerson,
    isVIP,
    currentPrivilegedUser,
    addActivityLog,
  } = useAppStore();

  const canManagePeople = isVIP || !!currentPrivilegedUser?.permissions?.canAddPeople;

  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<'all' | 'family' | 'business' | 'friend'>('all');

  // Modal State: 'add' | 'edit' | 'delete' | null
  const [modalMode, setModalMode] = useState<'add' | 'edit' | 'delete' | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

  // Form fields
  const [formName, setFormName] = useState('');
  const [formNickname, setFormNickname] = useState('');
  const [formRelationship, setFormRelationship] = useState<RelationshipType>('friend');
  const [formPhone, setFormPhone] = useState('');
  const [formNotes, setFormNotes] = useState('');

  const filtered = people.filter((p) => {
    // Category filter
    if (filterCategory === 'family' && p.relationship !== 'family' && p.relationship !== 'relative') return false;
    if (filterCategory === 'business' && p.relationship !== 'business_partner' && p.relationship !== 'client' && p.relationship !== 'colleague') return false;
    if (filterCategory === 'friend' && p.relationship !== 'friend' && p.relationship !== 'neighbor' && p.relationship !== 'acquaintance') return false;

    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.nickname.toLowerCase().includes(q) ||
      p.relationship.toLowerCase().includes(q)
    );
  });

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

  const handleOpenAdd = () => {
    setFormName('');
    setFormNickname('');
    setFormRelationship('friend');
    setFormPhone('');
    setFormNotes('');
    setSelectedPersonId(null);
    setModalMode('add');
  };

  const handleOpenEdit = (person: Person) => {
    setFormName(person.name);
    setFormNickname(person.nickname || person.name);
    setFormRelationship(person.relationship);
    setFormPhone(person.phone || '');
    setFormNotes(person.notes || '');
    setSelectedPersonId(person.id);
    setModalMode('edit');
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = formName.trim();
    if (!trimmedName) return;

    if (modalMode === 'edit' && selectedPersonId) {
      updatePerson(selectedPersonId, {
        name: trimmedName,
        nickname: formNickname.trim() || trimmedName,
        relationship: formRelationship,
        phone: formPhone.trim() || undefined,
        notes: formNotes.trim() || undefined,
      });

      addActivityLog({
        userId: isVIP ? 'vip' : currentPrivilegedUser?.id || 'staff',
        userName: isVIP ? 'VIP Principal' : currentPrivilegedUser?.name || 'Staff User',
        action: `updated contact details for "${trimmedName}"`,
        entityType: 'person',
        entityId: selectedPersonId,
        entityName: trimmedName,
      });
    } else {
      const created = addPerson({
        name: trimmedName,
        nickname: formNickname.trim() || trimmedName,
        relationship: formRelationship,
        phone: formPhone.trim() || undefined,
        notes: formNotes.trim() || undefined,
      });

      addActivityLog({
        userId: isVIP ? 'vip' : currentPrivilegedUser?.id || 'staff',
        userName: isVIP ? 'VIP Principal' : currentPrivilegedUser?.name || 'Staff User',
        action: `added new contact "${trimmedName}"`,
        entityType: 'person',
        entityId: created.id,
        entityName: trimmedName,
      });
    }

    setModalMode(null);
  };

  const handleConfirmDelete = () => {
    if (!selectedPersonId) return;
    const person = people.find((p) => p.id === selectedPersonId);
    removePerson(selectedPersonId);

    addActivityLog({
      userId: isVIP ? 'vip' : currentPrivilegedUser?.id || 'staff',
      userName: isVIP ? 'VIP Principal' : currentPrivilegedUser?.name || 'Staff User',
      action: `removed contact "${person?.name || 'Contact'}"`,
      entityType: 'person',
      entityId: selectedPersonId,
      entityName: person?.name,
    });

    setModalMode(null);
  };

  return (
    <div className="screen">
      {/* ── Stationary Header & Filters ─────────────────────────────────────── */}
      <div className="screen-stationary-header">
        {/* ── Apple Top Bar & Large Title ────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-2">
          <h1
            className="font-heading font-bold text-white tracking-tight"
            style={{ fontSize: '32px', letterSpacing: '-0.03em', lineHeight: 1.15 }}
          >
            Contacts
          </h1>
          {canManagePeople && (
            <button
              type="button"
              className="btn-icon"
              onClick={handleOpenAdd}
              aria-label="Add Contact"
              title="Add Contact"
            >
              <Plus size={18} strokeWidth={2} />
            </button>
          )}
        </div>
        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
          {people.length} contact in your relations
        </p>

        {/* ── Apple Search Field ──────────────────────────────────────────────── */}
        <div className="search-bar mb-3">
          <Search size={16} className="search-bar-icon" />
          <input
            placeholder="Search by name, nickname, or tier..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* ── Apple Segmented Filters ─────────────────────────────────────────── */}
        <div className="segmented-control">
          {[
            { id: 'all', label: 'All' },
            { id: 'family', label: 'Family' },
            { id: 'business', label: 'Business' },
            { id: 'friend', label: 'Friends' },
          ].map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={`segmented-item ${filterCategory === chip.id ? 'active' : ''}`}
              onClick={() => setFilterCategory(chip.id as any)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Scrollable Contacts Content ─────────────────────────────────────── */}
      <div className="screen-scroll-body">
        {/* ── Apple Inset Grouped Contact List ────────────────────────────────── */}
        {filtered.length > 0 ? (
        <div className="ios-grouped-list">
          {filtered.map((person) => (
            <div
              key={person.id}
              className="ios-grouped-item"
              onClick={() => navigate(`/person/${person.id}`)}
            >
              <div className="avatar avatar-sm">
                {getInitials(person.name)}
              </div>

              <div className="flex-1 min-w-0">
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {person.nickname || person.name}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '1px' }}>
                  {person.name}
                </div>
              </div>

              <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                <span className="badge badge-info">
                  {getRelationshipLabel(person.relationship)}
                </span>

                {canManagePeople && (
                  <button
                    type="button"
                    className="btn-icon"
                    style={{ width: '28px', height: '28px' }}
                    title="Edit Contact"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenEdit(person);
                    }}
                  >
                    <Edit3 size={13} strokeWidth={1.8} />
                  </button>
                )}
                <ChevronRight size={15} strokeWidth={2} style={{ color: 'var(--color-text-muted)' }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Users size={24} strokeWidth={1.8} />
          </div>
          <div className="empty-state-title" style={{ fontSize: '18px' }}>No Contacts Found</div>
          <div className="empty-state-text" style={{ fontSize: '13px' }}>
            {search ? 'No contacts match your query.' : 'Add your executive contacts to begin.'}
          </div>
          {canManagePeople && (
            <button className="btn btn-gold mt-4" onClick={handleOpenAdd}>
              Add First Contact
            </button>
          )}
        </div>
      )}
      </div>

      {/* ─── MODAL: ADD / EDIT PERSON ───────────────────────────────────────── */}
      {(modalMode === 'add' || modalMode === 'edit') && (
        <div className="modal-overlay" onClick={() => setModalMode(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-heading font-semibold text-white" style={{ fontSize: '18px', letterSpacing: '-0.02em', margin: 0 }}>
                {modalMode === 'edit' ? 'Edit Contact' : 'New Contact'}
              </h2>
              {modalMode === 'edit' && (
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-danger)',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 500,
                  }}
                  onClick={() => setModalMode('delete')}
                >
                  Remove
                </button>
              )}
            </div>
            <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
              {modalMode === 'edit'
                ? 'Update contact details and relationship tier'
                : 'Add a new member to your contact directory'}
            </p>

            <form onSubmit={handleSaveForm} className="flex flex-col gap-3">
              <div>
                <label className="label" style={{ fontSize: '12px', marginBottom: '4px' }}>Full Name *</label>
                <input
                  className="input"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g., Rajesh Khanna"
                  autoFocus
                  required
                />
              </div>

              <div>
                <label className="label" style={{ fontSize: '12px', marginBottom: '4px' }}>Display Nickname</label>
                <input
                  className="input"
                  value={formNickname}
                  onChange={(e) => setFormNickname(e.target.value)}
                  placeholder="e.g., Ramesh (Business Partner)"
                />
              </div>

              <div>
                <label className="label" style={{ fontSize: '12px', marginBottom: '4px' }}>Relationship Tier *</label>
                <select
                  className="select"
                  value={formRelationship}
                  onChange={(e) => setFormRelationship(e.target.value as RelationshipType)}
                >
                  {relationships.map((r) => (
                    <option key={r} value={r}>
                      {getRelationshipLabel(r)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label" style={{ fontSize: '12px', marginBottom: '4px' }}>Phone Number</label>
                <input
                  className="input"
                  type="tel"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                />
              </div>

              <div>
                <label className="label" style={{ fontSize: '12px', marginBottom: '4px' }}>Relationship Context & Notes</label>
                <textarea
                  className="textarea"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Important preferences, protocol details, background..."
                  rows={2}
                />
              </div>

              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  className="btn btn-ignore flex-1"
                  onClick={() => setModalMode(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-gold flex-1"
                  disabled={!formName.trim()}
                >
                  {modalMode === 'edit' ? 'Save Changes' : 'Add Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: DELETE CONFIRMATION ─────────────────────────────────────── */}
      {modalMode === 'delete' && (
        <div className="modal-overlay modal-centered" onClick={() => setModalMode('edit')}>
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
              Delete Contact?
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
              Are you sure you want to remove <strong>{formName}</strong>? This action cannot be undone.
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-ignore flex-1"
                onClick={() => setModalMode('edit')}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger flex-1"
                onClick={handleConfirmDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
