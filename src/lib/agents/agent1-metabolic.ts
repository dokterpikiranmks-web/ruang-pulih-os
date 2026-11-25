import type { AgentProposal } from './types';
import type { PatientContext } from './agent0-gatekeeper';
import { callGeminiJSON } from '@/lib/gemini/client';
import { z } from 'zod';

const MetabolicAgentOutputSchema = z.object({
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
 * Agent 1: Functional & Metabolic Analyst
 * Investigates systemic low-grade inflammation, gut-brain axis, metabolic dysfunction, and lab anomalies.
 */
export async function runAgent1Metabolic(ctx: PatientContext): Promise<AgentProposal> {
  const isDigestiveIssue =
    ctx.complaint_category?.toLowerCase().includes('gerd') ||
    ctx.complaint_category?.toLowerCase().includes('lambung');

  const findings: string[] = [
    isDigestiveIssue
      ? 'Indikasi gangguan motilitas lambung akibat disregulasi sumbu usus-otak (gut-brain axis)'
      : 'Potensi penumpukan metabolit inflamasi lokal akibat penurunan mikrosirkulasi di area keluhan',
    'Penurunan kualitas tidur mempengaruhi ritme pemulihan seluler dan modulasi hormon melatonin-kortisol',
  ];

  const recommendations: AgentProposal['recommendations'] = [
    {
      title: 'Regulasi Ritme Sirkadian Jam Makan',
      details: 'Hentikan asupan makanan berat minimal 3 jam sebelum tidur malam untuk meringankan beban kerja motilitas lambung.',
      evidence_tier: 'Tier A',
    },
    {
      title: 'Hidrasi Elektrolit Hangat Pagi Hari',
      details: 'Konsumsi air hangat dengan sedikit garam mineral alami di pagi hari untuk mendukung fungsi membran seluler dan hidrasi bantalan sendi.',
      evidence_tier: 'Tier B',
    },
  ];

  if (process.env.GEMINI_API_KEY) {
    try {
      const res = await callGeminiJSON({
        prompt: `Analisa metabolisme & kedokteran fungsional:
Keluhan: ${ctx.complaint_category || '-'} (${ctx.duration || '-'})
Gaya Hidup/Lab: ${JSON.stringify(ctx.lifestyle_json || {})} | Lab: ${JSON.stringify(ctx.lab_results_json || [])}
Keluarkan JSON: { findings: string[], recommendations: [{ title, details, evidence_tier: "Tier A"|"Tier B"|"Tier C" }] }`,
        systemInstruction: 'Anda adalah Agen 1 Spesialis Kedokteran Fungsional & Biokimia Metabolik di Ruang Pulih Makassar.',
        tier: 'flash',
        schema: MetabolicAgentOutputSchema,
        endpoint: 'agent1-metabolic',
        agentName: 'Agent-1-Metabolic',
      });
      return {
        agent_id: 'agent1-metabolic',
        domain: 'Metabolik & Gut-Brain',
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
    agent_id: 'agent1-metabolic',
    domain: 'Metabolik & Gut-Brain',
    findings,
    recommendations,
  };
}
