import { createClient } from '@supabase/supabase-js';

const envSupabaseUrl = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_SUPABASE_URL : undefined;
const envSupabaseKey = typeof import.meta !== 'undefined'
  ? (import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env?.VITE_SUPABASE_ANON_KEY)
  : undefined;

if (!envSupabaseUrl && typeof console !== 'undefined') {
  console.warn('[Supabase Config Warning] VITE_SUPABASE_URL is not configured in environment. Using default endpoint.');
}

const supabaseUrl = envSupabaseUrl || 'https://lliowikzustvebudgsoy.supabase.co';
const supabaseAnonKey = envSupabaseKey || 'sb_publishable_HOmmQBn10vwi0eehQDX5gg_3aRXTUTH';

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

// Custom fetch wrapper that automatically injects tenant isolation headers and enforces a safety timeout (25s)
const authenticatedFetch: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  if (activeVipId) {
    headers.set('x-vip-id', activeVipId);
  }
  if (activeAuthToken) {
    headers.set('x-user-token', activeAuthToken);
  }

  // Default network timeout to prevent infinite socket hanging on poor mobile connections
  let signal = init?.signal;
  if (!signal && typeof AbortSignal !== 'undefined' && typeof (AbortSignal as any).timeout === 'function') {
    try {
      signal = (AbortSignal as any).timeout(25000);
    } catch {
      // Fallback if environment restricts timeout constructor
    }
  }

  return fetch(input, { ...init, headers, signal: signal || init?.signal });
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: authenticatedFetch,
  },
});
