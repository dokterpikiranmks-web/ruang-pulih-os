import type { SafetyAuditItem, AgentProposal } from './types';
import type { PatientContext } from './agent0-gatekeeper';
import { callGeminiJSON } from '@/lib/gemini/client';
import { z } from 'zod';

export interface SafetyAuditResult {
  audits: SafetyAuditItem[];
  has_critical_conflict: boolean;
  mandatory_guardrail: string;
}

const SafetyAuditOutputSchema = z.object({
  audits: z.array(
    z.object({
      item: z.string(),
      traffic_light: z.enum(['GREEN', 'YELLOW', 'RED']),
      reason: z.string(),
    })
  ),
  has_critical_conflict: z.boolean(),
});

export const MANDATORY_RX_GUARDRAIL =
  'PERINGATAN KESELAMATAN KLINIS: Pasien DILARANG KERAS menghentikan, mengurangi, atau mengubah dosis obat resep dokter secara mendadak tanpa persetujuan dokter yang meresepkan. Terapi komplementer dan fitoterapi di Ruang Pulih Makassar bersifat pendamping (integratif), bukan pengganti obat medis esensial.';

/**
 * Agent 5: Clinical Safety & Red-Team Auditor
 * Evaluates all proposals from Agents 1-4 against patient's prescription medications,
 * medical history, allergies, and contraindications.
 */
export async function runAgent5Safety(
  proposals: AgentProposal[],
  ctx: PatientContext
): Promise<SafetyAuditResult> {
  const audits: SafetyAuditItem[] = [];
  const meds = (ctx.medications_json || []) as Array<{ name?: string; dosage?: string }>;
  const medsStr = meds.map((m) => m.name || '').filter(Boolean).join(', ').toLowerCase();
  const complaintStr = (ctx.complaint_category || '').toLowerCase();

  // Deterministic Safety Audits
  for (const p of proposals) {
    for (const rec of p.recommendations) {
      const recTitle = rec.title.toLowerCase();
      const recDetails = rec.details.toLowerCase();

      // Rule 1: High-dose Ginger or spicy herbs in active GERD/Gastric Ulcer
      if (
        complaintStr.includes('gerd') ||
        complaintStr.includes('lambung') ||
        medsStr.includes('omeprazole') ||
        medsStr.includes('lansoprazole')
      ) {
        if (recTitle.includes('jahe') || recDetails.includes('jahe dosis tinggi')) {
          audits.push({
            item: rec.title,
            traffic_light: 'YELLOW',
            reason: 'Jahe dosis tinggi berpotensi mengiritasi mukosa lambung pada GERD aktif. Gunakan ekstrak kunyit lembut dan beri jeda minimal 2 jam dari konsumsi obat lambung.',
          });
          continue;
        }
      }

      // Rule 2: Blood Pressure / Amlodipine interaction with aggressive stretching or hot therapies
      if (medsStr.includes('amlodipine') || medsStr.includes('captopril') || medsStr.includes('tensi')) {
        if (recTitle.includes('totok') || recTitle.includes('leher')) {
          audits.push({
            item: rec.title,
            traffic_light: 'YELLOW',
            reason: 'Pasien mengonsumsi obat antihipertensi. Hindari stimulasi refleks sinus karotis leher secara mendadak; lakukan manuver secara lembut dengan pemantauan tensi.',
          });
          continue;
        }
      }

      // Rule 3: Extreme fasting or aggressive diets with diabetes/kidney
      if (recTitle.includes('puasa') || recTitle.includes('fasting')) {
        audits.push({
          item: rec.title,
          traffic_light: 'RED',
          reason: 'Puasa ekstrem dikontraindikasikan pada kondisi metabolisme aktif tanpa pengawasan ketat. Wajib diganti dengan pembagian porsi makan seimbang.',
        });
        continue;
      }

      // Default safe
      audits.push({
        item: rec.title,
        traffic_light: 'GREEN',
        reason: 'Aman dijalankan, tidak ditemukan interaksi farmakologis yang merugikan.',
      });
    }
  }

  // LLM Refinement if API Key available (Fail-Safe)
  if (process.env.GEMINI_API_KEY) {
    try {
      const res = await callGeminiJSON({
        prompt: `Audit keamanan klinis farmakologi:
Daftar Obat Dokter Pasien: ${medsStr || 'Tidak ada obat'}
Riwayat Alergi/Organ: ${JSON.stringify(ctx.lifestyle_json || {})}
Usulan Intervensi Agen 1-4:
${JSON.stringify(
  proposals.map((p) => ({
    domain: p.domain,
    recs: p.recommendations.map((r) => r.title),
  }))
)}

Tugas: Periksa setiap item. Beri label GREEN (aman), YELLOW (butuh jeda 2 jam/pantau tensi/gula), atau RED (kontraindikasi mutlak obat-herbal).
Keluarkan JSON: { audits: [{ item, traffic_light: "GREEN"|"YELLOW"|"RED", reason }], has_critical_conflict: boolean }`,
        systemInstruction:
          'Anda adalah Agen 5 Clinical Safety & Farmakologi Auditor di Ruang Pulih Makassar. Bersikap kritis, konservatif, dan utamakan keselamatan pasien.',
        tier: 'flash',
        schema: SafetyAuditOutputSchema,
        endpoint: 'agent5-safety',
        agentName: 'Agent-5-Safety-Auditor',
      });

      if (res.data.audits && res.data.audits.length > 0) {
        return {
          audits: res.data.audits,
          has_critical_conflict: res.data.audits.some((a) => a.traffic_light === 'RED'),
          mandatory_guardrail: MANDATORY_RX_GUARDRAIL,
        };
      }
    } catch {
      // Fallback to deterministic audits
    }
  }

  return {
    audits,
    has_critical_conflict: audits.some((a) => a.traffic_light === 'RED'),
    mandatory_guardrail: MANDATORY_RX_GUARDRAIL,
  };
}
