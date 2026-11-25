import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { evaluateTriageRules } from '@/lib/triage/rules';
import { callGeminiJSON } from '@/lib/gemini/client';

export const dynamic = 'force-dynamic';

const TriageAnalyzeRequestSchema = z.object({
  complaint_category: z.string().min(1, 'Kategori keluhan wajib diisi'),
  duration: z.string().min(1, 'Durasi keluhan wajib diisi'),
  prior_treatments: z.array(z.string()).default([]),
  disrupted_activity: z.string().min(1, 'Aktivitas terganggu wajib diisi'),
  readiness_choice: z.string().min(1, 'Kesiapan pasien wajib diisi'),
  utm_source: z.string().optional().nullable(),
  utm_campaign: z.string().optional().nullable(),
});

const AIPolishResponseSchema = z
  .object({
    polished_summary: z.string().optional(),
    key_insight: z.string().optional(),
    penjelasan_klinis: z.string().optional(),
    penjelasan: z.string().optional(),
    summary: z.string().optional(),
    triage_summary: z.string().optional(),
    pesan_empatik: z.string().optional(),
    akar_masalah: z.string().optional(),
    insight: z.string().optional(),
    fokus_penanganan: z.string().optional(),
  })
  .passthrough()
  .transform((data) => {
    const summary =
      data.polished_summary ||
      data.penjelasan_klinis ||
      data.penjelasan ||
      data.summary ||
      data.triage_summary ||
      data.pesan_empatik ||
      '';

    const insight =
      data.key_insight ||
      data.akar_masalah ||
      data.insight ||
      data.fokus_penanganan ||
      'Fokus pelepasan ketegangan saraf dan pemulihan sirkulasi bertahap.';

    return {
      polished_summary: summary,
      key_insight: insight,
    };
  })
  .refine((data) => data.polished_summary.trim().length > 0, {
    message: 'Summary explanation (polished_summary) must not be empty',
  });

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const payload = TriageAnalyzeRequestSchema.parse(json);

    // 1. Evaluate deterministic clinical rules
    const rules = evaluateTriageRules({
      complaint_category: payload.complaint_category,
      duration: payload.duration,
      prior_treatments: payload.prior_treatments,
      disrupted_activity: payload.disrupted_activity,
      readiness_choice: payload.readiness_choice,
    });

    let finalSummary = rules.fallback_summary;
    let keyInsight = rules.root_cause_base;
    let isAiPolished = false;

    // 2. Optional empathetic polish via Gemini Flash (Fail-Safe)
    if (process.env.GEMINI_API_KEY) {
      try {
        const aiPrompt = `Pasien di Makassar datang dengan data awal berikut:
- Keluhan: ${payload.complaint_category}
- Durasi: ${payload.duration}
- Ikhtiar sebelumnya: ${payload.prior_treatments.join(', ') || 'Belum ada'}
- Aktivitas paling terganggu: ${payload.disrupted_activity}
- Indikasi Klinis Awal: ${rules.severity_label}
- Penjelasan Akar Masalah: ${rules.root_cause_base}
- Estimasi Sesi Rekomendasi: ${rules.recommended_sessions}

Tugas:
Tuliskan 1 paragraf ringkas (3-4 kalimat) penjelasan klinis yang empatik, menenangkan, mudah dimengerti orang awam usia 40-60 tahun, dan menyoroti bagaimana terapi bertahap membantu agar pasien bisa kembali beraktivitas (${payload.disrupted_activity}) dengan nyaman. Jangan pernah berikan over-claim sembuh instan.

Wajib berikan output HANYA dalam format JSON valid dengan struktur persis seperti ini:
{
  "polished_summary": "1 paragraf penjelasan klinis empatik dan terstruktur (3-4 kalimat)",
  "key_insight": "1 kalimat ringkas mengenai fokus penanganan utama atau akar masalah"
}`;

        const geminiRes = await callGeminiJSON({
          prompt: aiPrompt,
          systemInstruction:
            'Anda adalah spesialis komunikasi klinis holistik & totok saraf di Ruang Pulih Makassar. Bahasa santun, empatik, terstruktur, berbasis biologi tubuh dan tanpa janji instan.',
          tier: 'flash',
          schema: AIPolishResponseSchema,
          endpoint: '/api/triage/analyze',
          agentName: 'triage-empathy-polisher',
        });

        if (geminiRes.data.polished_summary) {
          finalSummary = geminiRes.data.polished_summary;
          keyInsight = geminiRes.data.key_insight || rules.root_cause_base;
          isAiPolished = true;
        }
      } catch (geminiError) {
        // Fail-safe: DO NOT fail the triage funnel if AI is unreachable
        console.warn('[Triage API] Gemini polish skipped or failed, using deterministic fallback:', geminiError);
      }
    }

    // 3. Persist lead to database
    let leadId: string | null = null;
    try {
      const adminClient = createAdminClient();
      const { data: insertedLead, error: insertError } = await adminClient
        .from('leads_triage')
        .insert({
          complaint_category: payload.complaint_category,
          duration: payload.duration,
          prior_treatments: payload.prior_treatments,
          disrupted_activity: payload.disrupted_activity,
          readiness_score: rules.readiness_score,
          triage_summary: finalSummary,
          disclaimer_accepted: false,
          utm_source: payload.utm_source || null,
          utm_campaign: payload.utm_campaign || null,
        })
        .select('id')
        .single();

      if (insertError) {
        console.warn('[Triage API] DB insert warning:', insertError);
      } else if (insertedLead) {
        leadId = insertedLead.id;
      }
    } catch (dbError) {
      console.warn('[Triage API] DB connection failed, continuing in memory:', dbError);
    }

    return NextResponse.json({
      success: true,
      lead_id: leadId,
      analysis: {
        severity_label: rules.severity_label,
        lead_temperature: rules.lead_temperature,
        readiness_score: rules.readiness_score,
        recommended_sessions: rules.recommended_sessions,
        session_count_min: rules.session_count_min,
        session_count_max: rules.session_count_max,
        suggested_package: rules.suggested_package,
        root_cause_base: keyInsight,
        triage_summary: finalSummary,
        is_ai_polished: isAiPolished,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validasi gagal', details: err.errors },
        { status: 400 }
      );
    }
    console.error('[Triage API] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Terjadi kesalahan sistem saat menganalisa keluhan.' },
      { status: 500 }
    );
  }
}
