/**
 * RUANG PULIH OS — TEST GATE SUITE FASE 1
 * Verifikasi fondasi arsitektur, kalkulasi zona waktu WITA,
 * kalkulator token Gemini ke IDR, parser JSON, dan migrasi SQL.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

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
console.log('  RUANG PULIH OS — MANDATORY TEST GATE: FASE 1');
console.log('======================================================\n');

// -----------------------------------------------------------------------------
// TEST SUITE 1: ZONA WAKTU WITA & KALKULASI SLOT & TRIGGER WA
// -----------------------------------------------------------------------------
console.log('\x1b[36m[TEST SUITE 1] Utilitas WITA (Asia/Makassar) & Slot Engine\x1b[0m');

// Dynamic import compiled or directly from JS/TS utils
const {
  TIMEZONE_WITA,
  calculateDaySlots,
  calculateWAFollowUpTriggers,
  formatWITADate,
  formatWITATime,
  createWITAISOString,
  getWITAParts,
} = await import('../src/lib/utils/timezone.ts');

assert(TIMEZONE_WITA === 'Asia/Makassar', 'Timezone terdefinisi resmi Asia/Makassar (WITA)');

// Test Day Slots Generation: Exactly 3 Fixed Sessions (WITA)
const slots = calculateDaySlots('2026-11-25');
assert(Array.isArray(slots) && slots.length === 3, 'Menghasilkan tepat 3 sesi operasional per hari (10:00, 16:00, 19:00 WITA)');

const firstSlot = slots[0];
assert(
  firstSlot.slot_start === '2026-11-25T10:00:00+08:00' && firstSlot.session_name === 'Sesi Pagi',
  'Slot pertama dimulai tepat pukul 10:00 WITA (Sesi Pagi)',
  `Received: ${firstSlot.slot_start}`
);
assert(
  firstSlot.slot_end === '2026-11-25T11:00:00+08:00',
  'Slot pertama berdurasi tepat 60 menit (selesai 11:00 WITA)',
  `Received: ${firstSlot.slot_end}`
);

const secondSlot = slots[1];
assert(
  secondSlot.slot_start === '2026-11-25T16:00:00+08:00' && secondSlot.session_name === 'Sesi Sore',
  'Slot kedua dimulai pukul 16:00 WITA (Sesi Sore)',
  `Received: ${secondSlot.slot_start}`
);

const lastSlot = slots[2];
assert(
  lastSlot.slot_start === '2026-11-25T19:00:00+08:00' && lastSlot.slot_end === '2026-11-25T20:00:00+08:00' && lastSlot.session_name === 'Sesi Malam',
  'Slot ketiga 19:00 - 20:00 WITA (Sesi Malam) sesuai spesifikasi',
  `Received: ${lastSlot.slot_start}`
);

// Test WA Triggers Calculation
const targetSlot = '2026-11-25T10:30:00+08:00';
const triggers = calculateWAFollowUpTriggers(targetSlot);

assert(
  triggers.hMinus1 === '2026-11-24T19:00:00+08:00',
  'Trigger H-1 dijadwalkan tepat H-1 tanggal sesi pukul 19:00 WITA',
  `Received: ${triggers.hMinus1}`
);

assert(
  triggers.hMinus2h === '2026-11-25T08:30:00+08:00',
  'Trigger H-2h dijadwalkan tepat 2 jam sebelum waktu sesi (08:30 WITA)',
  `Received: ${triggers.hMinus2h}`
);

assert(
  triggers.hPlus3Days === '2026-11-28T10:00:00+08:00',
  'Trigger H+3 hari dijadwalkan 3 hari setelah sesi pukul 10:00 WITA',
  `Received: ${triggers.hPlus3Days}`
);

// Test Date formatting
const sampleDate = new Date('2026-11-25T09:00:00+08:00');
const formattedDate = formatWITADate(sampleDate);
assert(
  formattedDate.includes('November') && formattedDate.includes('2026'),
  'Format tanggal Indonesia WITA valid',
  `Received: ${formattedDate}`
);

const formattedTime = formatWITATime(sampleDate);
assert(
  formattedTime.includes('09:00') && formattedTime.includes('WITA'),
  'Format jam WITA menyertakan label WITA',
  `Received: ${formattedTime}`
);

// Test Audio Normalization for Gemini Audio-to-Text
const { normalizeAudioMimeType } = await import('../src/lib/intake/audio.ts');
assert(normalizeAudioMimeType('audio/webm;codecs=opus') === 'audio/webm', 'MIME normalizer membersihkan codecs webm');
assert(normalizeAudioMimeType('audio/mp4; codecs=mp4a.40.2') === 'audio/mp4', 'MIME normalizer mendeteksi mp4');
assert(normalizeAudioMimeType('audio/m4a') === 'audio/mp4', 'MIME normalizer memetakan m4a ke mp4');
assert(normalizeAudioMimeType('audio/ogg') === 'audio/ogg', 'MIME normalizer mendeteksi ogg');

// -----------------------------------------------------------------------------
// TEST SUITE 2: GEMINI COST CALCULATOR & STRICT JSON PARSER
// -----------------------------------------------------------------------------
console.log('\n\x1b[36m[TEST SUITE 2] Kalkulator Biaya IDR & Strict JSON Parser Gemini\x1b[0m');

const {
  calculateCostIDR,
  cleanAndParseJSON,
  parseModelVersion,
  compareModelPriority,
  callGeminiJSON,
  isModelUnhealthy,
  getVerifiedActiveModel,
  resetModelCache,
} = await import('../src/lib/gemini/client.ts');

// Test IDR Cost Calculation
// Flash: $0.10 / 1M input, $0.40 / 1M output @ 16500 IDR/USD
// 1000 input tokens = (1000 / 1M) * 0.10 * 16500 = 1.65 IDR
// 500 output tokens = (500 / 1M) * 0.40 * 16500 = 3.30 IDR
// Total = 4.95 IDR
const costFlash = calculateCostIDR(1000, 500, 'flash', 16500);
assert(
  costFlash === 4.95,
  'Kalkulasi token Flash ke IDR presisi (1000 in, 500 out = Rp 4.95)',
  `Received: ${costFlash}`
);

// Pro: $1.25 / 1M input, $5.00 / 1M output @ 16500 IDR/USD
// 1000 input = 20.625 IDR, 1000 output = 82.5 IDR. Total = 103.13 IDR
const costPro = calculateCostIDR(1000, 1000, 'pro', 16500);
assert(
  costPro === 103.13,
  'Kalkulasi token Pro ke IDR presisi (1000 in, 1000 out = Rp 103.13)',
  `Received: ${costPro}`
);

// Test JSON Parser with clean JSON
const testSchema = z.object({
  condition: z.string(),
  score: z.number(),
  ready: z.boolean(),
});

const cleanRaw = '{"condition": "Saraf Kejepit", "score": 85, "ready": true}';
const parsedClean = cleanAndParseJSON(cleanRaw, testSchema);
assert(
  parsedClean.condition === 'Saraf Kejepit' && parsedClean.score === 85 && parsedClean.ready === true,
  'Parser memproses JSON murni tanpa error'
);

// Test JSON Parser with Markdown Code Fence
const fencedRaw = '```json\n{"condition": "GERD & Cemas", "score": 90, "ready": true}\n```';
const parsedFenced = cleanAndParseJSON(fencedRaw, testSchema);
assert(
  parsedFenced.condition === 'GERD & Cemas' && parsedFenced.score === 90,
  'Parser berhasil membersihkan markdown code fence (```json ... ```)'
);

// Test JSON Parser with conversational pre-text & post-text
const messyRaw = 'Halo! Berikut adalah hasil analisa klinis:\n\n```json\n{"condition": "Kebas Kaki", "score": 70, "ready": false}\n```\n\nSemoga lekas sembuh.';
const parsedMessy = cleanAndParseJSON(messyRaw, testSchema);
assert(
  parsedMessy.condition === 'Kebas Kaki' && parsedMessy.ready === false,
  'Parser berhasil mengekstrak blok JSON dari teks berantakan/percakapan'
);

// Test Zod Schema Validation Rejection
let threwValidationError = false;
try {
  cleanAndParseJSON('{"condition": "Test", "score": "bukan-angka", "ready": true}', testSchema);
} catch (err) {
  threwValidationError = true;
}
assert(threwValidationError, 'Parser menolak format data yang melanggar kontrak Zod schema');

// Test Semantic Version Parsing & Priority Sorting
const vFlash38 = parseModelVersion('gemini-3.8-flash');
assert(vFlash38.major === 3 && vFlash38.minor === 8 && vFlash38.isStable === true, 'Parser versi model mendeteksi mayor 3, minor 8, stabil');

const vProPreview = parseModelVersion('gemini-3.1-pro-preview');
assert(vProPreview.major === 3 && vProPreview.minor === 1 && vProPreview.isStable === false, 'Parser versi model mendeteksi varian preview');

const vAlias = parseModelVersion('gemini-flash-latest');
assert(vAlias.isVersioned === false, 'Model alias non-angka terdeteksi non-versioned');

const priorityComp = compareModelPriority('gemini-3.8-flash', 'gemini-3.7-flash');
assert(priorityComp < 0, 'Model versi 3.8 lebih diprioritaskan dibanding 3.7');

const priorityStableComp = compareModelPriority('gemini-3.5-flash', 'gemini-3.5-flash-preview');
assert(priorityStableComp < 0, 'Model varian stabil lebih diprioritaskan dibanding preview');

// Test Runtime Fallback Chain: Model #1 throws 404 (Deprecated) -> Fallback to Model #2
console.log('\n\x1b[36m  [Subtest] Simulasi Fallback Chain: 404 Deprecated -> Healthy Model\x1b[0m');

const originalFetch = globalThis.fetch;
const originalKey = process.env.GEMINI_API_KEY;
process.env.GEMINI_API_KEY = 'test-mock-api-key-123';
resetModelCache();

let triedModels = [];
globalThis.fetch = async (url, options) => {
  const urlStr = String(url);
  
  if (urlStr.includes('/models?key=')) {
    return new Response(JSON.stringify({
      models: [
        { name: 'models/gemini-deprecated-model-404', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-fallback-active-200', supportedGenerationMethods: ['generateContent'] }
      ]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (urlStr.includes('gemini-deprecated-model-404:generateContent')) {
    triedModels.push('gemini-deprecated-model-404');
    return new Response(JSON.stringify({
      error: { code: 404, message: 'Model gemini-deprecated-model-404 is not found or deprecated' }
    }), { status: 404, statusText: 'Not Found' });
  }

  if (urlStr.includes('gemini-fallback-active-200:generateContent')) {
    triedModels.push('gemini-fallback-active-200');
    return new Response(JSON.stringify({
      candidates: [{
        content: { parts: [{ text: '{"condition": "Pemulihan Baik", "score": 95, "ready": true}' }] }
      }],
      usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 20 }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  return originalFetch(url, options);
};

let fallbackSucceeded = false;
let fallbackResult = null;
try {
  fallbackResult = await callGeminiJSON({
    prompt: 'Tes Fallback',
    tier: 'flash',
    schema: testSchema,
    endpoint: 'test-fallback-gate',
    agentName: 'Test-Agent',
    modelOverride: 'gemini-deprecated-model-404',
  });
  fallbackSucceeded = true;
} catch (err) {
  fallbackSucceeded = false;
  console.error('Fallback error:', err);
}

// Restore fetch & environment
globalThis.fetch = originalFetch;
if (originalKey !== undefined) {
  process.env.GEMINI_API_KEY = originalKey;
} else {
  delete process.env.GEMINI_API_KEY;
}

assert(fallbackSucceeded === true, 'callGeminiJSON berhasil selesai tanpa melempar crash saat Model #1 error 404');
assert(triedModels.includes('gemini-deprecated-model-404'), 'Model #1 (404) dicoba pertama kali');
assert(triedModels.includes('gemini-fallback-active-200'), 'Sistem otomatis beralih memanggil Model #2 sebagai fallback');
assert(fallbackResult?.meta?.model === 'gemini-fallback-active-200', 'Model aktual yang tercatat sebagai penjawab adalah model yang sukses');
assert(isModelUnhealthy('gemini-deprecated-model-404') === true, 'Model #1 yang 404 otomatis masuk cooldown (unhealthy)');
assert(getVerifiedActiveModel('flash') === 'gemini-fallback-active-200', 'Model #2 yang sukses otomatis disimpan sebagai verifiedActiveModel');

resetModelCache();

// -----------------------------------------------------------------------------
// TEST SUITE 3: VALIDASI SCHEMA DATABASE (001_initial_schema.sql)
// -----------------------------------------------------------------------------
console.log('\n\x1b[36m[TEST SUITE 3] Integritas Migrasi Database & RLS\x1b[0m');

const schemaPath = path.join(rootDir, 'supabase', 'migrations', '001_initial_schema.sql');
assert(fs.existsSync(schemaPath), 'File migrasi 001_initial_schema.sql tersedia');

const schemaSQL = fs.readFileSync(schemaPath, 'utf8');

const requiredTables = [
  'leads_triage',
  'patients',
  'appointments',
  'patient_intakes',
  'clinical_protocols',
  'progress_logs',
  'wa_queue',
  'ai_usage_logs',
  'review_feedbacks',
];

for (const table of requiredTables) {
  const tableRegex = new RegExp(`CREATE TABLE (IF NOT EXISTS )?${table}\\b`, 'i');
  assert(tableRegex.test(schemaSQL), `Tabel '${table}' didefinisikan secara lengkap di SQL`);
}

// Check Unique Partial Index Anti-Double Booking
const partialIndexRegex = /CREATE UNIQUE INDEX (IF NOT EXISTS )?idx_unique_active_slot\s+ON appointments\s*\(slot_start\)\s+WHERE\s+status\s+IN\s*\('BOOKED',\s*'CONFIRMED'\)/i;
assert(
  partialIndexRegex.test(schemaSQL),
  'Unique Partial Index "idx_unique_active_slot" pada appointments(slot_start) WHERE status IN (BOOKED, CONFIRMED) terpasang'
);

// Check magic_token & pin_last4 in patients
assert(
  /magic_token\s+VARCHAR\(\d+\)\s+NOT NULL\s+UNIQUE/i.test(schemaSQL),
  'Kolom magic_token UNIQUE pada tabel patients terdefinisi'
);
assert(
  /pin_last4\s+VARCHAR\(4\)\s+NOT NULL/i.test(schemaSQL),
  'Kolom pin_last4 (4 digit) pada tabel patients terdefinisi'
);

// Check retry_count default 0 max 3 in wa_queue
assert(
  /retry_count\s+INT\s+NOT NULL\s+DEFAULT\s+0/i.test(schemaSQL),
  'Kolom retry_count pada wa_queue default 0 terdefinisi'
);

// Check Row Level Security Enabled for all tables
for (const table of requiredTables) {
  const rlsRegex = new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`, 'i');
  assert(rlsRegex.test(schemaSQL), `Row Level Security diaktifkan pada tabel '${table}'`);
}

// -----------------------------------------------------------------------------
// TEST SUMMARY & VERDICT
// -----------------------------------------------------------------------------
console.log('\n======================================================');
console.log(`  TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
console.log('======================================================');

if (failedTests > 0) {
  console.error('\n\x1b[31m❌ FASE 1 TEST GATE FAILED. Perbaiki kegagalan di atas sebelum melanjutkan.\x1b[0m\n');
  process.exit(1);
} else {
  console.log('\n\x1b[32m✔ FASE 1 TEST GATE PASSED: Semua kriteria fondasi 100% lulus tanpa celah!\x1b[0m\n');
  process.exit(0);
}
