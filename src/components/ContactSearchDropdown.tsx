import { useState, useEffect, useRef } from 'react';
import { User, Phone, Check, AlertCircle, X } from 'lucide-react';
import { contactService, type PhoneContact, deduplicatePhones } from '../services/contactService';
import type { PermissionResult } from '../services/permissionService';

interface ContactSearchDropdownProps {
  query: string;
  isOpen: boolean;
  onSelect: (contact: PhoneContact, selectedPhone: string) => void;
  onClose: () => void;
  inputRef?: React.RefObject<HTMLElement | null>;
}

export default function ContactSearchDropdown({
  query,
  isOpen,
  onSelect,
  onClose,
  inputRef,
}: ContactSearchDropdownProps) {
  const [contacts, setContacts] = useState<PhoneContact[]>([]);
  const [permission, setPermission] = useState<PermissionResult>({ granted: true, status: 'granted', canAskAgain: true });
  const [hasPromptedPermission, setHasPromptedPermission] = useState(false);
  const [multiPhoneContact, setMultiPhoneContact] = useState<PhoneContact | null>(null);
  const [selectedPhoneOption, setSelectedPhoneOption] = useState<string>('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Initialize and load contacts
  useEffect(() => {
    let isMounted = true;

    async function init() {
      const perm = await contactService.checkPermission();
      if (!isMounted) return;
      setPermission(perm);

      if (perm.granted) {
        const loaded = await contactService.loadPhoneContacts();
        if (isMounted) setContacts(loaded);
      }
    }

    init();

    return () => {
      isMounted = false;
    };
  }, []);

  // Reload contacts on open if permission is granted to ensure fresh directory data
  useEffect(() => {
    if (isOpen && permission.granted) {
      contactService.loadPhoneContacts().then((loaded) => {
        setContacts(loaded);
      });
    }
  }, [isOpen, permission.granted]);

  // Request permission automatically upon typing first character if not granted
  useEffect(() => {
    if (query.trim().length > 0 && !permission.granted && !hasPromptedPermission) {
      setHasPromptedPermission(true);
      contactService.requestPermission().then((res) => {
        setPermission(res);
        if (res.granted) {
          contactService.loadPhoneContacts().then(setContacts);
        }
      });
    }
  }, [query, permission.granted, hasPromptedPermission]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      // Don't close if multi-number modal is open
      if (multiPhoneContact) return;

      // Don't close if click is on the input field
      if (inputRef?.current && inputRef.current.contains(e.target as Node)) {
        return;
      }

      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose, multiPhoneContact, inputRef]);

  const handleGrantPermission = async () => {
    const res = await contactService.requestPermission();
    setPermission(res);
    if (res.granted) {
      const loaded = await contactService.loadPhoneContacts(true);
      setContacts(loaded);
    } else if (!res.canAskAgain) {
      await contactService.openSettings();
    }
  };

  const handleContactClick = (contact: PhoneContact) => {
    const allPhones = contact.phones && contact.phones.length > 0
      ? contact.phones
      : contact.phone
      ? [contact.phone]
      : [];
    const uniquePhones = deduplicatePhones(allPhones);

    if (uniquePhones.length > 1) {
      setMultiPhoneContact({
        ...contact,
        phones: uniquePhones,
      });
      setSelectedPhoneOption(uniquePhones[0]);
    } else {
      onSelect(contact, uniquePhones[0] || contact.phone || '');
      onClose();
    }
  };

  const handleConfirmMultiPhone = () => {
    if (multiPhoneContact) {
      onSelect(multiPhoneContact, selectedPhoneOption || multiPhoneContact.phone);
      setMultiPhoneContact(null);
      onClose();
    }
  };

  if (!isOpen || !query.trim()) {
    return null;
  }

  const results = contactService.searchContacts(query, contacts);

  return (
    <>
      <div
        ref={dropdownRef}
        style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          right: 0,
          zIndex: 60,
          background: 'var(--color-bg-card, #1c1c1e)',
          border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.15))',
          borderRadius: 'var(--radius-lg, 12px)',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.55), 0 2px 6px rgba(0, 0, 0, 0.3)',
          maxHeight: '260px',
          overflowY: 'auto',
          backdropFilter: 'blur(20px)',
        }}
      >
        {/* Permission Denied Notice Header */}
        {!permission.granted && (
          <div
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid var(--glass-border, rgba(255, 255, 255, 0.1))',
              background: 'rgba(245, 158, 11, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--color-warning, #f59e0b)' }}>
              <AlertCircle size={14} style={{ flexShrink: 0 }} />
              <span>Contacts permission needed to search phone contacts</span>
            </div>
            <button
              type="button"
              onClick={handleGrantPermission}
              style={{
                fontSize: '11px',
                fontWeight: 600,
                background: 'var(--color-gold, #0a84ff)',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                padding: '3px 8px',
                cursor: 'pointer',
              }}
            >
              Grant
            </button>
          </div>
        )}

        {/* Search Results List */}
        {results.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {results.map((c) => {
              const hasMultiple = c.phones && c.phones.length > 1;
              return (
                <div
                  key={c.id}
                  onClick={() => handleContactClick(c)}
                  style={{
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    borderBottom: '0.5px solid rgba(255, 255, 255, 0.06)',
                    transition: 'background 150ms ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: 'rgba(255, 255, 255, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--color-text-primary, #ffffff)',
                        fontWeight: 600,
                        fontSize: '13px',
                        flexShrink: 0,
                      }}
                    >
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: '13px',
                          fontWeight: 600,
                          color: 'var(--color-text-primary, #ffffff)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <span className="truncate">{c.name}</span>
                        {c.isVIPRecord && (
                          <span
                            style={{
                              fontSize: '9px',
                              padding: '1px 5px',
                              borderRadius: '4px',
                              background: 'rgba(10, 132, 255, 0.15)',
                              color: 'var(--color-accent, #0a84ff)',
                              border: '0.5px solid rgba(10, 132, 255, 0.3)',
                              fontWeight: 500,
                            }}
                          >
                            VIP Ledger
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: '11px',
                          color: 'var(--color-text-secondary, #98989d)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          marginTop: '1px',
                        }}
                      >
                        <Phone size={10} style={{ opacity: 0.7 }} />
                        <span className="truncate">{c.phone || (hasMultiple ? `${c.phones.length} numbers available` : 'No phone')}</span>
                      </div>
                    </div>
                  </div>

                  {hasMultiple && (
                    <span
                      style={{
                        fontSize: '10px',
                        color: 'var(--color-text-muted, #8e8e93)',
                        background: 'rgba(255, 255, 255, 0.06)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        marginLeft: '8px',
                        flexShrink: 0,
                      }}
                    >
                      {c.phones.length} numbers
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div
            style={{
              padding: '16px 14px',
              textAlign: 'center',
              fontSize: '12px',
              color: 'var(--color-text-secondary, #98989d)',
            }}
          >
            <User size={18} style={{ margin: '0 auto 6px', opacity: 0.5, display: 'block' }} />
            <span>No contacts found matching &ldquo;{query}&rdquo;</span>
          </div>
        )}
      </div>

      {/* Multi-phone selection modal */}
      {multiPhoneContact && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={() => setMultiPhoneContact(null)}
        >
          <div
            style={{
              background: 'var(--color-bg-card, #1c1c1e)',
              border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.15))',
              borderRadius: 'var(--radius-xl, 16px)',
              padding: '20px',
              width: '100%',
              maxWidth: '380px',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text-primary, #ffffff)', margin: 0 }}>
                  Select Phone Number
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--color-text-secondary, #98989d)', margin: '2px 0 0' }}>
                  for {multiPhoneContact.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMultiPhoneContact(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-secondary, #98989d)',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '18px' }}>
              {multiPhoneContact.phones.map((phone, idx) => (
                <div
                  key={phone + idx}
                  onClick={() => setSelectedPhoneOption(phone)}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md, 10px)',
                    border: selectedPhoneOption === phone
                      ? '1px solid var(--color-gold, #0a84ff)'
                      : '1px solid rgba(255, 255, 255, 0.1)',
                    background: selectedPhoneOption === phone
                      ? 'rgba(10, 132, 255, 0.12)'
                      : 'rgba(255, 255, 255, 0.03)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Phone size={14} style={{ color: selectedPhoneOption === phone ? 'var(--color-gold, #0a84ff)' : 'inherit' }} />
                    <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary, #ffffff)' }}>
                      {phone}
                    </span>
                  </div>
                  {selectedPhoneOption === phone && (
                    <Check size={16} style={{ color: 'var(--color-gold, #0a84ff)' }} />
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-outline flex-1"
                onClick={() => setMultiPhoneContact(null)}
                style={{ padding: '10px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-gold flex-1"
                onClick={handleConfirmMultiPhone}
                style={{ padding: '10px' }}
              >
                Use Number
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
