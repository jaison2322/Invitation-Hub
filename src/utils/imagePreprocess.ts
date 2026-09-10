/**
 * Image preprocessing utilities to optimize photos for Tesseract OCR.
 * - Resizes large camera photos to optimal dimensions (max 1600px)
 * - Enhances contrast using histogram stretching
 * - Converts to grayscale to eliminate colored noise and gold/foil reflections
 */

export async function preprocessImageForOCR(
  imageDataUrl: string,
  options: {
    maxDimension?: number;
    enhanceContrast?: boolean;
    sharpen?: boolean;
  } = {}
): Promise<string> {
  const {
    maxDimension = 1600,
    enhanceContrast = true,
  } = options;

  return new Promise((resolve) => {
    // If not in browser environment (e.g. Node tests), return as-is
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      resolve(imageDataUrl);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        let { width, height } = img;

        // Calculate scaled dimensions
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        if (!ctx) {
          resolve(imageDataUrl);
          return;
        }

        // Draw resized image
        ctx.drawImage(img, 0, 0, width, height);

        if (enhanceContrast) {
          const imgData = ctx.getImageData(0, 0, width, height);
          const data = imgData.data;

          // Pass 1: Convert to grayscale and find min/max luminance
          let minLum = 255;
          let maxLum = 0;

          for (let i = 0; i < data.length; i += 4) {
            // Standard perceptual luminance
            const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            if (lum < minLum) minLum = lum;
            if (lum > maxLum) maxLum = lum;
          }

          // Avoid divide by zero
          const lumRange = maxLum - minLum || 1;

          // Pass 2: Contrast stretch & binarize curve (soft S-curve)
          for (let i = 0; i < data.length; i += 4) {
            const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            // Normalize between 0 and 255
            let normalized = ((lum - minLum) / lumRange) * 255;

            // Apply mild S-curve for higher contrast on text
            if (normalized < 128) {
              normalized = Math.max(0, normalized * 0.85);
            } else {
              normalized = Math.min(255, normalized * 1.15);
            }

            data[i] = normalized;     // R
            data[i + 1] = normalized; // G
            data[i + 2] = normalized; // B
            // Alpha remains unchanged (data[i + 3])
          }

          ctx.putImageData(imgData, 0, 0);
        }

        resolve(canvas.toDataURL('image/jpeg', 0.92));
      } catch (err) {
        console.warn('Image preprocessing failed, using raw image:', err);
        resolve(imageDataUrl);
      }
    };

    img.onerror = () => {
      resolve(imageDataUrl);
    };

    img.src = imageDataUrl;
  });
}
