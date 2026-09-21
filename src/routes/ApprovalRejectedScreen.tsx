import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, LogOut, AtSign } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import IconBadge from '../components/IconBadge';

export default function ApprovalRejectedScreen() {
  const navigate = useNavigate();
  const { currentPrivilegedUser, reassignStaffVip, logout } = useAppStore();
  const [newVipUsername, setNewVipUsername] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const currentVip = currentPrivilegedUser?.targetVipUsername || 'the VIP Principal';
  const staffUsername = currentPrivilegedUser?.username || '';

  const handleReassign = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const cleanVip = newVipUsername.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!cleanVip) {
      setErrorMessage('Please enter the VIP Principal username.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await reassignStaffVip(cleanVip);
      if (result.success) {
        navigate('/waiting-approval', { replace: true });
      } else {
        setErrorMessage(result.error || 'VIP Account Not Found');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to submit request to new VIP.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignOut = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-ambient-glow" />

      <div className="auth-card text-center">
        {/* Rejection Alert Header */}
        <div className="flex justify-center mb-4">
          <IconBadge icon={AlertTriangle} variant="rose" size="hero" glow />
        </div>

        <h1 className="auth-title">
          Request Declined
        </h1>
        <p className="auth-subtitle text-rose-300">
          Your access request was declined by @{currentVip}
        </p>

        <div
          className="p-4 rounded-xl mb-6 text-left"
          style={{
            background: 'var(--color-surface-elevated, #1A1A1A)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
          }}
        >
          <p className="text-xs text-secondary leading-relaxed mb-3">
            You cannot access the VIP intelligence suite with your current assignment. You may request access to a different VIP Principal below using your existing credentials, or sign out.
          </p>

          <form onSubmit={handleReassign} className="space-y-3">
            <div>
              <label htmlFor="newVipUsernameInput" className="form-label text-xs block mb-1">
                New VIP Principal Username
              </label>
              <div className="form-input-icon-wrap">
                <AtSign size={16} className="form-input-icon text-secondary" />
                <input
                  id="newVipUsernameInput"
                  type="text"
                  value={newVipUsername}
                  onChange={(e) => {
                    setNewVipUsername(e.target.value);
                    setErrorMessage('');
                  }}
                  placeholder="e.g. jaison"
                  className="form-input"
                  autoCapitalize="none"
                  autoCorrect="off"
                />
              </div>
            </div>

            {errorMessage && (
              <div className="text-xs text-rose-400 p-2 rounded bg-rose-950/40 border border-rose-800/40">
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn btn-primary w-full flex items-center justify-center gap-2 mt-2"
            >
              <span>{isSubmitting ? 'Verifying VIP...' : 'Request Access to VIP'}</span>
              <ArrowRight size={16} />
            </button>
          </form>
        </div>

        <button
          type="button"
          onClick={handleSignOut}
          className="btn btn-secondary w-full flex items-center justify-center gap-2"
        >
          <LogOut size={16} />
          <span>Return to Sign In</span>
        </button>
      </div>
    </div>
  );
}
