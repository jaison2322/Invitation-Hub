import React from 'react';
import { Phone, CheckCircle2, RefreshCw, Edit3, ShieldCheck } from 'lucide-react';
import { verificationAuthService } from '../services/verificationAuthService';

interface ExecutiveVerificationBannerProps {
  phoneTarget: string;
  phoneVerified: boolean;
  onResend: () => void;
  resendCooldown: number;
  onEditDetails?: () => void;
  disabled?: boolean;
}

export default function ExecutiveVerificationBanner({
  phoneTarget,
  phoneVerified,
  onResend,
  resendCooldown,
  onEditDetails,
  disabled = false,
}: ExecutiveVerificationBannerProps) {
  const maskedTarget = verificationAuthService.maskTarget(phoneTarget, 'phone');

  return (
    <div className="verification-banner-root">
      {/* ── Channel Status Card ── */}
      <div className="verification-channel-grid" style={{ gridTemplateColumns: '1fr' }}>
        <div
          className={`verification-channel-pill active ${phoneVerified ? 'verified' : ''}`}
          style={{ cursor: 'default' }}
        >
          <div className="flex items-center gap-2">
            <div className="channel-icon-wrap">
              <Phone size={14} strokeWidth={2.2} />
            </div>
            <div className="text-left">
              <div className="channel-label">Mobile Phone</div>
              <div className="channel-target">{maskedTarget}</div>
            </div>
          </div>
          {phoneVerified ? (
            <div className="channel-status-badge verified">
              <CheckCircle2 size={13} strokeWidth={2.5} />
              <span>Verified</span>
            </div>
          ) : (
            <div className="channel-status-badge pending">
              <span>Required</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Channel Info Header ── */}
      <div className="verification-prompt-box">
        <div className="verification-shield-badge">
          <ShieldCheck size={20} className="text-gold" strokeWidth={2.2} />
        </div>
        <div className="flex items-center justify-center gap-1.5 mb-1">
          <span className="supabase-verified-tag">
            <ShieldCheck size={11} className="text-emerald" />
            <span>Secure SMS Verification</span>
          </span>
        </div>
        <h3 className="verification-channel-title">
          Verify Phone Number
        </h3>
        <p className="verification-channel-desc">
          A 6-digit SMS verification code has been dispatched to{' '}
          <span className="text-highlight">{maskedTarget}</span>. Check your mobile messages and enter the code below.
        </p>
      </div>

      {/* ── Resend & Edit Actions ── */}
      <div className="verification-actions-bar">
        <button
          type="button"
          onClick={onResend}
          disabled={resendCooldown > 0 || disabled}
          className="btn-resend-otp"
        >
          <RefreshCw
            size={12}
            strokeWidth={2}
            className={resendCooldown > 0 ? 'animate-spin-slow' : ''}
          />
          {resendCooldown > 0 ? (
            <span>Resend SMS in {resendCooldown}s</span>
          ) : (
            <span>Resend SMS Code</span>
          )}
        </button>

        {onEditDetails && (
          <>
            <span className="dot-divider">•</span>
            <button
              type="button"
              onClick={onEditDetails}
              className="btn-edit-contact"
              disabled={disabled}
            >
              <Edit3 size={12} strokeWidth={2} />
              <span>Edit Mobile Number</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
