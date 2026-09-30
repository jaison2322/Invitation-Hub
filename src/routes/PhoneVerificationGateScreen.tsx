import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';

/**
 * PhoneVerificationGateScreen (Deprecated)
 * Phone OTP verification has been completely removed from the application.
 * This screen safely redirects authenticated users to the dashboard and unauthenticated users to login.
 */
export default function PhoneVerificationGateScreen() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAppStore();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    } else {
      navigate('/login', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  return null;
}
