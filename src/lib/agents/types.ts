import { z } from 'zod';

export type TrafficLight = 'GREEN' | 'YELLOW' | 'RED';
export type EvidenceTier = 'Tier A' | 'Tier B' | 'Tier C';

export const DomainScoresSchema = z.object({
  nervous_autonomic: z.number().min(0).max(100),
  metabolic_gut: z.number().min(0).max(100),
  recovery_sleep: z.number().min(0).max(100),
  emotional_stress: z.number().min(0).max(100),
});
export type DomainScores = z.infer<typeof DomainScoresSchema>;

export const RootCauseMatrixSchema = z.object({
  antecedents: z.array(z.string()),
  triggers: z.array(z.string()),
  mediators: z.array(z.string()),
});
export type RootCauseMatrix = z.infer<typeof RootCauseMatrixSchema>;

export const SafetyAuditItemSchema = z.object({
  item: z.string(),
  traffic_light: z.enum(['GREEN', 'YELLOW', 'RED']),
  reason: z.string(),
});
export type SafetyAuditItem = z.infer<typeof SafetyAuditItemSchema>;

export const ProtocolPhaseSchema = z.object({
  phase: z.number().int().positive(),
  title: z.string(),
  clinic_therapy: z.string(),
  home_care: z.array(z.string()),
  evidence_tier: z.enum(['Tier A', 'Tier B', 'Tier C']),
});
export type ProtocolPhase = z.infer<typeof ProtocolPhaseSchema>;

export const ClinicalConsensusOutputSchema = z.object({
  status: z.enum(['DRAFT_REVIEW', 'PUBLISHED']).default('DRAFT_REVIEW'),
  red_flag_detected: z.boolean(),
  red_flag_action: z.string().nullable(),
  confidence_score: z.number().min(0).max(100),
  domain_scores: DomainScoresSchema,
  root_cause_matrix: RootCauseMatrixSchema,
  safety_audit: z.array(SafetyAuditItemSchema),
  protocol_phases: z.array(ProtocolPhaseSchema),
  practitioner_summary: z.string(),
  patient_friendly_summary: z.string(),
  meta: z.object({
    loops_executed: z.number().int().default(1),
    model_used: z.string(),
    total_cost_idr: z.number(),
  }),
});
export type ClinicalConsensusOutput = z.infer<typeof ClinicalConsensusOutputSchema>;

// Agent 0 Gatekeeper Types
export interface GatekeeperResult {
  red_flag: boolean;
  emergency_action: string | null;
  atm_timeline: RootCauseMatrix;
  functional_matrix: Record<string, unknown>;
}

// Inter-agent message structure
export interface AgentProposal {
  agent_id: string;
  domain: string;
  findings: string[];
  recommendations: Array<{
    title: string;
    details: string;
    evidence_tier: EvidenceTier;
  }>;
}
