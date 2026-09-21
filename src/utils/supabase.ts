import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
  'https://lliowikzustvebudgsoy.supabase.co';

const supabaseAnonKey =
  (typeof import.meta !== 'undefined' &&
    (import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY ||
      import.meta.env?.VITE_SUPABASE_ANON_KEY)) ||
  'sb_publishable_HOmmQBn10vwi0eehQDX5gg_3aRXTUTH';

let activeVipId: string | null = null;
let activeAuthToken: string | null = null;

export function setSupabaseAuthSession(vipId: string | null, authToken?: string | null): void {
  activeVipId = vipId || null;
  activeAuthToken = authToken || null;
}

export function clearSupabaseAuthSession(): void {
  activeVipId = null;
  activeAuthToken = null;
}

export function getActiveSessionVipId(): string | null {
  return activeVipId;
}

export function getActiveSessionAuthToken(): string | null {
  return activeAuthToken;
}

// Custom fetch wrapper that automatically injects tenant isolation headers for Supabase PostgREST RLS
const authenticatedFetch: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  if (activeVipId) {
    headers.set('x-vip-id', activeVipId);
  }
  if (activeAuthToken) {
    headers.set('x-user-token', activeAuthToken);
  }
  return fetch(input, { ...init, headers });
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: authenticatedFetch,
  },
});
