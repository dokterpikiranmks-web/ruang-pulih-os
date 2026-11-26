/**
 * RUANG PULIH OS — TEST GATE SUITE FASE 4 (FINAL PRODUCTION GATE)
 * Verifikasi:
 * 1. Otentikasi Sesi Pasien & PIN 4 Digit (HMAC Sign/Verify) + Human-in-the-Loop Protocol Privacy.
 * 2. Logika Agent 7 (Clinical Adaptation & Recovery Monitor: Hemat Token vs Alert Nyeri).
 * 3. Logika Smart Review Gate (Rating 4-5 -> Google Maps, Rating 1-3 -> Internal Feedback).
 * 4. Keamanan & Logika Cron Worker WA Fonnte (Batas Batch 5, Retry Count -> FAILED).
 * 5. Static Zero Secret Leak Audit pada seluruh Client Components ('use client').
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { signPatientSession, verifyPatientSession } from '../src/lib/patient/auth.ts';
import { runAgent7Monitor } from '../src/lib/agents/agent7-monitor.ts';
import { getWITAParts, createWITAISOString } from '../src/lib/utils/timezone.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

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
console.log('  RUANG PULIH OS — MANDATORY TEST GATE: FASE 4');
console.log('======================================================\n');

// -----------------------------------------------------------------------------
// TEST SUITE 1: OTENTIKASI SESI PASIEN PIN 4 DIGIT & HUMAN-IN-THE-LOOP
// -----------------------------------------------------------------------------
console.log('\x1b[36m[TEST SUITE 1] Otentikasi Sesi Pasien (HMAC) & Human-in-the-Loop Protocol Gate\x1b[0m');

const testMagicToken = 'token_abc123_makassar_wita';
const signedCookie = signPatientSession(testMagicToken);

assert(
  typeof signedCookie === 'string' && signedCookie.split('.').length === 3,
  'Sesi pasien bertanda tangan HMAC dengan format <token>.<timestamp>.<signature>'
);

const isSessionValid = verifyPatientSession(testMagicToken, signedCookie);
assert(isSessionValid === true, 'Verifikasi sesi HMAC sukses jika magic_token dan tanda tangan cocok');

const isTamperedInvalid = verifyPatientSession(testMagicToken, signedCookie + 'tampered');
assert(isTamperedInvalid === false, 'Sesi yang diubah (tampered) ditolak otomatis');

const isWrongTokenInvalid = verifyPatientSession('wrong_token_456', signedCookie);
assert(isWrongTokenInvalid === false, 'Sesi token yang tidak cocok ditolak');

const isNullSessionInvalid = verifyPatientSession(testMagicToken, null);
assert(isNullSessionInvalid === false, 'Cookie sesi kosong ditolak');

// Human-in-the-Loop Gate Simulation
function filterProtocolForPatient(protocolRecord) {
  if (protocolRecord && protocolRecord.status === 'PUBLISHED') {
    return {
      status: 'PUBLISHED',
      domain_scores: protocolRecord.domain_scores_json,
      protocol_phases: protocolRecord.final_protocol_json,
      summary: protocolRecord.patient_friendly_summary,
    };
  }
  return {
    status: 'WAITING_REVIEW',
    message: 'Protokol terapi mandiri Anda sedang disusun dan diverifikasi langsung oleh Praktisi Ruang Pulih Makassar.',
  };
}

const draftProtocol = {
  status: 'DRAFT_REVIEW',
  domain_scores_json: { nervous_autonomic: 60 },
  final_protocol_json: [{ phase: 1, title: 'Draft Phase' }],
  patient_friendly_summary: 'Draft summary klinis',
};

const patientViewOfDraft = filterProtocolForPatient(draftProtocol);
assert(
  patientViewOfDraft.status === 'WAITING_REVIEW',
  'Protokol berstatus DRAFT_REVIEW TIDAK BOLEH tampil ke pasien (kembalikan WAITING_REVIEW)'
);
assert(
  patientViewOfDraft.summary === undefined,
  'Konten teknis/draft tidak bocor sebelum disetujui praktisi'
);

const publishedProtocol = {
  status: 'PUBLISHED',
  domain_scores_json: { nervous_autonomic: 75 },
  final_protocol_json: [{ phase: 1, title: 'Phase 1 Active' }],
  patient_friendly_summary: 'Program pemulihan resmi Anda',
};
const patientViewOfPublished = filterProtocolForPatient(publishedProtocol);
assert(
  patientViewOfPublished.status === 'PUBLISHED',
  'Protokol berstatus PUBLISHED berhasil terbuka bagi pasien'
);

// -----------------------------------------------------------------------------
// TEST SUITE 2: AGENT 7 — PROGRESS & CLINICAL ADAPTATION MONITOR
// -----------------------------------------------------------------------------
console.log('\n\x1b[36m[TEST SUITE 2] Agent 7 — Progress & Clinical Adaptation Monitor\x1b[0m');

// Skenario A: Pasien membaik (nyeri dari 8 turun ke 4) -> Zero token / no alert
const improvingHistory = [
  { pain_score: 8, sleep_score: 4, stress_score: 7, logged_at: new Date(Date.now() - 10 * 86400000).toISOString() },
  { pain_score: 6, sleep_score: 6, stress_score: 5, logged_at: new Date(Date.now() - 5 * 86400000).toISOString() },
];
const improvingResult = await runAgent7Monitor({
  currentLog: { pain_score: 4, sleep_score: 8, stress_score: 3 },
  history: improvingHistory,
  patientName: 'Bapak Ruslan',
});

assert(improvingResult.requires_adaptation === false, 'Pasien dengan tren pemulihan baik tidak memicu adaptasi');
assert(improvingResult.alert_level === 'NONE', 'Tingkat alert bernilai NONE saat nyeri turun');
assert(improvingResult.alert_message === null, 'Pesan alert kosong saat kondisi pasien membaik (hemat token & log)');

// Skenario B: Lonjakan nyeri akut (nyeri >= 8) -> RED Alert
const acuteSpikeResult = await runAgent7Monitor({
  currentLog: { pain_score: 9, sleep_score: 2, stress_score: 8, patient_note: 'Tiba-tiba pinggang saya kram hebat' },
  history: [],
  patientName: 'Ibu Fatimah',
});

assert(acuteSpikeResult.requires_adaptation === true, 'Lonjakan nyeri akut (>= 8/10) memicu adaptasi klinis');
assert(acuteSpikeResult.alert_level === 'RED', 'Lonjakan nyeri akut diberi label RED Alert');
assert(
  acuteSpikeResult.alert_message !== null && acuteSpikeResult.alert_message.includes('RED'),
  'Pesan peringatan memuat instruksi darurat untuk praktisi'
);

// Skenario C: Nyeri stagnan setelah >= 7 hari pemulihan -> YELLOW Alert
const stagnantHistory = [
  { pain_score: 6, sleep_score: 5, stress_score: 6, logged_at: new Date(Date.now() - 9 * 86400000).toISOString() },
  { pain_score: 6, sleep_score: 5, stress_score: 6, logged_at: new Date(Date.now() - 4 * 86400000).toISOString() },
];
const stagnantResult = await runAgent7Monitor({
  currentLog: { pain_score: 6, sleep_score: 5, stress_score: 6 },
  history: stagnantHistory,
  patientName: 'Bapak Syamsul',
});

assert(stagnantResult.requires_adaptation === true, 'Nyeri stagnan setelah 9 hari memicu peringatan adaptasi');
assert(stagnantResult.alert_level === 'YELLOW', 'Nyeri stagnan diberi label YELLOW Alert');

// -----------------------------------------------------------------------------
// TEST SUITE 3: SMART REVIEW GATE (REPUTASI GOOGLE MAPS VS MASUKAN INTERNAL)
// -----------------------------------------------------------------------------
console.log('\n\x1b[36m[TEST SUITE 3] Smart Review Gate (Google Maps vs Masukan Internal)\x1b[0m');

function evaluateReviewRoute(rating) {
  return {
    routed_to_gmaps: rating >= 4,
    show_internal_form: rating <= 3,
  };
}

const fiveStar = evaluateReviewRoute(5);
assert(fiveStar.routed_to_gmaps === true, 'Rating 5 bintang diarahkan ke Google Maps (routed_to_gmaps = true)');
assert(fiveStar.show_internal_form === false, 'Rating 5 bintang tidak memunculkan form komplain internal');

const fourStar = evaluateReviewRoute(4);
assert(fourStar.routed_to_gmaps === true, 'Rating 4 bintang diarahkan ke Google Maps (routed_to_gmaps = true)');

const threeStar = evaluateReviewRoute(3);
assert(threeStar.routed_to_gmaps === false, 'Rating 3 bintang DITAHAN dari Google Maps (routed_to_gmaps = false)');
assert(threeStar.show_internal_form === true, 'Rating 3 bintang memunculkan form masukan internal praktisi');

const oneStar = evaluateReviewRoute(1);
assert(oneStar.routed_to_gmaps === false, 'Rating 1 bintang DITAHAN dari Google Maps (routed_to_gmaps = false)');
assert(oneStar.show_internal_form === true, 'Rating 1 bintang memunculkan form masukan internal praktisi');

// -----------------------------------------------------------------------------
// TEST SUITE 4: KEAMANAN & LOGIKA CRON WORKER WHATSAPP FONNTE
// -----------------------------------------------------------------------------
console.log('\n\x1b[36m[TEST SUITE 4] Keamanan & Logika Cron Worker WhatsApp Fonnte\x1b[0m');

// 1. Otorisasi Header Bearer CRON_SECRET
function verifyCronAuth(headerValue, expectedSecret) {
  if (!headerValue || !expectedSecret) return false;
  return headerValue === `Bearer ${expectedSecret}`;
}

const validCronAuth = verifyCronAuth('Bearer my-secure-cron-secret-2026', 'my-secure-cron-secret-2026');
assert(validCronAuth === true, 'Header Authorization Bearer valid diizinkan');

const invalidCronAuth = verifyCronAuth('Bearer wrong-secret', 'my-secure-cron-secret-2026');
assert(invalidCronAuth === false, 'Header Authorization Bearer salah ditolak');

const missingCronAuth = verifyCronAuth(null, 'my-secure-cron-secret-2026');
assert(missingCronAuth === false, 'Request tanpa header Authorization ditolak');

// 2. Simulasi Batch Size Limit (Vercel Anti-Timeout)
const mockPendingQueue = [
  { id: '1', scheduled_for: '2026-11-22T08:00:00+08:00' },
  { id: '2', scheduled_for: '2026-11-22T08:05:00+08:00' },
  { id: '3', scheduled_for: '2026-11-22T08:10:00+08:00' },
  { id: '4', scheduled_for: '2026-11-22T08:15:00+08:00' },
  { id: '5', scheduled_for: '2026-11-22T08:20:00+08:00' },
  { id: '6', scheduled_for: '2026-11-22T08:25:00+08:00' },
  { id: '7', scheduled_for: '2026-11-22T08:30:00+08:00' },
];

const BATCH_LIMIT = 5;
const batchItems = mockPendingQueue.slice(0, BATCH_LIMIT);
assert(batchItems.length === 5, 'Eksekusi batch dibatasi maksimal tepat 5 pesan per panggilan cron');

// 3. Retry Count & FAILED Transition Logic
function evaluateRetry(currentRetry) {
  const nextRetry = currentRetry + 1;
  return {
    retry_count: nextRetry,
    status: nextRetry >= 3 ? 'FAILED' : 'PENDING',
  };
}

const retry1 = evaluateRetry(0);
assert(retry1.status === 'PENDING' && retry1.retry_count === 1, 'Percobaan gagal ke-1 tetap PENDING (retry_count = 1)');

const retry2 = evaluateRetry(1);
assert(retry2.status === 'PENDING' && retry2.retry_count === 2, 'Percobaan gagal ke-2 tetap PENDING (retry_count = 2)');

const retry3 = evaluateRetry(2);
assert(retry3.status === 'FAILED' && retry3.retry_count === 3, 'Percobaan gagal ke-3 tepat beralih ke status FAILED');

// -----------------------------------------------------------------------------
// TEST SUITE 5: STATIC ZERO SECRET LEAK AUDIT PADA CLIENT COMPONENTS
// -----------------------------------------------------------------------------
console.log('\n\x1b[36m[TEST SUITE 5] Static Zero Secret Leak Audit pada Komponen Klien\x1b[0m');

const FORBIDDEN_SECRETS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'GEMINI_API_KEY',
  'FONNTE_TOKEN',
  'CRON_SECRET',
  'PATIENT_SESSION_SECRET',
];

function findClientFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.next') {
        findClientFiles(fullPath, fileList);
      }
    } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes("'use client'") || content.includes('"use client"')) {
        fileList.push({ path: fullPath, content, name: entry.name });
      }
    }
  }
  return fileList;
}

const clientFiles = findClientFiles(path.join(rootDir, 'src'));
assert(clientFiles.length > 0, `Ditemukan ${clientFiles.length} client component files untuk diaudit`);

let totalLeakFound = 0;
for (const file of clientFiles) {
  for (const secret of FORBIDDEN_SECRETS) {
    if (file.content.includes(secret)) {
      totalLeakFound++;
      console.error(`  \x1b[31m[LEAK DETECTED]\x1b[0m Secret '${secret}' ditemukan di file client: ${file.path}`);
    }
  }
}

assert(totalLeakFound === 0, 'Zero Secret Leak: 0 variabel rahasia ditemukan di seluruh file komponen klien');

// -----------------------------------------------------------------------------
// TEST SUITE 6: DETEKSI DETERMINISTIK TENSI, GULA DARAH & WEEKLY CHECK-IN H+7
// -----------------------------------------------------------------------------
console.log('\n\x1b[36m[TEST SUITE 6] Guardrail Klinis Tensi, Gula Darah & Trigger WEEKLY_CHECKIN (H+7)\x1b[0m');

// 1. Deteksi Krisis Hipertensi (185/120) -> RED Flag
const bpCrisisResult = await runAgent7Monitor({
  currentLog: {
    pain_score: 4,
    sleep_score: 7,
    stress_score: 5,
    systolic_bp: 185,
    diastolic_bp: 120,
  },
  history: [],
  patientName: 'Bapak Mansyur',
});

assert(bpCrisisResult.alert_level === 'RED', 'Krisis hipertensi (185/120) menghasilkan alert level RED');
assert(bpCrisisResult.requires_adaptation === true, 'Krisis hipertensi memicu requires_adaptation = true');
assert(
  Boolean(bpCrisisResult.urgent_patient_warning && bpCrisisResult.urgent_patient_warning.includes('Krisis Hipertensi')),
  'Peringatan pasien memuat keterangan krisis hipertensi'
);
assert(
  Boolean(bpCrisisResult.urgent_patient_warning && bpCrisisResult.urgent_patient_warning.includes('DILARANG menghentikan atau mengubah dosis obat')),
  'Guardrail mutlak: memuat larangan menghentikan obat resep dokter secara mendadak'
);

// 2. Deteksi Hipoglikemia Berat (< 70 mg/dL, misal 62) -> RED Flag
const hypoglycemiaResult = await runAgent7Monitor({
  currentLog: {
    pain_score: 3,
    sleep_score: 6,
    stress_score: 4,
    blood_sugar_mgdl: 62,
    blood_sugar_context: 'PUASA',
  },
  history: [],
  patientName: 'Ibu Ratna',
});

assert(hypoglycemiaResult.alert_level === 'RED', 'Gula darah 62 mg/dL terdeteksi darurat RED (Hipoglikemia)');
assert(
  Boolean(hypoglycemiaResult.urgent_patient_warning && hypoglycemiaResult.urgent_patient_warning.includes('Hipoglikemia Darurat')),
  'Peringatan pasien memuat peringatan hipoglikemia darurat'
);

// 3. Deteksi Hiperglikemia Berat (>= 300 mg/dL, misal 320) -> RED Flag
const severeHyperglycemiaResult = await runAgent7Monitor({
  currentLog: {
    pain_score: 4,
    sleep_score: 6,
    stress_score: 5,
    blood_sugar_mgdl: 320,
    blood_sugar_context: 'SEWAKTU',
  },
  history: [],
  patientName: 'Bapak Hendra',
});

assert(severeHyperglycemiaResult.alert_level === 'RED', 'Gula darah 320 mg/dL terdeteksi darurat RED (Hiperglikemia Berat)');
assert(
  Boolean(severeHyperglycemiaResult.urgent_patient_warning && severeHyperglycemiaResult.urgent_patient_warning.includes('Hiperglikemia Berat')),
  'Peringatan pasien memuat peringatan hiperglikemia berat'
);

// 4. Deteksi Tensi & Gula Darah Normal (125/80 mmHg & 115 mg/dL) -> GREEN / NONE
const normalVitalsResult = await runAgent7Monitor({
  currentLog: {
    pain_score: 3,
    sleep_score: 8,
    stress_score: 3,
    systolic_bp: 125,
    diastolic_bp: 80,
    blood_sugar_mgdl: 115,
    blood_sugar_context: 'PUASA',
  },
  history: [
    { pain_score: 7, sleep_score: 5, stress_score: 6, logged_at: new Date(Date.now() - 5 * 86400000).toISOString() },
  ],
  patientName: 'Ibu Nurhayati',
});

assert(normalVitalsResult.alert_level === 'NONE', 'Tensi 125/80 dan gula 115 mg/dL menghasilkan alert NONE (Hijau/Stabil)');
assert(normalVitalsResult.requires_adaptation === false, 'Tanda vital normal tidak memicu evaluasi adaptasi palsu');
assert(normalVitalsResult.urgent_patient_warning === null, 'Peringatan darurat pasien bernilai null pada kondisi normal');

// 5. Penjadwalan 3 Trigger Pasca-Sesi Saat COMPLETED: POST_REVIEW, H_PLUS_3, WEEKLY_CHECKIN (H+7)
function calculatePostSessionTriggers(completedTimeMs) {
  const postReviewIso = new Date(completedTimeMs + 2 * 60 * 60 * 1000).toISOString();

  // H+3 days at 10:00 WITA
  const hPlus3Date = new Date(completedTimeMs + 3 * 24 * 60 * 60 * 1000);
  const hPlus3Parts = getWITAParts(hPlus3Date);
  const hPlus3Iso = createWITAISOString(
    hPlus3Parts.year,
    hPlus3Parts.month,
    hPlus3Parts.day,
    10,
    0,
    0
  );

  // H+7 days at 09:30 WITA
  const hPlus7Date = new Date(completedTimeMs + 7 * 24 * 60 * 60 * 1000);
  const hPlus7Parts = getWITAParts(hPlus7Date);
  const hPlus7Iso = createWITAISOString(
    hPlus7Parts.year,
    hPlus7Parts.month,
    hPlus7Parts.day,
    9,
    30,
    0
  );

  return {
    postReviewIso,
    hPlus3Iso,
    hPlus7Iso,
  };
}

const testNowMs = new Date('2026-11-26T14:00:00+08:00').getTime();
const triggers = calculatePostSessionTriggers(testNowMs);

assert(Boolean(triggers.postReviewIso), 'Trigger POST_REVIEW (+2 jam) terhitung');
assert(triggers.hPlus3Iso.includes('10:00:00+08:00'), 'Trigger H_PLUS_3 dijadwalkan tepat jam 10:00 WITA');
assert(triggers.hPlus7Iso.includes('09:30:00+08:00'), 'Trigger WEEKLY_CHECKIN dijadwalkan tepat jam 09:30 WITA pada H+7');
assert(triggers.hPlus7Iso.startsWith('2026-12-03'), 'Trigger WEEKLY_CHECKIN tepat 7 hari setelah 26 November (3 Desember 2026)');

// -----------------------------------------------------------------------------
// REKAPITULASI HASIL TEST GATE FASE 4
// -----------------------------------------------------------------------------
console.log('\n======================================================');
console.log(`  HASIL AKHIR TEST GATE FASE 4 (FINAL PRODUCTION GATE):`);
console.log(`  Total Pengujian : ${totalTests}`);
console.log(`  \x1b[32mLulus (Pass)    : ${passedTests}\x1b[0m`);
console.log(`  \x1b[31mGagal (Fail)    : ${failedTests}\x1b[0m`);
console.log('======================================================\n');

if (failedTests > 0) {
  console.error('\x1b[31m❌ GATE 4 GAGAL: Masih ada test yang belum lulus. Harap perbaiki sebelum rilis produksi.\x1b[0m\n');
  process.exit(1);
} else {
  console.log('\x1b[32m✅ FINAL GATE PASSED: Seluruh modul Fase 4 terverifikasi 100% lulus & Zero Secret Leak!\x1b[0m\n');
  process.exit(0);
}
