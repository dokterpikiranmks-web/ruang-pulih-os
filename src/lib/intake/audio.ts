/**
 * Normalizes browser-reported audio MIME types to clean Gemini-supported MIME types.
 * Strips codecs parameters (e.g. "audio/webm;codecs=opus" -> "audio/webm").
 */
export function normalizeAudioMimeType(mime: string): string {
  const base = mime.split(';')[0].trim().toLowerCase();
  if (base.includes('webm')) return 'audio/webm';
  if (base.includes('mp4') || base.includes('m4a') || base.includes('aac')) return 'audio/mp4';
  if (base.includes('ogg')) return 'audio/ogg';
  if (base.includes('wav')) return 'audio/wav';
  if (base.includes('mp3') || base.includes('mpeg')) return 'audio/mp3';
  return 'audio/webm';
}
