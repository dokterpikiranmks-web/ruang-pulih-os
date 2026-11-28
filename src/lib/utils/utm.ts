/**
 * Ruang Pulih OS — UTM Attribution & Traffic Source Utility
 * 
 * Captures, stores in sessionStorage, and provides helpers for:
 * utm_source, utm_medium, utm_campaign, utm_content, and fbclid.
 */

export interface UTMParams {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  fbclid?: string;
}

const STORAGE_KEY = 'rp_utm_attribution';

/**
 * Capture UTM parameters from URL search string and store them in sessionStorage.
 * If URL does not have parameters, attempts to retrieve previously stored UTMs.
 */
export function captureAndStoreUTM(): UTMParams {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const params = new URLSearchParams(window.location.search);
    const utm_source = params.get('utm_source') || undefined;
    const utm_medium = params.get('utm_medium') || undefined;
    const utm_campaign = params.get('utm_campaign') || undefined;
    const utm_content = params.get('utm_content') || undefined;
    const fbclid = params.get('fbclid') || undefined;

    const hasIncomingUTM = Boolean(
      utm_source || utm_medium || utm_campaign || utm_content || fbclid
    );

    if (hasIncomingUTM) {
      const data: UTMParams = {
        utm_source,
        utm_medium,
        utm_campaign,
        utm_content,
        fbclid,
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return data;
    }

    // Fallback: Return already stored UTM in session
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as UTMParams;
    }
  } catch (err) {
    console.warn('[UTM] Error accessing URL/sessionStorage:', err);
  }

  return {};
}

/**
 * Get stored UTM parameters from sessionStorage (or URL fallback).
 */
export function getStoredUTM(): UTMParams {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as UTMParams;
    }
    return captureAndStoreUTM();
  } catch {
    return {};
  }
}

/**
 * Determine a concise traffic source badge label & styling for Admin Dashboard.
 * Examples:
 * - 'web_ad1_saraf'
 * - 'web_ad3_tensi_gula'
 * - 'Manual WA'
 * - 'Organik'
 */
export function getTrafficSourceBadge(source: {
  utm_campaign?: string | null;
  utm_source?: string | null;
  utm_content?: string | null;
  notes?: string | null;
}): { label: string; bgClass: string; textClass: string; borderClass: string } {
  // Check if manual booking via WhatsApp or admin
  const isManual =
    source.utm_source === 'Manual WA' ||
    source.utm_source === 'manual_wa' ||
    (source.notes && source.notes.toLowerCase().includes('manual'));

  if (isManual) {
    return {
      label: 'Manual WA',
      bgClass: 'bg-purple-100',
      textClass: 'text-purple-800',
      borderClass: 'border-purple-200',
    };
  }

  // If utm_campaign is present, display it directly (e.g. web_ad1_saraf, web_ad3_tensi_gula)
  if (source.utm_campaign && source.utm_campaign.trim().length > 0) {
    return {
      label: source.utm_campaign.trim(),
      bgClass: 'bg-blue-100',
      textClass: 'text-blue-800',
      borderClass: 'border-blue-200',
    };
  }

  // If only utm_source is present (e.g. 'facebook', 'instagram', 'tiktok')
  if (source.utm_source && source.utm_source.trim().length > 0) {
    return {
      label: source.utm_source.trim(),
      bgClass: 'bg-sky-100',
      textClass: 'text-sky-800',
      borderClass: 'border-sky-200',
    };
  }

  // Default organic visitor
  return {
    label: 'Organik',
    bgClass: 'bg-emerald-100',
    textClass: 'text-emerald-800',
    borderClass: 'border-emerald-200',
  };
}
