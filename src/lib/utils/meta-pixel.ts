/**
 * Ruang Pulih OS — Meta Pixel Utility (Fail-Safe)
 * Dispatches browser pixel events (PageView, Lead, Schedule) safely without crashing.
 */

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fbq?: (...args: any[]) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _fbq?: any;
  }
}

export function trackPixelEvent(
  eventName: 'PageView' | 'Lead' | 'Schedule' | string,
  params?: Record<string, unknown>
) {
  if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
    try {
      if (params) {
        window.fbq('track', eventName, params);
      } else {
        window.fbq('track', eventName);
      }
    } catch (err) {
      console.warn(`[Meta Pixel] Failed to track ${eventName}:`, err);
    }
  }
}
