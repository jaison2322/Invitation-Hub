import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { Star } from 'lucide-react';
import appLogo from '../assets/icon.png';

export default function SplashScreen() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAppStore();

  useEffect(() => {
    const timer = setTimeout(() => {
      if (isAuthenticated) {
        navigate('/dashboard', { replace: true });
      } else {
        navigate('/login', { replace: true });
      }
    }, 2800);
    return () => clearTimeout(timer);
  }, [navigate, isAuthenticated]);

  const handleProceed = () => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    } else {
      navigate('/login', { replace: true });
    }
  };

  return (
    <div
      className="splash-screen cursor-pointer select-none"
      onClick={handleProceed}
      title="Tap to continue"
    >
      {/* Golden Envelope Flaps */}
      <div className="envelope-flap-top" />
      <div className="envelope-flap-bottom" />

      {/* Wax Seal */}
      <div className="envelope-seal">
        <Star size={24} strokeWidth={2} fill="currentColor" />
      </div>

      {/* Revealed Content */}
      <div className="envelope-content">
        <img
          src={appLogo}
          alt="Invitation Hub"
          className="envelope-logo"
        />
        <div
          className="splash-title font-heading font-extrabold text-white text-center"
          style={{ fontSize: '26px', letterSpacing: '0.06em', textTransform: 'uppercase', color: '#ffffff' }}
        >
          Invitation Hub
        </div>
        <div className="splash-subtitle text-center">
          VIP Event Intelligence
        </div>
      </div>

      {/* Gold Progress Bar */}
      <div className="splash-progress">
        <div className="splash-progress-track">
          <div className="splash-progress-bar" />
        </div>
      </div>

      {/* Tap hint */}
      <div
        style={{
          position: 'absolute',
          bottom: '24px',
          fontSize: '11px',
          color: 'rgba(212, 175, 55, 0.45)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          fontWeight: 500,
        }}
      >
        Tap anywhere to enter
      </div>
    </div>
  );
}
