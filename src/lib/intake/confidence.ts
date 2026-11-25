/**
 * Ruang Pulih OS — Deterministic Clinical Confidence Meter
 * Maps the 3-Layer Multimodal Intake progress to a confidence percentage:
 * - Layer 1 (Triage funnel): 45%
 * - Layer 2 (Patient home deep intake): +33% -> 78%
 * - Layer 2+ (Medications/Lab photos/JSON): +10% -> 88%
 * - Layer 3 (In-clinic physical palpation & practitioner vitals): +7% -> 95%
 */

export interface ConfidenceInput {
  hasTriageData?: boolean;
  hasLayer2Basic?: boolean; // Safety, ATM timeline, Lifestyle, Autonomic & Pain
  hasMedicationsOrLabs?: boolean; // Rx meds list or lab results
  hasPractitionerVitals?: boolean; // Layer 3 palpation, blood pressure, vitals
}

export function calculateConfidenceScore(input: ConfidenceInput): number {
  let score = 0;

  // Layer 1: Triage baseline
  if (input.hasTriageData !== false) {
    score = 45;
  }

  // Layer 2: Deep intake basic
  if (input.hasLayer2Basic) {
    score += 33; // 45 + 33 = 78%
  }

  // Layer 2+: Medications or Lab reports present
  if (input.hasMedicationsOrLabs) {
    score += 10; // 78 + 10 = 88%
  }

  // Layer 3: Practitioner Physical & Vitals
  if (input.hasPractitionerVitals) {
    score += 7; // 88 + 7 = 95%
  }

  return Math.min(95, Math.max(45, score));
}
