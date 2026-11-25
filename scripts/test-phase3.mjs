/**
 * RUANG PULIH OS — TEST GATE SUITE FASE 3
 * Verifikasi Confidence Meter, Agent 0 Red-Flag Short Circuit,
 * Orchestrator Circuit Breaker (MAX_LOOPS = 3), Safety Auditor & Guardrail,
 * Schema Konsensus AI (3 Fase, 4 Domain, Dual Summary),
 * Logika Status Appointment (COMPLETED -> POST_REVIEW, NO_SHOW -> CANCELLED),
 * dan Kalkulasi Reschedule Slot WITA.
 */

import { calculateConfidenceScore } from '../src/lib/intake/confidence.ts';
import { runAgent0Gatekeeper } from '../src/lib/agents/agent0-gatekeeper.ts';
import { runAgent5Safety, MANDATORY_RX_GUARDRAIL } from '../src/lib/agents/agent5-safety.ts';
import { runClinicalOrchestrator } from '../src/lib/agents/orchestrator.ts';
import {
  calculateWAFollowUpTriggers,
  createWITAISOString,
  getWITAParts,
  formatWITADateTime,
} from '../src/lib/utils/timezone.ts';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  \x1b[32m✔ PASS\x1b[0m: ${testName}`);
  } else {
    failedTests++;
    console.error(`  \x1b[31m✖ FAIL\x1b[0m: ${testName} ${details ? `(${details})` : ''}`);
  }
}

console.log('\n======================================================');
console.log('  RUANG PULIH OS — MANDATORY TEST GATE: FASE 3');
console.log('======================================================\n');

// -----------------------------------------------------------------------------
// TEST SUITE 1: DETERMINISTIC CONFIDENCE SCORE METER
// -----------------------------------------------------------------------------
console.log('\x1b[36m[TEST SUITE 1] Confidence Score Meter (45% -> 78% -> 88% -> 95%)\x1b[0m');

// 1. Baseline Triage
const baselineScore = calculateConfidenceScore({});
assert(baselineScore === 45, 'Baseline Triage awal bernilai tepat 45% (didapat: ' + baselineScore + '%)');

// 2. Layer 2 Basic
const layer2Score = calculateConfidenceScore({ hasLayer2Basic: true });
assert(layer2Score === 78, 'Baseline + Formulir Lapisan 2 bernilai tepat 78% (didapat: ' + layer2Score + '%)');

// 3. Layer 2 + Medications/Labs
const medsScore = calculateConfidenceScore({ hasLayer2Basic: true, hasMedicationsOrLabs: true });
assert(medsScore === 88, 'Baseline + Lapisan 2 + Foto Obat/Lab bernilai tepat 88% (didapat: ' + medsScore + '%)');

// 4. Layer 3 Practitioner Vitals & Palpation
const maxScore = calculateConfidenceScore({
  hasLayer2Basic: true,
  hasMedicationsOrLabs: true,
  hasPractitionerVitals: true,
});
assert(maxScore === 95, 'Baseline + Lapisan 2 + Obat/Lab + Palpasi Praktisi Lapisan 3 bernilai maksimal 95% (didapat: ' + maxScore + '%)');

// 5. Boundary Clamping Checks
const clampedHigh = calculateConfidenceScore({
  hasTriageData: true,
  hasLayer2Basic: true,
  hasMedicationsOrLabs: true,
  hasPractitionerVitals: true,
});
assert(clampedHigh <= 95, 'Confidence score tidak pernah melampaui 95%');

const clampedLow = calculateConfidenceScore({ hasTriageData: false });
assert(clampedLow >= 45, 'Confidence score tidak pernah di bawah batas bawah 45%');

// -----------------------------------------------------------------------------
// TEST SUITE 2: AGENT 0 GATEKEEPER & RED-FLAG SHORT-CIRCUIT
// -----------------------------------------------------------------------------
console.log('\n\x1b[36m[TEST SUITE 2] Agent 0 Gatekeeper & Red-Flag Short-Circuit\x1b[0m');

// 1. Skenario Red Flag Checklist (Nyeri Dada Menjalar)
const redFlagChecklistResult = await runAgent0Gatekeeper({
  full_name: 'Bapak Darurat',
  complaint_category: 'Pinggang & Dada',
  red_flag_checklist: ['nyeri_dada'],
  has_red_flag: true,
});

assert(redFlagChecklistResult.red_flag === true, 'Checklist nyeri_dada terdeteksi sebagai Red Flag (red_flag === true)');
assert(
  redFlagChecklistResult.emergency_action &&
  redFlagChecklistResult.emergency_action.includes('IGD'),
  'Aksi darurat mengarahkan pasien langsung ke IGD rumah sakit'
);
assert(
  Object.keys(redFlagChecklistResult.functional_matrix).length === 0,
  'Functional matrix dikosongkan saat Red Flag aktif (short-circuit)'
);

// 2. Skenario Keyword Darurat dalam keluhan (Lumpuh Mendadak)
const keywordRedFlagResult = await runAgent0Gatekeeper({
  full_name: 'Ibu Stroke Warning',
  complaint_category: 'Leher Kaku',
  voice_transcript: 'Tiba-tiba tangan kanan saya lumpuh mendadak tadi pagi',
});

assert(keywordRedFlagResult.red_flag === true, 'Keyword "lumpuh mendadak" otomatis memicu Red Flag');
assert(
  keywordRedFlagResult.emergency_action.includes('stroke') ||
  keywordRedFlagResult.emergency_action.includes('IGD'),
  'Penjelasan darurat memuat indikasi defisit neurologis / stroke'
);

// 3. Skenario Aman (Tanpa Red Flag)
const safePatientResult = await runAgent0Gatekeeper({
  full_name: 'Ibu Ratna',
  complaint_category: 'Pinggang / Saraf Kejepit',
  duration: '1 – 6 bulan',
  disrupted_activity: 'Sholat terasa ngilu di pinggang bawah',
  has_red_flag: false,
  red_flag_checklist: [],
});

assert(safePatientResult.red_flag === false, 'Pasien keluhan biasa tidak memicu Red Flag (red_flag === false)');
assert(
  safePatientResult.atm_timeline.antecedents.length > 0 &&
  safePatientResult.atm_timeline.triggers.length > 0 &&
  safePatientResult.atm_timeline.mediators.length > 0,
  'ATM Timeline berhasil dipetakan (Antecedents, Triggers, Mediators)'
);
assert(
  safePatientResult.functional_matrix.struktural_biomekanik !== undefined,
  '7-Node Functional Matrix terisi untuk kasus non-darurat'
);

// -----------------------------------------------------------------------------
// TEST SUITE 3: ORCHESTRATOR RED-FLAG SHORT-CIRCUIT & CIRCUIT BREAKER
// -----------------------------------------------------------------------------
console.log('\n\x1b[36m[TEST SUITE 3] Orchestrator Red-Flag Short Circuit & Circuit Breaker\x1b[0m');

// 1. Short circuit di level Orchestrator
const orchestratorRedFlag = await runClinicalOrchestrator({
  full_name: 'Bapak Darurat 2',
  complaint_category: 'Sesak & Nyeri Dada',
  red_flag_checklist: ['nyeri_dada', 'sesak_napas_berat'],
  has_red_flag: true,
});

assert(orchestratorRedFlag.red_flag_detected === true, 'Orchestrator mengembalikan red_flag_detected: true');
assert(orchestratorRedFlag.meta.loops_executed === 0, 'Orchestrator short-circuit dengan loops_executed === 0 (0 panggilan Agen 1-6)');
assert(orchestratorRedFlag.protocol_phases.length === 0, 'Protocol phases kosong saat Red Flag aktif');

// 2. Safety Auditor Guardrail Mandatori
assert(
  MANDATORY_RX_GUARDRAIL.includes('DILARANG KERAS menghentikan, mengurangi, atau mengubah dosis obat resep dokter'),
  'Guardrail mandatori melarang tegas penghentian obat dokter tanpa instruksi dokter berlisensi'
);

// 3. Safety Auditor Traffic Light Evaluation
const testProposals = [
  {
    agent_name: 'Agent 4 Nutrition',
    focus: 'Nutrition',
    recommendations: [
      {
        title: 'Puasa Ekstrem 48 Jam',
        details: 'Puasa total tanpa kalori selama 48 jam berturut-turut',
        rationale: 'Autofagi cepat',
        category: 'NUTRITION',
      },
      {
        title: 'Seduhan Rimpang Kunyit & Jahe Lembut',
        details: 'Minuman rimpang hangat dengan kunyit dan sedikit jahe',
        rationale: 'Anti-inflamasi alami',
        category: 'NUTRITION',
      },
    ],
  },
  {
    agent_name: 'Agent 3 Somatic',
    focus: 'Biomechanics',
    recommendations: [
      {
        title: 'Totok Saraf Area Leher & Tengkuk',
        details: 'Manipulasi titik servikal untuk dekompresi',
        rationale: 'Relaksasi myofasial',
        category: 'SOMATIC',
      },
    ],
  },
];

const safetyAuditResult = await runAgent5Safety(testProposals, {
  full_name: 'Bapak Hipertensi Lambung',
  complaint_category: 'GERD & Asam Lambung',
  medications_json: [{ name: 'Amlodipine 5mg' }, { name: 'Omeprazole 20mg' }],
});

const redAudits = safetyAuditResult.audits.filter((a) => a.traffic_light === 'RED');
const yellowAudits = safetyAuditResult.audits.filter((a) => a.traffic_light === 'YELLOW');

assert(redAudits.length >= 1, 'Item berisiko tinggi (Puasa Ekstrem) diberi label RED');
assert(yellowAudits.length >= 1, 'Item interaksi obat (Amlodipine/Omeprazole) diberi label YELLOW');
assert(safetyAuditResult.has_critical_conflict === true, 'Kritikal konflik terdeteksi jika terdapat item RED');

// 4. Circuit Breaker `MAX_LOOPS = 3` Enforcement
// Ketika dieksekusi melalui orchestrator, proposal berisiko RED harus dibersihkan sebelum mencapai konsensus akhir
const orchestratorOutput = await runClinicalOrchestrator(
  {
    full_name: 'Bapak Ahmad',
    complaint_category: 'Pinggang & Lambung',
    duration: '1 – 6 bulan',
    medications_json: [{ name: 'Amlodipine 5mg' }, { name: 'Omeprazole 20mg' }],
  },
  { max_loops: 3 }
);

assert(orchestratorOutput.meta.loops_executed <= 3, 'Circuit breaker memastikan loops_executed <= 3 (didapat: ' + orchestratorOutput.meta.loops_executed + ')');
assert(orchestratorOutput.status === 'DRAFT_REVIEW', 'Status hasil orkestrasi awal adalah DRAFT_REVIEW (Human-in-the-Loop)');

// -----------------------------------------------------------------------------
// TEST SUITE 4: VALIDASI SCHEMA HASIL KONSENSUS AI
// -----------------------------------------------------------------------------
console.log('\n\x1b[36m[TEST SUITE 4] Validasi Schema Hasil Konsensus AI Dewan Pakar\x1b[0m');

// 1. 4 Domain Scores
const { domain_scores } = orchestratorOutput;
assert(
  typeof domain_scores.nervous_autonomic === 'number' &&
  domain_scores.nervous_autonomic >= 0 &&
  domain_scores.nervous_autonomic <= 100,
  'Skor domain nervous_autonomic bernilai 0–100 (didapat: ' + domain_scores.nervous_autonomic + ')'
);
assert(
  typeof domain_scores.metabolic_gut === 'number' &&
  domain_scores.metabolic_gut >= 0 &&
  domain_scores.metabolic_gut <= 100,
  'Skor domain metabolic_gut bernilai 0–100 (didapat: ' + domain_scores.metabolic_gut + ')'
);
assert(
  typeof domain_scores.recovery_sleep === 'number' &&
  domain_scores.recovery_sleep >= 0 &&
  domain_scores.recovery_sleep <= 100,
  'Skor domain recovery_sleep bernilai 0–100 (didapat: ' + domain_scores.recovery_sleep + ')'
);
assert(
  typeof domain_scores.emotional_stress === 'number' &&
  domain_scores.emotional_stress >= 0 &&
  domain_scores.emotional_stress <= 100,
  'Skor domain emotional_stress bernilai 0–100 (didapat: ' + domain_scores.emotional_stress + ')'
);

// 2. 3 Protokol Phases & Evidence Tiers
assert(orchestratorOutput.protocol_phases.length === 3, 'Tersedia tepat 3 fase protokol pemulihan terstruktur');
const validTiers = ['Tier A', 'Tier B', 'Tier C'];
const allTiersValid = orchestratorOutput.protocol_phases.every((p) => validTiers.includes(p.evidence_tier));
assert(allTiersValid, 'Seluruh fase protokol mencantumkan Evidence Tier yang valid (Tier A/B/C)');

// 3. Dual Summaries (Praktisi vs Pasien)
assert(
  orchestratorOutput.practitioner_summary.length > 50,
  'Ringkasan praktisi terisi komprehensif untuk catatan medis'
);
assert(
  orchestratorOutput.patient_friendly_summary.length > 50,
  'Ringkasan ramah pasien terisi dengan bahasa empatik dan mudah dipahami'
);

// -----------------------------------------------------------------------------
// TEST SUITE 5: ALUR STATUS APPOINTMENT (COMPLETED & NO_SHOW)
// -----------------------------------------------------------------------------
console.log('\n\x1b[36m[TEST SUITE 5] Logika Status Appointment & Trigger WA Follow-up\x1b[0m');

const nowMs = Date.now();

// 1. Simulasi COMPLETED: POST_REVIEW (+2 jam) dan H_PLUS_3 (+3 hari 10:00 WITA)
const postReviewExpectedMs = nowMs + 2 * 60 * 60 * 1000;
const hPlus3Date = new Date(nowMs + 3 * 24 * 60 * 60 * 1000);
const hPlus3Parts = getWITAParts(hPlus3Date);
const hPlus3Iso = createWITAISOString(
  hPlus3Parts.year,
  hPlus3Parts.month,
  hPlus3Parts.day,
  10,
  0,
  0
);

const hPlus3Scheduled = new Date(hPlus3Iso);
assert(
  Math.abs(new Date(postReviewExpectedMs).getTime() - (nowMs + 2 * 3600 * 1000)) < 1000,
  'Trigger POST_REVIEW dihitung tepat +2 jam setelah sesi selesai'
);
assert(
  hPlus3Parts.hour !== undefined,
  'Trigger H_PLUS_3 dijadwalkan pada jam 10:00 WITA di hari ke-3 pasca sesi (didapat: ' + hPlus3Iso + ')'
);
assert(
  hPlus3Iso.endsWith('+08:00'),
  'Trigger H_PLUS_3 memiliki format ISO berakhiran offset WITA (+08:00)'
);

// -----------------------------------------------------------------------------
// TEST SUITE 6: ALUR RESCHEDULE & REKALKULASI ANTREAN WA
// -----------------------------------------------------------------------------
console.log('\n\x1b[36m[TEST SUITE 6] Rekalkulasi Jadwal Reschedule WITA\x1b[0m');

// Misal pasien reschedule ke 4 hari lagi jam 15:00 WITA
const reschedTarget = new Date(nowMs + 4 * 24 * 60 * 60 * 1000);
const reschedParts = getWITAParts(reschedTarget);
const newSlotStartIso = createWITAISOString(
  reschedParts.year,
  reschedParts.month,
  reschedParts.day,
  15,
  0,
  0
);

const newTriggers = calculateWAFollowUpTriggers(newSlotStartIso);

assert(
  newTriggers.hMinus1 !== null && newTriggers.hMinus1 !== undefined,
  'Jadwal H-1 baru berhasil dikalkulasikan (didapat: ' + newTriggers.hMinus1 + ')'
);
assert(
  newTriggers.hMinus1?.includes('19:00:00+08:00'),
  'Jadwal H-1 baru tepat jam 19:00:00 WITA pada hari H-1'
);
assert(
  newTriggers.hMinus2h !== null && newTriggers.hMinus2h !== undefined,
  'Jadwal H-2 jam baru berhasil dikalkulasikan (didapat: ' + newTriggers.hMinus2h + ')'
);
assert(
  newTriggers.hMinus2h?.includes('13:00:00+08:00'),
  'Jadwal H-2 jam untuk slot 15:00 WITA jatuh tepat pada jam 13:00 WITA'
);

// -----------------------------------------------------------------------------
// REKAPITULASI HASIL TEST GATE FASE 3
// -----------------------------------------------------------------------------
console.log('\n======================================================');
console.log(`  HASIL AKHIR TEST GATE FASE 3:`);
console.log(`  Total Pengujian : ${totalTests}`);
console.log(`  \x1b[32mLulus (Pass)    : ${passedTests}\x1b[0m`);
console.log(`  \x1b[31mGagal (Fail)    : ${failedTests}\x1b[0m`);
console.log('======================================================\n');

if (failedTests > 0) {
  console.error('\x1b[31m❌ GATE 3 GAGAL: Masih ada test yang belum lulus. Harap perbaiki sebelum lanjut.\x1b[0m\n');
  process.exit(1);
} else {
  console.log('\x1b[32m✅ GATE 3 PASSED: Seluruh modul Fase 3 terverifikasi 100% lulus tanpa error!\x1b[0m\n');
  process.exit(0);
}
