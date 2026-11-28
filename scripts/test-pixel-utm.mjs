/**
 * RUANG PULIH OS — TEST GATE: META PIXEL & UTM ATTRIBUTION
 * 
 * Verifikasi:
 * 1. Sanitasi Parameter Meta Pixel (Kepatuhan Kebijakan Kesehatan Meta & Pencegahan Kebocoran Data Pasien).
 * 2. Pencegahan Double-Fire (Deduplikasi Event di React Strict Mode).
 * 3. Ekstraksi & Penyimpanan UTM (utm_source, utm_medium, utm_campaign, utm_content, fbclid).
 * 4. Logika Lencana Sumber Trafik Dashboard Admin (web_ad1_saraf, Manual WA, Organik).
 * 5. Integritas File Migrasi Database 006_utm_attribution_tracking.sql.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sanitizePixelParams, trackPixelEvent } from '../src/lib/utils/meta-pixel.ts';
import { getTrafficSourceBadge } from '../src/lib/utils/utm.ts';

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
console.log('  RUANG PULIH OS — TEST GATE: META PIXEL & UTM');
console.log('======================================================\n');

// -----------------------------------------------------------------------------
// TEST SUITE 1: SANITASI PARAMETER PIXEL (META HEALTH & WELLNESS POLICY)
// -----------------------------------------------------------------------------
console.log('\x1b[36m[TEST SUITE 1] Sanitasi Privasi Meta Health Policy\x1b[0m');

// 1. Blokir teks keluhan medis dan nama penyakit
const dirtyParams1 = {
  complaint_category: 'Pinggang / Saraf Kejepit',
  severity: 'Ketegangan Saraf Pinggang & Panggul Akut',
  diagnosis: 'HNP Lumbal L4-L5',
  disease_name: 'Sciatica',
  pain_score: 8,
  readiness_score: 90,
  content_name: 'SINGLE_150K',
  value: 150000,
  currency: 'idr',
};

const clean1 = sanitizePixelParams('Lead', dirtyParams1);

assert(clean1 !== undefined, 'Sanitizer mengembalikan objek parameter bersih');
assert(clean1.complaint_category === undefined, 'Kategori keluhan diblokir mutlak dari payload Pixel');
assert(clean1.severity === undefined, 'Severity label medis diblokir mutlak dari payload Pixel');
assert(clean1.diagnosis === undefined, 'Diagnosis medis diblokir mutlak dari payload Pixel');
assert(clean1.disease_name === undefined, 'Nama penyakit diblokir mutlak dari payload Pixel');
assert(clean1.pain_score === undefined, 'Skor nyeri (pain_score) diblokir mutlak dari payload Pixel');
assert(clean1.readiness_score === undefined, 'Skor kesiapan medis diblokir mutlak');
assert(clean1.content_name === 'program_a', 'SINGLE_150K dikonversi otomatis ke kode generik program_a');
assert(clean1.value === 150000, 'Nilai nominal paket (150000) valid sebagai angka');
assert(clean1.currency === 'IDR', 'Currency diformat rapi menjadi IDR');

// 2. Blokir PII (Nama, WA, Nomor Telepon, Alamat)
const dirtyParams2 = {
  patient_name: 'Ahmad Dahlan',
  full_name: 'Ahmad Dahlan',
  whatsapp: '0811443327',
  phone: '0811443327',
  address: 'Jl. Batua Raya Makassar',
  systolic_bp: 140,
  blood_sugar: 120,
  content_name: 'PACKAGE_3X_400K',
  value: 400000,
  currency: 'IDR',
};

const clean2 = sanitizePixelParams('Schedule', dirtyParams2);

assert(clean2.patient_name === undefined, 'Nama pasien diblokir mutlak dari payload Pixel');
assert(clean2.full_name === undefined, 'Nama lengkap diblokir mutlak dari payload Pixel');
assert(clean2.whatsapp === undefined, 'Nomor WhatsApp diblokir mutlak dari payload Pixel');
assert(clean2.phone === undefined, 'Nomor telepon diblokir mutlak dari payload Pixel');
assert(clean2.address === undefined, 'Alamat fisik diblokir mutlak dari payload Pixel');
assert(clean2.systolic_bp === undefined, 'Tensi darah (systolic_bp) diblokir mutlak');
assert(clean2.blood_sugar === undefined, 'Gula darah (blood_sugar) diblokir mutlak');
assert(clean2.content_name === 'program_b', 'PACKAGE_3X_400K dikonversi otomatis ke kode generik program_b');
assert(clean2.value === 400000, 'Nilai nominal paket 3x (400000) valid');

// 3. Payload yang hanya berisi parameter terlarang harus menghasilkan undefined
const allForbidden = {
  complaint: 'Sakit leher dan pundak',
  symptom: 'Kebas',
  tekanan_darah: '120/80',
};
const cleanEmpty = sanitizePixelParams('Lead', allForbidden);
assert(cleanEmpty === undefined, 'Payload yang hanya berisi parameter terlarang menghasilkan undefined');

// -----------------------------------------------------------------------------
// TEST SUITE 2: DEDUKLIKASI EVENT (ANTI-DOUBLE-FIRE DI REACT STRICT MODE)
// -----------------------------------------------------------------------------
console.log('\n\x1b[36m[TEST SUITE 2] Deduplikasi Event di React Strict Mode\x1b[0m');

// Mock window and fbq
let fbqCalls = [];
global.window = {
  fbq: (action, event, params) => {
    fbqCalls.push({ action, event, params });
  },
};

const dedupeTestKey = `test_schedule_unique_${Date.now()}`;

// Panggilan pertama
const firstCallResult = trackPixelEvent(
  'Schedule',
  { content_name: 'program_b', value: 400000, currency: 'IDR' },
  dedupeTestKey
);
assert(firstCallResult === true, 'Panggilan event pertama sukses dikirim ke fbq');
assert(fbqCalls.length === 1, 'fbq terpanggil tepat 1 kali');

// Panggilan kedua (simulasi React Strict Mode double-invocation)
const secondCallResult = trackPixelEvent(
  'Schedule',
  { content_name: 'program_b', value: 400000, currency: 'IDR' },
  dedupeTestKey
);
assert(secondCallResult === false, 'Panggilan event kedua dengan dedupeKey yang sama ditahan (deduplicated)');
assert(fbqCalls.length === 1, 'fbq tetap hanya terpanggil 1 kali (bebas double-fire)');

// -----------------------------------------------------------------------------
// TEST SUITE 3: LOGIKA LENCANA SUMBER TRAFIK ADMIN DASHBOARD
// -----------------------------------------------------------------------------
console.log('\n\x1b[36m[TEST SUITE 3] Lencana Sumber Trafik Dashboard Admin\x1b[0m');

// 1. Kampanye Iklan Spesifik
const ad1Badge = getTrafficSourceBadge({ utm_campaign: 'web_ad1_saraf', utm_source: 'facebook' });
assert(ad1Badge.label === 'web_ad1_saraf', 'Lencana menampilkan nama campaign iklan web_ad1_saraf');
assert(ad1Badge.bgClass.includes('blue'), 'Lencana campaign iklan memiliki warna latar biru informatif');

const ad3Badge = getTrafficSourceBadge({ utm_campaign: 'web_ad3_tensi_gula', utm_source: 'instagram' });
assert(ad3Badge.label === 'web_ad3_tensi_gula', 'Lencana menampilkan nama campaign iklan web_ad3_tensi_gula');

// 2. Booking Manual via WhatsApp
const manualBadge1 = getTrafficSourceBadge({ utm_source: 'Manual WA' });
assert(manualBadge1.label === 'Manual WA', 'Lencana mendeteksi utm_source Manual WA');
assert(manualBadge1.bgClass.includes('purple'), 'Lencana Manual WA memiliki aksen ungu');

const manualBadge2 = getTrafficSourceBadge({ notes: 'Booking manual via telepon' });
assert(manualBadge2.label === 'Manual WA', 'Lencana mendeteksi reservasi manual dari catatan');

// 3. Sumber Trafik Organik
const organicBadge = getTrafficSourceBadge({});
assert(organicBadge.label === 'Organik', 'Pengunjung tanpa parameter UTM berlabel Organik');
assert(organicBadge.bgClass.includes('emerald'), 'Lencana Organik berwarna hijau lembut (emerald)');

// -----------------------------------------------------------------------------
// TEST SUITE 4: INTEGRITAS MIGRASI DATABASE (006_utm_attribution_tracking.sql)
// -----------------------------------------------------------------------------
console.log('\n\x1b[36m[TEST SUITE 4] Integritas File Migrasi 006 SQL\x1b[0m');

const migrationFile = path.resolve(rootDir, 'supabase/migrations/006_utm_attribution_tracking.sql');
assert(fs.existsSync(migrationFile), 'File migrasi 006_utm_attribution_tracking.sql tersedia');

const migrationSql = fs.readFileSync(migrationFile, 'utf8');

assert(
  migrationSql.includes('ALTER TABLE leads_triage ADD COLUMN IF NOT EXISTS utm_medium'),
  'Migrasi memuat penambahan kolom utm_medium pada leads_triage'
);
assert(
  migrationSql.includes('ALTER TABLE leads_triage ADD COLUMN IF NOT EXISTS utm_content'),
  'Migrasi memuat penambahan kolom utm_content pada leads_triage'
);
assert(
  migrationSql.includes('ALTER TABLE leads_triage ADD COLUMN IF NOT EXISTS fbclid'),
  'Migrasi memuat penambahan kolom fbclid pada leads_triage'
);
assert(
  migrationSql.includes('ALTER TABLE appointments ADD COLUMN IF NOT EXISTS utm_source'),
  'Migrasi memuat penambahan kolom utm_source pada appointments'
);
assert(
  migrationSql.includes('ALTER TABLE appointments ADD COLUMN IF NOT EXISTS utm_campaign'),
  'Migrasi memuat penambahan kolom utm_campaign pada appointments'
);
assert(
  migrationSql.includes('ALTER TABLE appointments ADD COLUMN IF NOT EXISTS fbclid'),
  'Migrasi memuat penambahan kolom fbclid pada appointments'
);
assert(
  migrationSql.includes("NOTIFY pgrst, 'reload schema'"),
  'Migrasi memuat instruksi pgrst reload schema'
);

// -----------------------------------------------------------------------------
// REKAPITULASI
// -----------------------------------------------------------------------------
console.log('\n======================================================');
console.log(`  TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
console.log('======================================================\n');

if (failedTests > 0) {
  console.error('❌ BEBERAPA PENGUJIAN PIXEL & UTM GAGAL!');
  process.exit(1);
} else {
  console.log('✅ SELURUH PENGUJIAN PIXEL & UTM 100% LULUS!\n');
}
