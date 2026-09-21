/**
 * Vision OCR Service — Extracts structured invitation data using Google Gemini Vision API.
 *
 * This replaces the unreliable Tesseract.js client-side OCR with a single Vision LLM call
 * that both reads the text AND extracts structured fields in one pass.
 *
 * Falls back to Tesseract.js + regex parsing if the API is unavailable.
 */

import type { ExtractedFields, EventType } from '../types';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VisionOcrResult {
  success: boolean;
  /** Structured fields extracted directly by the Vision model */
  fields: ExtractedFields;
  /** Raw OCR text (for logging / fallback parsing) */
  rawText: string;
  /** Overall confidence from the model (0-1) */
  confidence: number;
  /** Which method was used */
  method: 'gemini_vision' | 'tesseract_fallback' | 'demo';
  /** Error message if failed */
  error?: string;
}

// ─── Gemini Vision API ───────────────────────────────────────────────────────

const GEMINI_API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEMINI_API_KEY) || '';

const GEMINI_MODEL = 'gemini-2.5-flash';

const EXTRACTION_PROMPT = `You are an expert at reading invitation cards (wedding, birthday, engagement, house warming, etc.) in both Tamil and English.

Analyze this invitation image and extract ALL details into the following JSON structure. Be thorough — look for Tamil script, English text, dates in any format, venue names, person names, etc.

Return ONLY valid JSON with these fields:
{
  "eventType": one of: "wedding", "engagement", "birthday", "anniversary", "house_warming", "baby_shower", "graduation", "retirement", "funeral", "business_event", "reception", "cultural", "religious", "other",
  "title": a short descriptive title for this invitation (e.g. "Karthik & Divya's Wedding"),
  "mainPerson": the main person or couple's name (e.g. "Karthik Kumar & Divya Sharma"),
  "hostName": the host or family inviting (e.g. "Sri Ramesh Kumar & Smt. Padma Kumar"),
  "date": the event date in YYYY-MM-DD format (e.g. "2026-08-30"),
  "time": the event time in HH:MM 24-hour format (e.g. "18:00"),
  "venue": the venue/hall name (e.g. "Chennai Convention Centre"),
  "location": the city or area (e.g. "Chennai"),
  "description": a brief 1-2 sentence summary of the invitation,
  "rawText": the full text you can read from the image (for reference),
  "confidence": your confidence in the extraction as a number from 0.0 to 1.0,
  "fieldConfidence": {
    "eventType": 0.0-1.0,
    "date": 0.0-1.0,
    "time": 0.0-1.0,
    "venue": 0.0-1.0,
    "location": 0.0-1.0,
    "mainPerson": 0.0-1.0,
    "hostName": 0.0-1.0,
    "title": 0.0-1.0
  }
}

Rules:
- If a field is not found, use null
- For Tamil dates, convert to YYYY-MM-DD format
- For Tamil times like "முற்பகல் 9.00 மணி", convert to 24-hour HH:MM format
- Include both Tamil and English names if present
- Be generous with confidence — if you can see it clearly, use 0.90+
- Return ONLY the JSON object, no markdown, no explanation`;

/**
 * Main entry point: extracts invitation data from an image using Gemini Vision API.
 * Falls back to Tesseract.js if API is unavailable.
 */
export async function extractInvitationFromImage(
  imageDataUrl: string,
  options: { timeout?: number } = {}
): Promise<VisionOcrResult> {
  const { timeout = 12000 } = options;

  // Try Gemini Vision first
  if (GEMINI_API_KEY) {
    try {
      const result = await callGeminiVision(imageDataUrl, timeout);
      if (result.success) {
        console.log('[VisionOCR] Gemini Vision succeeded');
        return result;
      }
      console.warn('[VisionOCR] Gemini Vision returned unsuccessful result, falling back');
    } catch (err) {
      console.warn('[VisionOCR] Gemini Vision failed, falling back to Tesseract:', err);
    }
  } else {
    console.warn('[VisionOCR] No VITE_GEMINI_API_KEY configured, using Tesseract fallback');
  }

  // Fallback: Tesseract.js (existing behavior)
  return await tesseractFallback(imageDataUrl);
}

/**
 * Calls Google Gemini Vision API to extract structured data from the invitation image.
 */
async function callGeminiVision(
  imageDataUrl: string,
  timeout: number
): Promise<VisionOcrResult> {
  // Extract base64 and MIME type from data URL
  const match = imageDataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid image data URL format');
  }

  const mimeType = match[1];
  const base64Data = match[2];

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: EXTRACTION_PROMPT },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Data,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
    },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Gemini API error ${response.status}: ${errText}`);
    }

    const data = await response.json();

    // Extract the text response from Gemini
    const textContent =
      data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!textContent) {
      throw new Error('Empty response from Gemini');
    }

    // Parse the JSON response
    const parsed = parseGeminiResponse(textContent);
    return parsed;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Gemini Vision API timed out');
    }
    throw err;
  }
}

/**
 * Parses the raw JSON text from Gemini into a structured VisionOcrResult.
 */
function parseGeminiResponse(jsonText: string): VisionOcrResult {
  // Clean potential markdown fencing
  let cleaned = jsonText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse Gemini JSON response: ${cleaned.substring(0, 200)}`);
  }

  const fieldConfidence = parsed.fieldConfidence || {};

  const confidence: Record<string, number> = {
    eventType: fieldConfidence.eventType ?? (parsed.eventType ? 0.90 : 0.30),
    date: fieldConfidence.date ?? (parsed.date ? 0.92 : 0.25),
    time: fieldConfidence.time ?? (parsed.time ? 0.90 : 0.25),
    venue: fieldConfidence.venue ?? (parsed.venue ? 0.88 : 0.25),
    location: fieldConfidence.location ?? (parsed.location ? 0.85 : 0.25),
    mainPerson: fieldConfidence.mainPerson ?? (parsed.mainPerson ? 0.88 : 0.25),
    hostName: fieldConfidence.hostName ?? (parsed.hostName ? 0.80 : 0.20),
    title: fieldConfidence.title ?? (parsed.title ? 0.90 : 0.35),
  };

  const validEventTypes: EventType[] = [
    'wedding', 'engagement', 'birthday', 'anniversary', 'house_warming',
    'baby_shower', 'graduation', 'retirement', 'funeral', 'business_event',
    'reception', 'cultural', 'religious', 'other',
  ];

  const eventType = validEventTypes.includes(parsed.eventType)
    ? parsed.eventType
    : 'other';

  const fields: ExtractedFields = {
    eventType,
    title: parsed.title || undefined,
    mainPerson: parsed.mainPerson || undefined,
    hostName: parsed.hostName || undefined,
    date: isValidDate(parsed.date) ? parsed.date : undefined,
    time: isValidTime(parsed.time) ? parsed.time : undefined,
    venue: parsed.venue || undefined,
    location: parsed.location || undefined,
    description: parsed.description || undefined,
    confidence,
  };

  return {
    success: true,
    fields,
    rawText: parsed.rawText || '',
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.85,
    method: 'gemini_vision',
  };
}

// ─── Tesseract.js Fallback ───────────────────────────────────────────────────

async function tesseractFallback(imageDataUrl: string): Promise<VisionOcrResult> {
  try {
    const { preprocessImageForOCR } = await import('../utils/imagePreprocess');
    const processedUrl = await preprocessImageForOCR(imageDataUrl, { attempt: 1 });

    console.log('[VisionOCR] Tesseract fallback: OCR started');
    const { createWorker } = await import('tesseract.js');

    let worker: any = null;
    try {
      worker = await createWorker(['eng', 'tam']);
      const { data } = await worker.recognize(processedUrl);
      let text = data.text?.trim() || '';
      let conf =
        typeof data.confidence === 'number'
          ? Math.round(data.confidence) / 100
          : 0.5;

      // Secondary attempt if text too short or low confidence
      if (
        (text.length < 25 || (data.confidence && data.confidence < 45)) &&
        processedUrl !== imageDataUrl
      ) {
        try {
          const altUrl = await preprocessImageForOCR(imageDataUrl, { attempt: 2 });
          const altData = await worker.recognize(altUrl);
          if (altData.data?.text && altData.data.text.trim().length > text.length) {
            text = altData.data.text.trim();
            conf =
              typeof altData.data.confidence === 'number'
                ? Math.round(altData.data.confidence) / 100
                : conf;
          }
        } catch {
          // ignore
        }
      }

      await worker.terminate();

      if (!text || text.length < 10) {
        return {
          success: false,
          fields: emptyFields(),
          rawText: text,
          confidence: 0,
          method: 'tesseract_fallback',
          error: 'OCR extracted very little text from the image',
        };
      }

      // Use existing regex parser from aiService
      const { parseOCRText } = await import('../services/aiService');
      const fields = parseOCRText(text);

      return {
        success: true,
        fields,
        rawText: text,
        confidence: conf,
        method: 'tesseract_fallback',
      };
    } catch (wErr) {
      if (worker) {
        try { await worker.terminate(); } catch {}
      }
      throw wErr;
    }
  } catch (err: any) {
    console.warn('[VisionOCR] Tesseract fallback failed:', err);
    return {
      success: false,
      fields: emptyFields(),
      rawText: '',
      confidence: 0,
      method: 'tesseract_fallback',
      error: err?.message || 'OCR processing failed',
    };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isValidDate(dateStr: any): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (y < 2020 || y > 2035) return false;
  if (m < 1 || m > 12) return false;
  const daysInMonth = new Date(y, m, 0).getDate();
  return d >= 1 && d <= daysInMonth;
}

function isValidTime(timeStr: any): boolean {
  if (!timeStr || typeof timeStr !== 'string') return false;
  if (!/^\d{2}:\d{2}$/.test(timeStr)) return false;
  const [h, m] = timeStr.split(':').map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

function emptyFields(): ExtractedFields {
  return {
    eventType: 'other',
    confidence: {
      eventType: 0,
      date: 0,
      time: 0,
      venue: 0,
      location: 0,
      mainPerson: 0,
      hostName: 0,
      title: 0,
    },
  };
}
