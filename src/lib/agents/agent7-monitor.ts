import { callGeminiJSON } from '@/lib/gemini/client';
import { z } from 'zod';

export interface ProgressLogItem {
  pain_score: number;
  sleep_score: number;
  stress_score: number;
  adherence_pct?: number;
  patient_note?: string | null;
  logged_at?: string;
}

export interface AdaptationMonitorInput {
  currentLog: ProgressLogItem;
  history: ProgressLogItem[];
  patientName: string;
  complaintCategory?: string | null;
}

export interface AdaptationMonitorResult {
  requires_adaptation: boolean;
  alert_level: 'NONE' | 'YELLOW' | 'RED';
  alert_message: string | null;
  clinical_recommendation?: string;
}

const AdaptationOutputSchema = z.object({
  alert_level: z.enum(['NONE', 'YELLOW', 'RED']),
  alert_message: z.string(),
  clinical_recommendation: z.string(),
});

/**
 * Agent 7: Progress & Adaptation Monitor
 * Cost-effective Hybrid Rule Engine + Gemini Flash:
 * ONLY triggers LLM or writes alerts when pain is severe (>= 8) or stagnant/worsened after >= 7 days.
 */
export async function runAgent7Monitor(
  input: AdaptationMonitorInput
): Promise<AdaptationMonitorResult> {
  const { currentLog, history, patientName, complaintCategory } = input;
  const currentPain = currentLog.pain_score;

  // 1. EVALUATE RECOVERY TRAJECTORY
  let isSevereSpike = currentPain >= 8;
  let isStagnantOrWorse = false;

  if (history.length >= 2) {
    // Sort chronological
    const sorted = [...history].sort(
      (a, b) => new Date(a.logged_at || 0).getTime() - new Date(b.logged_at || 0).getTime()
    );

    const firstLog = sorted[0];
    const firstDate = new Date(firstLog.logged_at || 0).getTime();
    const currentDate = Date.now();
    const diffDays = Math.max(0, (currentDate - firstDate) / (1000 * 60 * 60 * 24));

    // Stagnant condition: logged for >= 7 days and current pain is equal or higher than initial
    if (diffDays >= 7 && currentPain >= firstLog.pain_score) {
      isStagnantOrWorse = true;
    }
  }

  // If patient is progressing well (e.g. pain decreased from 7 to 4), NO ALERT NEEDED!
  if (!isSevereSpike && !isStagnantOrWorse) {
    return {
      requires_adaptation: false,
      alert_level: 'NONE',
      alert_message: null,
    };
  }

  // 2. ALERT CONDITION MET -> FORMULATE ADAPTATION ALERT
  const alertLevel: 'YELLOW' | 'RED' = isSevereSpike ? 'RED' : 'YELLOW';

  const defaultMessage = isSevereSpike
    ? `PERINGATAN TINGKAT TINGGI (RED): Pasien ${patientName} melaporkan lonjakan skala nyeri akut (${currentPain}/10). Perlu evaluasi darurat terhadap intensitas manipulasi totok saraf dan pengecekan spasme akut.`
    : `PERINGATAN ADAPTASI (YELLOW): Nyeri pasien ${patientName} stagnan/belum berkurang signifikan (${currentPain}/10) setelah lebih dari 7 hari pemulihan. Perlu adaptasi titik terapi kompensasi sekunder dan evaluasi kepatuhan rimpang/napas diafragma di rumah.`;

  const defaultRecommendation = isSevereSpike
    ? 'Hubungi pasien segera via WhatsApp untuk anjuran istirahat total dan kompres dingin/hangat; jadwalkan penyesuaian sesi totok saraf.'
    : 'Ubah strategi manipulasi dari fokus lokal ke penguraian fasia serviko-torakal dan perkuat stimulasi tonus vagal.';

  // Attempt Gemini Flash refinement if configured
  if (process.env.GEMINI_API_KEY) {
    try {
      const res = await callGeminiJSON({
        prompt: `Analisa respon pemulihan & alarm adaptasi terapi:
Pasien: ${patientName}
Keluhan: ${complaintCategory || 'Keluhan Muskuloskeletal/Saraf'}
Skor Nyeri Terkini: ${currentPain}/10 (Tidur: ${currentLog.sleep_score}/10, Stres: ${currentLog.stress_score}/10, Kepatuhan: ${currentLog.adherence_pct || 80}%)
Riwayat Nyeri: ${JSON.stringify(history.map((h) => ({ pain: h.pain_score, date: h.logged_at })))}
Catatan Pasien: "${currentLog.patient_note || '-'}"

Keluarkan JSON dengan schema:
{
  "alert_level": "${alertLevel}",
  "alert_message": "penjelasan klinis ringkas untuk praktisi",
  "clinical_recommendation": "anjuran tindakan modifikasi terapi"
}`,
        systemInstruction:
          'Anda adalah Agen 7: Clinical Recovery & Adaptation Monitor di Ruang Pulih Makassar. Berikan analisis klinis ringkas dan terukur untuk praktisi klinik.',
        tier: 'flash',
        schema: AdaptationOutputSchema,
        endpoint: 'agent7-monitor',
        agentName: 'Agent-7-AdaptationMonitor',
      });

      return {
        requires_adaptation: true,
        alert_level: res.data.alert_level,
        alert_message: res.data.alert_message,
        clinical_recommendation: res.data.clinical_recommendation,
      };
    } catch {
      // Fallback below
    }
  }

  return {
    requires_adaptation: true,
    alert_level: alertLevel,
    alert_message: defaultMessage,
    clinical_recommendation: defaultRecommendation,
  };
}
