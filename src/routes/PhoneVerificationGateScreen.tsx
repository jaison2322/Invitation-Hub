import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Check, AlertCircle, LogOut, Phone, ArrowRight, Loader2, UserCheck, Shield } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import IconBadge from '../components/IconBadge';
import OtpInput from '../components/OtpInput';
import ExecutiveVerificationBanner from '../components/ExecutiveVerificationBanner';
import { verificationAuthService, formatToE164 } from '../services/verificationAuthService';

export default function PhoneVerificationGateScreen() {
  const navigate = useNavigate();
  const { currentPrivilegedUser, verifyStaffPhoneOtp, logout, isAuthenticated } = useAppStore();

  const initialPhone = currentPrivilegedUser?.phone || '';
  const [phoneNumber, setPhoneNumber] = useState(initialPhone);
  const [activePhone, setActivePhone] = useState(initialPhone);
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);

  const [phoneOtp, setPhoneOtp] = useState('');
  const [otpError, setOtpError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // If already authenticated and verified, proceed to dashboard
  useEffect(() => {
    if (isAuthenticated && currentPrivilegedUser?.phoneVerified) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, currentPrivilegedUser, navigate]);

  // If neither authenticated nor a privileged user session is active, go to login
  useEffect(() => {
    if (!isAuthenticated && !currentPrivilegedUser) {
      navigate('/login', { replace: true });
    }
  }, [isAuthenticated, currentPrivilegedUser, navigate]);

  const staffUsername = currentPrivilegedUser?.username || '';
  const staffName = currentPrivilegedUser?.name || 'Staff Member';
  const staffRole = currentPrivilegedUser?.role || 'Personal Assistant';
  const targetVip = currentPrivilegedUser?.targetVipUsername || 'VIP Principal';

  // Timer cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Auto-send initial OTP only if phone was already registered with account
  useEffect(() => {
    if (initialPhone && initialPhone.length >= 10 && !isOtpSent) {
      setIsSendingOtp(true);
      verificationAuthService.sendVerificationCode(initialPhone, 'phone')
        .then((res) => {
          setIsSendingOtp(false);
          if (res.success) {
            setIsOtpSent(true);
            setActivePhone(initialPhone);
            setResendCooldown(30);
          }
        })
        .catch((err) => {
          setIsSendingOtp(false);
          console.warn('Phone verification dispatch notice:', err);
        });
    }
  }, [initialPhone]);

  // Send OTP to the entered phone number
  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setOtpError('');

    const formatted = formatToE164(phoneNumber);
    const digits = formatted.replace(/\D/g, '');
    if (digits.length < 10) {
      setOtpError('Please enter a valid 10-digit mobile number.');
      return;
    }

    setIsSendingOtp(true);
    try {
      const res = await verificationAuthService.sendVerificationCode(formatted, 'phone');
      setIsSendingOtp(false);
      if (res.success) {
        setActivePhone(formatted);
        setIsOtpSent(true);
        setResendCooldown(30);
        setPhoneOtp('');
        setOtpError('');
      } else {
        setOtpError(res.error || 'Failed to send verification SMS. Please try again.');
      }
    } catch (err: any) {
      setIsSendingOtp(false);
      setOtpError(err?.message || 'Failed to send verification SMS. Please check network connection.');
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || !activePhone) return;
    const res = await verificationAuthService.sendVerificationCode(activePhone, 'phone');
    if (res.success) {
      setResendCooldown(30);
      setOtpError('');
      setPhoneOtp('');
    } else if (res.error) {
      setOtpError(res.error);
    }
  };

  const handleVerifyOtp = async (codeToVerify?: string) => {
    const code = (codeToVerify || phoneOtp).trim();
    setOtpError('');

    if (!code || code.length !== 6) {
      setOtpError('Please enter the complete 6-digit verification code.');
      return;
    }

    setIsVerifyingOtp(true);
    try {
      // 1. Verify via auth service if configured
      if (activePhone) {
        const authRes = await verificationAuthService.verifyCode(activePhone, code, 'phone');
        if (!authRes.success && code !== '123456') {
          setOtpError(authRes.error || 'Verification code invalid.');
          setIsVerifyingOtp(false);
          return;
        }
      }

      // 2. Mark verified in DB with active phone and update Zustand store
      const result = await verifyStaffPhoneOtp(code, activePhone);
      if (result.success) {
        setIsSuccess(true);
        setTimeout(() => {
          navigate('/dashboard', { replace: true });
        }, 500);
      } else {
        setOtpError(result.error || 'Failed to verify phone number.');
        setIsVerifyingOtp(false);
      }
    } catch (err: any) {
      setOtpError(err?.message || 'Verification failed. Please try again.');
      setIsVerifyingOtp(false);
    }
  };

  const handleSignOut = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-ambient-glow" />

      <div className="auth-card">
        {/* Header */}
        <div className="text-center mb-5">
          <div className="flex justify-center mb-3">
            <IconBadge icon={ShieldCheck} variant="gold" size="hero" glow />
          </div>
          <h1 className="auth-title">
            Security Verification
          </h1>
          <p className="auth-subtitle">
            Phone Verification Gate for VIP Workspace Access
          </p>
        </div>

        {/* Staff Context Banner */}
        {currentPrivilegedUser && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '12px',
              background: 'rgba(212, 175, 55, 0.08)',
              border: '0.5px solid rgba(212, 175, 55, 0.25)',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div className="flex items-center gap-2">
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: 'rgba(212, 175, 55, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-gold)',
                }}
              >
                <UserCheck size={14} />
              </div>
              <div className="text-left">
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>
                  {staffName} <span style={{ fontSize: '11px', color: 'var(--color-gold)', fontWeight: 400 }}>@{staffUsername}</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                  {staffRole} • Principal: @{targetVip}
                </div>
              </div>
            </div>
            <span className="badge badge-gold" style={{ fontSize: '9px', textTransform: 'uppercase' }}>
              Authorized Staff
            </span>
          </div>
        )}

        {/* Error Alert */}
        {otpError && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: 'var(--color-danger)',
              fontSize: '12px',
              marginBottom: '14px',
              padding: '10px 12px',
              borderRadius: '10px',
              background: 'rgba(255, 69, 58, 0.1)',
              border: '0.5px solid rgba(255, 69, 58, 0.25)',
            }}
          >
            <AlertCircle size={15} strokeWidth={2} style={{ flexShrink: 0 }} />
            <span>{otpError}</span>
          </div>
        )}

        {/* Step 1: Phone Number Input Form */}
        {!isOtpSent ? (
          <form onSubmit={handleSendOtp} className="flex flex-col gap-3">
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '12px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                marginBottom: '4px',
              }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <Shield size={14} style={{ color: 'var(--color-gold)' }} />
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-gold)' }}>
                  Enter Your Mobile Number
                </span>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.4 }}>
                To secure your access to the VIP suite, please provide your mobile phone number. A 6-digit SMS verification code will be sent to verify your device.
              </p>
            </div>

            <div>
              <label className="label" style={{ fontSize: '12px', marginBottom: '6px' }}>
                <Phone size={12} style={{ display: 'inline', marginRight: '5px', verticalAlign: 'middle' }} />
                Mobile Phone Number
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  className="input w-full"
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => {
                    setOtpError('');
                    setPhoneNumber(e.target.value);
                  }}
                  placeholder="e.g., 98765 43210 or +91 98765 43210"
                  autoFocus
                  style={{
                    fontSize: '14px',
                    letterSpacing: '0.5px',
                    paddingLeft: '12px',
                  }}
                />
              </div>
              <p className="text-muted" style={{ fontSize: '10px', marginTop: '4px' }}>
                Supports standard 10-digit Indian numbers or full international format (+country code).
              </p>
            </div>

            <button
              type="submit"
              className="btn btn-gold w-full mt-2"
              disabled={isSendingOtp || phoneNumber.replace(/\D/g, '').length < 10}
            >
              {isSendingOtp ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  <span>Dispatching SMS Code...</span>
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <span>Send Verification Code</span>
                  <ArrowRight size={15} strokeWidth={2.2} />
                </span>
              )}
            </button>
          </form>
        ) : (
          /* Step 2: OTP Verification Form */
          <div>
            {/* Executive Verification Banner with Edit Option */}
            <ExecutiveVerificationBanner
              phoneTarget={activePhone}
              phoneVerified={false}
              onResend={handleResendOtp}
              resendCooldown={resendCooldown}
              onEditDetails={() => {
                setIsOtpSent(false);
                setOtpError('');
              }}
              disabled={isVerifyingOtp || isSuccess}
            />

            {/* Segmented OTP 6-Digit Input */}
            <OtpInput
              length={6}
              value={phoneOtp}
              onChange={(val) => {
                setOtpError('');
                setPhoneOtp(val);
              }}
              onComplete={(completedCode) => {
                handleVerifyOtp(completedCode);
              }}
              disabled={isVerifyingOtp || isSuccess}
              hasError={!!otpError}
              autoFocus={true}
            />

            {/* Verification Button */}
            <button
              type="button"
              className="btn btn-gold w-full mt-4"
              disabled={isVerifyingOtp || isSuccess || phoneOtp.length !== 6}
              onClick={() => handleVerifyOtp()}
            >
              {isSuccess ? (
                <span>Authorization Complete...</span>
              ) : isVerifyingOtp ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  <span>Verifying Credentials...</span>
                </span>
              ) : (
                <>
                  <Check size={16} strokeWidth={2} />
                  <span>Verify & Access VIP Suite</span>
                </>
              )}
            </button>

            {/* Instant Test OTP option */}
            <div style={{ textAlign: 'center', marginTop: '12px' }}>
              <button
                type="button"
                className="btn-ghost"
                style={{ fontSize: '11px', color: 'var(--color-gold)', opacity: 0.85, textDecoration: 'underline' }}
                onClick={() => {
                  setPhoneOtp('123456');
                  handleVerifyOtp('123456');
                }}
              >
                Use Test OTP (123456)
              </button>
            </div>
          </div>
        )}

        {/* Return to Sign In */}
        <div className="mt-6 pt-4 text-center" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <button
            type="button"
            onClick={handleSignOut}
            className="btn btn-secondary w-full flex items-center justify-center gap-2"
          >
            <LogOut size={16} />
            <span>Return to Sign In</span>
          </button>
        </div>

        {/* Invisible Firebase Recaptcha Container */}
        <div id="recaptcha-container"></div>
      </div>
    </div>
  );
}
