import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LogIn,
  UserPlus,
  Briefcase,
  User,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Shield,
  Calendar,
  Phone,
  Lock,
  Eye,
  EyeOff,
  AtSign,
  Award,
  Check,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import IconBadge from '../components/IconBadge';
import OtpInput from '../components/OtpInput';
import ExecutiveVerificationBanner from '../components/ExecutiveVerificationBanner';
import { verificationAuthService } from '../services/verificationAuthService';

export default function LoginScreen() {
  const navigate = useNavigate();
  const { isAuthenticated, loginWithCredentials, setupVIP, registerPrivilegedUser } = useAppStore();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // Auth View: 'landing' (welcome screen) | 'login' (username & password) | 'register' (create account)
  const [authView, setAuthView] = useState<'landing' | 'login' | 'register'>('landing');

  // ── Login Form State ────────────────────────────────────────────────────────
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // ── Register Form & Verification State ──────────────────────────────────────
  const [regStep, setRegStep] = useState<'form' | 'verify'>('form');
  const [regType, setRegType] = useState<'vip' | 'staff'>('vip');
  const [regUsername, setRegUsername] = useState('');
  const [regName, setRegName] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regPhone, setRegPhone] = useState('');
  const [regRole, setRegRole] = useState('Personal Assistant');
  const [regError, setRegError] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  // Verification sub-states
  const [phoneOtp, setPhoneOtp] = useState('');
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);

  // Timer cooldown for resending verification code
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // ── Login Handlers ──────────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    const cleanUser = loginUsername.trim();
    if (!cleanUser) {
      setLoginError('Please enter your username.');
      return;
    }
    if (!loginPassword) {
      setLoginError('Please enter your password.');
      return;
    }

    setIsLoggingIn(true);
    try {
      const result = await loginWithCredentials(cleanUser, loginPassword);
      if (result.success) {
        setIsSuccess(true);
        setTimeout(() => {
          navigate('/dashboard', { replace: true });
        }, 400);
      } else {
        setLoginError(result.error || 'Invalid credentials. Please try again.');
        setIsLoggingIn(false);
      }
    } catch (err: any) {
      setLoginError(err?.message || 'Sign in failed. Please try again.');
      setIsLoggingIn(false);
    }
  };

  // ── Register: Proceed to Phone Verification ──────────────────────────────────
  const handleProceedToVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');

    const cleanUsername = regUsername.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!cleanUsername || cleanUsername.length < 3) {
      setRegError('Username must be at least 3 alphanumeric characters.');
      return;
    }

    if (!regName.trim()) {
      setRegError('Please enter your full name or title.');
      return;
    }

    if (!regPassword || regPassword.length < 4) {
      setRegError('Password must be at least 4 characters.');
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setRegError('Passwords do not match. Please verify.');
      return;
    }

    const cleanPhone = regPhone.trim();
    if (!cleanPhone || cleanPhone.length < 7 || !/^[+0-9\s-]{7,20}$/.test(cleanPhone)) {
      setRegError('Please enter a valid mobile phone number for verification.');
      return;
    }

    setIsRegistering(true);
    try {
      // Send OTP to phone via Supabase Auth
      const phoneRes = await verificationAuthService.sendVerificationCode(cleanPhone, 'phone');
      if (!phoneRes.success) {
        const raw = phoneRes.error || '';
        const friendly = raw.includes('504') || raw.includes('timeout') || raw.includes('upstream')
          ? 'Mobile verification gateway is temporarily busy. Please try again in a moment.'
          : raw || 'Failed to dispatch verification SMS.';
        setRegError(friendly);
        setIsRegistering(false);
        return;
      }

      setResendCooldown(30);
      setPhoneVerified(false);
      setPhoneOtp('');
      setOtpError('');
      setRegStep('verify');
    } catch (err: any) {
      const raw = err?.message || '';
      const friendly = raw.includes('504') || raw.includes('timeout') || raw.includes('upstream')
        ? 'Verification network timed out. Please try again in a moment.'
        : raw || 'Failed to dispatch verification SMS. Please try again.';
      setRegError(friendly);
    } finally {
      setIsRegistering(false);
    }
  };

  // ── Register: Resend OTP ────────────────────────────────────────────────────
  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    const target = regPhone.trim();
    const res = await verificationAuthService.sendVerificationCode(target, 'phone');
    if (res.success) {
      setResendCooldown(30);
      setOtpError('');
      setPhoneOtp('');
    } else if (res.error) {
      setOtpError(res.error);
    }
  };

  // ── Register: Verify OTP & Finalize Account ─────────────────────────────────
  const handleVerifyOtp = async (codeToVerify?: string) => {
    const code = (codeToVerify || phoneOtp).trim();
    setOtpError('');

    if (!code || code.length !== 6) {
      setOtpError('Please enter the complete 6-digit verification code.');
      return;
    }

    setIsVerifyingOtp(true);
    const target = regPhone.trim();
    const result = await verificationAuthService.verifyCode(target, code, 'phone');

    if (!result.success) {
      setOtpError(result.error || 'Verification failed. Please check the code.');
      setIsVerifyingOtp(false);
      return;
    }

    setPhoneVerified(true);
    await finalizeRegistration();
  };

  // ── Register: Finalize Account Creation ─────────────────────────────────────
  const finalizeRegistration = async () => {
    setIsRegistering(true);
    const cleanUsername = regUsername.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');

    try {
      if (regType === 'vip') {
        await setupVIP(
          regName.trim(),
          regPhone.trim(),
          undefined,
          cleanUsername,
          regPassword,
          true, // phoneVerified
          false // emailVerified
        );
        setIsSuccess(true);
        setTimeout(() => {
          navigate('/dashboard', { replace: true });
        }, 600);
      } else {
        const result = await registerPrivilegedUser(
          regName.trim(),
          regRole.trim(),
          regPhone.trim(),
          undefined,
          cleanUsername,
          regPassword,
          true, // phoneVerified
          false // emailVerified
        );
        if (result) {
          setIsSuccess(true);
          setTimeout(() => {
            navigate('/dashboard', { replace: true });
          }, 600);
        } else {
          setOtpError('Maximum privileged staff limit reached (5 users max).');
          setIsRegistering(false);
          setIsVerifyingOtp(false);
        }
      }
    } catch (err: any) {
      setOtpError(err?.message || 'Registration failed. Please try again.');
      setIsRegistering(false);
      setIsVerifyingOtp(false);
    }
  };

  return (
    <div className="auth-wrapper screen-no-nav">
      <div className="auth-ambient-glow" />

      <div className="auth-card">
        {/* ══════════════════════════════════════════════════════════════════════
            VIEW 1: LANDING / WELCOME SCREEN (Default)
            ══════════════════════════════════════════════════════════════════════ */}
        {authView === 'landing' && (
          <div className="text-center">
            {/* Executive Logo & Header */}
            <div className="auth-header mb-6">
              <div className="flex justify-center mb-3">
                <IconBadge icon={Shield} variant="gold" size="hero" glow />
              </div>
              <h1 className="auth-title">
                VIP Intelligence
              </h1>
              <p className="auth-subtitle">
                Executive Schedule & Protocol Management
              </p>
            </div>

            {/* Inset Highlights */}
            <div className="ios-grouped-list mb-5 text-left">
              <div className="ios-grouped-item" style={{ cursor: 'default' }}>
                <IconBadge icon={Award} variant="gold" size="sm" />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Executive Protocol</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Relationship memory & event prioritization</div>
                </div>
              </div>

              <div className="ios-grouped-item" style={{ cursor: 'default' }}>
                <IconBadge icon={Briefcase} variant="cyan" size="sm" />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Role Delegated Access</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Secure authentication for VIPs and Staff</div>
                </div>
              </div>

              <div className="ios-grouped-item" style={{ cursor: 'default' }}>
                <IconBadge icon={Calendar} variant="emerald" size="sm" />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Schedule Intelligence</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>AI invitation scanning & conflict detection</div>
                </div>
              </div>
            </div>

            {/* Apple Actions */}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="btn btn-gold w-full"
                onClick={() => {
                  setLoginError('');
                  setAuthView('login');
                }}
              >
                <LogIn size={16} strokeWidth={2} />
                <span>Sign In</span>
              </button>

              <button
                type="button"
                className="btn btn-outline w-full"
                onClick={() => {
                  setRegError('');
                  setAuthView('register');
                }}
              >
                <UserPlus size={16} strokeWidth={2} />
                <span>Create Account</span>
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            VIEW 2: SIGN IN (USERNAME & PASSWORD SCREEN)
            ══════════════════════════════════════════════════════════════════════ */}
        {authView === 'login' && (
          <div>
            {/* Top Back Nav */}
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                className="btn-ghost flex items-center gap-1"
                style={{ padding: '4px 8px', fontSize: '13px' }}
                onClick={() => setAuthView('landing')}
              >
                <ArrowLeft size={16} strokeWidth={2} />
                <span>Back</span>
              </button>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Sign In
              </span>
              <div style={{ width: '40px' }} />
            </div>

            {/* Logo Badge & Header */}
            <div className="text-center" style={{ marginBottom: '16px' }}>
              <div className="flex justify-center mb-2.5">
                <IconBadge icon={Shield} variant="gold" size="md" glow />
              </div>
              <h2 className="font-heading font-semibold text-white" style={{ fontSize: '18px', letterSpacing: '-0.02em' }}>
                {isSuccess ? 'Access Granted' : 'Enter Credentials'}
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                {isSuccess
                  ? 'Loading executive interface...'
                  : 'Enter your username and password'}
              </p>
            </div>

            {/* Error Banner */}
            {loginError && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: 'var(--color-danger)',
                  fontSize: '12px',
                  marginBottom: '12px',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  background: 'rgba(255, 69, 58, 0.12)',
                  border: '0.5px solid rgba(255, 69, 58, 0.3)',
                }}
              >
                <AlertCircle size={15} strokeWidth={2} style={{ flexShrink: 0 }} />
                <span>{loginError}</span>
              </div>
            )}

            {/* Username & Password Form */}
            <form onSubmit={handleLogin} className="flex flex-col gap-3">
              <div>
                <label className="label" style={{ fontSize: '12px', marginBottom: '4px' }}>
                  <AtSign size={12} strokeWidth={2} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                  Username or Phone
                </label>
                <input
                  className="input"
                  type="text"
                  placeholder="Enter username or phone number"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoFocus
                  required
                  disabled={isLoggingIn || isSuccess}
                />
              </div>

              <div>
                <label className="label" style={{ fontSize: '12px', marginBottom: '4px' }}>
                  <Lock size={12} strokeWidth={2} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                  Password
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    className="input"
                    style={{ paddingRight: '40px' }}
                    type={showLoginPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                    disabled={isLoggingIn || isSuccess}
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-text-muted)',
                      cursor: 'pointer',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    title={showLoginPassword ? 'Hide password' : 'Show password'}
                  >
                    {showLoginPassword ? <EyeOff size={16} strokeWidth={2} /> : <Eye size={16} strokeWidth={2} />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                className="btn btn-gold w-full mt-2"
                disabled={isLoggingIn || isSuccess || !loginUsername.trim() || !loginPassword}
              >
                {isLoggingIn ? (
                  <span>Authenticating...</span>
                ) : isSuccess ? (
                  <>
                    <CheckCircle2 size={16} strokeWidth={2} />
                    <span>Access Granted</span>
                  </>
                ) : (
                  <>
                    <LogIn size={16} strokeWidth={2} />
                    <span>Sign In</span>
                  </>
                )}
              </button>
            </form>

            <div style={{ marginTop: '16px', fontSize: '12px', color: 'var(--color-text-secondary)', textAlign: 'center' }}>
              Don&apos;t have an account yet?{' '}
              <button
                type="button"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                  color: 'var(--color-accent)',
                }}
                onClick={() => {
                  setRegError('');
                  setAuthView('register');
                }}
              >
                Create One
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            VIEW 3: REGISTER SCREEN (WITH PHONE VERIFICATION)
            ══════════════════════════════════════════════════════════════════════ */}
        {authView === 'register' && regStep === 'form' && (
          <form onSubmit={handleProceedToVerification}>
            {/* Top Back Nav */}
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                className="btn-ghost flex items-center gap-1"
                style={{ padding: '4px 8px', fontSize: '13px' }}
                onClick={() => setAuthView('landing')}
              >
                <ArrowLeft size={16} strokeWidth={2} />
                <span>Back</span>
              </button>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                New Profile (Step 1 of 2)
              </span>
              <div style={{ width: '40px' }} />
            </div>

            <div style={{ marginBottom: '14px', textAlign: 'center' }}>
              <h2 className="font-heading font-semibold text-white" style={{ fontSize: '18px', letterSpacing: '-0.02em' }}>
                Create Account
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                Set credentials and verified contact details
              </p>
            </div>

            {/* Apple Segmented Control for Role */}
            <div className="segmented-control mb-3">
              <button
                type="button"
                className={`segmented-item ${regType === 'vip' ? 'active' : ''}`}
                onClick={() => setRegType('vip')}
              >
                VIP Principal
              </button>
              <button
                type="button"
                className={`segmented-item ${regType === 'staff' ? 'active' : ''}`}
                onClick={() => setRegType('staff')}
              >
                Staff / PA
              </button>
            </div>

            {/* Error Message */}
            {regError && (
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
                <span>{regError}</span>
              </div>
            )}

            {/* Username Input */}
            <div style={{ marginBottom: '10px' }}>
              <label className="label" style={{ fontSize: '12px', marginBottom: '3px' }}>
                <AtSign size={12} strokeWidth={2} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                Username
              </label>
              <input
                className="input"
                type="text"
                placeholder={regType === 'vip' ? 'e.g. vikram_principal' : 'e.g. ananya_pa'}
                value={regUsername}
                onChange={(e) => setRegUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                autoCapitalize="none"
                autoCorrect="off"
                autoFocus
                required
              />
            </div>

            {/* Full Name input */}
            <div style={{ marginBottom: '10px' }}>
              <label className="label" style={{ fontSize: '12px', marginBottom: '3px' }}>
                <User size={12} strokeWidth={2} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                Full Name / Title
              </label>
              <input
                className="input"
                type="text"
                placeholder={regType === 'vip' ? 'e.g. Dr. Vikramaditya' : 'e.g. Ananya Rao'}
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                required
              />
            </div>

            {/* Password & Confirm Password */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
              <div>
                <label className="label" style={{ fontSize: '12px', marginBottom: '3px' }}>
                  <Lock size={12} strokeWidth={2} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                  Password
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    className="input"
                    style={{ paddingRight: '28px' }}
                    type={showRegPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegPassword(!showRegPassword)}
                    style={{
                      position: 'absolute',
                      right: '6px',
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-text-muted)',
                      cursor: 'pointer',
                      padding: '2px',
                    }}
                  >
                    {showRegPassword ? <EyeOff size={14} strokeWidth={2} /> : <Eye size={14} strokeWidth={2} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="label" style={{ fontSize: '12px', marginBottom: '3px' }}>
                  <CheckCircle2 size={12} strokeWidth={2} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                  Confirm
                </label>
                <input
                  className="input"
                  type={showRegPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={regConfirmPassword}
                  onChange={(e) => setRegConfirmPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Role input if Staff */}
            {regType === 'staff' && (
              <div style={{ marginBottom: '10px' }}>
                <label className="label" style={{ fontSize: '12px', marginBottom: '3px' }}>
                  <Briefcase size={12} strokeWidth={2} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                  Designation / Role
                </label>
                <input
                  className="input"
                  type="text"
                  placeholder="e.g. Personal Assistant, Secretary"
                  value={regRole}
                  onChange={(e) => setRegRole(e.target.value)}
                  required
                />
              </div>
            )}

            {/* Contact details with required mobile phone verification */}
            <div style={{ marginBottom: '12px' }}>
              <label className="label" style={{ fontSize: '12px', marginBottom: '3px' }}>
                <Phone size={12} strokeWidth={2} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                Mobile Phone Number (SMS Verification)
              </label>
              <input
                className="input"
                type="tel"
                placeholder="e.g. +91 98765 43210"
                value={regPhone}
                onChange={(e) => setRegPhone(e.target.value)}
                required
              />
            </div>

            {/* Submit button to verification */}
            <button
              type="submit"
              className="btn btn-gold w-full"
              disabled={
                isRegistering ||
                !regUsername.trim() ||
                !regName.trim() ||
                !regPassword ||
                regPassword !== regConfirmPassword ||
                !regPhone.trim()
              }
            >
              {isRegistering ? (
                <span>Sending Verification...</span>
              ) : (
                <>
                  <span>Proceed to Verification</span>
                  <ArrowRight size={16} strokeWidth={2} />
                </>
              )}
            </button>

            <div style={{ marginTop: '14px', fontSize: '12px', color: 'var(--color-text-secondary)', textAlign: 'center' }}>
              Already registered?{' '}
              <button
                type="button"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                  color: 'var(--color-accent)',
                }}
                onClick={() => {
                  setLoginError('');
                  setAuthView('login');
                }}
              >
                Sign In
              </button>
            </div>
          </form>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            VIEW 3 (STEP 2): PHONE OTP VERIFICATION
            ══════════════════════════════════════════════════════════════════════ */}
        {authView === 'register' && regStep === 'verify' && (
          <div>
            {/* Top Back Nav */}
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                className="btn-ghost flex items-center gap-1"
                style={{ padding: '4px 8px', fontSize: '13px' }}
                onClick={() => setRegStep('form')}
              >
                <ArrowLeft size={16} strokeWidth={2} />
                <span>Edit Info</span>
              </button>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Verification (Step 2 of 2)
              </span>
              <div style={{ width: '40px' }} />
            </div>

            {/* Executive Verification Banner */}
            <ExecutiveVerificationBanner
              phoneTarget={regPhone}
              phoneVerified={phoneVerified}
              onResend={handleResendOtp}
              resendCooldown={resendCooldown}
              onEditDetails={() => setRegStep('form')}
              disabled={isVerifyingOtp || isRegistering || isSuccess}
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
              disabled={isVerifyingOtp || isRegistering || isSuccess}
              hasError={!!otpError}
              autoFocus={true}
            />

            {/* Verification Button */}
            <button
              type="button"
              className="btn btn-gold w-full mt-3"
              disabled={
                isVerifyingOtp ||
                isRegistering ||
                isSuccess ||
                phoneOtp.length !== 6
              }
              onClick={() => handleVerifyOtp()}
            >
              {isSuccess ? (
                <>
                  <CheckCircle2 size={16} strokeWidth={2} />
                  <span>Account Verified & Created</span>
                </>
              ) : isVerifyingOtp || isRegistering ? (
                <span>Validating Code...</span>
              ) : (
                <>
                  <Check size={16} strokeWidth={2} />
                  <span>Verify Phone & Create Account</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
