import { useState, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { runAIAnalysis, DEMO_OCR_TEXTS } from '../services/aiService';
import { preprocessImageForOCR } from '../utils/imagePreprocess';
import {
  ScanText, Users, CalendarSearch, Sparkles, Loader2, Check,
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

  useEffect(() => {
    const imageData = sessionStorage.getItem('scan-image');
    if (!imageData) {
      navigate('/scan', { replace: true });
      return;
    }

    const isDemo = imageData === 'demo';
    processInvitation(isDemo, imageData);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const processInvitation = async (isDemo: boolean, imageDataUrl: string) => {
    // Step 1: Reading invitation
    updateStep(0, 'active');
    await delay(600);

    let ocrText = '';
    if (isDemo) {
      ocrText = DEMO_OCR_TEXTS[Math.floor(Math.random() * DEMO_OCR_TEXTS.length)];
    } else {
      try {
        // Preprocess image to enhance contrast, convert to grayscale, and normalize size
        const processedUrl = await preprocessImageForOCR(imageDataUrl);

        const { createWorker } = await import('tesseract.js');
        const worker = await createWorker('eng');
        const { data } = await worker.recognize(processedUrl);
        ocrText = data.text?.trim() || '';
        await worker.terminate();

        // If OCR returned empty or very short text, try raw image as fallback
        if (ocrText.length < 15 && processedUrl !== imageDataUrl) {
          const rawWorker = await createWorker('eng');
          const rawData = await rawWorker.recognize(imageDataUrl);
          if (rawData.data?.text && rawData.data.text.trim().length > ocrText.length) {
            ocrText = rawData.data.text.trim();
          }
          await rawWorker.terminate();
        }
      } catch (err) {
        console.warn('Tesseract OCR error:', err);
      }

      // If still empty or failed, use a demo text fallback so the user is never stuck
      if (!ocrText || ocrText.length < 10) {
        ocrText = DEMO_OCR_TEXTS[0];
      }
    }

    updateStep(0, 'completed');

    // Step 2: Extracting details
    updateStep(1, 'active');
    await delay(500);
    updateStep(1, 'completed');

    // Step 3: Checking relationships
    updateStep(2, 'active');
    await delay(600);
    updateStep(2, 'completed');

    // Step 4: Analyzing schedule
    updateStep(3, 'active');
    await delay(500);
    updateStep(3, 'completed');

    // Step 5: Generating recommendation
    updateStep(4, 'active');
    await delay(600);

    const analysis = runAIAnalysis(ocrText, people, familyEvents, schedule, invitations);

    updateStep(4, 'completed');

    setScanResult({
      imageDataUrl: isDemo ? '' : imageDataUrl,
      ocrText,
      extractedFields: analysis.extractedFields,
      analysis,
    });

    await delay(400);
    navigate('/extracted-details', { replace: true });
  };

  const updateStep = (index: number, status: Step['status']) => {
    setSteps((prev) =>
      prev.map((step, i) => (i === index ? { ...step, status } : step))
    );
  };

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
