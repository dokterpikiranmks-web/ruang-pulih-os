import { NextResponse } from 'next/server';
import { formatWITADateTime, getWITAParts } from '@/lib/utils/timezone';
import { probeGeminiModel, discoverModelCandidates } from '@/lib/gemini/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  const now = new Date();
  const witaParts = getWITAParts(now);
  const formattedWITA = formatWITADateTime(now);

  // Audit environment configuration without leaking secrets
  const envConfigured = {
    NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    GEMINI_API_KEY: Boolean(process.env.GEMINI_API_KEY),
    FONNTE_TOKEN: Boolean(process.env.FONNTE_TOKEN),
    CRON_SECRET: Boolean(process.env.CRON_SECRET),
    NEXT_PUBLIC_META_PIXEL_ID: Boolean(process.env.NEXT_PUBLIC_META_PIXEL_ID),
    NEXT_PUBLIC_APP_URL: Boolean(process.env.NEXT_PUBLIC_APP_URL),
  };

  const coreEnvReady = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.GEMINI_API_KEY
  );

  // Gemini dynamic model auto-detection & live probe
  let discoveredCandidates: string[] = [];
  let verifiedActiveModel: string | null = null;
  let skippedFailedModels: string[] = [];
  let geminiDetectionStatus = 'unconfigured';

  if (process.env.GEMINI_API_KEY) {
    try {
      const probe = await probeGeminiModel('flash');
      discoveredCandidates = probe.discovered_candidates;
      verifiedActiveModel = probe.verified_active_model;
      skippedFailedModels = probe.skipped_failed_models;
      geminiDetectionStatus = probe.status;
    } catch (err) {
      geminiDetectionStatus = 'error';
      try {
        discoveredCandidates = (await discoverModelCandidates('flash')).slice(0, 5);
      } catch {
        discoveredCandidates = [];
      }
      skippedFailedModels.push((err as Error).message);
    }
  } else {
    geminiDetectionStatus = 'fallback-default';
    discoveredCandidates = (await discoverModelCandidates('flash')).slice(0, 5);
  }

  const detectedModel = verifiedActiveModel || (discoveredCandidates.length > 0 ? discoveredCandidates[0] : 'unknown');

  return NextResponse.json({
    status: 'ok',
    phase: 1,
    app: 'Ruang Pulih OS Core Engine',
    location: 'Jl. Batua Raya 10B No. 9, Makassar',
    timezone: {
      name: 'Asia/Makassar',
      abbreviation: 'WITA',
      offset: '+08:00',
      current_time: formattedWITA,
      iso_parts: witaParts,
    },
    env_configured: envConfigured,
    core_env_ready: coreEnvReady,
    gemini_core: {
      tier: 'flash',
      detected_model: detectedModel,
      detection_status: geminiDetectionStatus,
      discovered_candidates: discoveredCandidates,
      verified_active_model: verifiedActiveModel,
      skipped_failed_models: skippedFailedModels,
    },
  });
}
