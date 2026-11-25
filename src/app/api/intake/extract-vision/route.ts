import { NextResponse } from 'next/server';
import { z } from 'zod';
import { callGeminiJSON } from '@/lib/gemini/client';

export const dynamic = 'force-dynamic';

const ExtractVisionSchema = z.object({
  image_base64: z.string().min(10, 'Data gambar wajib diisi'),
  doc_type: z.enum(['MEDICATION', 'LAB_RESULT']),
});

const MedicationItemSchema = z.object({
  name: z.string(),
  dosage: z.string().default('-'),
  frequency: z.string().default('-'),
  notes: z.string().optional(),
});

const LabResultItemSchema = z.object({
  test_name: z.string(),
  value: z.string(),
  unit: z.string().default(''),
  reference_range: z.string().default(''),
  flag: z.enum(['NORMAL', 'HIGH', 'LOW']).default('NORMAL'),
});

const MedicationListSchema = z.array(MedicationItemSchema);
const LabResultListSchema = z.array(LabResultItemSchema);

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const payload = ExtractVisionSchema.parse(json);

    // Clean base64 string
    const rawBase64 = payload.image_base64.replace(/^data:image\/[a-z]+;base64,/, '');

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        success: true,
        extracted: [],
        warning: 'GEMINI_API_KEY belum dikonfigurasi. Silakan input manual.',
      });
    }

    let prompt = '';
    let systemInstruction = '';

    if (payload.doc_type === 'MEDICATION') {
      systemInstruction =
        'Anda adalah asisten apoteker dan ekstraktor data klinis di Ruang Pulih Makassar. Ekstrak nama obat resep dokter, herbal, atau suplemen dari foto bungkus obat ke dalam array JSON terstruktur.';
      prompt = `Ekstrak daftar obat yang terbaca dari foto ini ke dalam format JSON array murni:
[
  { "name": "Nama Obat", "dosage": "Dosis (cth: 5mg / 500mg)", "frequency": "Aturan minum (cth: 1x1 sesudah makan)", "notes": "Catatan tambahan jika ada" }
]
Jika ada teks yang kurang jelas, tuliskan tebakan terbaik atau '-' pada dosis.`;
    } else {
      systemInstruction =
        'Anda adalah analis data laboratorium klinis di Ruang Pulih Makassar. Ekstrak parameter hasil lab dari foto kertas hasil pemeriksaan darah/urin/rontgen ke dalam array JSON terstruktur.';
      prompt = `Ekstrak hasil lab dari foto kertas ini ke dalam format JSON array murni:
[
  { "test_name": "Nama Pemeriksaan", "value": "Nilai Angka", "unit": "Satuan", "reference_range": "Nilai Rujukan", "flag": "NORMAL" | "HIGH" | "LOW" }
]`;
    }

    const imagePart = {
      inlineData: {
        mimeType: 'image/jpeg',
        data: rawBase64,
      },
    };

    let extractedData: unknown[] = [];
    let modelUsed = '';
    let totalTokens = 0;
    let totalCostIdr = 0;

    if (payload.doc_type === 'MEDICATION') {
      const geminiRes = await callGeminiJSON({
        contents: [
          {
            parts: [{ text: prompt }, imagePart],
          },
        ],
        systemInstruction,
        tier: 'flash',
        schema: MedicationListSchema,
        endpoint: '/api/intake/extract-vision',
        agentName: 'vision-extractor',
        temperature: 0.1,
      });
      extractedData = geminiRes.data;
      modelUsed = geminiRes.meta.model;
      totalTokens = geminiRes.meta.inputTokens + geminiRes.meta.outputTokens;
      totalCostIdr = geminiRes.meta.costIdr;
    } else {
      const geminiRes = await callGeminiJSON({
        contents: [
          {
            parts: [{ text: prompt }, imagePart],
          },
        ],
        systemInstruction,
        tier: 'flash',
        schema: LabResultListSchema,
        endpoint: '/api/intake/extract-vision',
        agentName: 'vision-extractor',
        temperature: 0.1,
      });
      extractedData = geminiRes.data;
      modelUsed = geminiRes.meta.model;
      totalTokens = geminiRes.meta.inputTokens + geminiRes.meta.outputTokens;
      totalCostIdr = geminiRes.meta.costIdr;
    }

    return NextResponse.json({
      success: true,
      doc_type: payload.doc_type,
      extracted: extractedData,
      meta: {
        model: modelUsed,
        tokens: totalTokens,
        cost_idr: totalCostIdr,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validasi form gagal', details: err.errors },
        { status: 400 }
      );
    }
    console.error('[Vision API] Fallback error handler:', err);
    return NextResponse.json({
      success: true,
      extracted: [],
      warning: 'Gagal mengekstrak teks otomatis dari foto. Silakan ketik nama obat secara manual.',
    });
  }
}
