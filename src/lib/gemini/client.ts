import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';

export type ModelTier = 'flash' | 'pro';

export const DEFAULT_USD_TO_IDR = 16500;

// Pricing in USD per 1 Million tokens
export const TOKEN_PRICING_USD_PER_M = {
  flash: {
    input: 0.10, // $0.10 / 1M tokens
    output: 0.40, // $0.40 / 1M tokens
  },
  pro: {
    input: 1.25, // $1.25 / 1M tokens
    output: 5.00, // $5.00 / 1M tokens
  },
};

/**
 * Keywords to exclude from general text/JSON/vision generation candidates.
 * Excludes embeddings, video generation, text-to-speech, audio-only, robotics, and image generators.
 */
export const EXCLUDED_MODEL_KEYWORDS = [
  'embedding',
  'imagen',
  'veo',
  'tts',
  'audio',
  'aqa',
  'bisociative',
  'learnlm',
  'robotics',
  'computer-use',
  'transcribe',
  'image',
  'customtools',
];

const DISCOVERY_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const VERIFIED_MODEL_TTL_MS = 60 * 60 * 1000;  // 1 hour
const UNHEALTHY_COOLDOWN_MS = 30 * 60 * 1000;  // 30 minutes cooldown

// Cooldown map: modelName -> cooldownExpiryTimestamp
const unhealthyModels = new Map<string, number>();

// In-memory cache for verified active models
interface VerifiedModelEntry {
  name: string;
  verifiedAt: number;
}
let verifiedActiveCache: { flash?: VerifiedModelEntry; pro?: VerifiedModelEntry } = {};

// In-memory cache for discovered candidate lists per tier
interface CandidateCache {
  flash?: string[];
  pro?: string[];
  cachedAt: number;
}
let discoveredCandidatesCache: CandidateCache | null = null;

/**
 * Calculate token cost in Indonesian Rupiah (IDR)
 */
export function calculateCostIDR(
  inputTokens: number,
  outputTokens: number,
  tier: ModelTier = 'flash',
  usdToIdrRate: number = DEFAULT_USD_TO_IDR
): number {
  const pricing = TOKEN_PRICING_USD_PER_M[tier];
  const inputCostUSD = (inputTokens / 1_000_000) * pricing.input;
  const outputCostUSD = (outputTokens / 1_000_000) * pricing.output;
  const totalCostUSD = inputCostUSD + outputCostUSD;
  const costIDR = totalCostUSD * usdToIdrRate;

  // Round to 2 decimal places
  return Math.round(costIDR * 100) / 100;
}

/**
 * Robust JSON extraction and parsing helper.
 * Handles markdown fences (```json ... ```), conversational text, and trailing commas.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cleanAndParseJSON<T>(rawText: string, schema: z.ZodType<T, z.ZodTypeDef, any>): T {
  let cleaned = rawText.trim();

  // 1. Extract content from markdown code fences if present anywhere
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch && fenceMatch[1]) {
    cleaned = fenceMatch[1].trim();
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '');
    cleaned = cleaned.replace(/\n?```\s*$/, '');
    cleaned = cleaned.trim();
  }

  // 2. If still not cleanly starting with { or [, attempt to isolate the JSON block
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  let startIdx = -1;

  if (firstBrace !== -1 && firstBracket !== -1) {
    startIdx = Math.min(firstBrace, firstBracket);
  } else if (firstBrace !== -1) {
    startIdx = firstBrace;
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
  }

  if (startIdx > 0) {
    cleaned = cleaned.substring(startIdx);
  }

  const lastBrace = cleaned.lastIndexOf('}');
  const lastBracket = cleaned.lastIndexOf(']');
  const endIdx = Math.max(lastBrace, lastBracket);

  if (endIdx !== -1 && endIdx < cleaned.length - 1) {
    cleaned = cleaned.substring(0, endIdx + 1);
  }

  // 3. Remove trailing commas before closing braces/brackets (common LLM formatting quirk)
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Failed to parse AI output as JSON: ${(err as Error).message}\nRaw Text:\n${rawText}`);
  }

  // 4. Validate strictly against the zod schema
  const validation = schema.safeParse(parsed);
  if (validation.success) {
    return validation.data;
  }

  // If validation failed, check if the schema is expecting an array and parsed is wrapped in an object { items: [...] }
  if (!Array.isArray(parsed) && typeof parsed === 'object' && parsed !== null) {
    const obj = parsed as Record<string, unknown>;
    const keys = Object.keys(obj);
    for (const key of keys) {
      if (Array.isArray(obj[key])) {
        const arrayValidation = schema.safeParse(obj[key]);
        if (arrayValidation.success) {
          return arrayValidation.data;
        }
      }
    }
  }

  const errorDetails = validation.error.issues
    .map((issue) => `[${issue.path.join('.') || 'root'}]: ${issue.message}`)
    .join(', ');
  throw new Error(`AI JSON output failed schema validation: ${errorDetails}`);
}

/**
 * Parse semantic version major and minor from a Gemini model name.
 * e.g., "gemini-3.8-flash" -> major 3, minor 8, isStable: true
 *       "gemini-3.1-pro-preview" -> major 3, minor 1, isStable: false
 *       "gemini-flash-latest" -> major 0, minor 0, isStable: true
 */
export function parseModelVersion(name: string): {
  major: number;
  minor: number;
  isVersioned: boolean;
  isStable: boolean;
} {
  const isStable = !/preview|exp/i.test(name);
  const match = name.match(/gemini-(?:omni-)?(\d+)(?:\.(\d+))?/i);
  if (match) {
    return {
      major: parseInt(match[1], 10),
      minor: match[2] ? parseFloat(match[2]) : 0,
      isVersioned: true,
      isStable,
    };
  }
  return { major: 0, minor: 0, isVersioned: false, isStable };
}

/**
 * Dynamic comparator to sort Gemini models:
 * 1. Highest major version (3 > 2)
 * 2. Highest minor version (3.8 > 3.7 > 3.6 > 3.5 > 3.0)
 * 3. Stable releases prioritized over preview / experimental releases
 * 4. Alphabetical tie-breaker
 */
export function compareModelPriority(a: string, b: string): number {
  const vA = parseModelVersion(a);
  const vB = parseModelVersion(b);

  if (vA.major !== vB.major) {
    return vB.major - vA.major;
  }
  if (vA.minor !== vB.minor) {
    return vB.minor - vA.minor;
  }
  if (vA.isStable !== vB.isStable) {
    return vB.isStable ? 1 : -1;
  }
  return a.localeCompare(b);
}

/**
 * Check if a model is currently in unhealthy cooldown.
 */
export function isModelUnhealthy(modelName: string): boolean {
  const expiresAt = unhealthyModels.get(modelName);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    unhealthyModels.delete(modelName);
    return false;
  }
  return true;
}

/**
 * Mark a model as unhealthy and place into memory cooldown (default 30 mins).
 */
export function markModelUnhealthy(modelName: string, durationMs: number = UNHEALTHY_COOLDOWN_MS): void {
  unhealthyModels.set(modelName, Date.now() + durationMs);
  if (verifiedActiveCache.flash?.name === modelName) delete verifiedActiveCache.flash;
  if (verifiedActiveCache.pro?.name === modelName) delete verifiedActiveCache.pro;
}

/**
 * Return currently cooldown/unhealthy models with remaining minutes.
 */
export function getUnhealthyModels(): Array<{ model: string; expiresAt: number; remainingMinutes: number }> {
  const now = Date.now();
  const list: Array<{ model: string; expiresAt: number; remainingMinutes: number }> = [];
  for (const [model, expiresAt] of unhealthyModels.entries()) {
    if (expiresAt > now) {
      list.push({
        model,
        expiresAt,
        remainingMinutes: Math.ceil((expiresAt - now) / 60000),
      });
    } else {
      unhealthyModels.delete(model);
    }
  }
  return list;
}

/**
 * Get verified active model from cache if not expired and healthy.
 */
export function getVerifiedActiveModel(tier: ModelTier = 'flash'): string | null {
  const entry = verifiedActiveCache[tier];
  if (!entry) return null;
  if (Date.now() - entry.verifiedAt > VERIFIED_MODEL_TTL_MS) {
    delete verifiedActiveCache[tier];
    return null;
  }
  if (isModelUnhealthy(entry.name)) {
    delete verifiedActiveCache[tier];
    return null;
  }
  return entry.name;
}

/**
 * Set verified active model in cache.
 */
export function setVerifiedActiveModel(tier: ModelTier, modelName: string): void {
  verifiedActiveCache[tier] = {
    name: modelName,
    verifiedAt: Date.now(),
  };
}

/**
 * Fetch and discover all active Gemini models directly from Google API,
 * filter non-text/experimental, sort dynamically by version desc, and partition by tier.
 */
export async function discoverModelCandidates(
  tier: ModelTier = 'flash',
  apiKeyOverride?: string
): Promise<string[]> {
  const now = Date.now();
  if (
    discoveredCandidatesCache &&
    now - discoveredCandidatesCache.cachedAt < DISCOVERY_CACHE_TTL_MS
  ) {
    const cached = tier === 'flash' ? discoveredCandidatesCache.flash : discoveredCandidatesCache.pro;
    if (cached && cached.length > 0) return cached;
  }

  const apiKey = apiKeyOverride || process.env.GEMINI_API_KEY;

  // Safe fallback candidate lists if unconfigured or API fails
  const safeFlashFallbacks = [
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-2.5-flash',
    'gemini-flash-latest',
  ];
  const safeProFallbacks = [
    'gemini-3.1-pro-preview',
    'gemini-2.5-pro',
    'gemini-pro-latest',
    'gemini-3.6-flash',
  ];

  if (!apiKey) {
    return tier === 'flash' ? safeFlashFallbacks : safeProFallbacks;
  }

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
      console.warn(`[Gemini Client] ListModels API returned ${res.status}. Using fallback candidates.`);
      return tier === 'flash' ? safeFlashFallbacks : safeProFallbacks;
    }

    const data = await res.json() as {
      models?: Array<{
        name: string;
        supportedGenerationMethods?: string[];
      }>;
    };

    const models = data.models || [];

    // Filter models supporting generateContent and starting with gemini-
    const validModels = models
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''))
      .filter((name) => {
        if (!name.startsWith('gemini-')) return false;
        const lower = name.toLowerCase();
        return !EXCLUDED_MODEL_KEYWORDS.some((kw) => lower.includes(kw));
      });

    // Partition Flash candidates
    const flashStandard = validModels
      .filter((m) => m.includes('flash') && !m.includes('flash-lite') && !m.includes('latest'))
      .sort(compareModelPriority);

    const flashLite = validModels
      .filter((m) => m.includes('flash-lite') && !m.includes('latest'))
      .sort(compareModelPriority);

    const flashAliases = validModels
      .filter((m) => m.includes('flash') && m.includes('latest'))
      .sort(compareModelPriority);

    const otherValid = validModels
      .filter((m) => !m.includes('flash') && !m.includes('pro'))
      .sort(compareModelPriority);

    const flashCandidates = Array.from(
      new Set([...flashStandard, ...flashLite, ...flashAliases, ...otherValid, ...safeFlashFallbacks])
    );

    // Partition Pro candidates
    const proStandard = validModels
      .filter((m) => m.includes('pro') && !m.includes('latest'))
      .sort(compareModelPriority);

    const proAliases = validModels
      .filter((m) => m.includes('pro') && m.includes('latest'))
      .sort(compareModelPriority);

    // Pro falls back automatically to top flash candidates
    const proCandidates = Array.from(
      new Set([...proStandard, ...proAliases, ...flashStandard, ...flashLite, ...safeProFallbacks])
    );

    discoveredCandidatesCache = {
      flash: flashCandidates,
      pro: proCandidates,
      cachedAt: now,
    };

    return tier === 'flash' ? flashCandidates : proCandidates;
  } catch (err) {
    console.warn('[Gemini Client] Failed to discover models from Google API:', err);
    return tier === 'flash' ? safeFlashFallbacks : safeProFallbacks;
  }
}

/**
 * Get ordered candidate list for runtime execution:
 * 1. Places verified active model first (if healthy)
 * 2. Filters out unhealthy models on cooldown
 * 3. Limits to top candidates
 */
export async function getPrioritizedCandidateList(
  tier: ModelTier = 'flash',
  apiKeyOverride?: string
): Promise<string[]> {
  const discovered = await discoverModelCandidates(tier, apiKeyOverride);
  const verifiedActive = getVerifiedActiveModel(tier);

  let ordered = [...discovered];
  if (verifiedActive && ordered.includes(verifiedActive)) {
    ordered = [verifiedActive, ...ordered.filter((m) => m !== verifiedActive)];
  }

  // Filter out unhealthy models currently in cooldown
  const healthy = ordered.filter((m) => !isModelUnhealthy(m));

  // If all discovered candidates happen to be in cooldown, clear cooldown to prevent hard lock
  if (healthy.length === 0) {
    console.warn(`[Gemini Client] All candidates for tier '${tier}' were in cooldown. Resetting cooldowns.`);
    unhealthyModels.clear();
    return ordered.slice(0, 5);
  }

  return healthy.slice(0, 5);
}

/**
 * Detect best model for backwards compatibility with existing callers.
 */
export async function detectBestModel(
  tier: ModelTier = 'flash',
  apiKeyOverride?: string
): Promise<string> {
  const verified = getVerifiedActiveModel(tier);
  if (verified) return verified;

  const candidates = await getPrioritizedCandidateList(tier, apiKeyOverride);
  return candidates[0] || (tier === 'flash' ? 'gemini-3.6-flash' : 'gemini-3.1-pro-preview');
}

/**
 * Reset memory cache for models (used in tests and config updates)
 */
export function resetModelCache(): void {
  discoveredCandidatesCache = null;
  verifiedActiveCache = {};
  unhealthyModels.clear();
}

export interface CallGeminiJSONOptions<T> {
  prompt?: string;
  contents?: Array<{
    parts: Array<{
      text?: string;
      inlineData?: {
        mimeType: string;
        data: string;
      };
    }>;
  }>;
  systemInstruction?: string;
  tier?: ModelTier;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: z.ZodType<T, z.ZodTypeDef, any>;
  endpoint: string;
  agentName?: string;
  modelOverride?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface GeminiJSONResponse<T> {
  data: T;
  meta: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    costIdr: number;
  };
}

/**
 * Core function to invoke Gemini with:
 * - Dynamic model auto-detection
 * - 5-candidate runtime fallback chain
 * - Automatic 30-minute cooldown on 404, 400, 429, 503, or network errors
 * - In-memory verified active model caching
 * - Enforced JSON output and strict Zod schema validation
 * - Token and IDR cost calculation recorded to ai_usage_logs with actual_model_used
 */
export async function callGeminiJSON<T>(
  options: CallGeminiJSONOptions<T>
): Promise<GeminiJSONResponse<T>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in environment variables.');
  }

  const tier = options.tier || 'flash';

  // Build candidate chain
  let candidatesToTry: string[] = [];
  if (options.modelOverride) {
    const fallbacks = await getPrioritizedCandidateList(tier, apiKey);
    candidatesToTry = Array.from(new Set([options.modelOverride, ...fallbacks])).slice(0, 5);
  } else {
    candidatesToTry = await getPrioritizedCandidateList(tier, apiKey);
  }

  const contents = options.contents || [
    {
      parts: [{ text: options.prompt || '' }],
    },
  ];

  const payload = {
    contents,
    systemInstruction: options.systemInstruction
      ? {
          parts: [{ text: options.systemInstruction }],
        }
      : undefined,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: options.temperature ?? 0.2,
      ...(options.maxOutputTokens ? { maxOutputTokens: options.maxOutputTokens } : {}),
    },
  };

  const skippedModels: string[] = [];

  for (const candidateModel of candidatesToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${candidateModel}:generateContent?key=${apiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errStatus = response.status;
        const errBody = await response.text();

        // 404 (Deprecated / Not Found), 400 (Unsupported), 429 (Rate Limit), 503 (Overloaded)
        markModelUnhealthy(candidateModel);
        skippedModels.push(`${candidateModel} (${errStatus})`);
        console.warn(
          `[Gemini Client] Model ${candidateModel} failed with status ${errStatus}. Added to cooldown. Error: ${errBody.slice(0, 150)}`
        );
        continue;
      }

      const result = await response.json() as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
          totalTokenCount?: number;
        };
      };

      const candidateText = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!candidateText) {
        markModelUnhealthy(candidateModel);
        skippedModels.push(`${candidateModel} (empty text)`);
        continue;
      }

      // Successfully received HTTP 200 with candidates! Cache as verified active model
      setVerifiedActiveModel(tier, candidateModel);

      // Parse and validate strictly using Zod
      let validatedData: T;
      try {
        validatedData = cleanAndParseJSON(candidateText, options.schema);
      } catch (validationErr) {
        // Schema validation or JSON parsing failed on this prompt.
        // DO NOT mark model unhealthy/cooldown because the HTTP model is fully functional.
        // DO NOT loop through other candidates; the issue is prompt/schema formatting.
        console.error(
          `[Gemini Client] Model ${candidateModel} responded 200 OK but JSON schema validation failed:`,
          (validationErr as Error).message
        );
        throw validationErr;
      }

      // Calculate tokens & IDR cost
      const inputTokens = result.usageMetadata?.promptTokenCount || 0;
      const outputTokens = result.usageMetadata?.candidatesTokenCount || 0;
      const costIdr = calculateCostIDR(inputTokens, outputTokens, tier);

      // Record ai_usage_logs with ACTUAL model used
      try {
        const admin = createAdminClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (admin.from('ai_usage_logs') as any).insert({
          endpoint: options.endpoint,
          agent_name: options.agentName || 'gemini-core',
          model_name: candidateModel,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cost_idr: costIdr,
        });
      } catch (logErr) {
        console.warn('[Gemini Client] Failed to record ai_usage_log to database (fail-safe):', logErr);
      }

      return {
        data: validatedData,
        meta: {
          model: candidateModel,
          inputTokens,
          outputTokens,
          costIdr,
        },
      };
    } catch (err) {
      // If the error was already our schema validation error rethrown above, do not mark unhealthy or loop
      if (
        (err as Error).message?.includes('AI JSON output failed schema validation') ||
        (err as Error).message?.includes('Failed to parse AI output as JSON')
      ) {
        throw err;
      }

      markModelUnhealthy(candidateModel);
      skippedModels.push(`${candidateModel} (${(err as Error).message})`);
      console.warn(`[Gemini Client] Model ${candidateModel} threw network/runtime exception:`, err);
      continue;
    }
  }

  throw new Error(`All Gemini model candidates failed in fallback chain: ${skippedModels.join(', ')}`);
}

/**
 * Lightweight live probe for /api/health:
 * Discovers top candidates, executes a minimal test through the fallback chain,
 * and reports discovered candidates, verified active model, and any skipped failed models.
 */
export async function probeGeminiModel(
  tier: ModelTier = 'flash',
  apiKeyOverride?: string
): Promise<{
  discovered_candidates: string[];
  verified_active_model: string | null;
  skipped_failed_models: string[];
  status: 'active' | 'fallback-default' | 'error';
}> {
  const apiKey = apiKeyOverride || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const fallbacks = (await discoverModelCandidates(tier)).slice(0, 5);
    return {
      discovered_candidates: fallbacks,
      verified_active_model: null,
      skipped_failed_models: [],
      status: 'fallback-default',
    };
  }

  const allDiscovered = await discoverModelCandidates(tier, apiKey);
  const topCandidates = allDiscovered.slice(0, 5);
  const skippedModels: string[] = [];

  // Probe with a minimal 1-token JSON payload
  const probeSchema = z.object({
    status: z.string().optional(),
    ok: z.boolean().optional(),
  });

  try {
    const res = await callGeminiJSON({
      prompt: 'Ketik JSON: {"status": "ok"}',
      tier,
      schema: probeSchema,
      endpoint: '/api/health',
      agentName: 'health-prober',
      temperature: 0.1,
    });

    // Determine which candidates were skipped before reaching the successful one
    const successfulIndex = topCandidates.indexOf(res.meta.model);
    if (successfulIndex > 0) {
      for (let i = 0; i < successfulIndex; i++) {
        const skipped = topCandidates[i];
        if (isModelUnhealthy(skipped)) {
          skippedModels.push(skipped);
        }
      }
    }

    return {
      discovered_candidates: topCandidates,
      verified_active_model: res.meta.model,
      skipped_failed_models: skippedModels,
      status: 'active',
    };
  } catch (err) {
    // Collect all candidates that are now marked unhealthy
    for (const c of topCandidates) {
      if (isModelUnhealthy(c)) {
        skippedModels.push(c);
      }
    }
    return {
      discovered_candidates: topCandidates,
      verified_active_model: null,
      skipped_failed_models: skippedModels.length > 0 ? skippedModels : [(err as Error).message],
      status: 'error',
    };
  }
}
