import { callGeminiJSON } from '@/lib/gemini/client';
import { z } from 'zod';

export interface ProgressLogItem {
  pain_score: number;
  sleep_score: number;
  stress_score: number;
  adherence_pct?: number;
  patient_note?: string | null;
  logged_at?: string;
  systolic_bp?: number | null;
  diastolic_bp?: number | null;
  blood_sugar_mgdl?: number | null;
  blood_sugar_context?: 'PUASA' | 'SEWAKTU' | '2_JAM_PP' | string | null;
  completed_habits_json?: string[] | null;
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
  urgent_patient_warning?: string | null;
}

const AdaptationOutputSchema = z.object({
  alert_level: z.enum(['NONE', 'YELLOW', 'RED']),
  alert_message: z.string(),
  clinical_recommendation: z.string(),
});

/**
 * Agent 7: Progress & Adaptation Monitor
 * Cost-effective Hybrid Deterministic Guardrail + Gemini Flash:
 * 1. Zero AI Token deterministic checks for vital emergencies (BP Crisis, Hypoglycemia, Severe Hyperglycemia).
 * 2. Absolute Clinical Safety Rule: strictly forbids advising patient to change or stop prescribed medications.
 * 3. Evaluates recovery trajectory: flags pain spike (>= 8) or stagnation (>= 7 days).
 */
export async function runAgent7Monitor(
  input: AdaptationMonitorInput
): Promise<AdaptationMonitorResult> {
  const { currentLog, history, patientName, complaintCategory } = input;
  const currentPain = currentLog.pain_score;
  const systolic = currentLog.systolic_bp;
  const diastolic = currentLog.diastolic_bp;
  const bloodSugar = currentLog.blood_sugar_mgdl;

  // ---------------------------------------------------------------------------
  // 1. DETERMINISTIC CLINICAL GUARDRAIL: TENSI & GULA DARAH (0 AI Cost)
  // ---------------------------------------------------------------------------
  let isVitalCrisisRed = false;
  let isVitalWarningYellow = false;
  const vitalCrisisReasons: string[] = [];
  const vitalWarningReasons: string[] = [];

  // RED FLAG DARURAT TENSI:
  // Krisis Hipertensi jika Sistolik >= 180 ATAU Diastolik >= 120
  if (
    (typeof systolic === 'number' && systolic >= 180) ||
    (typeof diastolic === 'number' && diastolic >= 120)
  ) {
    isVitalCrisisRed = true;
    vitalCrisisReasons.push(
      `Tekanan darah (${systolic ?? '-'}/${diastolic ?? '-'} mmHg) tergolong Krisis Hipertensi`
    );
  } else if (typeof systolic === 'number' && systolic >= 150) {
    isVitalWarningYellow = true;
    vitalWarningReasons.push(
      `Tekanan darah sistolik (${systolic} mmHg) berada di atas target aman`
    );
  }

  // RED FLAG DARURAT GULA DARAH:
  // Hipoglikemia < 70 mg/dL ATAU Hiperglikemia berat >= 300 mg/dL
  if (typeof bloodSugar === 'number') {
    if (bloodSugar < 70) {
      isVitalCrisisRed = true;
      vitalCrisisReasons.push(
        `Kadar gula darah (${bloodSugar} mg/dL) tergolong Hipoglikemia Darurat (< 70 mg/dL)`
      );
    } else if (bloodSugar >= 300) {
      isVitalCrisisRed = true;
      vitalCrisisReasons.push(
        `Kadar gula darah (${bloodSugar} mg/dL) tergolong Hiperglikemia Berat (≥ 300 mg/dL)`
      );
    } else if (bloodSugar >= 200) {
      isVitalWarningYellow = true;
      vitalWarningReasons.push(
        `Kadar gula darah (${bloodSugar} mg/dL) tinggi di atas 200 mg/dL`
      );
    }
  }

  // JIKA TERDETEKSI KRISIS TANDA VITAL DARURAT:
  // Langsung kembalikan alert RED instan tanpa biaya token AI
  if (isVitalCrisisRed) {
    const reasonsText = vitalCrisisReasons.join(', ');
    const urgentWarning = `PERINGATAN MEDIS DARURAT: ${reasonsText}. Mohon segera istirahat tenang, lakukan pengukuran ulang dalam 15–30 menit, dan segera hubungi faskes atau IGD terdekat jika timbul gejala pusing hebat, lemas gemetar, atau pandangan kabur. DILARANG menghentikan atau mengubah dosis obat resep dokter secara mendadak tanpa instruksi dokter Anda.`;

    const alertMessage = `PERINGATAN DARURAT (RED): Pasien ${patientName} mencatat ${reasonsText}. Segera lakukan follow-up medis darurat dan koordinasikan rujukan faskes jika gejala berlanjut.`;

    const recommendation = `Hubungi pasien segera via telepon/WhatsApp untuk verifikasi keluhan fisik dan arahkan konsultasi faskes terdekat. Pastikan pasien tidak memanipulasi dosis obat dokter sendiri.`;

    return {
      requires_adaptation: true,
      alert_level: 'RED',
      alert_message: alertMessage,
      clinical_recommendation: recommendation,
      urgent_patient_warning: urgentWarning,
    };
  }

  // ---------------------------------------------------------------------------
  // 2. EVALUASI TREN PEMULIHAN NYERI & STAGNASI (Fase Nyeri)
  // ---------------------------------------------------------------------------
  const isSevereSpike = currentPain >= 8;
  let isStagnantOrWorse = false;

  if (history.length >= 2) {
    const sorted = [...history].sort(
      (a, b) => new Date(a.logged_at || 0).getTime() - new Date(b.logged_at || 0).getTime()
    );

    const firstLog = sorted[0];
    const firstDate = new Date(firstLog.logged_at || 0).getTime();
    const currentDate = Date.now();
    const diffDays = Math.max(0, (currentDate - firstDate) / (1000 * 60 * 60 * 24));

    if (diffDays >= 7 && currentPain >= firstLog.pain_score) {
      isStagnantOrWorse = true;
    }
  }

  // Jika kondisi pasien normal & stabil tanpa tanda bahaya
  if (!isVitalWarningYellow && !isSevereSpike && !isStagnantOrWorse) {
    return {
      requires_adaptation: false,
      alert_level: 'NONE',
      alert_message: null,
      urgent_patient_warning: null,
    };
  }

  // ---------------------------------------------------------------------------
  // 3. FORMULASIKAN PERINGATAN ADAPTASI (YELLOW / RED SPARK)
  // ---------------------------------------------------------------------------
  const alertLevel: 'YELLOW' | 'RED' = isSevereSpike ? 'RED' : 'YELLOW';

  let defaultMessage = '';
  let defaultRecommendation = '';
  let urgentPatientWarning: string | null = null;

  if (isSevereSpike) {
    defaultMessage = `PERINGATAN TINGKAT TINGGI (RED): Pasien ${patientName} melaporkan lonjakan skala nyeri akut (${currentPain}/10). Perlu evaluasi darurat terhadap intensitas manipulasi totok saraf dan pengecekan spasme akut.`;
    defaultRecommendation =
      'Hubungi pasien segera via WhatsApp untuk anjuran istirahat total dan kompres dingin/hangat; jadwalkan penyesuaian sesi totok saraf.';
    urgentPatientWarning = `Catatan Praktisi: Anda melaporkan nyeri yang cukup tinggi (${currentPain}/10). Mohon istirahat dan hindari aktivitas fisik berat. Praktisi kami telah menerima notifikasi dan akan meninjau kondisi Anda.`;
  } else {
    // YELLOW Alert
    const reasons: string[] = [];
    if (vitalWarningReasons.length > 0) reasons.push(vitalWarningReasons.join(', '));
    if (isStagnantOrWorse) reasons.push(`skala nyeri (${currentPain}/10) stagnan ≥ 7 hari`);

    defaultMessage = `PERINGATAN ADAPTASI (YELLOW): Pasien ${patientName} mencatat ${reasons.join(
      ' dan '
    )}. Perlu evaluasi titik kompensasi sekunder, tinjauan gaya hidup, dan stimulasi saraf otonom di rumah.`;
    defaultRecommendation =
      'Evaluasi kembali titik kompresi saraf serviko-torakal dan perkuat stimulasi relaksasi diafragma serta konsumsi rimpang anti-inflamasi.';
  }

  // Attempt Gemini Flash refinement for nuanced clinical notes if configured
  if (process.env.GEMINI_API_KEY) {
    try {
      const res = await callGeminiJSON({
        prompt: `Analisa respon pemulihan & alarm adaptasi terapi:
Pasien: ${patientName}
Keluhan: ${complaintCategory || 'Keluhan Muskuloskeletal / Saraf / Metabolik'}
Skor Nyeri Terkini: ${currentPain}/10 (Tidur: ${currentLog.sleep_score}/10, Stres: ${currentLog.stress_score}/10, Kepatuhan: ${currentLog.adherence_pct || 80}%)
Tensi: ${systolic ? `${systolic}/${diastolic} mmHg` : '-'}
Gula Darah: ${bloodSugar ? `${bloodSugar} mg/dL (${currentLog.blood_sugar_context || 'sewaktu'})` : '-'}
Riwayat Nyeri: ${JSON.stringify(history.map((h) => ({ pain: h.pain_score, date: h.logged_at })))}
Catatan Pasien: "${currentLog.patient_note || '-'}"

Keluarkan JSON dengan schema:
{
  "alert_level": "${alertLevel}",
  "alert_message": "penjelasan klinis ringkas untuk praktisi",
  "clinical_recommendation": "anjuran tindakan modifikasi terapi"
}`,
        systemInstruction:
          'Anda adalah Agen 7: Clinical Recovery & Adaptation Monitor di Ruang Pulih Makassar. Berikan analisis klinis ringkas dan terukur untuk praktisi klinik. DILARANG menganjurkan pasien menghentikan obat resep dokter.',
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
        urgent_patient_warning: urgentPatientWarning,
      };
    } catch {
      // Fallback to deterministic default message
    }
  }

  return {
    requires_adaptation: true,
    alert_level: alertLevel,
    alert_message: defaultMessage,
    clinical_recommendation: defaultRecommendation,
    urgent_patient_warning: urgentPatientWarning,
  };
}
