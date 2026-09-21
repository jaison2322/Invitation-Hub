import { useState, useEffect, useRef, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { runAIAnalysis, DEMO_OCR_TEXTS } from '../services/aiService';
import { getCachedScanImage } from '../utils/imagePreprocess';
import { extractInvitationFromImage, type VisionOcrResult } from '../services/visionOcrService';
import {
  ScanText, Users, CalendarSearch, Sparkles, Loader2, Check,
  AlertTriangle, Camera, PenLine, RotateCcw,
} from 'lucide-react';

interface Step {
  label: string;
  icon: ReactNode;
  status: 'pending' | 'active' | 'completed';
}

export default function AIProcessingScreen() {
  const navigate = useNavigate();
  const { people, familyEvents, schedule, invitations, setScanResult } = useAppStore();
  const [steps, setSteps] = useState<Step[]>([
    { label: 'Reading invitation text...', icon: <ScanText size={15} strokeWidth={1.8} />, status: 'pending' },
    { label: 'Extracting key protocol details...', icon: <Loader2 size={15} className="animate-spin" />, status: 'pending' },
    { label: 'Cross-referencing VIP relationships...', icon: <Users size={15} strokeWidth={1.8} />, status: 'pending' },
    { label: 'Detecting schedule & calendar conflicts...', icon: <CalendarSearch size={15} strokeWidth={1.8} />, status: 'pending' },
    { label: 'Formulating attendance recommendation...', icon: <Sparkles size={15} strokeWidth={1.8} />, status: 'pending' },
  ]);
  const [errorState, setErrorState] = useState<string | null>(null);
  const processingRef = useRef(false);

  useEffect(() => {
    if (processingRef.current) return;
    processingRef.current = true;

    let imageData: string | null = null;
    try {
      imageData = sessionStorage.getItem('scan-image');
    } catch {}
    if (!imageData) {
      imageData = getCachedScanImage();
    }
    if (!imageData) {
      navigate('/scan', { replace: true });
      return;
    }

    const isDemo = imageData === 'demo';
    processInvitation(isDemo, imageData);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const processInvitation = async (isDemo: boolean, imageDataUrl: string) => {
    console.log('[Scanner] Image selected');
    console.log('[Scanner] Image validated');
    console.log('[Scanner] Processing started');

    // Step 1: Reading invitation
    updateStep(0, 'active');

    let ocrText = '';
    let extractedFields: VisionOcrResult['fields'] | null = null;
    let ocrConfidence = 0.85;
    let visionMethod: VisionOcrResult['method'] = 'demo';

    if (isDemo) {
      // Demo mode — use sample text
      await delay(300);
      ocrText = DEMO_OCR_TEXTS[Math.floor(Math.random() * DEMO_OCR_TEXTS.length)];
      ocrConfidence = 0.95;
      console.log('[OCR] Demo mode');
      console.log(`[OCR] Text length: ${ocrText.length}`);
    } else {
      // Real image — use Gemini Vision API (or Tesseract fallback)
      try {
        const visionResult = await extractInvitationFromImage(imageDataUrl, { timeout: 12000 });
        visionMethod = visionResult.method;

        if (visionResult.success) {
          extractedFields = visionResult.fields;
          ocrText = visionResult.rawText;
          ocrConfidence = visionResult.confidence;
          console.log(`[VisionOCR] Method: ${visionResult.method}`);
          console.log(`[VisionOCR] Confidence: ${ocrConfidence}`);
        } else {
          // Both Vision API and Tesseract failed
          console.warn('[VisionOCR] All extraction methods failed:', visionResult.error);
          updateStep(0, 'completed');
          setErrorState(
            visionResult.error ||
            'Could not read the invitation image. The image may be too blurry, dark, or in an unsupported format.'
          );
          return;
        }
      } catch (err: any) {
        console.warn('[VisionOCR] Unexpected error:', err);
        updateStep(0, 'completed');
        setErrorState(
          'An unexpected error occurred while analyzing the image. Please try again or enter details manually.'
        );
        return;
      }
    }

    updateStep(0, 'completed');

    // Step 2: Extracting details
    updateStep(1, 'active');
    await delay(200);
    updateStep(1, 'completed');

    // Step 3: Checking relationships
    updateStep(2, 'active');
    await delay(200);
    updateStep(2, 'completed');

    // Step 4: Analyzing schedule
    updateStep(3, 'active');
    await delay(200);
    updateStep(3, 'completed');

    // Step 5: Generating recommendation
    updateStep(4, 'active');
    await delay(200);

    const rawOcr = {
      rawText: ocrText,
      confidence: ocrConfidence,
    };

    // If Vision API returned structured fields, use those directly.
    // Otherwise, fall back to regex parsing of OCR text.
    const analysis = runAIAnalysis(
      ocrText,
      people,
      familyEvents,
      schedule,
      invitations,
      rawOcr,
      visionMethod !== 'demo' && visionMethod !== 'tesseract_fallback'
        ? extractedFields ?? undefined
        : undefined
    );

    updateStep(4, 'completed');

    console.log('[Form] Auto-fill started');
    setScanResult({
      imageDataUrl: isDemo ? '' : imageDataUrl,
      ocrText,
      extractedFields: analysis.extractedFields,
      analysis,
    });
    console.log('[Form] Auto-fill completed');

    await delay(300);
    navigate('/extracted-details', { replace: true });
  };

  const updateStep = (index: number, status: Step['status']) => {
    setSteps((prev) =>
      prev.map((step, i) => (i === index ? { ...step, status } : step))
    );
  };

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // ── Error State UI ─────────────────────────────────────────────────────────
  if (errorState) {
    return (
      <div className="screen-no-nav flex flex-col items-center justify-center" style={{ minHeight: '100vh' }}>
        <div style={{ width: '100%', maxWidth: '340px', padding: '0 16px' }}>
          {/* Error Icon */}
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '20px',
              background: 'rgba(28, 28, 30, 0.9)',
              border: '1px solid rgba(255, 159, 10, 0.4)',
              boxShadow: '0 0 24px rgba(255, 159, 10, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
              color: '#ff9f0a',
            }}
          >
            <AlertTriangle size={28} strokeWidth={1.8} />
          </div>

          <h2
            className="font-heading font-semibold text-white text-center"
            style={{ fontSize: '20px', letterSpacing: '-0.02em', marginBottom: '6px' }}
          >
            Recognition Issue
          </h2>
          <p
            className="text-center"
            style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '28px', lineHeight: '1.5' }}
          >
            {errorState}
          </p>

          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              className="btn btn-gold w-full"
              onClick={() => {
                setErrorState(null);
                processingRef.current = false;
                navigate('/scan', { replace: true });
              }}
            >
              <Camera size={16} strokeWidth={2} />
              <span>Try Different Photo</span>
            </button>

            <button
              type="button"
              className="btn btn-ignore w-full"
              onClick={() => navigate('/add-invitation', { replace: true })}
            >
              <PenLine size={16} strokeWidth={2} />
              <span>Enter Details Manually</span>
            </button>

            <button
              type="button"
              className="btn-ghost flex items-center justify-center gap-2"
              style={{ fontSize: '13px', color: 'var(--color-accent)', marginTop: '4px' }}
              onClick={() => {
                setErrorState(null);
                processingRef.current = false;

                // Re-trigger processing
                let imageData: string | null = null;
                try { imageData = sessionStorage.getItem('scan-image'); } catch {}
                if (!imageData) imageData = getCachedScanImage();
                if (imageData) {
                  setSteps((prev) => prev.map((s) => ({ ...s, status: 'pending' as const })));
                  processInvitation(imageData === 'demo', imageData);
                } else {
                  navigate('/scan', { replace: true });
                }
              }}
            >
              <RotateCcw size={14} strokeWidth={2} />
              <span>Retry Analysis</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Normal Processing UI ───────────────────────────────────────────────────
  return (
    <div className="screen-no-nav flex flex-col items-center justify-center" style={{ minHeight: '100vh' }}>
      <div style={{ width: '100%', maxWidth: '340px', padding: '0 16px' }}>
        {/* Apple Intelligence Glowing Ring Centerpiece */}
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '20px',
            background: 'rgba(28, 28, 30, 0.9)',
            border: '1px solid rgba(100, 180, 255, 0.4)',
            boxShadow: '0 0 24px rgba(100, 180, 255, 0.25), 0 0 40px rgba(180, 100, 255, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            color: '#64d2ff',
          }}
        >
          <Sparkles size={28} strokeWidth={1.8} />
        </div>

        <h2 className="font-heading font-semibold text-white text-center" style={{ fontSize: '20px', letterSpacing: '-0.02em', marginBottom: '4px' }}>
          Apple Intelligence
        </h2>
        <p className="text-center" style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '28px' }}>
          Analyzing document layout & VIP protocol...
        </p>

        {/* Inset Grouped Steps List */}
        <div className="ios-grouped-list">
          {steps.map((step, i) => (
            <div
              key={i}
              className="ios-grouped-item"
              style={{
                cursor: 'default',
                padding: '12px 14px',
                opacity: step.status === 'pending' ? 0.35 : 1,
                transition: 'opacity 0.25s ease',
              }}
            >
              <div
                className="ios-icon-squircle"
                style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '7px',
                  background:
                    step.status === 'completed'
                      ? 'rgba(48, 209, 88, 0.15)'
                      : step.status === 'active'
                      ? 'rgba(10, 132, 255, 0.15)'
                      : 'rgba(255, 255, 255, 0.05)',
                  color:
                    step.status === 'completed'
                      ? '#30d158'
                      : step.status === 'active'
                      ? '#0a84ff'
                      : 'var(--color-text-muted)',
                }}
              >
                {step.status === 'completed' ? (
                  <Check size={14} strokeWidth={2.5} />
                ) : (
                  step.icon
                )}
              </div>
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: step.status === 'active' ? 600 : 400,
                  color: step.status === 'active' ? 'var(--color-accent)' : 'var(--color-text-primary)',
                }}
              >
                {step.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
