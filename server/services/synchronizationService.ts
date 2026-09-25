import { getSupabase, isSupabaseConfigured } from '../config/supabase';
import { getDataSource, updateDataSource } from './dataSourceRegistry';
import { getLiveWeatherObservation } from './weatherAdapter';

// In-flight mutex locks preventing duplicate concurrent synchronizations
const ACTIVE_SYNC_LOCKS = new Map<string, Promise<SyncExecutionResult>>();

// Scheduled background timers
const SCHEDULED_TIMERS = new Map<string, NodeJS.Timeout>();

export interface SyncExecutionResult {
  source_id: string;
  success: boolean;
  attempted_at: string;
  completed_at: string;
  elapsed_ms: number;
  retries_attempted: number;
  message: string;
  error?: string;
  data?: any;
}

export interface SyncOptions {
  entityType?: string;
  entityId?: string;
  coordinates?: { latitude: number; longitude: number };
  maxRetries?: number;
  initialBackoffMs?: number;
}

/**
 * Triggers a controlled synchronization for an external data source.
 * Includes concurrency deduplication, exponential backoff retries, and statutory audit logging.
 */
export async function syncSource(
  sourceId: string,
  options: SyncOptions = {}
): Promise<SyncExecutionResult> {
  const lockKey = `${sourceId}:${options.entityType || 'global'}:${options.entityId || 'default'}`;

  // If a sync is already in flight for this source/entity, return the active promise
  if (ACTIVE_SYNC_LOCKS.has(lockKey)) {
    return ACTIVE_SYNC_LOCKS.get(lockKey)!;
  }

  const syncPromise = executeSyncWithRetry(sourceId, options);
  ACTIVE_SYNC_LOCKS.set(lockKey, syncPromise);

  try {
    const result = await syncPromise;
    return result;
  } finally {
    ACTIVE_SYNC_LOCKS.delete(lockKey);
  }
}

async function executeSyncWithRetry(
  sourceId: string,
  options: SyncOptions
): Promise<SyncExecutionResult> {
  const startTime = Date.now();
  const attemptedAt = new Date().toISOString();
  const maxRetries = options.maxRetries ?? 2;
  const initialBackoffMs = options.initialBackoffMs ?? 500;

  const source = await getDataSource(sourceId);
  if (!source) {
    return {
      source_id: sourceId,
      success: false,
      attempted_at: attemptedAt,
      completed_at: new Date().toISOString(),
      elapsed_ms: Date.now() - startTime,
      retries_attempted: 0,
      message: `Data source "${sourceId}" not registered.`,
      error: 'SOURCE_NOT_FOUND',
    };
  }

  if (!source.is_enabled) {
    return {
      source_id: sourceId,
      success: false,
      attempted_at: attemptedAt,
      completed_at: new Date().toISOString(),
      elapsed_ms: Date.now() - startTime,
      retries_attempted: 0,
      message: `Data source "${sourceId}" is currently disabled.`,
      error: 'SOURCE_DISABLED',
    };
  }

  let attempt = 0;
  let lastError: Error | null = null;
  let resultData: any = null;

  while (attempt <= maxRetries) {
    try {
      if (sourceId === 'open_meteo') {
        let lat = options.coordinates?.latitude;
        let lng = options.coordinates?.longitude;

        if ((lat === undefined || lng === undefined) && options.entityType === 'case' && options.entityId) {
          try {
            if (isSupabaseConfigured) {
              const client = getSupabase();
              const { data } = await client
                .from('acquisition_cases')
                .select('geojson_boundary')
                .eq('id', options.entityId)
                .single();
              if (data?.geojson_boundary) {
                const { extractGeometryCentroid } = await import('./portfolioAnalyzer');
                const c = extractGeometryCentroid(data.geojson_boundary);
                if (c) {
                  lat = c[0];
                  lng = c[1];
                }
              }
            }
          } catch {}
        }

        if (lat === undefined || lng === undefined || isNaN(lat) || isNaN(lng)) {
          throw new Error('Coordinates are required to synchronize Open-Meteo meteorological observations. No valid coordinates provided or resolvable for entity.');
        }

        const res = await getLiveWeatherObservation(lat, lng, {
          entityType: options.entityType,
          entityId: options.entityId,
          bypassCache: true,
        });

        if (res.status === 'failed' || res.status === 'data_unavailable') {
          throw new Error(res.message);
        }

        resultData = res;
      } else if (sourceId === 'lgd_india') {
        const { executeAuthoritativeLgdSync } = await import('./lgdIngestionService');
        const syncSummary = await executeAuthoritativeLgdSync({
          maxRecordsPerTier: 50,
          actor: 'Sync Service',
        });
        resultData = syncSummary;
      } else if (sourceId === 'nominatim_osm') {
        const { geocodingService } = await import('./geocodingService');
        resultData = await geocodingService.forwardGeocode('India', { limit: 1 });
      } else if (sourceId === 'supabase_postgres') {
        const { testDataSourceConnectivity } = await import('./dataSourceRegistry');
        const testRes = await testDataSourceConnectivity('supabase_postgres');
        if (!testRes.operational) throw new Error(testRes.message);
        resultData = testRes;
      } else {
        // Generic source ping
        const { testDataSourceConnectivity } = await import('./dataSourceRegistry');
        const testRes = await testDataSourceConnectivity(sourceId);
        if (!testRes.operational) throw new Error(testRes.message);
        resultData = testRes;
      }

      // Success: update source registry state
      const completedAt = new Date().toISOString();
      await updateSourceSyncState(sourceId, {
        lastAttempted: attemptedAt,
        lastSuccessful: completedAt,
        error: null,
      });

      return {
        source_id: sourceId,
        success: true,
        attempted_at: attemptedAt,
        completed_at: completedAt,
        elapsed_ms: Date.now() - startTime,
        retries_attempted: attempt,
        message: `Synchronization completed successfully (${Date.now() - startTime}ms).`,
        data: resultData,
      };
    } catch (err: any) {
      lastError = err;
      attempt++;
      if (attempt <= maxRetries) {
        const backoff = initialBackoffMs * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }

  // All retries failed: record failure
  const completedAt = new Date().toISOString();
  const errorMsg = lastError ? lastError.message : 'Unknown synchronization error';

  await updateSourceSyncState(sourceId, {
    lastAttempted: attemptedAt,
    error: errorMsg,
  });

  return {
    source_id: sourceId,
    success: false,
    attempted_at: attemptedAt,
    completed_at: completedAt,
    elapsed_ms: Date.now() - startTime,
    retries_attempted: maxRetries,
    message: `Synchronization failed after ${maxRetries} retry attempts: ${errorMsg}`,
    error: errorMsg,
  };
}

async function updateSourceSyncState(
  sourceId: string,
  params: { lastAttempted: string; lastSuccessful?: string; error?: string | null }
): Promise<void> {
  const updates: any = {
    last_attempted_sync: params.lastAttempted,
  };
  if (params.lastSuccessful) {
    updates.last_successful_sync = params.lastSuccessful;
    updates.error_details = null;
  }
  if (params.error !== undefined) {
    updates.error_details = params.error;
  }

  if (isSupabaseConfigured) {
    try {
      const client = getSupabase();
      await client
        .from('data_sources')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sourceId);
    } catch {}
  }

  // Also update in-memory
  await updateDataSource(sourceId, updates as any);
}

/**
 * Starts a recurring background schedule when running in a long-lived Node/Bun server process.
 * Returns an unsubscription teardown function.
 */
export function startScheduledSync(
  sourceId: string,
  intervalSeconds: number,
  callback?: (result: SyncExecutionResult) => void
): () => void {
  // Clear any existing timer for this source
  if (SCHEDULED_TIMERS.has(sourceId)) {
    clearInterval(SCHEDULED_TIMERS.get(sourceId)!);
  }

  const timer = setInterval(async () => {
    try {
      const res = await syncSource(sourceId);
      if (callback) callback(res);
    } catch (e) {
      console.error(`[ScheduledSync] Error during sync for ${sourceId}:`, e);
    }
  }, intervalSeconds * 1000);

  SCHEDULED_TIMERS.set(sourceId, timer);

  return () => {
    clearInterval(timer);
    SCHEDULED_TIMERS.delete(sourceId);
  };
}

/**
 * Stops all background scheduled timers (useful in tests and shutdown hooks).
 */
export function stopAllScheduledSyncs(): void {
  for (const timer of SCHEDULED_TIMERS.values()) {
    clearInterval(timer);
  }
  SCHEDULED_TIMERS.clear();
}
