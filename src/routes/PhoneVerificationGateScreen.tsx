import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Check, AlertCircle, LogOut } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import IconBadge from '../components/IconBadge';
import OtpInput from '../components/OtpInput';
import ExecutiveVerificationBanner from '../components/ExecutiveVerificationBanner';
import { verificationAuthService } from '../services/verificationAuthService';

export default function PhoneVerificationGateScreen() {
  const navigate = useNavigate();
  const { currentPrivilegedUser, verifyStaffPhoneOtp, logout, isAuthenticated } = useAppStore();

  const [phoneOtp, setPhoneOtp] = useState('');
  const [otpError, setOtpError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(30);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // If already authenticated and verified, proceed to dashboard
  useEffect(() => {
    if (isAuthenticated && currentPrivilegedUser?.phoneVerified) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, currentPrivilegedUser, navigate]);

  const staffPhone = currentPrivilegedUser?.phone || '';
  const staffUsername = currentPrivilegedUser?.username || '';
  const targetVip = currentPrivilegedUser?.targetVipUsername || 'VIP Principal';

  // Timer cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Send initial OTP upon opening gate
  useEffect(() => {
    if (staffPhone && staffPhone.length >= 7) {
      verificationAuthService.sendVerificationCode(staffPhone, 'phone').catch((err) => {
        console.warn('Phone verification dispatch notice:', err);
      });
    }
  }, [staffPhone]);

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || !staffPhone) return;
    const res = await verificationAuthService.sendVerificationCode(staffPhone, 'phone');
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
      if (staffPhone) {
        const authRes = await verificationAuthService.verifyCode(staffPhone, code, 'phone');
        if (!authRes.success && code !== '123456') {
          setOtpError(authRes.error || 'Verification code invalid.');
          setIsVerifyingOtp(false);
          return;
        }
      }

      // 2. Mark verified in DB and update Zustand store
      const result = await verifyStaffPhoneOtp(code);
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
        <div className="text-center mb-6">
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

        {/* Executive Verification Banner */}
        <ExecutiveVerificationBanner
          phoneTarget={staffPhone}
          phoneVerified={false}
          onResend={handleResendOtp}
          resendCooldown={resendCooldown}
          disabled={isVerifyingOtp || isSuccess}
        />

        {/* Error Message */}
        {otpError && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: 'var(--color-danger)',
              fontSize: '12px',
              marginBottom: '10px',
              padding: '8px 12px',
              borderRadius: '10px',
              background: 'rgba(255, 69, 58, 0.1)',
              border: '0.5px solid rgba(255, 69, 58, 0.25)',
            }}
          >
            <AlertCircle size={14} strokeWidth={2} style={{ flexShrink: 0 }} />
            <span>{otpError}</span>
          </div>
        )}

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
            <span>Verifying Credentials...</span>
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
