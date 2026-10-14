import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import {
  Search,
  Plus,
  Users,
  Edit3,
  Trash2,
  ChevronRight,
  Phone,
  Check,
  Calendar,
  UserPlus,
  X,
  AlertCircle,
} from 'lucide-react';
import { getInitials, getRelationshipLabel } from '../utils/formatters';
import type { RelationshipType, Person } from '../types';
import { contactService, type PhoneContact, deduplicatePhones } from '../services/contactService';
import type { PermissionResult } from '../services/permissionService';

interface DisplayContactItem {
  id: string;
  name: string;
  nickname: string;
  phone?: string;
  phones?: string[];
  relationship?: RelationshipType;
  badgeLabel: string;
  badgeClass: string;
  isVIPRecord: boolean;
  vipPerson?: Person;
  phoneContact?: PhoneContact;
}

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
    activeVipId,
  } = useAppStore();

  const canManagePeople = isVIP || !!currentPrivilegedUser?.permissions?.canAddPeople;

  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<'all' | 'family' | 'business' | 'friend'>('all');

  // Phone Contacts Integration State
  const [phoneContacts, setPhoneContacts] = useState<PhoneContact[]>([]);
  const [permission, setPermission] = useState<PermissionResult>({ granted: true, status: 'granted', canAskAgain: true });
  const [multiPhoneContact, setMultiPhoneContact] = useState<PhoneContact | null>(null);
  const [selectedPhoneOption, setSelectedPhoneOption] = useState<string>('');
  const [activePhoneContactAction, setActivePhoneContactAction] = useState<PhoneContact | null>(null);
  const [actionRelationship, setActionRelationship] = useState<RelationshipType>('friend');

  // Modal State: 'add' | 'edit' | 'delete' | null
  const [modalMode, setModalMode] = useState<'add' | 'edit' | 'delete' | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

  // Form fields
  const [formName, setFormName] = useState('');
  const [formRelationship, setFormRelationship] = useState<RelationshipType>('friend');
  const [formPhone, setFormPhone] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // 1. Initial Permission Check & Phone Contacts Read
  useEffect(() => {
    let isMounted = true;

    async function initPhoneContacts() {
      const perm = await contactService.checkPermission();
      if (!isMounted) return;
      setPermission(perm);

      if (perm.granted) {
        const loaded = await contactService.loadPhoneContacts();
        if (isMounted) {
          setPhoneContacts(loaded);
        }
      }
    }

    initPhoneContacts();

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Lifecycle Refresh when screen gains focus or is reopened
  useEffect(() => {
    function handleVisibilityOrFocus() {
      if (document.visibilityState === 'visible' && permission.granted) {
        contactService.loadPhoneContacts(true).then((loaded) => {
          setPhoneContacts(loaded);
        });
      }
    }

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [permission.granted]);

  // Request permission helper
  const handleRequestPermission = async () => {
    const res = await contactService.requestPermission();
    setPermission(res);
    if (res.granted) {
      const loaded = await contactService.loadPhoneContacts(true);
      setPhoneContacts(loaded);
    } else if (!res.canAskAgain) {
      await contactService.openSettings();
    }
  };

  // Search input handler with automated permission trigger on typing
  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (val.trim() && !permission.granted) {
      handleRequestPermission();
    }
  };

  // 3. Merged Live Filter with Strict Prefix Matching
  const displayItems = useMemo<DisplayContactItem[]>(() => {
    const q = search.trim().toLowerCase();

    // CATEGORY TABS: 'family', 'business', 'friend' filter app's VIP ledger records
    if (filterCategory !== 'all') {
      const filteredVip = people.filter((p) => {
        if (filterCategory === 'family' && p.relationship !== 'family' && p.relationship !== 'relative') return false;
        if (filterCategory === 'business' && p.relationship !== 'business_partner' && p.relationship !== 'client' && p.relationship !== 'colleague') return false;
        if (filterCategory === 'friend' && p.relationship !== 'friend' && p.relationship !== 'neighbor' && p.relationship !== 'acquaintance') return false;

        if (!q) return true;
        // Strict prefix matching (name only, starting from the starting letter)
        const name = (p.name || '').trim().toLowerCase();
        const words = name.split(/\s+/);
        return name.startsWith(q) || words.some((w) => w.startsWith(q));
      });

      return filteredVip.map((p) => ({
        id: p.id,
        name: p.name,
        nickname: p.nickname || p.name,
        phone: p.phone,
        relationship: p.relationship,
        badgeLabel: getRelationshipLabel(p.relationship),
        badgeClass: 'badge-info',
        isVIPRecord: true,
        vipPerson: p,
      }));
    }

    // 'ALL' TAB: Unified VIP Contacts + Phone Contacts
    const vipList: DisplayContactItem[] = [];
    const seenNames = new Set<string>();

    // 1. Add all VIP People
    for (const p of people) {
      const key = p.name.trim().toLowerCase();
      seenNames.add(key);
      vipList.push({
        id: p.id,
        name: p.name,
        nickname: p.nickname || p.name,
        phone: p.phone,
        relationship: p.relationship,
        badgeLabel: getRelationshipLabel(p.relationship),
        badgeClass: 'badge-info',
        isVIPRecord: true,
        vipPerson: p,
      });
    }

    // If search field is empty: DO NOT show phone contacts.
    // Return only the app's VIP contacts (empty if no VIP contacts exist).
    if (!q) {
      return vipList;
    }

    // 2. LIVE SEARCH: Only read & display phone contacts when user has typed in search field
    const searchResults: DisplayContactItem[] = [];

    // Filter VIP People matching prefix query (name only, starting from the starting letter)
    for (const item of vipList) {
      const name = (item.name || '').trim().toLowerCase();
      const words = name.split(/\s+/);
      if (name.startsWith(q) || words.some((w) => w.startsWith(q))) {
        searchResults.push(item);
      }
    }

    // Filter and add phone contacts matching strict prefix query
    for (const pc of phoneContacts) {
      const key = pc.name.trim().toLowerCase();
      if (!seenNames.has(key)) {
        const name = (pc.name || '').trim().toLowerCase();
        const words = name.split(/\s+/);
        // Prefix matching: contact name starts with query OR any word in name starts with query
        if (name.startsWith(q) || words.some((w) => w.startsWith(q))) {
          seenNames.add(key);
          searchResults.push({
            id: pc.id,
            name: pc.name,
            nickname: pc.name,
            phone: pc.phone || (pc.phones?.[0] || ''),
            phones: pc.phones,
            badgeLabel: 'Phone',
            badgeClass: 'badge-gold',
            isVIPRecord: false,
            phoneContact: pc,
          });
        }
      }
    }

    console.log(`[PeopleListScreen] Search query: "${search}"`);
    console.log(`[PeopleListScreen] Matching contacts: ${searchResults.length}`);

    return searchResults;
  }, [people, phoneContacts, filterCategory, search]);

  const relationships: RelationshipType[] = [
    'family',
    'relative',
    'friend',
    'business_partner',
    'client',
    'other',
  ];

  const handleOpenAdd = () => {
    setFormName('');
    setFormRelationship('friend');
    setFormPhone('');
    setFormNotes('');
    setSelectedPersonId(null);
    setModalMode('add');
  };

  const handleOpenEdit = (person: Person) => {
    setFormName(person.name);
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
        nickname: trimmedName,
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
        nickname: trimmedName,
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

  // 4. Contact Tap Handling (VIP vs Phone Contact)
  const handleItemClick = (item: DisplayContactItem) => {
    if (item.isVIPRecord && item.vipPerson) {
      navigate(`/person/${item.vipPerson.id}`);
      return;
    }

    if (item.phoneContact) {
      const allPhones = item.phoneContact.phones && item.phoneContact.phones.length > 0
        ? item.phoneContact.phones
        : item.phoneContact.phone
        ? [item.phoneContact.phone]
        : [];
      const uniquePhones = deduplicatePhones(allPhones);

      const existing = people.find(
        (p) => p.name.trim().toLowerCase() === item.phoneContact!.name.trim().toLowerCase()
      );
      setActionRelationship(existing ? existing.relationship : 'friend');

      if (uniquePhones.length > 1) {
        setMultiPhoneContact({
          ...item.phoneContact,
          phones: uniquePhones,
        });
        setSelectedPhoneOption(uniquePhones[0]);
      } else {
        setActivePhoneContactAction({
          ...item.phoneContact,
          phone: uniquePhones[0] || item.phoneContact.phone,
          phones: uniquePhones,
        });
      }
    }
  };

  const handleConfirmMultiPhone = () => {
    if (multiPhoneContact) {
      const existing = people.find(
        (p) => p.name.trim().toLowerCase() === multiPhoneContact.name.trim().toLowerCase()
      );
      setActionRelationship(existing ? existing.relationship : 'friend');

      const resolvedContact: PhoneContact = {
        ...multiPhoneContact,
        phone: selectedPhoneOption || multiPhoneContact.phone,
      };
      setMultiPhoneContact(null);
      setActivePhoneContactAction(resolvedContact);
    }
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
        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '10px' }}>
          {search.trim()
            ? `${displayItems.length} matching contact${displayItems.length === 1 ? '' : 's'}`
            : `${people.length} contact in your relations`}
        </p>

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
      <div className="screen-scroll-body" style={{ paddingTop: '12px' }}>
        {/* ── Apple Search Field (Scrolls with page content) ─────────────────── */}
        <div className="search-bar mb-3">
          <Search size={16} className="search-bar-icon" />
          <input
            placeholder="Search by name or nickname"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>

        {/* Permission Request Banner if search attempted without permission */}
        {!permission.granted && search.trim() && filterCategory === 'all' && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              background: 'rgba(212, 175, 55, 0.1)',
              border: '1px solid rgba(212, 175, 55, 0.25)',
              marginBottom: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
            }}
          >
            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={15} style={{ color: 'var(--color-gold)', flexShrink: 0 }} />
              <span>Enable phone contacts access to search your device's address book.</span>
            </div>
            <button
              type="button"
              className="btn btn-gold btn-sm"
              style={{ padding: '4px 10px', fontSize: '12px', flexShrink: 0 }}
              onClick={handleRequestPermission}
            >
              {permission.canAskAgain ? 'Allow' : 'Settings'}
            </button>
          </div>
        )}

        {/* ── Apple Inset Grouped Contact List ────────────────────────────────── */}
        {displayItems.length > 0 ? (
          <div className="ios-grouped-list">
            {displayItems.map((item) => (
              <div
                key={item.id}
                className="ios-grouped-item"
                onClick={() => handleItemClick(item)}
              >
                <div className="avatar avatar-sm">
                  {getInitials(item.name)}
                </div>

                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {item.nickname || item.name}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '1px' }}>
                    {item.phone || item.name}
                  </div>
                </div>

                <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                  <span className={`badge ${item.badgeClass || 'badge-info'}`}>
                    {item.badgeLabel}
                  </span>

                  {item.isVIPRecord && item.vipPerson && canManagePeople && (
                    <button
                      type="button"
                      className="btn-icon"
                      style={{ width: '28px', height: '28px' }}
                      title="Edit Contact"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenEdit(item.vipPerson!);
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
            {canManagePeople && !search && (
              <button className="btn btn-gold mt-4" onClick={handleOpenAdd}>
                Add First Contact
              </button>
            )}
          </div>
        )}
      </div>

      {/* ─── MODAL: MULTI-PHONE NUMBER PICKER ───────────────────────────────── */}
      {multiPhoneContact && (
        <div className="modal-overlay modal-centered" onClick={() => setMultiPhoneContact(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-heading font-semibold text-white" style={{ fontSize: '17px' }}>
                Select Phone Number
              </h3>
              <button type="button" className="btn-icon" onClick={() => setMultiPhoneContact(null)}>
                <X size={16} />
              </button>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '14px' }}>
              <strong>{multiPhoneContact.name}</strong> has multiple numbers saved:
            </p>
            <div className="flex flex-col gap-2 mb-4">
              {multiPhoneContact.phones?.map((num) => (
                <button
                  key={num}
                  type="button"
                  className={`btn ${selectedPhoneOption === num ? 'btn-gold' : 'btn-outline'} text-left justify-start`}
                  style={{ padding: '10px 14px' }}
                  onClick={() => setSelectedPhoneOption(num)}
                >
                  <Phone size={14} className="mr-2" />
                  <span className="flex-1">{num}</span>
                  {selectedPhoneOption === num && <Check size={14} className="ml-auto" />}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn btn-ignore flex-1" onClick={() => setMultiPhoneContact(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-gold flex-1"
                onClick={handleConfirmMultiPhone}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: PHONE CONTACT ACTION SHEET (LINK TO INVITATION / SAVE) ───── */}
      {activePhoneContactAction && (
        <div className="modal-overlay modal-centered" onClick={() => setActivePhoneContactAction(null)}>
          <div className="modal-dialog text-left" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <div className="avatar avatar-md">{getInitials(activePhoneContactAction.name)}</div>
              <button type="button" className="btn-icon" onClick={() => setActivePhoneContactAction(null)}>
                <X size={16} />
              </button>
            </div>
            <h3 className="font-heading font-bold text-white" style={{ fontSize: '18px', marginTop: '6px' }}>
              {activePhoneContactAction.name}
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '14px' }}>
              {activePhoneContactAction.phone || 'Phone Contact'}
            </p>

            {/* Relationship Tier Selector Dropdown */}
            <div style={{ marginBottom: '16px' }}>
              <label className="label" style={{ fontSize: '12px', marginBottom: '4px' }}>
                Relationship *
              </label>
              <select
                className="select"
                value={actionRelationship}
                onChange={(e) => setActionRelationship(e.target.value as RelationshipType)}
              >
                {relationships.map((r) => (
                  <option key={r} value={r}>
                    {getRelationshipLabel(r)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="btn btn-gold w-full flex items-center justify-center gap-2"
                onClick={() => {
                  const contact = activePhoneContactAction;
                  setActivePhoneContactAction(null);
                  navigate('/add-invitation', {
                    state: {
                      prefillContact: {
                        name: contact.name,
                        phone: contact.phone || (contact.phones?.[0] || ''),
                        relationship: actionRelationship,
                      },
                    },
                  });
                }}
              >
                <Calendar size={15} />
                <span>Link to New Invitation</span>
              </button>

              {canManagePeople && (
                <button
                  type="button"
                  className="btn btn-outline w-full flex items-center justify-center gap-2"
                  onClick={() => {
                    const contact = activePhoneContactAction;
                    const resolvedPhone = contact.phone || (contact.phones?.[0] || undefined);
                    const existing = people.find(
                      (p) => p.name.trim().toLowerCase() === contact.name.trim().toLowerCase()
                    );

                    if (existing) {
                      updatePerson(existing.id, {
                        relationship: actionRelationship,
                        phone: resolvedPhone || existing.phone,
                      });
                      addActivityLog({
                        userId: isVIP ? 'vip' : currentPrivilegedUser?.id || 'staff',
                        userName: isVIP ? 'VIP Principal' : currentPrivilegedUser?.name || 'Staff User',
                        action: `updated "${contact.name}" relationship to ${getRelationshipLabel(actionRelationship)}`,
                        entityType: 'person',
                        entityId: existing.id,
                        entityName: contact.name,
                      });
                    } else {
                      const created = addPerson({
                        name: contact.name,
                        nickname: contact.name.split(' ')[0] || contact.name,
                        relationship: actionRelationship,
                        phone: resolvedPhone,
                        vipId: activeVipId || 'vip_default',
                      });
                      addActivityLog({
                        userId: isVIP ? 'vip' : currentPrivilegedUser?.id || 'staff',
                        userName: isVIP ? 'VIP Principal' : currentPrivilegedUser?.name || 'Staff User',
                        action: `added "${contact.name}" to App Contacts as ${getRelationshipLabel(actionRelationship)}`,
                        entityType: 'person',
                        entityId: created.id,
                        entityName: contact.name,
                      });
                    }

                    setActivePhoneContactAction(null);
                  }}
                >
                  <UserPlus size={15} />
                  <span>Save to App Contact</span>
                </button>
              )}

              {activePhoneContactAction.phone && (
                <a
                  href={`tel:${activePhoneContactAction.phone}`}
                  className="btn btn-ignore w-full flex items-center justify-center gap-2"
                  onClick={() => setActivePhoneContactAction(null)}
                  style={{ textDecoration: 'none' }}
                >
                  <Phone size={15} />
                  <span>Call</span>
                </a>
              )}
            </div>
          </div>
        </div>
      )}

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
                ? 'Update contact details and relationship'
                : 'Add a new member to your contact directory'}
            </p>

            <form onSubmit={handleSaveForm} className="flex flex-col gap-3">
              <div>
                <label className="label" style={{ fontSize: '12px', marginBottom: '4px' }}>Full Name *</label>
                <input
                  className="input"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Enter full name"
                  required
                />
              </div>

              <div>
                <label className="label" style={{ fontSize: '12px', marginBottom: '4px' }}>Relationship *</label>
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
                  placeholder="Enter phone number"
                />
              </div>

              <div>
                <label className="label" style={{ fontSize: '12px', marginBottom: '4px' }}>Description</label>
                <textarea
                  className="textarea"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Enter any notes about the contact"
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
