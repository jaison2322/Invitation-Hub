import React, { useRef, useEffect } from 'react';

interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  hasError?: boolean;
  autoFocus?: boolean;
}

export default function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  disabled = false,
  hasError = false,
  autoFocus = true,
}: OtpInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Initialize refs array
  useEffect(() => {
    inputRefs.current = inputRefs.current.slice(0, length);
  }, [length]);

  // Auto focus first input on mount
  useEffect(() => {
    if (autoFocus && inputRefs.current[0] && !disabled) {
      inputRefs.current[0].focus();
    }
  }, [autoFocus, disabled]);

  const digits = value.split('').slice(0, length);
  while (digits.length < length) {
    digits.push('');
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === 'Backspace') {
      e.preventDefault();
      const newDigits = [...digits];
      if (newDigits[index]) {
        // Clear current box
        newDigits[index] = '';
        const newValue = newDigits.join('');
        onChange(newValue);
      } else if (index > 0) {
        // Move back and clear previous box
        newDigits[index - 1] = '';
        const newValue = newDigits.join('');
        onChange(newValue);
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;

    const val = e.target.value;
    // Extract only digits
    const cleaned = val.replace(/\D/g, '');

    if (!cleaned) {
      const newDigits = [...digits];
      newDigits[index] = '';
      onChange(newDigits.join(''));
      return;
    }

    // Handle single character or multi-character input
    const char = cleaned.slice(-1);
    const newDigits = [...digits];
    newDigits[index] = char;
    const newValue = newDigits.join('');
    onChange(newValue);

    if (newValue.length === length && onComplete) {
      onComplete(newValue);
    }

    // Auto advance focus
    if (index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text');
    const numericOnly = pasteData.replace(/\D/g, '').slice(0, length);

    if (numericOnly) {
      onChange(numericOnly);
      if (numericOnly.length === length && onComplete) {
        onComplete(numericOnly);
      }
      const focusIndex = Math.min(numericOnly.length, length - 1);
      inputRefs.current[focusIndex]?.focus();
    }
  };

  return (
    <div
      className={`otp-input-container ${hasError ? 'has-error' : ''}`}
      style={{
        display: 'flex',
        justifyContent: 'center',
        gap: '8px',
        margin: '12px 0',
      }}
    >
      {digits.map((digit, index) => {
        const isFilled = digit !== '';
        return (
          <input
            key={index}
            ref={(el) => {
              inputRefs.current[index] = el;
            }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            value={digit}
            disabled={disabled}
            onChange={(e) => handleChange(index, e)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            className={`otp-digit-box ${isFilled ? 'filled' : ''} ${hasError ? 'error' : ''}`}
            aria-label={`Digit ${index + 1}`}
            autoComplete="one-time-code"
          />
        );
      })}
    </div>
  );
}
