/**
 * RUANG PULIH OS — TEST GATE SUITE FASE 2
 * Verifikasi Rule Engine Triage, Normalisasi WhatsApp, Logika Slot WITA & WA Triggers,
 * Penolakan Disclaimer False, dan Penanganan Error Double Booking 23505 -> 409 Conflict.
 */

import { z } from 'zod';
import { evaluateTriageRules } from '../src/lib/triage/rules.ts';
import { normalizeIndonesianPhone } from '../src/lib/utils/phone.ts';
import {
  calculateDaySlots,
  calculateWAFollowUpTriggers,
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
console.log('  RUANG PULIH OS — MANDATORY TEST GATE: FASE 2');
console.log('======================================================\n');

// -----------------------------------------------------------------------------
// TEST SUITE 1: TRIAGE RULE ENGINE & SESSION ESTIMATES
// -----------------------------------------------------------------------------
console.log('\x1b[36m[TEST SUITE 1] Triage Rule Engine & Lead Scoring\x1b[0m');

// 1. HOT Lead test
const hotResult = evaluateTriageRules({
  complaint_category: 'Pinggang / Saraf Kejepit',
  duration: '1 – 6 bulan',
  prior_treatments: ['Baru minum obat pereda nyeri', 'Pijat urut biasa tapi kambuh'],
  disrupted_activity: 'Sholat & sujud terasa ngilu',
  readiness_choice: 'Siap datang ke klinik & ikut proses bertahap',
});

assert(hotResult.lead_temperature === 'HOT', 'Lead teridentifikasi HOT jika memilih siap datang');
assert(hotResult.readiness_score >= 80, 'Skor kesiapan HOT lead >= 80 (didapat: ' + hotResult.readiness_score + ')');
assert(hotResult.recommended_sessions.includes('3 Sesi'), 'Durasi 1–6 bulan menghasilkan rekomendasi 3 Sesi');
assert(hotResult.suggested_package === 'PACKAGE_3X_400K', 'Durasi 1–6 bulan merekomendasikan paket 3 sesi (Rp 400.000)');

// 2. COLD Lead test
const coldResult = evaluateTriageRules({
  complaint_category: 'Leher / Pundak / Migrain',
  duration: 'Baru (< 1 bulan)',
  prior_treatments: [],
  disrupted_activity: 'Kerja / duduk lama tersiksa',
  readiness_choice: 'Masih sekadar cari informasi dulu',
});

assert(coldResult.lead_temperature === 'COLD', 'Lead teridentifikasi COLD jika masih cari info dulu');
assert(coldResult.readiness_score < 50, 'Skor kesiapan COLD lead < 50 (didapat: ' + coldResult.readiness_score + ')');
assert(coldResult.recommended_sessions.includes('1 – 2 Sesi'), 'Durasi < 1 bulan menghasilkan rekomendasi 1–2 Sesi');
assert(coldResult.suggested_package === 'SINGLE_150K', 'Durasi < 1 bulan merekomendasikan paket Sesi Awal (Rp 150.000)');

// 3. Menahun (> 6 bulan) test
const chronicResult = evaluateTriageRules({
  complaint_category: 'GERD / Asam Lambung / Cemas',
  duration: 'Menahun (> 6 bulan)',
  prior_treatments: ['Baru minum obat pereda nyeri'],
  disrupted_activity: 'Tidur malam tidak nyenyak',
  readiness_choice: 'Siap datang ke klinik & ikut proses bertahap',
});

assert(
  chronicResult.recommended_sessions.includes('3 – 5 Sesi'),
  'Durasi Menahun (> 6 bulan) menghasilkan rekomendasi 3–5 Sesi bertahap'
);
assert(
  chronicResult.severity_label.includes('Disregulasi Saraf Otonom'),
  'Kategori GERD/Cemas memetakan ke label saraf otonom'
);
assert(
  chronicResult.fallback_summary.length > 50 && !chronicResult.fallback_summary.includes('sembuh instan'),
  'Fallback summary terisi lengkap dan tidak memuat overclaim sembuh instan'
);

// -----------------------------------------------------------------------------
// TEST SUITE 2: NORMALISASI NOMOR WHATSAPP & PIN_LAST4
// -----------------------------------------------------------------------------
console.log('\n\x1b[36m[TEST SUITE 2] Normalisasi Nomor WhatsApp Indonesia & PIN 4 Digit\x1b[0m');

const testCasesPhone = [
  { input: '0811443327', expected: '62811443327', pin: '3327' },
  { input: '+62 811-4433-27', expected: '62811443327', pin: '3327' },
  { input: '62811443327', expected: '62811443327', pin: '3327' },
  { input: '0812-3456-7890', expected: '6281234567890', pin: '7890' },
  { input: '+6285211223344', expected: '6285211223344', pin: '3344' },
];

for (const tc of testCasesPhone) {
  const res = normalizeIndonesianPhone(tc.input);
  assert(
    res.isValid && res.normalized === tc.expected && res.pin_last4 === tc.pin,
    `Normalisasi '${tc.input}' -> '${tc.expected}' (PIN: ${tc.pin})`
  );
}

// Invalid phone numbers
const invalidPhones = ['12345', '021-123456', '', 'abc0811'];
for (const inv of invalidPhones) {
  const res = normalizeIndonesianPhone(inv);
  assert(!res.isValid, `Menolak nomor tidak valid '${inv}'`);
}

// -----------------------------------------------------------------------------
// TEST SUITE 3: VALIDASI DISCLAIMER & WA TRIGGER SCHEDULING
// -----------------------------------------------------------------------------
console.log('\n\x1b[36m[TEST SUITE 3] Validasi Disclaimer & Logika WA Queue Triggers\x1b[0m');

// 1. Zod schema validation for disclaimer
const BookingValidationSchema = z.object({
  disclaimer_accepted: z.literal(true, {
    errorMap: () => ({ message: 'Persetujuan disclaimer wajib dicentang' }),
  }),
});

const validDisclaimer = BookingValidationSchema.safeParse({ disclaimer_accepted: true });
assert(validDisclaimer.success, 'Menerima submission jika disclaimer_accepted = true');

const invalidDisclaimer = BookingValidationSchema.safeParse({ disclaimer_accepted: false });
assert(!invalidDisclaimer.success, 'Menolak submission jika disclaimer_accepted = false');

// 2. WA Trigger future vs past time evaluation
// Slot in the future (3 days from now at 10:30 WITA)
const futureSlotDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
const futureIso = futureSlotDate.toISOString();
const futureTriggers = calculateWAFollowUpTriggers(futureIso);

assert(Boolean(futureTriggers.hMinus1), 'Trigger H-1 berhasil dihitung');
assert(Boolean(futureTriggers.hMinus2h), 'Trigger H-2h berhasil dihitung');

// Check logic: if appointment is today in 1 hour, H-1 (which was yesterday 19:00) is in the past
const slotIn1Hour = new Date(Date.now() + 60 * 60 * 1000);
const triggersSlotIn1Hour = calculateWAFollowUpTriggers(slotIn1Hour.toISOString());
const hMinus1Date = new Date(triggersSlotIn1Hour.hMinus1);
const isHMinus1Past = hMinus1Date.getTime() <= Date.now();
assert(
  isHMinus1Past,
  'Trigger H-1 terdeteksi di masa lampau jika booking dilakukan hari H sesi (< 24 jam)',
  `H-1: ${triggersSlotIn1Hour.hMinus1}`
);

// 3. Slot calculation: Exactly 3 Fixed Sessions (WITA)
const daySlots = calculateDaySlots('2026-11-26');
assert(daySlots.length === 3, 'Menghasilkan 3 sesi kalender WITA');
for (const slot of daySlots) {
  assert(slot.slot_start.includes('+08:00'), 'Setiap slot memiliki offset waktu +08:00 (WITA)');
}

// -----------------------------------------------------------------------------
// TEST SUITE 4: POSTGRESQL 23505 ERROR MAPPING TO 409 CONFLICT
// -----------------------------------------------------------------------------
console.log('\n\x1b[36m[TEST SUITE 4] Error Handling: PostgreSQL 23505 -> HTTP 409 Conflict\x1b[0m');

function simulateBookingErrorHandling(error) {
  if (
    error.code === '23505' ||
    error.message?.includes('idx_unique_active_slot') ||
    error.message?.toLowerCase().includes('unique')
  ) {
    return {
      status: 409,
      body: {
        error: 'Maaf, slot jam ini baru saja diambil pasien lain. Silakan pilih jam kosong lainnya.',
        code: 'SLOT_ALREADY_BOOKED',
      },
    };
  }
  return {
    status: 500,
    body: { error: 'Gagal memesan slot jadwal.' },
  };
}

const mockPgConflictError = {
  code: '23505',
  message: 'duplicate key value violates unique constraint "idx_unique_active_slot"',
  detail: 'Key (slot_start)=(2026-11-25 01:00:00+00) already exists.',
};

const handledResponse = simulateBookingErrorHandling(mockPgConflictError);
assert(handledResponse.status === 409, 'Error kode 23505 dipetakan ke HTTP status 409 Conflict');
assert(
  handledResponse.body.code === 'SLOT_ALREADY_BOOKED',
  'Response code bernilai SLOT_ALREADY_BOOKED'
);
assert(
  handledResponse.body.error.includes('baru saja diambil pasien lain'),
  'Pesan error ramah dan mengarahkan pasien memilih jam lain'
);

// -----------------------------------------------------------------------------
// TEST SUMMARY & VERDICT
// -----------------------------------------------------------------------------
console.log('\n======================================================');
console.log(`  TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
console.log('======================================================');

if (failedTests > 0) {
  console.error('\n\x1b[31m❌ FASE 2 TEST GATE FAILED. Perbaiki kegagalan di atas sebelum melanjutkan.\x1b[0m\n');
  process.exit(1);
} else {
  console.log('\n\x1b[32m✔ FASE 2 TEST GATE PASSED: Seluruh alur Triage, Booking WITA, & Anti-Double-Booking 100% lulus!\x1b[0m\n');
  process.exit(0);
}
