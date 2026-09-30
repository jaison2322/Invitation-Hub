import type { VerificationChannel, VerificationSession } from '../types';

/**
 * Format phone string to strict E.164 format (+[country_code][number])
 */
export function formatToE164(phone: string): string {
  const trimmed = phone.trim();
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) {
    return `+${digitsOnly}`;
  }
  // Default to +91 if 10-digit Indian standard, or prepend +
  if (digitsOnly.length === 10) {
    return `+91${digitsOnly}`;
  }
  return `+${digitsOnly}`;
}

/**
 * Standardize target key
 */
function normalizeTarget(target: string): string {
  return target.trim().toLowerCase();
}

/**
 * Verification service stub (Phone OTP verification has been completely removed).
 * Methods return immediate success and do not initiate any SMS or OTP prompts.
 */
export const verificationAuthService = {
  /**
   * No-op send: OTP verification is disabled across the application.
   */
  async sendVerificationCode(
    target: string,
    channel: VerificationChannel
  ): Promise<{
    success: boolean;
    session?: VerificationSession;
    error?: string;
    cooldownSeconds?: number;
  }> {
    return {
      success: true,
      session: {
        target: target.trim(),
        channel,
        code: '',
        expiresAt: Date.now() + 600000,
        attemptsLeft: 5,
        verified: true,
        lastSentAt: Date.now(),
      },
    };
  },

  /**
   * No-op verify: All verification requests succeed immediately.
   */
  async verifyCode(
    _target: string,
    _code: string,
    _channel: VerificationChannel
  ): Promise<{ success: boolean; error?: string; verifiedViaSupabase?: boolean; supabaseUserId?: string }> {
    return {
      success: true,
      verifiedViaSupabase: true,
    };
  },

  /**
   * Check if a target has been verified (always true since OTP is disabled)
   */
  isVerified(_target: string, _channel: VerificationChannel): boolean {
    return true;
  },

  /**
   * Get active session for target
   */
  getSession(_target: string, _channel: VerificationChannel): VerificationSession | undefined {
    return undefined;
  },

  /**
   * Clear session
   */
  clearSession(_target: string, _channel: VerificationChannel): void {},

  /**
   * Executive string masking for privacy and aesthetics
   */
  maskTarget(target: string, channel: VerificationChannel): string {
    const clean = target.trim();
    if (channel === 'phone') {
      if (clean.length < 5) return clean;
      const visibleStart = clean.slice(0, 3);
      const visibleEnd = clean.slice(-3);
      return `${visibleStart} •••• ••${visibleEnd}`;
    } else {
      const parts = clean.split('@');
      if (parts.length !== 2) return clean;
      const [user, domain] = parts;
      if (user.length <= 2) {
        return `${user.charAt(0)}•@${domain}`;
      }
      const maskedUser = `${user.slice(0, 2)}${'•'.repeat(Math.min(user.length - 2, 5))}`;
      return `${maskedUser}@${domain}`;
    }
  },
};
