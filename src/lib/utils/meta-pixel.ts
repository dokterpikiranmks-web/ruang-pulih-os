/**
 * Ruang Pulih OS — Meta Pixel Utility (Fail-Safe & Privacy-Compliant)
 * 
 * Kepatuhan Ketat Meta Health & Wellness Policy:
 * DILARANG mengirim data medis sensitif (detail keluhan, nama penyakit,
 * skor medis, tensi, gula darah, atau data pribadi pasien).
 * Hanya kirim kode kategori generik dan nilai nominal paket.
 */

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fbq?: (...args: any[]) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _fbq?: any;
  }
}

// Memory deduplication cache to prevent double-firing in React Strict Mode
const firedEventsMemoryCache = new Set<string>();

const SENSITIVE_VALUE_PATTERNS = [
  'complaint',
  'diagnosis',
  'disease',
  'symptom',
  'pain',
  'score',
  'tensi',
  'sugar',
  'blood',
  'patient',
  'phone',
  'wa',
  'whatsapp',
  'address',
  'severity',
  'temperature',
  'readiness',
  'summary',
  'root_cause',
  'vitals',
  'medical',
  'keluhan',
  'penyakit',
  'gejala',
  'tekanan',
  'gula',
  'nyeri',
];

const ALLOWED_PARAM_KEYS = new Set([
  'content_name',
  'content_category',
  'content_type',
  'value',
  'currency',
  'status',
]);

/**
 * Sanitizes pixel parameters to ensure complete privacy compliance.
 * Removes any medical details or PII, allowing only generic codes and numerical values.
 */
export function sanitizePixelParams(
  eventName: string,
  params?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!params || Object.keys(params).length === 0) {
    return undefined;
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, rawVal] of Object.entries(params)) {
    const lowerKey = key.toLowerCase();

    // STRICT WHITELIST: Only allow explicitly permitted pixel properties
    if (!ALLOWED_PARAM_KEYS.has(lowerKey)) {
      continue;
    }

    if (rawVal === undefined || rawVal === null) {
      continue;
    }

    // Special handling for content_name (convert package identifiers to generic codes)
    if (lowerKey === 'content_name') {
      const strVal = String(rawVal);
      if (strVal === 'SINGLE_150K') {
        sanitized[key] = 'program_a';
      } else if (strVal === 'PACKAGE_3X_400K') {
        sanitized[key] = 'program_b';
      } else {
        // Ensure no sensitive terms leak through custom content_name
        const containsSensitive = SENSITIVE_VALUE_PATTERNS.some((pattern) =>
          strVal.toLowerCase().includes(pattern)
        );
        sanitized[key] = containsSensitive ? 'program_general' : strVal;
      }
      continue;
    }

    // Values must be numeric
    if (lowerKey === 'value') {
      const numVal = Number(rawVal);
      if (!isNaN(numVal) && numVal >= 0) {
        sanitized[key] = numVal;
      }
      continue;
    }

    // Currency must be standard 3-letter code
    if (lowerKey === 'currency') {
      sanitized[key] = String(rawVal).toUpperCase().slice(0, 3);
      continue;
    }

    // For other string properties, ensure value has no sensitive clinical words
    const strVal = String(rawVal);
    const containsSensitive = SENSITIVE_VALUE_PATTERNS.some((pattern) =>
      strVal.toLowerCase().includes(pattern)
    );
    if (!containsSensitive) {
      sanitized[key] = strVal;
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

/**
 * Check and record whether an event with a specific dedupe key has already been fired.
 */
function isEventAlreadyFired(dedupeKey: string): boolean {
  if (firedEventsMemoryCache.has(dedupeKey)) {
    return true;
  }

  // Also check sessionStorage to avoid double firing on back navigation
  if (typeof window !== 'undefined') {
    try {
      const sessionKey = `rp_pixel_fired_${dedupeKey}`;
      if (sessionStorage.getItem(sessionKey)) {
        return true;
      }
      sessionStorage.setItem(sessionKey, '1');
    } catch {
      // Ignore sessionStorage errors (e.g. private mode quota)
    }
  }

  firedEventsMemoryCache.add(dedupeKey);
  return false;
}

/**
 * Dispatches browser pixel events safely, without crashing, with deduplication and sanitization.
 */
export function trackPixelEvent(
  eventName: 'PageView' | 'ViewContent' | 'Lead' | 'Schedule' | string,
  params?: Record<string, unknown>,
  dedupeKey?: string
): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  // Deduplication check
  if (dedupeKey) {
    if (isEventAlreadyFired(dedupeKey)) {
      return false;
    }
  }

  const cleanParams = sanitizePixelParams(eventName, params);

  if (typeof window.fbq === 'function') {
    try {
      if (cleanParams) {
        window.fbq('track', eventName, cleanParams);
      } else {
        window.fbq('track', eventName);
      }
      return true;
    } catch (err) {
      console.warn(`[Meta Pixel] Failed to track ${eventName}:`, err);
      return false;
    }
  }

  return false;
}
