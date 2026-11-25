export type ComplaintCategory =
  | 'Pinggang / Saraf Kejepit'
  | 'Kebas / Kesemutan Kaki-Tangan'
  | 'Leher / Pundak / Migrain'
  | 'GERD / Asam Lambung / Cemas'
  | 'Penyakit Kronis Lainnya';

export type ComplaintDuration =
  | 'Baru (< 1 bulan)'
  | '1 – 6 bulan'
  | 'Menahun (> 6 bulan)';

export type DisruptedActivity =
  | 'Sholat & sujud terasa ngilu'
  | 'Tidur malam tidak nyenyak'
  | 'Kerja / duduk lama tersiksa'
  | 'Aktivitas keluarga terhambat';

export type ReadinessChoice =
  | 'Siap datang ke klinik & ikut proses bertahap'
  | 'Masih sekadar cari informasi dulu';

export interface TriageInput {
  complaint_category: ComplaintCategory | string;
  duration: ComplaintDuration | string;
  prior_treatments: string[];
  disrupted_activity: DisruptedActivity | string;
  readiness_choice: ReadinessChoice | string;
}

export interface TriageRuleOutput {
  severity_label: string;
  lead_temperature: 'HOT' | 'COLD';
  readiness_score: number;
  recommended_sessions: string;
  session_count_min: number;
  session_count_max: number;
  root_cause_base: string;
  fallback_summary: string;
  suggested_package: 'SINGLE_150K' | 'PACKAGE_3X_400K';
}

/**
 * Deterministic Clinical Rule Engine for Ruang Pulih Makassar.
 * Maps quiz answers to clinical severity, lead scoring, session estimates,
 * and evidence-based root cause explanations.
 */
export function evaluateTriageRules(input: TriageInput): TriageRuleOutput {
  const isHot = input.readiness_choice.includes('Siap datang');
  const lead_temperature: 'HOT' | 'COLD' = isHot ? 'HOT' : 'COLD';

  // Base readiness score
  let readiness_score = isHot ? 85 : 40;
  if (input.duration.includes('Menahun')) readiness_score += 5;
  if (input.prior_treatments && input.prior_treatments.length >= 2) readiness_score += 5;
  readiness_score = Math.min(100, Math.max(10, readiness_score));

  // Determine session recommendations based on complaint duration
  let recommended_sessions = '3 Sesi Pemulihan';
  let session_count_min = 3;
  let session_count_max = 3;
  let suggested_package: 'SINGLE_150K' | 'PACKAGE_3X_400K' = 'PACKAGE_3X_400K';

  if (input.duration.includes('< 1 bulan')) {
    recommended_sessions = '1 – 2 Sesi';
    session_count_min = 1;
    session_count_max = 2;
    suggested_package = 'SINGLE_150K';
  } else if (input.duration.includes('1 – 6 bulan')) {
    recommended_sessions = '3 Sesi (Paket Pemulihan)';
    session_count_min = 3;
    session_count_max = 3;
    suggested_package = 'PACKAGE_3X_400K';
  } else {
    // Menahun (> 6 bulan)
    recommended_sessions = '3 – 5 Sesi Bertahap';
    session_count_min = 3;
    session_count_max = 5;
    suggested_package = 'PACKAGE_3X_400K';
  }

  // Determine clinical severity label and root cause base based on category
  let severity_label = 'Indikasi Ketegangan & Hambatan Jalur Saraf';
  let root_cause_base = '';

  const cat = input.complaint_category;

  if (cat.includes('Pinggang') || cat.includes('Saraf Kejepit')) {
    severity_label = input.duration.includes('Menahun')
      ? 'Indikasi Kompresi Saraf Lumbar Kronis & Spasme Myofasial'
      : 'Indikasi Jepitan Saraf Lumbo-Sakral Tingkat Menengah';
    root_cause_base =
      'Nyeri pinggang dan saraf kejepit umumnya terjadi akibat pemendekan otot punggung bawah yang menekan celah bantalan tulang belakang. Obat pereda nyeri hanya menghambat sinyal nyeri di otak, sementara pijat urut keras sering kali memicu inflamasi baru jika titik kompresi saraf utama belum diurai secara presisi.';
  } else if (cat.includes('Kebas') || cat.includes('Kesemutan')) {
    severity_label = 'Indikasi Hambatan Mikrosirkulasi & Neuropati Perifer';
    root_cause_base =
      'Sensasi kebas dan kesemutan pada telapak kaki atau tangan menandakan adanya gangguan aliran darah mikro dan konduksi sinyal saraf perifer. Tanpa penguraian simpul saraf dari pangkal tulang belakang dan leher, sensasi kebas cenderung berulang karena aliran nutrisi sel saraf masih terhambat.';
  } else if (cat.includes('Leher') || cat.includes('Migrain') || cat.includes('Pundak')) {
    severity_label = 'Indikasi Spasme Servikal & Gangguan Aliran Vaskular Kranial';
    root_cause_base =
      'Ketegangan di area leher dan pundak menekan pembuluh darah dan saraf yang menuju ke kepala, memicu migrain dan rasa berat di tengkuk. Terapi totok saraf fokus melepaskan ketegangan otot suboksipital dan servikal agar sirkulasi oksigen ke kepala kembali lancar.';
  } else if (cat.includes('GERD') || cat.includes('Lambung') || cat.includes('Cemas')) {
    severity_label = 'Indikasi Disregulasi Saraf Otonom & Sumbu Otak-Lambung (Gut-Brain)';
    root_cause_base =
      'GERD menahun dan rasa cemas sering kali berakar dari ketidakseimbangan sistem saraf otonom (dominasi saraf simpatis/stres) yang melemahkan katup lambung dan motilitas pencernaan. Pengobatan lambung perlu dikombinasikan dengan regulasi saraf parasimpatis (tonus vagal) dan penguraian diafragma yang tegang.';
  } else {
    severity_label = 'Indikasi Kelelahan Sistemik & Disregulasi Sirkulatori Holistik';
    root_cause_base =
      'Keluhan metabolik kronis memerlukan pendekatan integratif: mengurai sumbatan somatik fisik, menstabilkan ritme sirkadian tidur, dan memulihkan regulasi saraf otonom agar daya pulih mandiri tubuh kembali aktif.';
  }

  // Empathetic deterministic fallback summary (failsafe when AI offline)
  const fallback_summary =
    `Berdasarkan data awal Anda (${input.complaint_category}, dirasakan ${input.duration}), tubuh Anda menunjukkan ${severity_label.toLowerCase()}. ` +
    `Kondisi ini saat ini mengganggu aktivitas Anda, khususnya ${input.disrupted_activity.toLowerCase()}. ` +
    `${root_cause_base} Di Ruang Pulih Makassar, kami tidak menjanjikan kesembuhan instan, melainkan proses penguraian titik sumbatan saraf dan restorasi fungsi biologis bertahap dengan estimasi ${recommended_sessions}.`;

  return {
    severity_label,
    lead_temperature,
    readiness_score,
    recommended_sessions,
    session_count_min,
    session_count_max,
    root_cause_base,
    fallback_summary,
    suggested_package,
  };
}
