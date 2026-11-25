import crypto from 'crypto';

const SECRET = process.env.PATIENT_SESSION_SECRET || 'ruang-pulih-session-secret-key-2026-wita';

/**
 * Sign a session token for a patient's magic_token using HMAC SHA-256.
 * Format: `<magic_token>.<timestamp>.<signature>`
 */
export function signPatientSession(magicToken: string): string {
  const timestamp = Date.now().toString();
  const data = `${magicToken}:${timestamp}`;
  const signature = crypto.createHmac('sha256', SECRET).update(data).digest('hex');
  return `${magicToken}.${timestamp}.${signature}`;
}

/**
 * Verify whether a cookie session string matches the requested magicToken.
 */
export function verifyPatientSession(magicToken: string, cookieValue: string | undefined | null): boolean {
  if (!cookieValue || !magicToken) return false;

  const parts = cookieValue.split('.');
  if (parts.length !== 3) return false;

  const [cookieMagicToken, timestamp, signature] = parts;
  if (cookieMagicToken !== magicToken) return false;
  if (!signature || signature.length !== 64 || !/^[0-9a-f]{64}$/i.test(signature)) return false;

  // Verify HMAC signature
  const expectedData = `${cookieMagicToken}:${timestamp}`;
  const expectedSig = crypto.createHmac('sha256', SECRET).update(expectedData).digest('hex');

  try {
    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSig, 'hex');
    if (sigBuffer.length !== expectedBuffer.length) return false;
    return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
  } catch {
    return false;
  }
}
