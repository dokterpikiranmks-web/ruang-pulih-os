import type { ClinicalConsensusOutput, AgentProposal, SafetyAuditItem } from './types';
import { runAgent0Gatekeeper, type PatientContext } from './agent0-gatekeeper';
import { runAgent1Metabolic } from './agent1-metabolic';
import { runAgent2MindBody } from './agent2-mindbody';
import { runAgent3Somatic } from './agent3-somatic';
import { runAgent4Nutrition } from './agent4-nutrition';
import { runAgent5Safety } from './agent5-safety';
import { runAgent6Synthesizer } from './agent6-synthesizer';

export interface OrchestratorOptions {
  confidence_score?: number;
  model_name?: string;
  max_loops?: number;
}

/**
 * Master Clinical Orchestrator (6-Agent Clinical Consensus Engine)
 * - Agent 0 (Gatekeeper): Short-circuit on red flags.
 * - Agents 1-4: Parallel execution via Promise.all().
 * - Agents 5-6: Circuit-breaker review loop with MAX_LOOPS = 3.
 */
export async function runClinicalOrchestrator(
  ctx: PatientContext,
  options: OrchestratorOptions = {}
): Promise<ClinicalConsensusOutput> {
  const MAX_LOOPS = options.max_loops || 3;
  const initialConfidence = options.confidence_score || 88;
  const modelUsed = options.model_name || 'gemini-flash-auto';

  // 1. AGENT 0: GATEKEEPER & RED FLAG CHECK
  const gatekeeperResult = await runAgent0Gatekeeper(ctx);

  if (gatekeeperResult.red_flag) {
    // SHORT-CIRCUIT: DO NOT invoke Agents 1-6!
    return {
      status: 'DRAFT_REVIEW',
      red_flag_detected: true,
      red_flag_action: gatekeeperResult.emergency_action,
      confidence_score: initialConfidence,
      domain_scores: {
        nervous_autonomic: 20,
        metabolic_gut: 20,
        recovery_sleep: 20,
        emotional_stress: 20,
      },
      root_cause_matrix: gatekeeperResult.atm_timeline,
      safety_audit: [
        {
          item: 'Pemeriksaan Kegawatdaruratan',
          traffic_light: 'RED',
          reason: gatekeeperResult.emergency_action || 'Red Flag terdeteksi.',
        },
      ],
      protocol_phases: [],
      practitioner_summary: `PERINGATAN: Red Flag terdeteksi. ${gatekeeperResult.emergency_action}`,
      patient_friendly_summary:
        'Mohon perhatian: Berdasarkan data gejala Anda, ada indikasi kondisi yang memerlukan pemeriksaan medis darurat terlebih dahulu sebelum menjalani terapi totok saraf. Harap segera periksakan diri ke IGD terdekat.',
      meta: {
        loops_executed: 0,
        model_used: modelUsed,
        total_cost_idr: 0,
      },
    };
  }

  // 2. PARALLEL EXECUTION: AGENTS 1, 2, 3, 4
  const [metabolicProposal, mindBodyProposal, somaticProposal, nutritionProposal] =
    await Promise.all([
      runAgent1Metabolic(ctx),
      runAgent2MindBody(ctx),
      runAgent3Somatic(ctx),
      runAgent4Nutrition(ctx),
    ]);

  let currentProposals: AgentProposal[] = [
    metabolicProposal,
    mindBodyProposal,
    somaticProposal,
    nutritionProposal,
  ];

  // 3. CIRCUIT BREAKER SAFETY LOOP: AGENT 5 (Safety) <-> AGENT 6 (Synthesizer)
  let loopCount = 0;
  let safetyAudits: SafetyAuditItem[] = [];
  let hasCriticalConflict = false;

  while (loopCount < MAX_LOOPS) {
    loopCount++;

    // Run Agent 5 Safety Audit
    const safetyResult = await runAgent5Safety(currentProposals, ctx);
    safetyAudits = safetyResult.audits;
    hasCriticalConflict = safetyResult.has_critical_conflict;

    if (!hasCriticalConflict) {
      // Loop resolved safely!
      break;
    }

    if (loopCount >= MAX_LOOPS) {
      // CIRCUIT BREAKER TRIGGERED: Strip all RED items from proposals
      const redTitles = new Set(
        safetyAudits
          .filter((a) => a.traffic_light === 'RED')
          .map((a) => a.item.toLowerCase())
      );

      currentProposals = currentProposals.map((p) => ({
        ...p,
        recommendations: p.recommendations.filter(
          (r) => !redTitles.has(r.title.toLowerCase())
        ),
      }));

      console.warn(`[Orchestrator] Circuit breaker reached MAX_LOOPS (${MAX_LOOPS}). ${redTitles.size} item RED dibuang otomatis.`);
      break;
    }

    // Attempt revision in next loop by filtering problematic items
    const redTitles = new Set(
      safetyAudits
        .filter((a) => a.traffic_light === 'RED')
        .map((a) => a.item.toLowerCase())
    );

    currentProposals = currentProposals.map((p) => ({
      ...p,
      recommendations: p.recommendations.filter(
        (r) => !redTitles.has(r.title.toLowerCase())
      ),
    }));
  }

  // 4. AGENT 6: CHIEF SYNTHESIZER
  const synthesis = await runAgent6Synthesizer(
    currentProposals,
    safetyAudits,
    gatekeeperResult.atm_timeline,
    ctx
  );

  return {
    status: 'DRAFT_REVIEW',
    red_flag_detected: false,
    red_flag_action: null,
    confidence_score: initialConfidence,
    domain_scores: synthesis.domain_scores,
    root_cause_matrix: gatekeeperResult.atm_timeline,
    safety_audit: safetyAudits,
    protocol_phases: synthesis.protocol_phases,
    practitioner_summary: synthesis.practitioner_summary,
    patient_friendly_summary: synthesis.patient_friendly_summary,
    meta: {
      loops_executed: loopCount,
      model_used: modelUsed,
      total_cost_idr: 0,
    },
  };
}
