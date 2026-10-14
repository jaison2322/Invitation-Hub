import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
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
    }, 1800);
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
      {/* Executive Protocol Emblem */}
      <div
        className="splash-logo"
        style={{
          width: '72px',
          height: '72px',
          borderRadius: '18px',
          overflow: 'hidden',
          marginBottom: '20px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 24px rgba(212, 175, 55, 0.25)',
          border: '1px solid rgba(212, 175, 55, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <img
          src={appLogo}
          alt="Invitation Hub"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>

      <div
        className="splash-title font-heading font-extrabold text-white text-center"
        style={{ fontSize: '24px', letterSpacing: '0.04em', textTransform: 'uppercase', color: '#ffffff' }}
      >
        Invitation Hub
      </div>
      {/* Apple Minimalist Progress Indicator */}
      <div
        style={{
          position: 'absolute',
          bottom: '50px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <div
          style={{
            width: '100px',
            height: '2px',
            background: 'rgba(255, 255, 255, 0.12)',
            borderRadius: '1px',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              height: '100%',
              width: '60%',
              background: '#ffffff',
              borderRadius: '1px',
              animation: 'slideInRight 1.5s ease-in-out infinite alternate',
            }}
          />
        </div>
      </div>
    </div>
  );
}
