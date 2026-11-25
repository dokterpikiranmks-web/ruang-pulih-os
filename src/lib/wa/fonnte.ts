export interface SendWhatsAppParams {
  target: string; // e.g. "62811443327"
  message: string;
  delay?: string; // default "3-7"
}

export interface FonnteSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  rawResponse?: unknown;
}

/**
 * Sends a WhatsApp message via official Fonnte REST API.
 * Uses Fonnte's server-side `delay` parameter ("3-7") for anti-ban rate limiting,
 * ensuring the Vercel serverless function finishes in < 3 seconds without sleeping locally.
 */
export async function sendWhatsAppMessage(
  params: SendWhatsAppParams
): Promise<FonnteSendResult> {
  const token = process.env.FONNTE_TOKEN;

  // Mock fallback for CI/testing when token is not provided
  if (!token || token.trim() === '' || token.includes('placeholder')) {
    console.log(`[Fonnte Mock] Sending to ${params.target}: ${params.message.slice(0, 60)}...`);
    return {
      success: true,
      messageId: `mock-fonnte-${Date.now()}`,
    };
  }

  try {
    const formData = new FormData();
    formData.append('target', params.target);
    formData.append('message', params.message);
    formData.append('delay', params.delay || '3-7');
    formData.append('countryCode', '62');

    const res = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: {
        Authorization: token,
      },
      body: formData,
    });

    const data = await res.json();

    if (res.ok && (data.status === true || data.status === 'true' || data.id)) {
      return {
        success: true,
        messageId: data.id || (Array.isArray(data.id) ? data.id[0] : `fonnte-${Date.now()}`),
        rawResponse: data,
      };
    } else {
      const errReason = data.reason || data.message || 'Gagal mengirim via Fonnte';
      console.warn(`[Fonnte] Error response:`, data);
      return {
        success: false,
        error: errReason,
        rawResponse: data,
      };
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[Fonnte] Network / Fetch error:', errMsg);
    return {
      success: false,
      error: errMsg,
    };
  }
}
