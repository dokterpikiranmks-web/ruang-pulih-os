import { NextResponse } from 'next/server';
import { z } from 'zod';
import { callGeminiJSON } from '@/lib/gemini/client';
import { normalizeAudioMimeType } from '@/lib/intake/audio';

export const dynamic = 'force-dynamic';

const TranscribeAudioSchema = z.object({
  audio_base64: z.string().min(1, 'Audio base64 wajib dikirim'),
  mime_type: z.string().default('audio/webm'),
});

const TranscriptResponseSchema = z.object({
  transcript: z.string(),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const payload = TranscribeAudioSchema.parse(json);

    // Clean data URL prefix if present (e.g. "data:audio/webm;base64,...")
    const rawBase64 = payload.audio_base64.replace(/^data:audio\/[a-zA-Z0-9.-]+;base64,/, '');

    // Size limit check: approx 3 MB
    // Base64 length * 0.75 ≈ original bytes
    const approxBytes = Math.ceil((rawBase64.length * 3) / 4);
    const MAX_BYTES = 3 * 1024 * 1024; // 3 MB
    if (approxBytes > MAX_BYTES) {
      return NextResponse.json(
        {
          error: 'Ukuran rekaman audio melebihi batas 3 MB. Silakan rekam cerita Anda lebih singkat (1–2 menit).',
        },
        { status: 413 }
      );
    }

    const normalizedMime = normalizeAudioMimeType(payload.mime_type);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          transcript: '',
          error: 'GEMINI_API_KEY belum terkonfigurasi untuk transkripsi audio.',
        },
        { status: 500 }
      );
    }

    const prompt = `Dengarkan rekaman audio pasien klinik ini dengan cermat.
Tugas Anda:
1. Transkripsikan seluruh isi cerita keluhan pasien ke dalam teks Bahasa Indonesia yang akurat, rapi, dan mudah dibaca.
2. Pahami konteks percakapan warga Makassar / Sulawesi Selatan (termasuk partikel atau intonasi lokal seperti 'mi', 'ji', 'ki', 'kodong', 'ta' jika muncul).
3. Hapus pengulangan kata yang tidak disengaja, jeda bergumam ("eh", "uh", "anu"), atau kalimat terbata-bata agar teks menjadi mengalir dan bersih.
4. Jangan hilangkan informasi klinis penting: bagian tubuh/titik nyeri (pinggang, leher, belikat, betis, saraf kejepit, lutut), durasi keluhan, pemicu awal, obat-obatan, atau aktivitas yang terganggu.
5. Susun kalimat dengan tanda baca (titik, koma) dan huruf kapital yang benar.
6. Kembalikan HANYA format JSON valid persis:
{
  "transcript": "Transkrip bersih hasil rekaman suara pasien di sini..."
}`;

    const geminiRes = await callGeminiJSON({
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: normalizedMime,
                data: rawBase64,
              },
            },
          ],
        },
      ],
      systemInstruction:
        'Anda adalah asisten medis spesialis transkripsi klinis di Ruang Pulih Makassar. Anda mentranskripsi audio cerita pasien ke dalam teks Bahasa Indonesia yang terstruktur, alami, dan tanpa pengulangan kata yang tidak sengaja.',
      tier: 'flash',
      schema: TranscriptResponseSchema,
      endpoint: '/api/intake/transcribe-audio',
      agentName: 'audio-transcriber',
      temperature: 0.1,
    });

    return NextResponse.json({
      success: true,
      transcript: geminiRes.data.transcript,
      meta: {
        model: geminiRes.meta.model,
        input_tokens: geminiRes.meta.inputTokens,
        output_tokens: geminiRes.meta.outputTokens,
        cost_idr: geminiRes.meta.costIdr,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Format data audio tidak valid', details: err.errors },
        { status: 400 }
      );
    }

    console.error('[Transcribe Audio API] Error:', err);
    return NextResponse.json(
      {
        error: (err as Error).message || 'Gagal mentranskripsi rekaman audio.',
      },
      { status: 500 }
    );
  }
}
