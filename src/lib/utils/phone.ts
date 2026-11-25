/**
 * Ruang Pulih OS — Indonesian Phone & WhatsApp Normalizer
 * Standardizes Indonesian mobile numbers to E.164 without plus sign (e.g. '628xxxxxxxxxx')
 * Extracts 4-digit PIN for lightweight patient magic-link auth.
 */

export interface NormalizedPhoneResult {
  raw: string;
  normalized: string; // Format: 628xxxxxxxxxx
  pin_last4: string;   // Last 4 digits
  isValid: boolean;
  displayFormatted: string; // e.g. +62 811-4433-27
}

export function normalizeIndonesianPhone(input: string): NormalizedPhoneResult {
  const raw = (input || '').trim();
  
  // Remove all non-numeric characters except leading '+'
  let cleaned = raw.replace(/[^\d+]/g, '');

  // Strip leading '+'
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }

  // Handle various Indonesian country code prefixes
  if (cleaned.startsWith('08')) {
    cleaned = '628' + cleaned.substring(2);
  } else if (cleaned.startsWith('8')) {
    cleaned = '628' + cleaned.substring(1);
  } else if (cleaned.startsWith('00628')) {
    cleaned = '628' + cleaned.substring(5);
  }

  // Indonesian cellular numbers start with 628 and are 10 to 14 digits long
  const isValid = /^628\d{7,12}$/.test(cleaned);

  // Extract last 4 digits for PIN
  const pin_last4 = cleaned.length >= 4 ? cleaned.slice(-4) : '0000';

  // Format nicely for display
  let displayFormatted = cleaned;
  if (isValid) {
    const nationalPart = cleaned.substring(2); // '811443327'
    const prefix = nationalPart.substring(0, 3); // '811'
    const mid = nationalPart.substring(3, 7);    // '4433'
    const rest = nationalPart.substring(7);      // '27'
    displayFormatted = `+62 ${prefix}-${mid}${rest ? '-' + rest : ''}`;
  }

  return {
    raw,
    normalized: cleaned,
    pin_last4,
    isValid,
    displayFormatted,
  };
}
