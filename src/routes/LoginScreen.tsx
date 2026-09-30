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
import { supabaseDbService } from '../services/supabaseDbService';

export default function LoginScreen() {
  const navigate = useNavigate();
  const { isAuthenticated, loginWithCredentials, setupVIP, submitStaffRegistration } = useAppStore();

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

  // ── Register Form State ─────────────────────────────────────────────────────
  const [regType, setRegType] = useState<'vip' | 'staff'>('vip');
  const [regUsername, setRegUsername] = useState('');
  const [regName, setRegName] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regPhone, setRegPhone] = useState('');
  const [regRole, setRegRole] = useState('Personal Assistant');
  const [regVipPrincipal, setRegVipPrincipal] = useState('');
  const [regError, setRegError] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

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
        if (result.status === 'PENDING_APPROVAL') {
          navigate('/waiting-approval', { replace: true });
          return;
        }
        if (result.status === 'REJECTED') {
          navigate('/approval-rejected', { replace: true });
          return;
        }
        setLoginError(result.error || 'Invalid credentials. Please try again.');
        setIsLoggingIn(false);
      }
    } catch (err: any) {
      setLoginError(err?.message || 'Sign in failed. Please try again.');
      setIsLoggingIn(false);
    }
  };

  // ── Register: Submit Account Creation or Staff Request ──────────────────
  const handleRegister = async (e: React.FormEvent) => {
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
      setRegError('Please enter a valid mobile phone number.');
      return;
    }

    // ── Staff Registration Flow ──
    if (regType === 'staff') {
      const cleanPrincipal = regVipPrincipal.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
      if (!cleanPrincipal) {
        setRegError('Please specify the username of the Principal you assist.');
        return;
      }

      setIsRegistering(true);
      try {
        // Step 1: Verify Principal exists
        const vipCheck = await supabaseDbService.checkVipPrincipalExists(cleanPrincipal);
        if (!vipCheck.exists) {
          setRegError('Principal Account Not Found');
          setIsRegistering(false);
          return;
        }

        // Step 2: Submit staff request to VIP Principal
        const result = await submitStaffRegistration({
          username: cleanUsername,
          password: regPassword,
          name: regName.trim(),
          staffTitle: regRole.trim() || 'Personal Assistant',
          vipUsername: cleanPrincipal,
          phone: cleanPhone,
        });

        if (!result.success) {
          setRegError(result.error || 'Registration request failed.');
          setIsRegistering(false);
          return;
        }

        // Step 3: Navigate to Waiting Approval screen
        navigate('/waiting-approval', { replace: true });
        return;
      } catch (err: any) {
        setRegError(err?.message || 'Registration failed. Please try again.');
        setIsRegistering(false);
        return;
      }
    }

    // ── VIP Principal Registration Flow (Direct creation without OTP) ──
    setIsRegistering(true);
    try {
      const result = await setupVIP(
        regName.trim(),
        cleanPhone,
        undefined,
        cleanUsername,
        regPassword,
        true, // phoneVerified
        true  // emailVerified
      );
      if (!result.success) {
        setRegError(result.error || 'VIP Account creation failed. Please try again.');
        setIsRegistering(false);
        return;
      }
      setIsSuccess(true);
      setTimeout(() => {
        navigate('/dashboard', { replace: true });
      }, 500);
    } catch (err: any) {
      setRegError(err?.message || 'Registration failed. Please try again.');
      setIsRegistering(false);
    }
  };

  return (
    <div className="auth-wrapper">
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
                Invitation Hub
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
            VIEW 3: REGISTER SCREEN
            ══════════════════════════════════════════════════════════════════════ */}
        {authView === 'register' && (
          <form onSubmit={handleRegister}>
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
              <div style={{ width: '40px' }} />
            </div>

            <div style={{ marginBottom: '14px', textAlign: 'center' }}>
              <h2 className="font-heading font-semibold text-white" style={{ fontSize: '18px', letterSpacing: '-0.02em' }}>
                Create Account
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                Set credentials and contact details
              </p>
            </div>

            {/* Apple Segmented Control for Role */}
            <div className="segmented-control mb-3">
              <button
                type="button"
                className={`segmented-item ${regType === 'vip' ? 'active' : ''}`}
                onClick={() => setRegType('vip')}
              >
                Principal
              </button>
              <button
                type="button"
                className={`segmented-item ${regType === 'staff' ? 'active' : ''}`}
                onClick={() => setRegType('staff')}
              >
                User
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
                placeholder={regType === 'vip' ? 'Enter your username' : 'Enter your username'}
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
                Full Name
              </label>
              <input
                className="input"
                type="text"
                placeholder={regType === 'vip' ? 'Enter your full name' : 'Enter your full name'}
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
              <>
                <div style={{ marginBottom: '10px' }}>
                  <label className="label" style={{ fontSize: '12px', marginBottom: '3px' }}>
                    <Award size={12} strokeWidth={2} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                    Principal Username
                  </label>
                  <input
                    className="input"
                    type="text"
                    placeholder='Enter username'
                    value={regVipPrincipal}
                    onChange={(e) => setRegVipPrincipal(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                    required
                  />
                </div>
                <div style={{ marginBottom: '10px' }}>
                  <label className="label" style={{ fontSize: '12px', marginBottom: '3px' }}>
                    <Briefcase size={12} strokeWidth={2} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                    Role
                  </label>
                  <input
                    className="input"
                    type="text"
                    value={regRole}
                    onChange={(e) => setRegRole(e.target.value)}
                    required
                  />
                </div>
              </>
            )}

            {/* Contact details with mobile phone */}
            <div style={{ marginBottom: '12px' }}>
              <label className="label" style={{ fontSize: '12px', marginBottom: '3px' }}>
                <Phone size={12} strokeWidth={2} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                Mobile Phone Number
              </label>
              <input
                className="input"
                type="tel"
                placeholder='Enter your phone number'
                value={regPhone}
                onChange={(e) => setRegPhone(e.target.value)}
                required
              />
            </div>

            {/* Submit button */}
            <button
              type="submit"
              className="btn btn-gold w-full"
              disabled={
                isRegistering ||
                !regUsername.trim() ||
                !regName.trim() ||
                !regPassword ||
                regPassword !== regConfirmPassword ||
                !regPhone.trim() ||
                (regType === 'staff' && !regVipPrincipal.trim())
              }
            >
              {isRegistering ? (
                <span>{regType === 'vip' ? 'Creating Principal Account...' : 'Submitting Request...'}</span>
              ) : (
                <>
                  <span>{regType === 'vip' ? 'Create Principal Account' : 'Request Access from Principal'}</span>
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
      </div>
    </div>
  );
}
