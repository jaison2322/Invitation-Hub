/**
 * Image preprocessing utilities to optimize photos for Tesseract OCR.
 * - Validates input image
 * - Detects document boundaries against background and auto-crops
 * - Performs deskew for slightly tilted documents
 * - Normalizes resolution and enhances small text
 * - Eliminates shadows and uneven lighting (flat-field correction)
 * - Preserves Tamil Unicode script characters without aggressive binarization
 * - Supports multiple preprocessing attempts for OCR reliability
 */

export interface PreprocessOptions {
  maxDimension?: number;
  minDimension?: number;
  enhanceContrast?: boolean;
  sharpen?: boolean;
  deskew?: boolean;
  detectDocument?: boolean;
  attempt?: 1 | 2;
}

let _cachedScanImage: string | null = null;
export function setCachedScanImage(img: string | null): void {
  _cachedScanImage = img;
}
export function getCachedScanImage(): string | null {
  return _cachedScanImage;
}

/**
 * Lightweight image preparation for Vision API — only downscales to reduce payload size.
 * Skips heavy preprocessing (deskew, contrast, sharpening) since the LLM handles those natively.
 */
export async function prepareImageForVisionAPI(
  imageDataUrl: string,
  maxDimension = 1200
): Promise<string> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      resolve(imageDataUrl);
      return;
    }

    const safetyTimer = setTimeout(() => {
      resolve(imageDataUrl);
    }, 2000);

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      clearTimeout(safetyTimer);
      try {
        let w = img.width;
        let h = img.height;
        const maxDim = Math.max(w, h);

        if (maxDim <= maxDimension) {
          resolve(imageDataUrl);
          return;
        }

        const scale = maxDimension / maxDim;
        w = Math.round(w * scale);
        h = Math.round(h * scale);

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(imageDataUrl);
          return;
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      } catch {
        resolve(imageDataUrl);
      }
    };

    img.onerror = () => {
      clearTimeout(safetyTimer);
      resolve(imageDataUrl);
    };

    img.src = imageDataUrl;
  });
}

export async function validateImage(imageDataUrl: string): Promise<boolean> {
  if (!imageDataUrl || !imageDataUrl.startsWith('data:image/')) return false;
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      resolve(true);
      return;
    }
    const img = new Image();
    img.onload = () => {
      resolve(img.width >= 30 && img.height >= 30);
    };
    img.onerror = () => resolve(false);
    img.src = imageDataUrl;
  });
}

export async function preprocessImageForOCR(
  imageDataUrl: string,
  options: PreprocessOptions = {}
): Promise<string> {
  const {
    maxDimension = 1400,
    minDimension = 900,
    enhanceContrast = true,
    sharpen = true,
    deskew = true,
    detectDocument = true,
    attempt = 1,
  } = options;

  return new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      resolve(imageDataUrl);
      return;
    }

    // Safety timeout: Never let preprocessing hang more than 3 seconds
    const safetyTimer = setTimeout(() => {
      console.warn('[Scanner] Preprocessing timed out, using original image');
      resolve(imageDataUrl);
    }, 3000);

    const finish = (result: string) => {
      clearTimeout(safetyTimer);
      resolve(result);
    };

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        let width = img.width;
        let height = img.height;

        // 1. Initial Canvas
        let canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        let ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          finish(imageDataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        // 2. Document Detection & Auto-crop (if document is on a contrasting background)
        if (detectDocument && width > 200 && height > 200) {
          const cropBox = detectDocumentBounds(ctx, width, height);
          if (cropBox) {
            console.log('[Scanner] Document detected');
            const croppedCanvas = document.createElement('canvas');
            croppedCanvas.width = cropBox.width;
            croppedCanvas.height = cropBox.height;
            const cropCtx = croppedCanvas.getContext('2d', { willReadFrequently: true });
            if (cropCtx) {
              cropCtx.drawImage(
                canvas,
                cropBox.x, cropBox.y, cropBox.width, cropBox.height,
                0, 0, cropBox.width, cropBox.height
              );
              canvas = croppedCanvas;
              ctx = cropCtx;
              width = cropBox.width;
              height = cropBox.height;
            }
          }
        }

        // 3. Resolution Normalization & Scaling for Small Text
        let targetWidth = width;
        let targetHeight = height;

        // If small, upscale so small Tamil characters and diacritics are clear
        const currentMin = Math.min(width, height);
        if (currentMin < minDimension) {
          const scale = minDimension / currentMin;
          targetWidth = Math.round(width * scale);
          targetHeight = Math.round(height * scale);
        }

        // If too large, downscale to avoid high memory usage
        const currentMax = Math.max(targetWidth, targetHeight);
        if (currentMax > maxDimension) {
          const scale = maxDimension / currentMax;
          targetWidth = Math.round(targetWidth * scale);
          targetHeight = Math.round(targetHeight * scale);
        }

        if (targetWidth !== width || targetHeight !== height) {
          const scaledCanvas = document.createElement('canvas');
          scaledCanvas.width = targetWidth;
          scaledCanvas.height = targetHeight;
          const scaledCtx = scaledCanvas.getContext('2d', { willReadFrequently: true });
          if (scaledCtx) {
            scaledCtx.imageSmoothingEnabled = true;
            scaledCtx.imageSmoothingQuality = 'high';
            scaledCtx.drawImage(canvas, 0, 0, targetWidth, targetHeight);
            canvas = scaledCanvas;
            ctx = scaledCtx;
            width = targetWidth;
            height = targetHeight;
          }
        }

        // 4. Deskew slight tilts (-4 to +4 degrees)
        if (deskew && width > 300 && height > 300) {
          const skewAngle = estimateSkewAngle(ctx, width, height);
          if (Math.abs(skewAngle) >= 0.5) {
            const deskewedCanvas = document.createElement('canvas');
            deskewedCanvas.width = width;
            deskewedCanvas.height = height;
            const dctx = deskewedCanvas.getContext('2d', { willReadFrequently: true });
            if (dctx) {
              dctx.save();
              dctx.translate(width / 2, height / 2);
              dctx.rotate((-skewAngle * Math.PI) / 180);
              dctx.drawImage(canvas, -width / 2, -height / 2);
              dctx.restore();
              canvas = deskewedCanvas;
              ctx = dctx;
            }
          }
        }

        // 5. Illumination Correction & Contrast Enhancement
        const imgData = ctx.getImageData(0, 0, width, height);
        const data = imgData.data;

        if (attempt === 1) {
          // Attempt 1: Gentle shadow flattening and optimal color separation
          // Tamil cards often have red/maroon/gold ink on cream/yellow paper.
          // In red ink on yellow paper, the Green channel provides maximum contrast!
          applyOptimalContrastAndFlatten(data, width, height, enhanceContrast);
        } else {
          // Attempt 2: Alternative contrast enhancement (grayscale S-curve with boosted midtones)
          applyAlternativeGrayscale(data, width, height);
        }

        // 6. Moderate Sharpening (Gentle Unsharp Mask to keep Tamil pullis and loops crisp)
        if (sharpen) {
          applyModerateSharpen(imgData, width, height);
        } else {
          ctx.putImageData(imgData, 0, 0);
        }

        console.log('[Scanner] Image preprocessing completed');
        finish(canvas.toDataURL('image/jpeg', 0.92));
      } catch (err) {
        console.warn('[Scanner] Image preprocessing fallback:', err);
        finish(imageDataUrl);
      }
    };

    img.onerror = () => {
      finish(imageDataUrl);
    };

    img.src = imageDataUrl;
  });
}

/**
 * Detects document bounds by sampling perimeter pixels to estimate background,
 * then identifying the document's bounding box.
 */
function detectDocumentBounds(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): { x: number; y: number; width: number; height: number } | null {
  try {
    // Work on downsampled canvas for speed
    const sampleW = 160;
    const sampleH = Math.round((height * sampleW) / width);
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = sampleW;
    thumbCanvas.height = sampleH;
    const thumbCtx = thumbCanvas.getContext('2d', { willReadFrequently: true });
    if (!thumbCtx) return null;

    thumbCtx.drawImage(ctx.canvas, 0, 0, sampleW, sampleH);
    const thumbData = thumbCtx.getImageData(0, 0, sampleW, sampleH).data;

    // Sample border pixels to find background color
    let bgR = 0, bgG = 0, bgB = 0, borderCount = 0;
    const borderThickness = Math.max(2, Math.floor(sampleW * 0.04));

    for (let y = 0; y < sampleH; y++) {
      for (let x = 0; x < sampleW; x++) {
        if (
          y < borderThickness ||
          y >= sampleH - borderThickness ||
          x < borderThickness ||
          x >= sampleW - borderThickness
        ) {
          const idx = (y * sampleW + x) * 4;
          bgR += thumbData[idx];
          bgG += thumbData[idx + 1];
          bgB += thumbData[idx + 2];
          borderCount++;
        }
      }
    }

    if (borderCount === 0) return null;
    bgR /= borderCount;
    bgG /= borderCount;
    bgB /= borderCount;

    // Scan for pixels that differ noticeably from background
    const threshold = 38;
    let minX = sampleW, maxX = 0, minY = sampleH, maxY = 0;
    let foregroundCount = 0;

    for (let y = 0; y < sampleH; y++) {
      for (let x = 0; x < sampleW; x++) {
        const idx = (y * sampleW + x) * 4;
        const dist = Math.hypot(
          thumbData[idx] - bgR,
          thumbData[idx + 1] - bgG,
          thumbData[idx + 2] - bgB
        );
        if (dist > threshold) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          foregroundCount++;
        }
      }
    }

    const docW = maxX - minX;
    const docH = maxY - minY;
    const totalPixels = sampleW * sampleH;

    // Check if valid document bounds were discovered:
    // Must occupy between 25% and 96% of the frame
    if (
      foregroundCount > totalPixels * 0.25 &&
      docW > sampleW * 0.35 &&
      docH > sampleH * 0.35 &&
      (docW < sampleW * 0.96 || docH < sampleH * 0.96)
    ) {
      // Map back to full resolution with a 2% safety padding margin
      const scaleX = width / sampleW;
      const scaleY = height / sampleH;
      const padX = Math.round(width * 0.02);
      const padY = Math.round(height * 0.02);

      const x = Math.max(0, Math.round(minX * scaleX) - padX);
      const y = Math.max(0, Math.round(minY * scaleY) - padY);
      const w = Math.min(width - x, Math.round(docW * scaleX) + padX * 2);
      const h = Math.min(height - y, Math.round(docH * scaleY) + padY * 2);

      return { x, y, width: w, height: h };
    }
  } catch (err) {
    console.debug('detectDocumentBounds skipped:', err);
  }
  return null;
}

/**
 * Estimates skew angle using horizontal projection profile variance.
 */
function estimateSkewAngle(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): number {
  try {
    const sw = 120;
    const sh = Math.round((height * sw) / width);
    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const sctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!sctx) return 0;

    sctx.drawImage(ctx.canvas, 0, 0, sw, sh);
    const data = sctx.getImageData(0, 0, sw, sh).data;

    let bestAngle = 0;
    let maxVariance = 0;

    // Test angles from -3.5 to +3.5 degrees in 0.5 degree steps
    for (let angle = -3.5; angle <= 3.5; angle += 0.5) {
      const rad = (angle * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);

      const rowSums = new Float32Array(sh);
      const cx = sw / 2;
      const cy = sh / 2;

      for (let y = 0; y < sh; y += 2) {
        for (let x = 0; x < sw; x += 2) {
          const idx = (y * sw + x) * 4;
          // Invert brightness: dark text = higher weight
          const dark = 255 - (data[idx] * 0.3 + data[idx + 1] * 0.59 + data[idx + 2] * 0.11);
          if (dark > 60) {
            const rotY = Math.round((x - cx) * sin + (y - cy) * cos + cy);
            if (rotY >= 0 && rotY < sh) {
              rowSums[rotY] += dark;
            }
          }
        }
      }

      // Calculate variance of rowSums
      let sum = 0;
      for (let i = 0; i < sh; i++) sum += rowSums[i];
      const mean = sum / sh;
      let variance = 0;
      for (let i = 0; i < sh; i++) {
        const diff = rowSums[i] - mean;
        variance += diff * diff;
      }

      if (variance > maxVariance) {
        maxVariance = variance;
        bestAngle = angle;
      }
    }

    return bestAngle;
  } catch {
    return 0;
  }
}

/**
 * Applies illumination flattening and optimal contrast preservation for Tamil documents.
 * Green channel separation isolates red/maroon ink from yellow/ivory paper.
 */
function applyOptimalContrastAndFlatten(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  enhanceContrast: boolean
): void {
  // Step 1: Compute optimal luminance for each pixel
  // 50% Green + 30% Blue + 20% Red provides optimal contrast for dark/red/gold text on paper
  const lumArray = new Uint8Array(width * height);
  let minLum = 255;
  let maxLum = 0;

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = Math.round(0.20 * r + 0.52 * g + 0.28 * b);
    lumArray[p] = lum;
    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
  }

  // Step 2: Illumination flattening across background grid (32x32 blocks)
  const gridX = 32;
  const gridY = 32;
  const bgEstimates = new Float32Array(gridX * gridY);
  const blockW = width / gridX;
  const blockH = height / gridY;

  // Find 90th percentile (background paper brightness) in each block
  for (let gy = 0; gy < gridY; gy++) {
    for (let gx = 0; gx < gridX; gx++) {
      const startX = Math.floor(gx * blockW);
      const endX = Math.floor((gx + 1) * blockW);
      const startY = Math.floor(gy * blockH);
      const endY = Math.floor((gy + 1) * blockH);

      let maxB = 0;
      for (let y = startY; y < endY; y += 3) {
        for (let x = startX; x < endX; x += 3) {
          const l = lumArray[y * width + x];
          if (l > maxB) maxB = l;
        }
      }
      bgEstimates[gy * gridX + gx] = maxB || maxLum;
    }
  }

  // Step 3: Normalize pixel luminance using background estimate
  const lumRange = maxLum - minLum || 1;

  for (let y = 0; y < height; y++) {
    const gy = Math.min(gridY - 1, Math.floor(y / blockH));
    for (let x = 0; x < width; x++) {
      const gx = Math.min(gridX - 1, Math.floor(x / blockW));
      const bg = bgEstimates[gy * gridX + gx] || 255;
      const pixelIndex = y * width + x;
      const lum = lumArray[pixelIndex];

      // Flat-field correction: divide pixel by background estimate
      let normalized = (lum / (bg || 1)) * 235;

      if (enhanceContrast) {
        // Linear contrast stretch with protection for thin strokes
        normalized = ((normalized - minLum) / lumRange) * 255;

        // Mild S-curve (preserving Tamil loops and pullis without harsh cutoff)
        if (normalized < 110) {
          normalized = Math.max(0, normalized * 0.88);
        } else if (normalized > 160) {
          normalized = Math.min(255, normalized * 1.08);
        }
      }

      normalized = Math.max(0, Math.min(255, normalized));
      const idx = pixelIndex * 4;
      data[idx] = normalized;
      data[idx + 1] = normalized;
      data[idx + 2] = normalized;
    }
  }
}

/**
 * Alternative Grayscale for secondary OCR attempt.
 */
function applyAlternativeGrayscale(
  data: Uint8ClampedArray,
  width: number,
  height: number
): void {
  let minLum = 255;
  let maxLum = 0;

  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
  }

  const range = maxLum - minLum || 1;
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const val = Math.max(0, Math.min(255, ((lum - minLum) / range) * 255));
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
  }
}

/**
 * Moderate 3x3 unsharp mask sharpening to crispen characters without artifacts.
 */
function applyModerateSharpen(
  imgData: ImageData,
  width: number,
  height: number
): void {
  const src = new Uint8ClampedArray(imgData.data);
  const dst = imgData.data;

  // Mild kernel: center 1.8, cross neighbors -0.2
  const centerWeight = 1.8;
  const neighborWeight = -0.2;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      const topIdx = ((y - 1) * width + x) * 4;
      const btmIdx = ((y + 1) * width + x) * 4;
      const leftIdx = (y * width + (x - 1)) * 4;
      const rightIdx = (y * width + (x + 1)) * 4;

      const val =
        src[idx] * centerWeight +
        (src[topIdx] + src[btmIdx] + src[leftIdx] + src[rightIdx]) * neighborWeight;

      const clamped = Math.max(0, Math.min(255, val));
      dst[idx] = clamped;
      dst[idx + 1] = clamped;
      dst[idx + 2] = clamped;
    }
  }
}
