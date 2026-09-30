import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { Search, Gift, Shield, ArrowLeft } from 'lucide-react';
import { formatDate, formatCurrency, getGiftCategoryLabel, getInitials } from '../utils/formatters';
import GiftBadgeIcon from '../components/GiftBadgeIcon';

export default function GiftHistoryScreen() {
  const navigate = useNavigate();
  const { familyEvents, isVIP, currentPrivilegedUser } = useAppStore();
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const canViewGifts = isVIP || currentPrivilegedUser?.permissions?.canViewGiftHistory !== false;

  // Flatten all gift records
  const allGifts = familyEvents.flatMap((event) =>
    event.guests
      .filter((g) => g.gift)
      .map((g) => ({
        ...g,
        eventName: event.name,
        eventDate: event.date,
      }))
  );

  const filtered = allGifts
    .filter((g) => {
      if (filterCategory !== 'all' && g.giftCategory !== filterCategory) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          g.personName.toLowerCase().includes(q) ||
          (g.gift || '').toLowerCase().includes(q) ||
          g.eventName.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => b.eventDate.localeCompare(a.eventDate));

  const totalValue = filtered.reduce((s, g) => s + (g.estimatedValue || 0), 0);

  const categories = ['all', 'gold', 'silver', 'cash', 'clothing', 'electronics', 'household', 'jewelry', 'other'];

  if (!canViewGifts) {
    return (
      <div className="screen flex flex-col items-center justify-center text-center">
        <div className="empty-state-icon"><Shield size={36} style={{ color: 'var(--color-danger)' }} /></div>
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
      <div className="screen-stationary-header">
        <div className="screen-header">
          <div className="flex items-center gap-3">
            <button className="btn-icon" onClick={() => navigate(-1)} aria-label="Go Back">
              <ArrowLeft size={16} />
            </button>
            <div>
              <h2>Gift Ledger</h2>
              <p className="text-sm text-secondary mt-1">
                {allGifts.length} protocol exchanges recorded · Total: {formatCurrency(totalValue)}
              </p>
            </div>
          </div>
        </div>

        <div className="search-bar" style={{ marginBottom: 'var(--space-3)' }}>
          <Search size={16} className="search-bar-icon" />
          <input placeholder="Search gifts, recipients, or functions..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="overflow-x-auto" style={{ margin: '0 calc(-1 * var(--space-4)) 0', padding: '0 var(--space-4)' }}>
          <div className="tabs" style={{ width: 'max-content' }}>
            {categories.map((cat) => (
              <button
                key={cat}
                className={`tab flex items-center gap-1.5 ${filterCategory === cat ? 'active' : ''}`}
                onClick={() => setFilterCategory(cat)}
              >
                {cat !== 'all' && <GiftBadgeIcon category={cat} size="xs" />}
                <span>{cat === 'all' ? 'All Gifts' : getGiftCategoryLabel(cat as any)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="screen-scroll-body">
        <div className="flex flex-col gap-2">
        {filtered.map((g, i) => (
          <div
            key={i}
            className="glass-card glass-card-interactive animate-slide-up"
            style={{ animationDelay: `${i * 0.04}s` }}
            onClick={() => navigate(`/person/${g.personId}`)}
          >
            <div className="flex items-center gap-3">
              <div className="avatar avatar-sm">{getInitials(g.personName)}</div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-white">{g.personName}</div>
                <div className="flex items-center gap-2 mt-1">
                  <GiftBadgeIcon category={g.giftCategory || 'other'} size="xs" />
                  <span className="text-sm text-gold font-medium">{g.gift}</span>
                </div>
                <div className="text-xs text-muted mt-1">
                  {g.eventName} · {formatDate(g.eventDate)}
                </div>
              </div>
              <div className="text-right">
                {g.estimatedValue && (
                  <div className="badge badge-gold" style={{ fontSize: '10px' }}>{formatCurrency(g.estimatedValue)}</div>
                )}
                {g.giftCategory && (
                  <div className="text-xs text-muted mt-1">{getGiftCategoryLabel(g.giftCategory)}</div>
                )}
              </div>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon"><Gift size={28} /></div>
            <div className="empty-state-title">No Gifts Found</div>
            <div className="empty-state-text">
              {search ? 'No results matching your search.' : 'No gift records in this category.'}
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
