import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught application error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/dashboard';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            background: 'var(--color-bg, #060a13)',
            color: 'var(--color-text-primary, #ffffff)',
            fontFamily: 'inherit',
          }}
        >
          <div
            style={{
              maxWidth: '420px',
              width: '100%',
              padding: '28px 24px',
              borderRadius: '20px',
              background: 'var(--color-surface, rgba(255, 255, 255, 0.04))',
              border: '1px solid var(--glass-border, rgba(212, 175, 55, 0.2))',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
              textAlign: 'center',
              backdropFilter: 'blur(20px)',
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                margin: '0 auto 18px',
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ef4444',
              }}
            >
              <AlertTriangle size={28} strokeWidth={2} />
            </div>

            <h2
              style={{
                fontSize: '20px',
                fontWeight: 700,
                marginBottom: '8px',
                letterSpacing: '-0.01em',
              }}
            >
              Something went unexpected
            </h2>

            <p
              style={{
                fontSize: '14px',
                color: 'var(--color-text-muted, #94a3b8)',
                lineHeight: '1.5',
                marginBottom: '24px',
              }}
            >
              An unexpected display issue occurred. Your data is secure. You can reload the view or return to the main dashboard.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                type="button"
                onClick={this.handleReload}
                className="btn btn-gold"
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '12px',
                  borderRadius: '12px',
                  fontWeight: 600,
                }}
              >
                <RefreshCw size={16} strokeWidth={2} />
                <span>Reload Application</span>
              </button>

              <button
                type="button"
                onClick={this.handleReset}
                className="btn btn-outline"
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '12px',
                  borderRadius: '12px',
                  fontWeight: 600,
                }}
              >
                <Home size={16} strokeWidth={1.8} />
                <span>Return to Dashboard</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

