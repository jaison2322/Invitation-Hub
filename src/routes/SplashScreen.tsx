import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

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
          width: '64px',
          height: '64px',
          borderRadius: '18px',
          background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.25) 0%, rgba(15, 23, 42, 0.6) 100%)',
          border: '1px solid rgba(212, 175, 55, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-gold-light)',
          marginBottom: '20px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 24px rgba(212, 175, 55, 0.2), inset 0 1px 0 0 rgba(255, 255, 255, 0.2)',
        }}
      >
        <Shield size={30} strokeWidth={2} />
      </div>

      <div
        className="font-heading font-extrabold text-white text-center"
        style={{ fontSize: '24px', letterSpacing: '0.04em', textTransform: 'uppercase' }}
      >
        VIP Intelligence
      </div>
      <div
        className="text-center"
        style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '6px', letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}
      >
        Executive Protocol & Relationship Ledger
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
