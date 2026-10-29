// Simple ID generator (no external uuid dependency needed)
export function v4Style(): string {
  return 'xxxx-xxxx-xxxx'.replace(/x/g, () =>
    Math.floor(Math.random() * 16).toString(16)
  );
}

export function generateId(prefix: string = ''): string {
  const id = v4Style();
  return prefix ? `${prefix}-${id}` : id;
}

/**
 * Generates a cryptographically strong random token using CSPRNG.
 * Uses globalThis.crypto.getRandomValues when available (browsers, Web Workers, Node.js).
 */
export function generateSecureToken(prefix: string = 'token'): string {
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (c && typeof c.getRandomValues === 'function') {
    const bytes = new Uint8Array(24);
    c.getRandomValues(bytes);
    const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    return `${prefix}_${Date.now()}_${hex}`;
  }
  // Fallback for restricted legacy contexts
  return `${prefix}_${Date.now()}_${v4Style()}_${v4Style()}`;
}
