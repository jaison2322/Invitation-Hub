import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Shield, RefreshCw, LogOut, AlertCircle } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import IconBadge from '../components/IconBadge';

export default function WaitingApprovalScreen() {
  const navigate = useNavigate();
  const { currentPrivilegedUser, checkStaffStatus, logout, isAuthenticated } = useAppStore();
  const [isChecking, setIsChecking] = useState(false);

  // If already authenticated and approved, proceed to dashboard
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const targetVip = currentPrivilegedUser?.targetVipUsername || 'Admin';
  const staffName = currentPrivilegedUser?.name || 'Staff Member';
  const staffUsername = currentPrivilegedUser?.username || '';
  const staffRole = currentPrivilegedUser?.role || currentPrivilegedUser?.staffTitle || 'Staff';

  const [statusMessage, setStatusMessage] = useState<string>(
    `Your access request is currently pending review by @${targetVip}.`
  );

  // Status check logic:
  // When isManual is true, we show button loading state.
  // When isManual is false (background 5s poll), it refreshes status silently without flickering or disabling the button.
  const performCheck = async (isManual = false) => {
    if (!staffUsername) {
      navigate('/login', { replace: true });
      return;
    }

    if (isManual) {
      setIsChecking(true);
    }

    try {
      const result = await checkStaffStatus(staffUsername);
      if (result.status === 'APPROVED') {
        navigate('/dashboard', { replace: true });
        return;
      } else if (result.status === 'REJECTED') {
        navigate('/approval-rejected', { replace: true });
        return;
      } else {
        setStatusMessage(`Your access request is currently pending review by @${targetVip}.`);
      }
    } catch {
      if (isManual) {
        setStatusMessage('Unable to reach server. Please check your connection.');
      }
    } finally {
      if (isManual) {
        setIsChecking(false);
      }
    }
  };

  // Background silent auto-refresh every 5 seconds (does not cause UI to disappear or jump)
  useEffect(() => {
    performCheck(false);
    const interval = setInterval(() => {
      performCheck(false);
    }, 5000);
    return () => clearInterval(interval);
  }, [staffUsername]);

  const handleSignOut = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-ambient-glow" />

      <div className="auth-card text-center">
        {/* Executive Header */}
        <div className="flex justify-center mb-4">
          <IconBadge icon={Clock} variant="gold" size="hero" glow />
        </div>

        <h1 className="auth-title">
          Approval Pending
        </h1>
        <p className="auth-subtitle mb-5">
          Waiting for Admin Authorization
        </p>

        {/* Formal Ticket / Credential Card matching reference sketch */}
        <div
          className="mb-5 overflow-hidden text-left"
          style={{
            background: 'var(--color-bg-card, #ffffff)',
            borderRadius: '20px',
            border: '1.5px solid var(--color-separator, rgba(0, 0, 0, 0.12))',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.05)',
          }}
        >
          {/* Top Section: Centered Shield + Target Admin */}
          <div
            className="p-4 flex flex-col items-center justify-center text-center"
            style={{
              background: 'transparent',
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                marginBottom: '4px',
              }}
            >
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '10px',
                  background: 'rgba(212, 175, 55, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Shield size={17} style={{ color: 'var(--color-gold, #D4AF37)' }} />
              </div>
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--color-text-secondary, #8e8e93)',
                }}
              >
                Target admin
              </span>
            </div>
            <div
              style={{
                fontSize: '20px',
                fontWeight: 700,
                color: 'var(--color-text-primary, #000000)',
                fontFamily: 'var(--font-heading)',
                letterSpacing: '-0.02em',
              }}
            >
              @{targetVip}
            </div>
          </div>

          {/* Clean Horizontal Divider Line as drawn in the reference sketch */}
          <div
            style={{
              height: '1px',
              background: 'var(--color-separator, rgba(0, 0, 0, 0.1))',
              marginLeft: '16px',
              marginRight: '16px',
            }}
          />

          {/* 3 Vertically Stacked Rows matching the reference sketch */}
          <div className="p-4 flex flex-col gap-3.5">
            {/* Row 1: Applicant */}
            <div className="flex items-baseline" style={{ gap: '8px', fontSize: '14px' }}>
              <span
                style={{
                  color: 'var(--color-text-secondary, #8e8e93)',
                  fontWeight: 500,
                  minWidth: '115px',
                }}
              >
                Applicant :
              </span>
              <span
                style={{
                  color: 'var(--color-text-primary, #000000)',
                  fontWeight: 600,
                }}
              >
                {staffName}
              </span>
            </div>

            {/* Row 2: Username */}
            <div className="flex items-baseline" style={{ gap: '8px', fontSize: '14px' }}>
              <span
                style={{
                  color: 'var(--color-text-secondary, #8e8e93)',
                  fontWeight: 500,
                  minWidth: '115px',
                }}
              >
                Username :
              </span>
              <span
                style={{
                  color: 'var(--color-gold, #D4AF37)',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 600,
                }}
              >
                @{staffUsername}
              </span>
            </div>

            {/* Row 3: Assigned role */}
            <div className="flex items-baseline" style={{ gap: '8px', fontSize: '14px' }}>
              <span
                style={{
                  color: 'var(--color-text-secondary, #8e8e93)',
                  fontWeight: 500,
                  minWidth: '115px',
                }}
              >
                Assigned role :
              </span>
              <span
                style={{
                  color: 'var(--color-text-primary, #000000)',
                  fontWeight: 600,
                  textTransform: 'capitalize',
                }}
              >
                {staffRole}
              </span>
            </div>
          </div>
        </div>

        {/* Message Banner (Permanent, does not flicker or disappear) */}
        {statusMessage && (
          <div
            className="p-3 mb-4 rounded-xl text-xs flex items-center gap-2.5 text-left"
            style={{
              background: 'rgba(255, 159, 10, 0.1)',
              border: '0.5px solid rgba(255, 159, 10, 0.25)',
              color: 'var(--color-text-primary)',
            }}
          >
            <AlertCircle size={16} className="shrink-0 text-amber-500" />
            <span style={{ lineHeight: 1.4 }}>{statusMessage}</span>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', width: '100%' }}>
          <button
            type="button"
            onClick={() => performCheck(true)}
            disabled={isChecking}
            className="btn btn-gold w-full flex items-center justify-center gap-2"
          >
            <RefreshCw size={16} className={isChecking ? 'animate-spin' : ''} />
            <span>{isChecking ? 'Checking Authorization...' : 'Check Approval Status'}</span>
          </button>

          <button
            type="button"
            onClick={handleSignOut}
            className="btn btn-gold w-full flex items-center justify-center gap-2"
          >
            <LogOut size={16} />
            <span>Return to Sign In</span>
          </button>
        </div>
      </div>
    </div>
  );
}
