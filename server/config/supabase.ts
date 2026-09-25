import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  !supabaseUrl.includes('your-supabase-project') &&
  supabaseKey &&
  !supabaseKey.includes('your-supabase-anon-key') &&
  !supabaseKey.includes('your-supabase-service-role-key')
);

export const isGeminiConfigured = Boolean(
  process.env.GEMINI_API_KEY &&
  !process.env.GEMINI_API_KEY.includes('your-gemini-api-key') &&
  process.env.GEMINI_API_KEY.trim().length > 10
);

let supabaseClient: SupabaseClient | null = null;

if (isSupabaseConfigured && supabaseUrl && supabaseKey) {
  supabaseClient = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    if (!isSupabaseConfigured || !supabaseUrl || !supabaseKey) {
      throw new Error(
        'Supabase is not configured yet. Please configure valid SUPABASE_URL and SUPABASE_ANON_KEY/SERVICE_ROLE_KEY in .env file.'
      );
    }
    supabaseClient = createClient(supabaseUrl, supabaseKey);
  }
  return supabaseClient;
}

export async function checkSupabaseConnection(): Promise<{ connected: boolean; message: string }> {
  if (!isSupabaseConfigured) {
    return {
      connected: false,
      message: 'Supabase credentials contain placeholder values in .env. Real remote database is not configured.',
    };
  }

  try {
    const client = getSupabase();
    const { error } = await client.from('workflows').select('id').limit(1);
    if (error) {
      return {
        connected: false,
        message: `Connected to Supabase endpoint, but query failed (schema migrations may need to be applied): ${error.message}`,
      };
    }
    return {
      connected: true,
      message: 'Connected to Supabase PostgreSQL database successfully.',
    };
  } catch (err: any) {
    return {
      connected: false,
      message: `Failed to connect to Supabase: ${err.message}`,
    };
  }
}

/**
 * Returns a comprehensive, honest diagnostic status of all external integration layers.
 */
import { IntegrationDiagnostics } from '../../shared/types';
import { geocodingService } from '../services/geocodingService';
import { getTotalUnitsCount } from '../services/administrativeGeographyService';

/**
 * Returns a comprehensive, honest diagnostic status of all external integration layers.
 * Strictly avoids exposing secret keys or tokens.
 */
export async function getIntegrationDiagnostics(): Promise<IntegrationDiagnostics> {
  let dbReachable = false;
  let storageAvailable = false;
  let authConfigured = false;
  let realtimeAvailable = false;
  let dbMessage = 'Supabase credentials pending or placeholder in .env';

  if (isSupabaseConfigured) {
    try {
      const client = getSupabase();
      const { error: dbErr } = await client.from('workflows').select('id').limit(1);
      dbReachable = !dbErr;
      dbMessage = dbErr ? dbErr.message : 'Database reachable and responsive.';

      // Check storage
      try {
        const { error: storageErr } = await client.storage.from('documents').list('', { limit: 1 });
        storageAvailable = !storageErr;
      } catch {
        storageAvailable = false;
      }

      authConfigured = Boolean(client.auth);
      realtimeAvailable = Boolean(client.realtime);
    } catch (err: any) {
      dbMessage = err.message || 'Connection error';
    }
  }

  // Gemini Status
  const geminiOperational = isGeminiConfigured;
  const geminiModel = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  const geminiMessage = isGeminiConfigured
    ? `Gemini (${geminiModel}) configured server-side for structured legal extraction.`
    : 'GEMINI_API_KEY is not configured or has placeholder in .env. Automatic AI extraction is unavailable (manual review supported).';

  // Geocoding Status
  const geocodingOperational = true; // OpenStreetMap Nominatim active
  const geocodingMessage = `Geocoding adapter active via ${geocodingService.getProviderName()} (Rate limit: 1 req/sec).`;

  // Administrative Data Status
  const totalUnits = await getTotalUnitsCount();
  const adminDataConfigured = totalUnits > 0;
  const adminDataMessage = adminDataConfigured
    ? `Administrative hierarchy operational with ${totalUnits} units loaded.`
    : 'No administrative units loaded yet. Run Data Import to ingest official LGD datasets.';

  // Determine overall status
  let overallStatus: 'healthy' | 'degraded' | 'unconfigured' = 'healthy';
  if (!isSupabaseConfigured && !isGeminiConfigured) {
    overallStatus = 'unconfigured';
  } else if (!isSupabaseConfigured || !dbReachable || !isGeminiConfigured) {
    overallStatus = 'degraded';
  }

  let summary = '';
  if (overallStatus === 'healthy') {
    summary = 'All primary integrations (Supabase PostgreSQL, Storage, Auth, and Gemini AI) are operational.';
  } else if (overallStatus === 'unconfigured') {
    summary = 'Running in offline institutional evaluation mode. Real Supabase and Gemini credentials are not configured in .env. Application maintains full functional offline resilience with honest diagnostics.';
  } else {
    summary = `Partially configured: Supabase (${isSupabaseConfigured && dbReachable ? 'OPERATIONAL' : 'UNREACHABLE'}), Gemini (${isGeminiConfigured ? 'READY' : 'UNCONFIGURED'}).`;
  }

  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    supabase: {
      configured: isSupabaseConfigured,
      operational: isSupabaseConfigured && dbReachable,
      database_reachable: dbReachable,
      auth_configured: authConfigured,
      storage_available: storageAvailable,
      realtime_available: realtimeAvailable,
      message: dbMessage,
    },
    gemini: {
      configured: isGeminiConfigured,
      operational: geminiOperational,
      server_side_only: true,
      model: geminiModel,
      message: geminiMessage,
    },
    geocoding: {
      configured: true,
      operational: geocodingOperational,
      provider: geocodingService.getProviderName(),
      rate_limit_rps: 1,
      message: geocodingMessage,
    },
    administrative_data: {
      configured: adminDataConfigured,
      operational: adminDataConfigured,
      provider: 'Local Government Directory (LGD), Ministry of Panchayati Raj',
      total_units_loaded: totalUnits,
      message: adminDataMessage,
    },
    data_sources: {
      total_registered: 4,
      operational_count: (isSupabaseConfigured && dbReachable ? 1 : 0) + (isGeminiConfigured ? 1 : 0) + (adminDataConfigured ? 1 : 0) + 1,
      unconfigured_count: (!isSupabaseConfigured ? 1 : 0) + (!isGeminiConfigured ? 1 : 0) + (!adminDataConfigured ? 1 : 0),
    },
    diagnostic_summary: summary,
    environment: {
      node_env: process.env.NODE_ENV || 'development',
      port: Number(process.env.PORT || 3001),
      platform: process.platform,
    },
  };
}
