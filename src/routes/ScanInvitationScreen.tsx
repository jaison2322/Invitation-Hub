import { useState, useRef, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Upload, ArrowLeft, Sparkles, PenLine } from 'lucide-react';
import { permissionService } from '../services/permissionService';
import { setCachedScanImage } from '../utils/imagePreprocess';

export default function ScanInvitationScreen() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleFile = (file: File) => {
    setIsAnalyzing(false);
    const reader = new FileReader();
    reader.onload = (e) => {
      const rawDataUrl = e.target?.result as string;
      if (!rawDataUrl) return;

      // Downscale high-resolution camera images to avoid memory pressure and storage quotas
      const img = new Image();
      img.onload = () => {
        const maxDim = 1400;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, w, h);
            const optimized = canvas.toDataURL('image/jpeg', 0.88);
            setPreview(optimized);
            setCachedScanImage(optimized);
            return;
          }
        }
        setPreview(rawDataUrl);
        setCachedScanImage(rawDataUrl);
      };
      img.onerror = () => {
        setPreview(rawDataUrl);
        setCachedScanImage(rawDataUrl);
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleAnalyze = () => {
    if (isAnalyzing || !preview) return;
    setIsAnalyzing(true);
    try {
      sessionStorage.setItem('scan-image', preview);
    } catch {
      // Fallback handled via cachedScanImage
    }
    setCachedScanImage(preview);
    navigate('/ai-processing');
  };

  const handleOpenCamera = async () => {
    try {
      // 1. Check if permission is already granted
      const check = await permissionService.checkCamera();
      if (check.granted) {
        cameraInputRef.current?.click();
        return;
      }

      // 2. Request runtime permission
      const res = await permissionService.requestCamera();
      if (res.granted) {
        cameraInputRef.current?.click();
      } else {
        // 3. Handle denial safely without crashing; handle "Don't ask again"
        if (!res.canAskAgain) {
          const open = window.confirm(
            'Camera permission is required to capture invitation cards. Would you like to open App Settings to grant Camera permission?'
          );
          if (open) {
            permissionService.openSettings();
          }
        } else {
          alert('Camera permission was not granted. You can still choose an existing photo from your gallery or enter details manually.');
        }
      }
    } catch (err) {
      console.warn('Camera permission check fallback:', err);
      // Safe fallback
      cameraInputRef.current?.click();
    }
  };

  return (
    <div className="screen-no-nav">
      {/* ── Stationary Top Bar ────────────────────────────────────────────── */}
      <div className="screen-stationary-header">
        <div className="top-bar">
          <button className="top-bar-back" onClick={() => navigate(-1)} aria-label="Go Back">
            <ArrowLeft size={16} strokeWidth={2} />
          </button>
          <span className="top-bar-title">Document Scanner</span>
          <div style={{ width: '36px' }} />
        </div>
      </div>

      <div className="screen-scroll-body flex flex-col items-center justify-center gap-6" style={{ paddingLeft: '16px', paddingRight: '16px' }}>
        {!preview ? (
          <>
            {/* Apple Viewfinder Frame */}
            <div
              className="ios-card text-center cursor-pointer transition-transform"
              style={{
                width: '100%',
                maxWidth: '320px',
                padding: '40px 24px',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              {/* Corner Reticles */}
              <div
                style={{
                  position: 'absolute',
                  top: '12px',
                  left: '12px',
                  width: '20px',
                  height: '20px',
                  borderTop: '2px solid #0a84ff',
                  borderLeft: '2px solid #0a84ff',
                  borderRadius: '4px 0 0 0',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  width: '20px',
                  height: '20px',
                  borderTop: '2px solid #0a84ff',
                  borderRight: '2px solid #0a84ff',
                  borderRadius: '0 4px 0 0',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  bottom: '12px',
                  left: '12px',
                  width: '20px',
                  height: '20px',
                  borderBottom: '2px solid #0a84ff',
                  borderLeft: '2px solid #0a84ff',
                  borderRadius: '0 0 0 4px',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  bottom: '12px',
                  right: '12px',
                  width: '20px',
                  height: '20px',
                  borderBottom: '2px solid #0a84ff',
                  borderRight: '2px solid #0a84ff',
                  borderRadius: '0 0 4px 0',
                }}
              />

              <div
                className="ios-icon-squircle"
                style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '16px',
                  background: 'rgba(10, 132, 255, 0.15)',
                  color: '#0a84ff',
                  marginBottom: '16px',
                }}
              >
                <Camera size={24} strokeWidth={1.8} />
              </div>

              <h2 className="font-heading font-semibold text-white mb-1" style={{ fontSize: '17px' }}>
                Capture Invitation Card
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', maxWidth: '240px' }}>
                Position card within camera view or choose an existing photo
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2.5 w-full" style={{ maxWidth: '320px' }}>
              <button
                type="button"
                className="btn btn-gold w-full"
                onClick={handleOpenCamera}
              >
                <Camera size={16} strokeWidth={2} />
                <span>Open Camera</span>
              </button>

              <button
                type="button"
                className="btn btn-ignore w-full"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={16} strokeWidth={2} />
                <span>Choose Photo</span>
              </button>

              <button
                type="button"
                className="btn flex items-center justify-center gap-2 w-full"
                style={{
                  fontSize: '13px',
                  color: 'var(--color-text-primary)',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '12px',
                  padding: '10px',
                }}
                onClick={() => {
                  try { sessionStorage.setItem('scan-image', 'demo'); } catch {}
                  setCachedScanImage('demo');
                  navigate('/ai-processing');
                }}
              >
                <Sparkles size={14} strokeWidth={1.8} style={{ color: '#64d2ff' }} />
                <span>Test with Sample Invitation</span>
              </button>

              <button
                type="button"
                className="btn-ghost flex items-center justify-center gap-2 mt-1"
                style={{ fontSize: '13px', color: 'var(--color-accent)' }}
                onClick={() => navigate('/add-invitation')}
              >
                <PenLine size={14} strokeWidth={2} />
                <span>Enter Details Manually</span>
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Captured Preview */}
            <div style={{ width: '100%', maxWidth: '320px' }}>
              <img
                src={preview}
                alt="Invitation scan preview"
                style={{
                  width: '100%',
                  borderRadius: '18px',
                  border: '0.5px solid rgba(255, 255, 255, 0.2)',
                  boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
                }}
              />
            </div>

            <div className="flex gap-2 w-full" style={{ maxWidth: '320px' }}>
              <button
                type="button"
                className="btn btn-ignore flex-1"
                onClick={() => setPreview(null)}
              >
                Retake
              </button>
              <button
                type="button"
                className="btn btn-gold flex-1"
                onClick={handleAnalyze}
              >
                <Sparkles size={16} strokeWidth={2} />
                <span>Analyze</span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Hidden inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileInput}
        style={{ display: 'none' }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileInput}
        style={{ display: 'none' }}
      />
    </div>
  );
}
