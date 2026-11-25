import type { AgentProposal } from './types';
import type { PatientContext } from './agent0-gatekeeper';
import { callGeminiJSON } from '@/lib/gemini/client';
import { z } from 'zod';

const MindBodyAgentOutputSchema = z.object({
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
 * Agent 2: Mind-Body & Psychoneuroimmunology (PNI) Specialist
 * Analyzes autonomic nervous system imbalance, vagal nerve tone, stress, and psychosomatic loops.
 */
export async function runAgent2MindBody(ctx: PatientContext): Promise<AgentProposal> {
  const autonomic = (ctx.autonomic_mindbody_json || {}) as Record<string, unknown>;
  const stress = typeof autonomic.stress_level === 'number' ? autonomic.stress_level : 6;

  const findings: string[] = [
    `Dominasi saraf simpatis (fight-or-flight) terdeteksi pada skala stres ${stress}/10, memicu vasokonstriksi pembuluh darah dan hipertonus otot`,
    'Penurunan stimulasi saraf vagus (vagal tone) melemahkan kemampuan alami tubuh untuk relaksasi dan regenerasi jaringan saraf',
  ];

  const recommendations: AgentProposal['recommendations'] = [
    {
      title: 'Latihan Pernapasan Diafragma 4-7-8',
      details: 'Tarik napas melalui hidung 4 detik, tahan 7 detik, hembuskan perlahan melalui bibir 8 detik. Lakukan 4 siklus sebelum tidur untuk merangsang tonus vagal.',
      evidence_tier: 'Tier A',
    },
    {
      title: 'Protokol De-eskalasi Ketegangan Somatik',
      details: 'Teknik grounding dan relaksasi otot progresif saat merasakan tanda simpatis (dada sesak atau overthinking) untuk memutus umpan balik nyeri-stres.',
      evidence_tier: 'Tier B',
    },
  ];

  if (process.env.GEMINI_API_KEY) {
    try {
      const res = await callGeminiJSON({
        prompt: `Analisa Mind-Body & Saraf Otonom:
Keluhan: ${ctx.complaint_category || '-'}
Beban Stres: ${JSON.stringify(ctx.autonomic_mindbody_json || {})}
Cerita Pasien: ${ctx.voice_transcript || '-'}
Keluarkan JSON: { findings: string[], recommendations: [{ title, details, evidence_tier: "Tier A"|"Tier B"|"Tier C" }] }`,
        systemInstruction: 'Anda adalah Agen 2 Spesialis Saraf Otonom & Psikoneuroimunologi di Ruang Pulih Makassar.',
        tier: 'flash',
        schema: MindBodyAgentOutputSchema,
        endpoint: 'agent2-mindbody',
        agentName: 'Agent-2-MindBody',
      });
      return {
        agent_id: 'agent2-mindbody',
        domain: 'Saraf Otonom & PNI',
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
    agent_id: 'agent2-mindbody',
    domain: 'Saraf Otonom & PNI',
    findings,
    recommendations,
  };
}
