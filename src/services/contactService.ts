import { permissionService, type PermissionResult } from './permissionService';
import { useAppStore } from '../store/useAppStore';

export interface PhoneContact {
  id: string;
  name: string;
  phone: string;
  phones: string[];
  isVIPRecord?: boolean;
  vipPersonId?: string;
}

/**
 * Normalizes a phone number to its core comparison key.
 * Removes all non-digit characters.
 * For numbers with 10 or more digits, uses the last 10 digits to match across local,
 * country-code prefixed (+91), or spaced variants (e.g. "86758 55272" vs "8675855272").
 */
export function normalizePhoneKey(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return digits || phone.replace(/\s+/g, '');
}

/**
 * Deduplicates an array of phone numbers by normalized key,
 * preserving clean readable formatting while preventing duplicate numbers.
 */
export function deduplicatePhones(phones: (string | undefined | null)[]): string[] {
  const seenKeys = new Set<string>();
  const result: string[] = [];

  for (const raw of phones) {
    if (!raw) continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = normalizePhoneKey(trimmed);
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      result.push(trimmed);
    }
  }

  return result;
}

// Development and web preview fallback contacts matching test requirements
const MOCK_WEB_CONTACTS: PhoneContact[] = [
  { id: 'mock-1', name: 'Arun Kumar', phone: '9876543210', phones: ['9876543210', '9876543299'] },
  { id: 'mock-2', name: 'Aravind', phone: '9876543211', phones: ['9876543211'] },
  { id: 'mock-3', name: 'Anitha', phone: '9876543212', phones: ['9876543212'] },
  { id: 'mock-4', name: 'Bala', phone: '9876543213', phones: ['9876543213'] },
  { id: 'mock-5', name: 'Bharath', phone: '9876543214', phones: ['9876543214'] },
  { id: 'mock-6', name: 'Karthik', phone: '9876543215', phones: ['9876543215'] },
];

let cachedContacts: PhoneContact[] | null = null;
let isLoadingContacts = false;

export const contactService = {
  /**
   * Check whether phone contacts permission is granted.
   */
  async checkPermission(): Promise<PermissionResult> {
    return await permissionService.checkContacts();
  },

  /**
   * Request phone contacts permission.
   */
  async requestPermission(): Promise<PermissionResult> {
    return await permissionService.requestContacts();
  },

  /**
   * Open app settings if permission is permanently denied.
   */
  async openSettings(): Promise<boolean> {
    return await permissionService.openSettings();
  },

  /**
   * Clear the in-memory cache to force a fresh read if necessary.
   */
  clearCache(): void {
    cachedContacts = null;
  },

  /**
   * Reads available phone contacts once into memory.
   * Merges phone contacts with existing VIP directory contacts for active VIP.
   */
  async loadPhoneContacts(forceReload = false): Promise<PhoneContact[]> {
    if (cachedContacts && !forceReload) {
      return cachedContacts;
    }

    if (isLoadingContacts && cachedContacts) {
      return cachedContacts;
    }

    isLoadingContacts = true;

    try {
      const mergedMap = new Map<string, PhoneContact>();

      // 1. Load VIP directory contacts from active store
      try {
        const vipPeople = useAppStore.getState().people || [];
        for (const p of vipPeople) {
          if (!p.name) continue;
          const key = p.name.trim().toLowerCase();
          const phones = p.phone ? deduplicatePhones([p.phone]) : [];
          mergedMap.set(key, {
            id: `vip-${p.id}`,
            name: p.name.trim(),
            phone: phones[0] || '',
            phones,
            isVIPRecord: true,
            vipPersonId: p.id,
          });
        }
      } catch (err) {
        console.warn('[ContactService] Error reading VIP store contacts:', err);
      }

      // 2. Load device phone contacts if native platform
      if (permissionService.isNative()) {
        const rawContacts = await permissionService.getNativeContacts();
        console.log('[ContactService] CONTACT PERMISSION = GRANTED');
        console.log(`[ContactService] NUMBER OF PHONE CONTACTS READ = ${rawContacts.length}`);

        for (const raw of rawContacts) {
          if (!raw.name || !raw.name.trim()) continue;
          const trimmedName = raw.name.trim();
          const key = trimmedName.toLowerCase();

          const existing = mergedMap.get(key);
          const rawPhones = [
            ...(raw.phones || []),
            raw.phone,
          ];
          const phonesList = deduplicatePhones(rawPhones);

          if (existing) {
            existing.phones = deduplicatePhones([...existing.phones, ...phonesList]);
            if (!existing.phone && existing.phones.length > 0) {
              existing.phone = existing.phones[0];
            }
          } else {
            mergedMap.set(key, {
              id: raw.id ? `phone-${raw.id}` : `phone-${Date.now()}-${Math.random()}`,
              name: trimmedName,
              phone: phonesList[0] || '',
              phones: phonesList,
              isVIPRecord: false,
            });
          }
        }
      } else {
        // Desktop / Web preview fallback
        console.log('[ContactService] Web Preview: Using mock phone contacts for testing');
        console.log(`[ContactService] NUMBER OF PHONE CONTACTS READ = ${MOCK_WEB_CONTACTS.length}`);

        for (const mock of MOCK_WEB_CONTACTS) {
          const key = mock.name.toLowerCase();
          if (!mergedMap.has(key)) {
            mergedMap.set(key, { ...mock });
          }
        }
      }

      const contactList = Array.from(mergedMap.values()).sort((a, b) =>
        a.name.localeCompare(b.name)
      );

      cachedContacts = contactList;
      return contactList;
    } catch (e) {
      console.error('[ContactService] Failed to load phone contacts:', e);
      return cachedContacts || [];
    } finally {
      isLoadingContacts = false;
    }
  },

  /**
   * Fast in-memory search with strict prefix matching.
   * Case-insensitive.
   * Matches if contact name starts with query OR any word in name starts with query.
   * Excludes internal substrings (e.g. "Ar" does NOT match "Karthik").
   */
  searchContacts(query: string, contacts: PhoneContact[]): PhoneContact[] {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;

    const results = contacts.filter((contact) => {
      const name = (contact.name || '').trim().toLowerCase();

      // Primary check: contact name starts with query
      if (name.startsWith(q)) return true;

      // Word-level prefix check (e.g. "Kumar" matches "Arun Kumar")
      const words = name.split(/\s+/);
      return words.some((word) => word.startsWith(q));
    });

    console.log(`[ContactService] Search query: "${query}"`);
    console.log(`[ContactService] Matching contacts: ${results.length}`);

    return results;
  },
};
