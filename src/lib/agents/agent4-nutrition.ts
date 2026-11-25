import type { AgentProposal } from './types';
import type { PatientContext } from './agent0-gatekeeper';
import { callGeminiJSON } from '@/lib/gemini/client';
import { z } from 'zod';

const NutritionAgentOutputSchema = z.object({
  findings: z.array(z.string()),
  recommendations: z.array(
    z.object({
      title: z.string(),
      details: z.string(),
      evidence_tier: z.enum(['Tier A', 'Tier B', 'Tier C']),
    })
  ),
});

/**
 * Agent 4: Nutrition & Indonesian Phytotherapy Architect
 * Formulates evidence-based anti-inflammatory nutrition utilizing local Indonesian functional foods.
 */
export async function runAgent4Nutrition(ctx: PatientContext): Promise<AgentProposal> {
  const isDigestive = (ctx.complaint_category || '').toLowerCase().includes('gerd');

  const findings: string[] = [
    'Pola konsumsi makanan tinggi gluten rafinasi, minyak gorengan berulang, atau gula pasir memicu kaskade sitokin pro-inflamasi yang memperlambat resolusi nyeri saraf',
    'Dukungan fitonutrien lokal diperlukan untuk menstabilkan membran sel dan menurunkan stres oksidatif',
  ];

  const recommendations: AgentProposal['recommendations'] = [
    {
      title: 'Dukungan Rimpang Kunyit & Asam Jawa Lembut',
      details: isDigestive
        ? 'Seduhan rimpang kunyit parut hangat (kurkuminoid) tanpa cabai/lada hitam berlebih untuk melapisi mukosa lambung dan meredakan peradangan sistemik.'
        : 'Rebusan rimpang kunyit dan temulawak hangat 1 gelas sehari sebagai modulator inflamasi alami.',
      evidence_tier: 'Tier A',
    },
    {
      title: 'Pola Pangan Anti-Inflamasi Lokal Nusantara',
      details: 'Perbanyak asupan sayur bening daun kelor (moringa), tempe kukus/rebus, dan ikan kembung/tongkol segar kaya asam lemak omega-3 alami Indonesia.',
      evidence_tier: 'Tier B',
    },
  ];

  if (process.env.GEMINI_API_KEY) {
    try {
      const res = await callGeminiJSON({
        prompt: `Rancang panduan nutrisi anti-inflamasi lokal Indonesia:
Keluhan: ${ctx.complaint_category || '-'}
Alergi: ${JSON.stringify(ctx.lifestyle_json || {})}
Obat: ${JSON.stringify(ctx.medications_json || [])}
Keluarkan JSON: { findings: string[], recommendations: [{ title, details, evidence_tier: "Tier A"|"Tier B"|"Tier C" }] }`,
        systemInstruction: 'Anda adalah Agen 4 Ahli Nutrisi Fungsional Pangan Lokal & Fitoterapi Indonesia di Ruang Pulih Makassar.',
        tier: 'flash',
        schema: NutritionAgentOutputSchema,
        endpoint: 'agent4-nutrition',
        agentName: 'Agent-4-Nutrition',
      });
      return {
        agent_id: 'agent4-nutrition',
        domain: 'Nutrisi Anti-Inflamasi & Herbal',
        findings: res.data.findings.length > 0 ? res.data.findings : findings,
        recommendations:
          res.data.recommendations.length > 0
            ? res.data.recommendations.map((r) => ({
                title: r.title || '',
                details: r.details || '',
                evidence_tier: (r.evidence_tier as 'Tier A' | 'Tier B' | 'Tier C') || 'Tier B',
              }))
            : recommendations,
      };
    } catch {
      // Fallback
    }
  }

  return {
    agent_id: 'agent4-nutrition',
    domain: 'Nutrisi Anti-Inflamasi & Herbal',
    findings,
    recommendations,
  };
}
