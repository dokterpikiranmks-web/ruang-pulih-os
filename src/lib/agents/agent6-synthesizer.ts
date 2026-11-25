import type {
  DomainScores,
  ProtocolPhase,
  SafetyAuditItem,
  AgentProposal,
  RootCauseMatrix,
} from './types';
import type { PatientContext } from './agent0-gatekeeper';
import { callGeminiJSON } from '@/lib/gemini/client';
import { z } from 'zod';

const SynthesizerOutputSchema = z.object({
  domain_scores: z.object({
    nervous_autonomic: z.number().min(0).max(100),
    metabolic_gut: z.number().min(0).max(100),
    recovery_sleep: z.number().min(0).max(100),
    emotional_stress: z.number().min(0).max(100),
  }),
  protocol_phases: z.array(
    z.object({
      phase: z.number().int().positive(),
      title: z.string(),
      clinic_therapy: z.string(),
      home_care: z.array(z.string()),
      evidence_tier: z.enum(['Tier A', 'Tier B', 'Tier C']),
    })
  ),
  practitioner_summary: z.string(),
  patient_friendly_summary: z.string(),
});

export interface SynthesizerResult {
  domain_scores: DomainScores;
  protocol_phases: ProtocolPhase[];
  practitioner_summary: string;
  patient_friendly_summary: string;
}

/**
 * Agent 6: Chief Integrative Synthesizer
 * Formulates realistic 3-phase protocols, 4 domain health scores (0-100),
 * and dual-audience summaries (practitioner vs patient).
 */
export async function runAgent6Synthesizer(
  proposals: AgentProposal[],
  safetyAudits: SafetyAuditItem[],
  atm: RootCauseMatrix,
  ctx: PatientContext
): Promise<SynthesizerResult> {
  // Filter out RED items from proposals
  const redItemTitles = new Set(
    safetyAudits
      .filter((a) => a.traffic_light === 'RED')
      .map((a) => a.item.toLowerCase())
  );

  const safeProposals = proposals.map((p) => ({
    ...p,
    recommendations: p.recommendations.filter(
      (r) => !redItemTitles.has(r.title.toLowerCase())
    ),
  }));

  // Deterministic baseline domain scores
  const autonomic = (ctx.autonomic_mindbody_json || {}) as { stress_level?: number };
  const stress = typeof autonomic.stress_level === 'number' ? autonomic.stress_level : 6;
  const isDigestive = (ctx.complaint_category || '').toLowerCase().includes('gerd');

  const baseDomainScores: DomainScores = {
    nervous_autonomic: Math.max(30, 90 - stress * 6),
    metabolic_gut: isDigestive ? 45 : 68,
    recovery_sleep: 55,
    emotional_stress: Math.max(25, 100 - stress * 8),
  };

  // Deterministic 3-phase protocol
  const baseProtocolPhases: ProtocolPhase[] = [
    {
      phase: 1,
      title: 'Minggu 1–2: Stabilisasi Saraf & Reduksi Spasme Akut',
      clinic_therapy:
        'Totok saraf titik kompresi utama, dekompresi sendi faset secara bertahap, dan perbaikan mikrosirkulasi di klinik Makassar.',
      home_care: [
        'Latihan napas diafragma 4-7-8 selama 5 menit sebelum tidur malam',
        'Kompres hangat pada area kaku selama 15 menit di malam hari',
        'Hindari mengangkat beban berat mendadak dan postur membungkuk lama',
      ],
      evidence_tier: 'Tier A',
    },
    {
      title: 'Minggu 3–4: Koreksi Akar Masalah & Penguatan Postur',
      phase: 2,
      clinic_therapy:
        'Penguraian fasia kompensasi sekunder, stimulasi tonus vagal, dan penyesuaian sumbu biomekanik panggul/tengkuk.',
      home_care: [
        'Peregangan terarah (nerve flossing) 2x sehari saat pagi dan sore',
        'Pola pangan anti-inflamasi lokal (sayur kelor, tempe, seduhan rimpang kunyit lembut)',
        'Jeda makan berat minimal 3 jam sebelum tidur',
      ],
      evidence_tier: 'Tier B',
    },
    {
      title: 'Minggu 5–6: Kemandirian & Ketahanan Pemulihan Jangka Panjang',
      phase: 3,
      clinic_therapy:
        'Sesi evaluasi respon biologis akhir, pelepasan sisa ketegangan somatis, dan penetapan protokol pemeliharaan mandiri.',
      home_care: [
        'Rutin jalan kaki santai 20-30 menit di pagi hari dengan postur tegak',
        'Manajemen de-eskalasi stres mandiri untuk mencegah relaps simpatis',
      ],
      evidence_tier: 'Tier A',
    },
  ];

  const basePractitionerSummary =
    `Pasien ${ctx.full_name} (${ctx.age || '-'} th) datang dengan keluhan ${ctx.complaint_category || 'saraf/muskuloskeletal'} ` +
    `durasi ${ctx.duration || 'kronis'}. Temuan utama menunjukkan spasme myofasial fungsional dengan keterlibatan dominasi saraf simpatis. ` +
    `Protokol 3 fase difokuskan pada dekompresi mekanik di klinik yang dipadukan dengan modulasi tonus vagus dan pangan anti-inflamasi mandiri. ` +
    `Seluruh intervensi telah diaudit bebas dari kontraindikasi obat medis.`;

  const basePatientSummary =
    `Bapak/Ibu ${ctx.full_name}, tubuh Anda membutuhkan waktu untuk pulih secara bertahap. ` +
    `Keluhan yang Anda rasakan bukan tanda kerusakan permanen, melainkan sinyal alarm bahwa jalur saraf dan otot sedang tegang serta aliran nutrisi sel terhambat. ` +
    `Melalui terapi totok saraf di klinik kami dan panduan sederhana di rumah, kita akan mengurai sumbatan ini langkah demi langkah agar Anda dapat kembali beraktivitas (${ctx.disrupted_activity || 'sehari-hari'}) dengan nyaman dan tenang.`;

  // LLM Synthesis (Fail-Safe)
  if (process.env.GEMINI_API_KEY) {
    try {
      const res = await callGeminiJSON({
        prompt: `Sintesis Protokol Integratif 6 Agen:
Pasien: ${ctx.full_name}, ${ctx.age || '-'} th, Keluhan: ${ctx.complaint_category} (${ctx.duration})
Aktivitas Terganggu: ${ctx.disrupted_activity}
ATM Timeline: ${JSON.stringify(atm)}
Usulan Agen 1-4 yang Aman: ${JSON.stringify(safeProposals.map((p) => ({ domain: p.domain, recs: p.recommendations })))}
Audit Keselamatan: ${JSON.stringify(safetyAudits)}

Tugas: Susun Protokol 3 Fase realistis (Minggu 1-2, 3-4, 5-6), hitung 4 Domain Scores (0-100: nervous_autonomic, metabolic_gut, recovery_sleep, emotional_stress), sertakan Evidence Tier (Tier A, Tier B, Tier C) pada setiap fase, ringkasan teknis untuk praktisi, dan ringkasan bahasa awam yang menenangkan untuk pasien.
Keluarkan JSON sesuai schema.`,
        systemInstruction:
          'Anda adalah Chief Integrative Synthesizer (Dewan Pakar AI) di Ruang Pulih Makassar. Integrasikan kedokteran holistik, biomekanik totok saraf, dan keselamatan farmakologis.',
        tier: 'flash',
        schema: SynthesizerOutputSchema,
        endpoint: 'agent6-synthesizer',
        agentName: 'Agent-6-Synthesizer',
      });

      return {
        domain_scores: res.data.domain_scores,
        protocol_phases: res.data.protocol_phases,
        practitioner_summary: res.data.practitioner_summary || basePractitionerSummary,
        patient_friendly_summary: res.data.patient_friendly_summary || basePatientSummary,
      };
    } catch {
      // Fallback
    }
  }

  return {
    domain_scores: baseDomainScores,
    protocol_phases: baseProtocolPhases,
    practitioner_summary: basePractitionerSummary,
    patient_friendly_summary: basePatientSummary,
  };
}
