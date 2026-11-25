import type { GatekeeperResult, RootCauseMatrix } from './types';
import { callGeminiJSON } from '@/lib/gemini/client';
import { z } from 'zod';

export interface PatientContext {
  full_name: string;
  age?: number | null;
  complaint_category?: string | null;
  duration?: string | null;
  disrupted_activity?: string | null;
  red_flag_checklist?: string[];
  has_red_flag?: boolean;
  medications_json?: unknown[];
  lab_results_json?: unknown[];
  atm_timeline_json?: Record<string, unknown>;
  lifestyle_json?: Record<string, unknown>;
  autonomic_mindbody_json?: Record<string, unknown>;
  somatic_pain_map?: Record<string, unknown>;
  voice_transcript?: string | null;
  practitioner_vitals_json?: Record<string, unknown>;
  practitioner_notes?: string | null;
}

const FunctionalMatrixSchema = z.object({
  pencernaan: z.string().default('Normoaktif'),
  imun_inflamasi: z.string().default('Inflamasi tingkat rendah'),
  energi_mitokondria: z.string().default('Kelelahan ringan'),
  detoksifikasi: z.string().default('Fungsi eliminasi standar'),
  kardiovaskular: z.string().default('Normotensi'),
  hormon_saraf: z.string().default('Dominasi simpatis'),
  struktural_biomekanik: z.string().default('Spasme myofasial'),
});

const EMERGENCY_KEYWORDS = [
  'nyeri dada menjalar',
  'lumpuh mendadak',
  'kelumpuhan mendadak',
  'tidak bisa kontrol bab',
  'tidak bisa kontrol bak',
  'sesak napas berat mendadak',
  'stroke mendadak',
  'serangan jantung',
];

/**
 * Agent 0: Gatekeeper & Triage Matrix Mapper
 * Performs mandatory Red-Flag safety short-circuit. If dangerous symptoms are present,
 * halts immediately without executing Agents 1-6.
 */
export async function runAgent0Gatekeeper(ctx: PatientContext): Promise<GatekeeperResult> {
  const redFlagsList = ctx.red_flag_checklist || [];
  const textContent = `${ctx.complaint_category || ''} ${ctx.voice_transcript || ''} ${ctx.practitioner_notes || ''}`.toLowerCase();

  const hasExplicitRedFlag = ctx.has_red_flag === true || redFlagsList.length > 0;
  const hasKeywordRedFlag = EMERGENCY_KEYWORDS.some((kw) => textContent.includes(kw));

  // 1. RED FLAG DETECTED -> SHORT CIRCUIT
  if (hasExplicitRedFlag || hasKeywordRedFlag) {
    const reasons: string[] = [];
    if (redFlagsList.includes('nyeri_dada') || textContent.includes('nyeri dada menjalar')) {
      reasons.push('Kecurigaan sindrom koroner akut / nyeri dada menjalar');
    }
    if (redFlagsList.includes('lumpuh_mendadak') || textContent.includes('lumpuh mendadak')) {
      reasons.push('Kecurigaan defisit neurologis fokal akut / stroke');
    }
    if (redFlagsList.includes('bab_bak_loss') || textContent.includes('tidak bisa kontrol bab')) {
      reasons.push('Kecurigaan sindrom cauda equina (hilang kontrol sfingter)');
    }
    if (redFlagsList.includes('sesak_napas_berat') || textContent.includes('sesak napas berat')) {
      reasons.push('Sesak napas berat mendadak');
    }

    const actionText = `PERINGATAN RED FLAG KLINIS: Pasien terindikasi memiliki tanda bahaya medis (${reasons.join(', ') || 'Gejala darurat'}). ` +
      `REKOMENDASI MUTLAK: Segera arahkan pasien ke Instalasi Gawat Darurat (IGD) rumah sakit terdekat. ` +
      `Seluruh tindakan manipulasi totok saraf dan terapi komplementer ditunda sampai ada evaluasi medis kegawatdaruratan.`;

    return {
      red_flag: true,
      emergency_action: actionText,
      atm_timeline: {
        antecedents: ['Gejala akut darurat terdeteksi'],
        triggers: ['Onset akut'],
        mediators: ['Potensi ancaman fungsi vital'],
      },
      functional_matrix: {},
    };
  }

  // 2. SAFE -> MAP ATM TIMELINE & 7-NODE FUNCTIONAL MATRIX
  const userAtm = (ctx.atm_timeline_json || {}) as Record<string, string[]>;
  const antecedents = Array.isArray(userAtm.antecedents) && userAtm.antecedents.length > 0
    ? userAtm.antecedents
    : [`Riwayat beban postur (${ctx.duration || 'berbulan-bulan'}) & kebiasaan harian`];

  const triggers = Array.isArray(userAtm.triggers) && userAtm.triggers.length > 0
    ? userAtm.triggers
    : [`Aktivitas memicu (${ctx.disrupted_activity || 'gerakan tertentu'})`];

  const mediators = Array.isArray(userAtm.mediators) && userAtm.mediators.length > 0
    ? userAtm.mediators
    : ['Ketegangan saraf simpatis dan inflamasi jaringan somatik'];

  const atm_timeline: RootCauseMatrix = {
    antecedents,
    triggers,
    mediators,
  };

  // Base 7-Node Functional Matrix
  let functional_matrix: Record<string, unknown> = {
    pencernaan: 'Potensi iritasi lambung / motilitas menurun saat stres',
    imun_inflamasi: 'Inflamasi lokal di area kompresi saraf',
    energi_mitokondria: 'Penurunan ambang lelah seluler pasca nyeri kronis',
    detoksifikasi: 'Sirkulasi cairan limfatik terhambat di area kaku',
    kardiovaskular: 'Mikrosirkulasi perifer melambat di ekstremitas',
    hormon_saraf: 'Dominasi saraf simpatis (fight-or-flight) & penurunan tonus vagal',
    struktural_biomekanik: `Spasme otot & kompresi sendi faset pada ${ctx.complaint_category || 'tulang belakang'}`,
  };

  // Optional AI enrichment (Fail-Safe)
  if (process.env.GEMINI_API_KEY) {
    try {
      const res = await callGeminiJSON({
        prompt: `Petakan profil pasien:
Keluhan: ${ctx.complaint_category || '-'} (${ctx.duration || '-'})
Aktivitas Terganggu: ${ctx.disrupted_activity || '-'}
Suara Pasien: ${ctx.voice_transcript || '-'}
Catatan Praktisi: ${ctx.practitioner_notes || '-'}
ke dalam 7-Node Functional Matrix ringkas (1 frasa per node: pencernaan, imun_inflamasi, energi_mitokondria, detoksifikasi, kardiovaskular, hormon_saraf, struktural_biomekanik).`,
        systemInstruction: 'Anda adalah Gatekeeper Kedokteran Fungsional Ruang Pulih Makassar. Keluarkan JSON.',
        tier: 'flash',
        schema: FunctionalMatrixSchema,
        endpoint: 'agent0-gatekeeper',
        agentName: 'Agent-0-Gatekeeper',
      });
      functional_matrix = res.data;
    } catch {
      // Continue with base matrix
    }
  }

  return {
    red_flag: false,
    emergency_action: null,
    atm_timeline,
    functional_matrix,
  };
}
