import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Shield, RefreshCw, LogOut, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import IconBadge from '../components/IconBadge';

export default function WaitingApprovalScreen() {
  const navigate = useNavigate();
  const { currentPrivilegedUser, checkStaffStatus, logout, isAuthenticated } = useAppStore();
  const [isChecking, setIsChecking] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // If already authenticated and approved, proceed to dashboard
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const targetVip = currentPrivilegedUser?.targetVipUsername || 'VIP Principal';
  const staffName = currentPrivilegedUser?.name || 'Staff Member';
  const staffUsername = currentPrivilegedUser?.username || '';
  const staffRole = currentPrivilegedUser?.role || 'Personal Assistant';

  const handleCheckStatus = async () => {
    if (!staffUsername) {
      navigate('/login', { replace: true });
      return;
    }

    setIsChecking(true);
    setStatusMessage(null);

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
      setStatusMessage('Unable to reach server. Please check your connection.');
    } finally {
      setIsChecking(false);
    }
  };

  // Check periodically while screen is open
  useEffect(() => {
    handleCheckStatus();
    const interval = setInterval(handleCheckStatus, 5000);
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
        <p className="auth-subtitle">
          Waiting for VIP Principal Authorization
        </p>

        {/* Status Card */}
        <div
          className="p-4 rounded-xl mb-6 text-left"
          style={{
            background: 'var(--color-surface-elevated, #1A1A1A)',
            border: '1px solid var(--color-border-subtle, rgba(255, 215, 0, 0.15))',
          }}
        >
          <div className="flex items-center gap-3 mb-3 pb-3" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <Shield size={18} className="text-amber-400" />
            <div>
              <div className="text-xs text-secondary">Target Principal</div>
              <div className="font-semibold text-white">@{targetVip}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-secondary block">Applicant</span>
              <span className="text-white font-medium">{staffName}</span>
            </div>
            <div>
              <span className="text-secondary block">Username</span>
              <span className="text-white font-mono">@{staffUsername}</span>
            </div>
            <div className="col-span-2">
              <span className="text-secondary block">Assigned Role</span>
              <span className="text-white font-medium">{staffRole}</span>
            </div>
          </div>
        </div>

        {/* Message Banner */}
        {statusMessage && (
          <div className="p-3 mb-4 rounded-lg text-xs flex items-center gap-2 text-amber-300 bg-amber-950/40 border border-amber-800/40 text-left">
            <AlertCircle size={16} className="shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        <div className="space-y-3">
          <button
            type="button"
            onClick={handleCheckStatus}
            disabled={isChecking}
            className="btn btn-primary w-full flex items-center justify-center gap-2"
          >
            <RefreshCw size={16} className={isChecking ? 'animate-spin' : ''} />
            <span>{isChecking ? 'Checking Authorization...' : 'Check Approval Status'}</span>
          </button>

          <button
            type="button"
            onClick={handleSignOut}
            className="btn btn-secondary w-full flex items-center justify-center gap-2"
          >
            <LogOut size={16} />
            <span>Return to Sign In</span>
          </button>
        </div>

        <p className="text-xs text-secondary mt-6">
          Once approved by @{targetVip}, you will proceed to the mandatory Phone Verification Gate.
        </p>
      </div>
    </div>
  );
}
