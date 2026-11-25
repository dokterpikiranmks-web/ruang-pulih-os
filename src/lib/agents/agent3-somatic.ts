import type { AgentProposal } from './types';
import type { PatientContext } from './agent0-gatekeeper';
import { callGeminiJSON } from '@/lib/gemini/client';
import { z } from 'zod';

const SomaticAgentOutputSchema = z.object({
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
 * Agent 3: Somatic & Totok Saraf Strategist
 * Maps nerve compression pathways, myofascial trigger points, clinical acupressure points, and home stretches.
 */
export async function runAgent3Somatic(ctx: PatientContext): Promise<AgentProposal> {
  const cat = (ctx.complaint_category || '').toLowerCase();
  const isLumbar = cat.includes('pinggang') || cat.includes('saraf kejepit') || cat.includes('kaki');
  const isCervical = cat.includes('leher') || cat.includes('migrain') || cat.includes('pundak');

  const findings: string[] = [
    isLumbar
      ? 'Indikasi kompresi mikrosirkulasi di bantalan faset lumbar L4-L5-S1 dan spasme kompensasi m. piriformis'
      : isCervical
      ? 'Indikasi penarikan fasia servikal C5-C7 dan hipertrofi otot trapezius atas yang memicu hambatan aliran darah kranial'
      : 'Ketegangan myofasial difus dengan keterbatasan lingkup gerak sendi fungsional',
    'Terbentuknya titik picu nyeri (trigger point) yang memancarkan sensasi ngilu/kebas ke area ekstremitas',
  ];

  const recommendations: AgentProposal['recommendations'] = [
    {
      title: isLumbar
        ? 'Totok Saraf Titik Lumbo-Sakral & Dekompresi Gluteal'
        : 'Totok Saraf Titik Suboksipital & Rilis Skapula',
      details: isLumbar
        ? 'Penguraian simpul saraf di area paravertebral L4-L5, foramen sakralis, dan titik jalur saraf ischiadicus di klinik.'
        : 'Pelepasan kompresi faset servikal atas dan stimulasi titik pembuluh leher lateral di klinik.',
      evidence_tier: 'Tier B',
    },
    {
      title: 'Peregangan Aman di Rumah (Nerve Flossing)',
      details: 'Latihan dekompresi mandiri tanpa gerakan sentakan: lutut ke dada bergantian (knee-to-chest) 3 x 20 detik saat bangun tidur.',
      evidence_tier: 'Tier A',
    },
  ];

  if (process.env.GEMINI_API_KEY) {
    try {
      const res = await callGeminiJSON({
        prompt: `Analisa Somatik & Totok Saraf:
Keluhan: ${ctx.complaint_category || '-'} (${ctx.duration || '-'})
Peta Nyeri: ${JSON.stringify(ctx.somatic_pain_map || {})}
Palpasi/Vitals Praktisi: ${JSON.stringify(ctx.practitioner_vitals_json || {})}
Keluarkan JSON: { findings: string[], recommendations: [{ title, details, evidence_tier: "Tier A"|"Tier B"|"Tier C" }] }`,
        systemInstruction: 'Anda adalah Agen 3 Spesialis Biomekanik & Strategi Totok Saraf di Ruang Pulih Makassar.',
        tier: 'flash',
        schema: SomaticAgentOutputSchema,
        endpoint: 'agent3-somatic',
        agentName: 'Agent-3-Somatic',
      });
      return {
        agent_id: 'agent3-somatic',
        domain: 'Somatik & Totok Saraf',
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
    agent_id: 'agent3-somatic',
    domain: 'Somatik & Totok Saraf',
    findings,
    recommendations,
  };
}
