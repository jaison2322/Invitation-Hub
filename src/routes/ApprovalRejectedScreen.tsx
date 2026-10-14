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

  const currentVip = currentPrivilegedUser?.targetVipUsername || 'Admin';

  const handleReassign = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const cleanVip = newVipUsername.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!cleanVip) {
      setErrorMessage('Please enter the Admin username.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await reassignStaffVip(cleanVip);
      if (result.success) {
        navigate('/waiting-approval', { replace: true });
      } else {
        setErrorMessage(result.error || 'Admin Account Not Found');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to submit request to new Admin.');
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
        <p className="auth-subtitle text-rose-400 mb-5">
          Your access request was declined by @{currentVip}
        </p>

        <div
          className="p-4 rounded-2xl mb-6 text-left"
          style={{
            background: 'var(--color-bg-card, #ffffff)',
            border: '1px solid var(--color-separator, rgba(239, 68, 68, 0.2))',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.04)',
          }}
        >
          <p className="text-xs text-secondary leading-relaxed mb-4">
            You cannot access Invitation Hub with your current assignment. You may request access to a different Admin below using your existing credentials, or sign out.
          </p>

          <form onSubmit={handleReassign} className="space-y-3">
            <div>
              <label htmlFor="newVipUsernameInput" className="label" style={{ fontSize: '12px', marginBottom: '4px' }}>
                New Admin Username
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <AtSign size={15} style={{ position: 'absolute', left: '12px', color: 'var(--color-text-secondary)', pointerEvents: 'none' }} />
                <input
                  id="newVipUsernameInput"
                  type="text"
                  value={newVipUsername}
                  onChange={(e) => {
                    setNewVipUsername(e.target.value);
                    setErrorMessage('');
                  }}
                  placeholder="e.g. jaison"
                  className="input"
                  style={{ paddingLeft: '36px' }}
                  autoCapitalize="none"
                  autoCorrect="off"
                />
              </div>
            </div>

            {errorMessage && (
              <div
                style={{
                  fontSize: '12px',
                  color: 'var(--color-danger)',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  background: 'rgba(255, 69, 58, 0.1)',
                  border: '0.5px solid rgba(255, 69, 58, 0.25)',
                }}
              >
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn btn-gold w-full flex items-center justify-center gap-2 mt-2"
            >
              <span>{isSubmitting ? 'Verifying Admin...' : 'Request Access to Admin'}</span>
              <ArrowRight size={16} />
            </button>
          </form>
        </div>

        <button
          type="button"
          onClick={handleSignOut}
          className="btn btn-outline w-full flex items-center justify-center gap-2"
        >
          <LogOut size={16} />
          <span>Return to Sign In</span>
        </button>
      </div>
    </div>
  );
}
