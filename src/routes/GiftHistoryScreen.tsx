import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import {
  Search,
  Gift,
  Shield,
  ArrowLeft,
  Plus,
  Calendar,
  MapPin,
  User,
  Edit3,
  Trash2,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import {
  formatDate,
  formatCurrency,
  getInitials,
} from '../utils/formatters';
import type { GiftCategory, GiftRecord } from '../types';

export default function GiftHistoryScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as { tab?: 'received' | 'given'; openAdd?: boolean } | null;

  const {
    familyEvents,
    giftRecords,
    isVIP,
    currentPrivilegedUser,
    removeGiftRecord,
  } = useAppStore();

  // Mode Selection: 'received' (Default) vs 'given'
  const [activeTab, setActiveTab] = useState<'received' | 'given'>(
    locationState?.tab === 'given' ? 'given' : 'received'
  );
  const [search, setSearch] = useState('');

  // Sync if navigation state changes
  useEffect(() => {
    if (locationState?.tab) {
      setActiveTab(locationState.tab);
    }
    if (locationState?.openAdd) {
      navigate('/record-gift', { replace: true });
    }
  }, [locationState, navigate]);

  // Permission checks
  const canViewGifts =
    isVIP || currentPrivilegedUser?.permissions?.canViewGiftHistory !== false;
  const canManageGifts =
    isVIP ||
    currentPrivilegedUser?.permissions?.canEditEvents !== false ||
    currentPrivilegedUser?.permissions?.canViewGiftHistory !== false;

  // ── 1. Flatten all Gift Received records ────────────────────────────────────
  const receivedGifts = useMemo(() => {
    // A. From past family events (guests who brought gifts)
    const fromFamilyEvents = familyEvents.flatMap((event) =>
      event.guests
        .filter((g) => g.gift)
        .map((g) => ({
          id: g.id,
          personId: g.personId,
          personName: g.personName,
          gift: g.gift as string,
          giftCategory: g.giftCategory || 'other',
          estimatedValue: g.estimatedValue,
          notes: g.notes,
          eventName: event.name,
          eventDate: event.date,
          direction: 'received' as const,
        }))
    );

    // B. From dedicated gift_records if any marked as received
    const fromGiftRecords = giftRecords
      .filter((gr) => gr.direction === 'received')
      .map((gr) => ({
        id: gr.id,
        personId: gr.recipientPersonId,
        personName: gr.recipientName || 'Guest',
        gift: gr.giftName,
        giftCategory: gr.giftCategory || 'other',
        estimatedValue: gr.estimatedValue,
        notes: gr.notes,
        eventName: gr.eventTitle,
        eventDate: gr.eventDate,
        direction: 'received' as const,
      }));

    return [...fromFamilyEvents, ...fromGiftRecords];
  }, [familyEvents, giftRecords]);

  // ── 2. Gift Given records ───────────────────────────────────────────────────
  const givenGifts = useMemo(() => {
    return giftRecords.filter((gr) => gr.direction === 'given');
  }, [giftRecords]);

  // ── 3. Apply Search Filter ─────────────────────────────────────────────────
  const filteredReceived = useMemo(() => {
    return receivedGifts
      .filter((g) => {
        if (search) {
          const q = search.trim().toLowerCase();
          const person = (g.personName || '').toLowerCase();
          const giftName = (g.gift || '').toLowerCase();
          const event = (g.eventName || '').toLowerCase();
          return person.includes(q) || giftName.includes(q) || event.includes(q);
        }
        return true;
      })
      .sort((a, b) => b.eventDate.localeCompare(a.eventDate));
  }, [receivedGifts, search]);

  const filteredGiven = useMemo(() => {
    return givenGifts
      .filter((g) => {
        if (search) {
          const q = search.trim().toLowerCase();
          const giftName = (g.giftName || '').toLowerCase();
          const recipient = (g.recipientName || '').toLowerCase();
          const event = (g.eventTitle || '').toLowerCase();
          return giftName.includes(q) || recipient.includes(q) || event.includes(q);
        }
        return true;
      })
      .sort((a, b) => b.eventDate.localeCompare(a.eventDate));
  }, [givenGifts, search]);

  // ── Event Selection Handler ─────────────────────────────────────────────────
  const handleEditGivenGift = (gr: GiftRecord) => {
    navigate('/record-gift', { state: { giftRecord: gr } });
  };

  const handleDeleteGivenGift = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this gift record?')) {
      await removeGiftRecord(id);
    }
  };

  if (!canViewGifts) {
    return (
      <div className="screen flex flex-col items-center justify-center text-center">
        <div className="empty-state-icon">
          <Shield size={36} style={{ color: 'var(--color-danger)' }} />
        </div>
        <div className="empty-state-title">Access Restricted</div>
        <div className="empty-state-text">
          You do not have permission to view the gift ledger.
        </div>
        <button className="btn btn-gold mt-4" onClick={() => navigate('/dashboard')}>
          Return to Home
        </button>
      </div>
    );
  }

  return (
    <div className="screen">
      {/* ── Stationary Header & Controls ────────────────────────────────────── */}
      <div className="screen-stationary-header" style={{ paddingBottom: '12px' }}>
        {/* Top Header Row with Back Button, Prominent Title & "+" Record Gift Button */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <button className="btn-icon" onClick={() => navigate(-1)} aria-label="Go Back">
              <ArrowLeft size={18} />
            </button>
            <h1
              className="font-heading font-bold text-white tracking-tight leading-tight"
              style={{ fontSize: '22px', margin: 0 }}
            >
              Gift History
            </h1>
          </div>

          {/* Prominent "+" Add Button visible for authorized users across both tabs */}
          {canManageGifts && (
            <button
              type="button"
              className="btn btn-sm btn-gold flex items-center gap-1.5 shadow-md animate-scale-in"
              onClick={() => navigate('/record-gift', { state: { tab: activeTab, defaultDirection: activeTab } })}
              aria-label={activeTab === 'received' ? 'Record Gift Received' : 'Record Gift Given'}
              title={activeTab === 'received' ? 'Record Gift Received' : 'Record Gift Given'}
            >
              <Plus size={15} strokeWidth={2.4} />
              <span>Record Gift</span>
            </button>
          )}
        </div>

        {/* ── Segmented Control: Gift Received vs Gift Given ─────────────────── */}
        <div className="segmented-control mb-3">
          <button
            type="button"
            className={`segmented-item ${activeTab === 'received' ? 'active' : ''}`}
            onClick={() => setActiveTab('received')}
            style={{ fontWeight: 600, padding: '7px 12px', fontSize: '13px' }}
          >
            Gift Received
          </button>
          <button
            type="button"
            className={`segmented-item ${activeTab === 'given' ? 'active' : ''}`}
            onClick={() => setActiveTab('given')}
            style={{ fontWeight: 600, padding: '7px 12px', fontSize: '13px' }}
          >
            Gift Given
          </button>
        </div>
      </div>

      {/* ── Scrollable Body with Search Bar & Gift Ledgers ───────────────────── */}
      <div className="screen-scroll-body" style={{ paddingTop: '12px' }}>
        {/* Search Bar placed inside scrollable body so it scrolls with the page */}
        <div className="search-bar" style={{ marginBottom: 'var(--space-3)' }}>
          <Search size={16} className="search-bar-icon" />
          <input
            placeholder={
              activeTab === 'received'
                ? 'Search gifts such as gold, silver, etc...'
                : 'Search given gifts, recipient, or function...'
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* ══════════════════════════════════════════════════════════════════════ */}
        {/* TAB 1: GIFT RECEIVED                                                 */}
        {/* ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'received' && (
          <div className="flex flex-col gap-2">
            {filteredReceived.map((g, i) => (
              <div
                key={g.id || i}
                className="glass-card glass-card-interactive animate-slide-up"
                style={{ animationDelay: `${i * 0.03}s` }}
                onClick={() => {
                  if (g.personId) navigate(`/person/${g.personId}`);
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="avatar avatar-sm">{getInitials(g.personName)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white truncate">{g.personName}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <Gift size={14} className="text-gold flex-shrink-0" />
                      <span className="text-sm text-gold font-medium truncate">{g.gift}</span>
                    </div>
                    <div className="text-xs text-muted mt-1 truncate">
                      {g.eventName} · {formatDate(g.eventDate)}
                    </div>
                    {g.notes && (
                      <div className="text-xs text-slate-400 mt-1 line-clamp-1 italic">
                        "{g.notes}"
                      </div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    {g.estimatedValue !== undefined && g.estimatedValue > 0 && (
                      <div className="badge badge-gold" style={{ fontSize: '10px' }}>
                        {formatCurrency(g.estimatedValue)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {filteredReceived.length === 0 && (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <Gift size={28} />
                </div>
                <div className="empty-state-title">No Received Gifts Found</div>
                <div className="empty-state-text">
                  {search
                    ? 'No results matching your search query.'
                    : 'No gift records found.'}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════ */}
        {/* TAB 2: GIFT GIVEN                                                    */}
        {/* ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'given' && (
          <div className="flex flex-col gap-2">
            {filteredGiven.map((g, i) => (
              <div
                key={g.id}
                className="glass-card animate-slide-up"
                style={{ animationDelay: `${i * 0.03}s` }}
              >
                <div className="flex items-start gap-3">
                  {/* Avatar / Recipient Initials */}
                  <div className="avatar avatar-sm flex-shrink-0 mt-0.5">
                    {getInitials(g.recipientName || g.eventTitle)}
                  </div>

                  {/* Main Gift Details */}
                  <div className="flex-1 min-w-0">
                    {/* Top Row: Gift Name */}
                    <div className="flex items-center gap-2">
                      <Gift size={14} className="text-gold flex-shrink-0" />
                      <span className="text-sm font-semibold text-white truncate">
                        {g.giftName}
                      </span>
                    </div>

                    {/* Recipient line */}
                    {g.recipientName && (
                      <div className="text-xs text-slate-300 mt-1 flex items-center gap-1.5 truncate">
                        <User size={12} className="text-gold flex-shrink-0" />
                        <span>Given to: <strong>{g.recipientName}</strong></span>
                      </div>
                    )}

                    {/* Visually Distinct Event Association Banner */}
                    <div
                      className="mt-2 p-2 rounded border border-glass-border flex items-center justify-between gap-2"
                      style={{ background: 'rgba(255, 255, 255, 0.02)' }}
                      onClick={() => {
                        if (g.eventId) navigate(`/event/${g.eventId}`);
                      }}
                      role="button"
                      title="View Event Details"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-gold truncate">
                          {g.eventTitle}
                        </div>
                        <div className="text-xs text-muted flex items-center gap-2 mt-0.5">
                          <span className="flex items-center gap-1">
                            <Calendar size={11} /> {formatDate(g.eventDate)}
                          </span>
                          {g.eventVenue && (
                            <span className="truncate flex items-center gap-1">
                              · <MapPin size={11} /> {g.eventVenue}
                            </span>
                          )}
                        </div>
                      </div>
                      <ExternalLink size={13} className="text-muted flex-shrink-0" />
                    </div>

                    {/* Notes if available */}
                    {g.notes && (
                      <div className="text-xs text-slate-400 mt-1.5 italic line-clamp-2">
                        "{g.notes}"
                      </div>
                    )}
                  </div>

                  {/* Right Column: Value & Actions */}
                  <div className="text-right flex flex-col items-end flex-shrink-0">
                    {g.estimatedValue !== undefined && g.estimatedValue > 0 && (
                      <div className="badge badge-gold" style={{ fontSize: '10px' }}>
                        {formatCurrency(g.estimatedValue)}
                      </div>
                    )}

                    {/* Edit / Delete actions for authorized users */}
                    {canManageGifts && (
                      <div className="flex items-center gap-1 mt-2">
                        <button
                          type="button"
                          className="btn-icon btn-icon-xs"
                          onClick={() => handleEditGivenGift(g)}
                          title="Edit Gift Record"
                          aria-label="Edit Gift"
                        >
                          <Edit3 size={13} />
                        </button>
                        <button
                          type="button"
                          className="btn-icon btn-icon-xs text-red-400 hover:text-red-300"
                          onClick={() => handleDeleteGivenGift(g.id)}
                          title="Delete Gift Record"
                          aria-label="Delete Gift"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {filteredGiven.length === 0 && (
              <div className="empty-state py-8">
                <div className="empty-state-icon">
                  <Gift size={28} />
                </div>
                <div className="empty-state-title">No Given Gifts Found</div>
                <div className="empty-state-text max-w-xs mx-auto">
                  {search
                    ? 'No given gift records match your search.'
                    : 'You have not recorded any gifts given for functions or events yet.'}
                </div>
                {canManageGifts && (
                  <button
                    type="button"
                    className="btn btn-gold mt-4 inline-flex items-center gap-1.5"
                    onClick={() => navigate('/record-gift')}
                  >
                    <Plus size={15} strokeWidth={2.4} />
                    <span>Record First Gift</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
