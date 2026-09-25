import { getSupabase, isSupabaseConfigured, isGeminiConfigured } from '../config/supabase';
import { DataSource, DataSourceStatus } from '../../shared/types';
import { BHUVAN_WMS_BASE_URL, BHUVAN_WMS_LAYERS, bhuvanProvider } from './satelliteService';

export interface DataSourceTestResult {
  source_id: string;
  operational: boolean;
  status: DataSourceStatus;
  response_time_ms: number;
  message: string;
  timestamp: string;
}

// In-memory fallback cache of data sources for resilience
const IN_MEMORY_SOURCES: DataSource[] = [
  {
    id: 'supabase_postgres',
    name: 'Primary Statutory Database & Storage Engine',
    type: 'database',
    provider: 'Supabase PostgreSQL & Storage',
    endpoint_ref: 'SUPABASE_URL',
    env_secret_keys: ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
    status: 'not_configured',
    is_enabled: true,
    sync_mode: 'realtime',
    data_scope: 'Institutional Land Acquisition Records, Audits, Policies & Spatial Data',
    metadata: { relational: true, spatial_support: true, rls_enabled: true },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'gemini_flash',
    name: 'Document Intelligence & Statutory Extraction Engine',
    type: 'ai',
    provider: 'Google Gemini 3.6 Flash',
    endpoint_ref: 'https://generativelanguage.googleapis.com',
    env_secret_keys: ['GEMINI_API_KEY'],
    status: 'not_configured',
    is_enabled: true,
    sync_mode: 'on_demand',
    data_scope: 'Gazettes, Notices, Section 11/19 declarations, Valuation records',
    metadata: { model: 'gemini-3.6-flash', structured_json: true, server_side_only: true },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'nominatim_osm',
    name: 'OpenStreetMap Nominatim Geocoding Adapter',
    type: 'geocoding',
    provider: 'OpenStreetMap / Nominatim',
    endpoint_ref: 'https://nominatim.openstreetmap.org',
    env_secret_keys: [],
    status: 'configured',
    is_enabled: true,
    sync_mode: 'on_demand',
    data_scope: 'Forward & Reverse Indian Spatial Coordinates & Centroids',
    metadata: { rate_limit_rps: 1, attribution: 'OpenStreetMap contributors', cache_hours: 24 },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'lgd_india',
    name: 'Local Government Directory (LGD) Administrative Hierarchy',
    type: 'administrative_data',
    provider: 'Ministry of Panchayati Raj, Govt of India (GODL)',
    endpoint_ref: 'https://lgd.gov.in',
    env_secret_keys: [],
    status: 'not_configured',
    is_enabled: true,
    sync_mode: 'manual_import',
    data_scope: 'National Master: States, Districts, Sub-Districts/Tehsils, Villages',
    metadata: { license: 'Government Open Data License - India (GODL)', hierarchical: true },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'open_meteo',
    name: 'Open-Meteo Global Meteorological & Environmental Adapter',
    type: 'weather',
    provider: 'Open-Meteo API / WMO National Weather Services',
    endpoint_ref: 'https://api.open-meteo.com/v1/forecast',
    env_secret_keys: [],
    status: 'configured',
    is_enabled: true,
    sync_mode: 'on_demand',
    data_scope: 'High-resolution temperature, precipitation, humidity, wind and atmospheric observations by GIS coordinates',
    metadata: {
      attribution: 'Open-Meteo.com (CC BY 4.0) & National Weather Services',
      rate_limit_rpm: 600,
      freshness_policy: {
        fresh_seconds: 1800,
        aging_seconds: 7200,
        stale_seconds: 86400,
      },
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'osrm_routing',
    name: 'OpenStreetMap OSRM Road Routing Adapter',
    type: 'routing',
    provider: 'OpenStreetMap / OSRM Project',
    endpoint_ref: 'https://router.project-osrm.org',
    env_secret_keys: [],
    status: 'configured',
    is_enabled: true,
    sync_mode: 'on_demand',
    data_scope: 'Static road network topology, distance, and duration calculations',
    metadata: {
      attribution: 'OpenStreetMap contributors, OSRM (ODbL)',
      usage_policy: 'Public community routing engine subject to fair use',
      traffic_aware: false,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'google_maps_platform',
    name: 'Google Maps Platform (Routes, Geocoding & Satellite)',
    type: 'routing',
    provider: 'Google Maps Platform',
    endpoint_ref: 'https://routes.googleapis.com',
    env_secret_keys: ['GOOGLE_MAPS_API_KEY'],
    status: 'not_configured',
    is_enabled: true,
    sync_mode: 'on_demand',
    data_scope: 'Real-time traffic-aware routing, high-accuracy geocoding, and hybrid imagery',
    metadata: {
      attribution: 'Google Maps Platform',
      pricing_tier: 'Pay-as-you-go per SKU (10k free events/month on Essentials)',
      traffic_aware: true,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'isro_bhuvan',
    name: 'ISRO Bhuvan Sovereign Earth Observation WMS',
    type: 'satellite',
    provider: 'ISRO / National Remote Sensing Centre (NRSC)',
    endpoint_ref: 'https://bhuvan-vec2.nrsc.gov.in/bhuvan/wms',
    env_secret_keys: [],
    status: 'configured',
    is_enabled: true,
    sync_mode: 'on_demand',
    data_scope: 'Sovereign Land Use / Land Cover (LULC 50K) and Landslide Hazard thematic map layers for contextual planning.',
    metadata: {
      attribution: 'ISRO / NRSC Bhuvan',
      service_type: 'OGC WMS 1.1.1',
      usage_policy: 'Open sovereign Indian earth observation data subject to NRSC terms',
      disclaimer: 'Thematic reference spatial data. Not cadastral ground truth.',
      coverage: 'All-India state-scoped & regional thematic layers',
      authentication: 'none',
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'copernicus_cdse',
    name: 'ESA Copernicus Data Space Ecosystem (Sentinel-2 STAC)',
    type: 'satellite',
    provider: 'European Space Agency (ESA) Copernicus',
    endpoint_ref: 'https://catalogue.dataspace.copernicus.eu/stac',
    env_secret_keys: ['COPERNICUS_CDSE_CLIENT_ID', 'COPERNICUS_CDSE_CLIENT_SECRET'],
    status: 'requires_credentials',
    is_enabled: true,
    sync_mode: 'on_demand',
    data_scope: 'Sentinel-2 L2A multispectral granule metadata and optical scene search',
    metadata: {
      attribution: 'European Union, Copernicus Data Space Ecosystem',
      free_tier_limits: '10,000 Processing Units/month, 2000 req/min',
      stac_standard: 'STAC API 1.0.0',
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'bhashini_meity',
    name: 'Bhashini National Language Translation Mission (ULCA)',
    type: 'translation',
    provider: 'Ministry of Electronics and Information Technology (MeitY), Govt of India',
    endpoint_ref: 'https://dhruva-api.bhashini.gov.in',
    env_secret_keys: ['BHASHINI_API_KEY', 'BHASHINI_USER_ID'],
    status: 'requires_credentials',
    is_enabled: true,
    sync_mode: 'on_demand',
    data_scope: 'Official 22 scheduled Indian languages for statutory notice and document translation',
    metadata: {
      attribution: 'Bhashini / ULCA (MeitY, Government of India)',
      standard: 'National Language Translation Mission (NLTM)',
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'maptiler',
    name: 'MapTiler Cloud Cartography & Basemap Engine',
    type: 'gis',
    provider: 'MapTiler AG (Cloud Platform)',
    endpoint_ref: 'https://api.maptiler.com',
    env_secret_keys: ['MAPTILER_API_KEY'],
    status: 'not_configured',
    is_enabled: true,
    sync_mode: 'on_demand',
    data_scope: 'High-resolution vector & raster basemaps, topographic terrain, and satellite imagery',
    metadata: {
      attribution: '© MapTiler © OpenStreetMap contributors',
      terms: 'https://www.maptiler.com/terms-of-use/',
      supported_styles: ['streets-v2', 'basic-v2', 'satellite', 'hybrid', 'topo-v2', 'outdoor-v2'],
      free_tier_limits: '100,000 map tile requests/month',
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

// Short-lived cache for live open-endpoint handshake probes so dynamic status
// evaluation stays truthful without hammering fair-use public APIs.
const OPEN_SOURCE_PROBE_TTL_MS = 60_000;
const openSourceProbeCache = new Map<string, { status: DataSourceStatus; expiresAt: number }>();

async function probeOpenSourceStatus(sourceId: string): Promise<DataSourceStatus> {
  const cached = openSourceProbeCache.get(sourceId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.status;
  }
  const result = await runConnectivityProbe(sourceId);
  openSourceProbeCache.set(sourceId, {
    status: result.status,
    expiresAt: Date.now() + OPEN_SOURCE_PROBE_TTL_MS,
  });
  return result.status;
}

/**
 * Resolves current live operational status for any source dynamically without exposing secrets.
 */
export async function evaluateSourceStatus(source: DataSource): Promise<DataSourceStatus> {
  if (!source.is_enabled) {
    return 'disabled';
  }

  if (source.id === 'supabase_postgres') {
    if (!isSupabaseConfigured) return 'not_configured';
    try {
      const client = getSupabase();
      const { error } = await client.from('workflows').select('id').limit(1);
      return error ? 'error' : 'operational';
    } catch {
      return 'error';
    }
  }

  if (source.id === 'gemini_flash') {
    if (!isGeminiConfigured) return 'not_configured';
    // Key exists and is not a placeholder
    return 'configured';
  }

  if (source.id === 'nominatim_osm') {
    return probeOpenSourceStatus(source.id);
  }

  if (source.id === 'open_meteo') {
    return probeOpenSourceStatus(source.id);
  }

  if (source.id === 'lgd_india') {
    if (isSupabaseConfigured) {
      try {
        const client = getSupabase();
        const { count, error } = await client
          .from('administrative_units')
          .select('*', { count: 'exact', head: true });
        if (!error && typeof count === 'number' && count > 0) {
          return 'operational';
        }
      } catch {}
    }
    return 'not_configured';
  }

  if (source.id === 'osrm_routing') {
    return probeOpenSourceStatus(source.id);
  }

  if (source.id === 'google_maps_platform') {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    return key && !key.includes('your-google-maps-api-key') ? 'configured' : 'not_configured';
  }

  if (source.id === 'isro_bhuvan') {
    return 'configured';
  }

  if (source.id === 'copernicus_cdse') {
    const hasCreds = Boolean(
      process.env.COPERNICUS_CDSE_CLIENT_ID &&
      !process.env.COPERNICUS_CDSE_CLIENT_ID.includes('your-') &&
      process.env.COPERNICUS_CDSE_CLIENT_SECRET &&
      !process.env.COPERNICUS_CDSE_CLIENT_SECRET.includes('your-')
    );
    return hasCreds ? 'configured' : 'not_configured';
  }

  if (source.id === 'bhashini_meity') {
    const hasCreds = Boolean(
      process.env.BHASHINI_API_KEY &&
      !process.env.BHASHINI_API_KEY.includes('your-') &&
      process.env.BHASHINI_USER_ID &&
      !process.env.BHASHINI_USER_ID.includes('your-')
    );
    return hasCreds ? 'configured' : 'not_configured';
  }

  if (source.id === 'maptiler') {
    const key = process.env.MAPTILER_API_KEY || process.env.VITE_MAPTILER_API_KEY;
    return key && !key.includes('your-') && key.trim().length > 0 ? 'configured' : 'not_configured';
  }

  return source.status || 'not_configured';
}

/**
 * Lists all registered data sources enriched with their live status.
 */
export async function listDataSources(): Promise<DataSource[]> {
  let sources: DataSource[] = [];

  if (isSupabaseConfigured) {
    try {
      const client = getSupabase();
      const { data, error } = await client.from('data_sources').select('*').order('created_at', { ascending: true });
      if (!error && data && data.length > 0) {
        sources = data as DataSource[];
      }
    } catch {
      sources = IN_MEMORY_SOURCES;
    }
  }

  if (sources.length === 0) {
    sources = [...IN_MEMORY_SOURCES];
  } else {
    // Ensure any canonical sources from IN_MEMORY_SOURCES (like open_meteo) are merged
    const existingIds = new Set(sources.map((s) => s.id));
    for (const memSource of IN_MEMORY_SOURCES) {
      if (!existingIds.has(memSource.id)) {
        sources.push(memSource);
      }
    }
  }

  // Enrich with dynamic live status
  const enriched = await Promise.all(
    sources.map(async (src) => {
      const liveStatus = await evaluateSourceStatus(src);
      return {
        ...src,
        status: liveStatus,
      };
    })
  );

  return enriched;
}

/**
 * Retrieves a single registered data source by ID.
 */
export async function getDataSource(id: string): Promise<DataSource | null> {
  const all = await listDataSources();
  return all.find((s) => s.id === id) || null;
}

/**
 * Toggles or updates data source configuration.
 */
export async function updateDataSource(
  id: string,
  updates: Partial<Pick<DataSource, 'is_enabled' | 'sync_mode' | 'metadata'>>
): Promise<DataSource | null> {
  if (isSupabaseConfigured) {
    try {
      const client = getSupabase();
      const { data, error } = await client
        .from('data_sources')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .single();
      if (!error && data) {
        const liveStatus = await evaluateSourceStatus(data as DataSource);
        return { ...(data as DataSource), status: liveStatus };
      }
    } catch {}
  }

  const memoryIndex = IN_MEMORY_SOURCES.findIndex((s) => s.id === id);
  if (memoryIndex >= 0) {
    IN_MEMORY_SOURCES[memoryIndex] = {
      ...IN_MEMORY_SOURCES[memoryIndex],
      ...updates,
      updated_at: new Date().toISOString(),
    };
    const liveStatus = await evaluateSourceStatus(IN_MEMORY_SOURCES[memoryIndex]);
    return { ...IN_MEMORY_SOURCES[memoryIndex], status: liveStatus };
  }

  return null;
}

/**
 * Performs a live handshake test against a registered data source.
 */
export async function testDataSourceConnectivity(id: string): Promise<DataSourceTestResult> {
  const source = await getDataSource(id);

  if (!source) {
    return {
      source_id: id,
      operational: false,
      status: 'not_configured',
      response_time_ms: 0,
      message: `Data source with id "${id}" not found in registry.`,
      timestamp: new Date().toISOString(),
    };
  }

  return runConnectivityProbe(id, source);
}

/**
 * Internal live handshake probe. Deliberately bypasses getDataSource/listDataSources
 * so evaluateSourceStatus -> probeOpenSourceStatus can never recurse back into
 * status enrichment (which would deadlock on live network handshakes).
 */
async function runConnectivityProbe(id: string, source?: DataSource): Promise<DataSourceTestResult> {
  const startTime = Date.now();
  const registrySource = source ?? IN_MEMORY_SOURCES.find((s) => s.id === id);

  if (id === 'supabase_postgres') {
    if (!isSupabaseConfigured) {
      return {
        source_id: id,
        operational: false,
        status: 'not_configured',
        response_time_ms: Date.now() - startTime,
        message: 'Supabase credentials contain placeholder values in .env. Configure real credentials.',
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const client = getSupabase();
      const { error } = await client.from('workflows').select('id').limit(1);
      const elapsed = Date.now() - startTime;
      if (error) {
        return {
          source_id: id,
          operational: false,
          status: 'error',
          response_time_ms: elapsed,
          message: `Query failed: ${error.message}. Schema migrations may need to be applied.`,
          timestamp: new Date().toISOString(),
        };
      }
      return {
        source_id: id,
        operational: true,
        status: 'operational',
        response_time_ms: elapsed,
        message: 'Successfully reached Supabase PostgreSQL database and executed verification query.',
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      return {
        source_id: id,
        operational: false,
        status: 'error',
        response_time_ms: Date.now() - startTime,
        message: `Database connection error: ${err.message}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  if (id === 'gemini_flash') {
    if (!isGeminiConfigured) {
      return {
        source_id: id,
        operational: false,
        status: 'not_configured',
        response_time_ms: Date.now() - startTime,
        message: 'GEMINI_API_KEY is not configured or contains placeholder in .env.',
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
      const modelName = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
      const model = genAI.getGenerativeModel({ model: modelName });
      // Minimal token test
      const res = await model.generateContent('ping');
      const elapsed = Date.now() - startTime;
      return {
        source_id: id,
        operational: true,
        status: 'operational',
        response_time_ms: elapsed,
        message: `Gemini (${modelName}) reached successfully (${elapsed}ms).`,
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      return {
        source_id: id,
        operational: false,
        status: 'error',
        response_time_ms: Date.now() - startTime,
        message: `Gemini test call failed: ${err.message}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  if (id === 'nominatim_osm') {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch('https://nominatim.openstreetmap.org/search?format=json&q=India&limit=1', {
        headers: {
          'User-Agent': 'BhoomiSetu-Platform/1.0 (contact: admin@bhoomisetu.gov.in)',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const elapsed = Date.now() - startTime;
      if (res.ok) {
        return {
          source_id: id,
          operational: true,
          status: 'operational',
          response_time_ms: elapsed,
          message: `Nominatim OSM geocoding service responded in ${elapsed}ms.`,
          timestamp: new Date().toISOString(),
        };
      } else {
        return {
          source_id: id,
          operational: false,
          status: res.status === 429 ? 'rate_limited' : 'error',
          response_time_ms: elapsed,
          message: `Nominatim returned HTTP ${res.status}: ${res.statusText}`,
          timestamp: new Date().toISOString(),
        };
      }
    } catch (err: any) {
      return {
        source_id: id,
        operational: false,
        status: 'error',
        response_time_ms: Date.now() - startTime,
        message: `Geocoding test request error: ${err.message}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  if (id === 'lgd_india') {
    if (isSupabaseConfigured) {
      try {
        const client = getSupabase();
        const { count, error } = await client
          .from('administrative_units')
          .select('*', { count: 'exact', head: true });
        const elapsed = Date.now() - startTime;
        if (!error && typeof count === 'number' && count > 0) {
          return {
            source_id: id,
            operational: true,
            status: 'operational',
            response_time_ms: elapsed,
            message: `LGD India administrative hierarchy operational with ${count} units loaded.`,
            timestamp: new Date().toISOString(),
          };
        }
      } catch {}
    }
    return {
      source_id: id,
      operational: false,
      status: 'not_configured',
      response_time_ms: Date.now() - startTime,
      message: 'No administrative units loaded yet. Run Data Import to ingest official LGD datasets.',
      timestamp: new Date().toISOString(),
    };
  }

  if (id === 'open_meteo') {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      // Handshake probe using standard WGS-84 geographic origin (0, 0)
      const probeUrl = `${registrySource?.endpoint_ref || 'https://api.open-meteo.com/v1/forecast'}?latitude=0&longitude=0&current=temperature_2m`;
      const res = await fetch(probeUrl, {
        headers: {
          'User-Agent': 'BhoomiSetu-Platform/2.0 (contact: tech@bhoomisetu.gov.in)',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const elapsed = Date.now() - startTime;
      if (res.ok) {
        return {
          source_id: id,
          operational: true,
          status: 'operational',
          response_time_ms: elapsed,
          message: `Open-Meteo weather adapter reached successfully in ${elapsed}ms.`,
          timestamp: new Date().toISOString(),
        };
      } else {
        return {
          source_id: id,
          operational: false,
          status: res.status === 429 ? 'rate_limited' : 'error',
          response_time_ms: elapsed,
          message: `Open-Meteo returned HTTP ${res.status}: ${res.statusText}`,
          timestamp: new Date().toISOString(),
        };
      }
    } catch (err: any) {
      return {
        source_id: id,
        operational: false,
        status: 'error',
        response_time_ms: Date.now() - startTime,
        message: `Open-Meteo connectivity error: ${err.message}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  if (id === 'osrm_routing') {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const probeUrl = 'https://router.project-osrm.org/route/v1/driving/77.2090,28.6139;77.2190,28.6239?overview=false';
      const res = await fetch(probeUrl, {
        headers: { 'User-Agent': 'BhoomiSetu-Platform/2.0' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const elapsed = Date.now() - startTime;
      if (res.ok) {
        return {
          source_id: id,
          operational: true,
          status: 'operational',
          response_time_ms: elapsed,
          message: `OSRM routing engine reached successfully in ${elapsed}ms.`,
          timestamp: new Date().toISOString(),
        };
      }
      return {
        source_id: id,
        operational: false,
        status: res.status === 429 ? 'rate_limited' : 'error',
        response_time_ms: elapsed,
        message: `OSRM returned HTTP ${res.status}: ${res.statusText}`,
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      return {
        source_id: id,
        operational: false,
        status: 'error',
        response_time_ms: Date.now() - startTime,
        message: `OSRM probe error: ${err.message}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  if (id === 'google_maps_platform') {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey || apiKey.includes('your-google-maps-api-key')) {
      return {
        source_id: id,
        operational: false,
        status: 'not_configured',
        response_time_ms: Date.now() - startTime,
        message: 'GOOGLE_MAPS_API_KEY is not configured in .env file. Routing and geocoding will use open fallbacks.',
        timestamp: new Date().toISOString(),
      };
    }
    return {
      source_id: id,
      operational: false,
      status: 'configured',
      response_time_ms: Date.now() - startTime,
      message: 'GOOGLE_MAPS_API_KEY configured. Run a capability-specific route/geocode request to validate operational status.',
      timestamp: new Date().toISOString(),
    };
  }

  if (id === 'isro_bhuvan') {
    try {
      const health = await bhuvanProvider.getHealth();
      return {
        source_id: id,
        operational: health.status === 'operational',
        status: health.status,
        response_time_ms: health.response_time_ms,
        message: health.message,
        timestamp: health.timestamp,
      };
    } catch (err: any) {
      return {
        source_id: id,
        operational: false,
        status: 'unavailable',
        response_time_ms: Date.now() - startTime,
        message: `ISRO Bhuvan WMS endpoint probe unreachable: ${err.message}. Layers remain configured as fallback context.`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  if (id === 'copernicus_cdse') {
    const hasCreds = Boolean(
      process.env.COPERNICUS_CDSE_CLIENT_ID &&
      !process.env.COPERNICUS_CDSE_CLIENT_ID.includes('your-') &&
      process.env.COPERNICUS_CDSE_CLIENT_SECRET &&
      !process.env.COPERNICUS_CDSE_CLIENT_SECRET.includes('your-')
    );
    if (!hasCreds) {
      return {
        source_id: id,
        operational: false,
        status: 'requires_credentials',
        response_time_ms: Date.now() - startTime,
        message: 'COPERNICUS_CDSE_CLIENT_ID / CLIENT_SECRET not configured. Sentinel-2 metadata search is disabled until institutional credentials are supplied.',
        timestamp: new Date().toISOString(),
      };
    }
    return {
      source_id: id,
      operational: false,
      status: 'configured',
      response_time_ms: Date.now() - startTime,
      message: 'Copernicus CDSE credentials configured. STAC operational status requires a successful metadata query.',
      timestamp: new Date().toISOString(),
    };
  }

  if (id === 'bhashini_meity') {
    const hasCreds = Boolean(
      process.env.BHASHINI_API_KEY &&
      !process.env.BHASHINI_API_KEY.includes('your-') &&
      process.env.BHASHINI_USER_ID &&
      !process.env.BHASHINI_USER_ID.includes('your-')
    );
    if (!hasCreds) {
      return {
        source_id: id,
        operational: false,
        status: 'requires_credentials',
        response_time_ms: Date.now() - startTime,
        message: 'BHASHINI_API_KEY / BHASHINI_USER_ID not configured in .env. Translation falls back to Gemini or offline passthrough.',
        timestamp: new Date().toISOString(),
      };
    }
    return {
      source_id: id,
      operational: false,
      status: 'configured',
      response_time_ms: Date.now() - startTime,
      message: 'Bhashini MeitY credentials configured. Translation operational status requires a successful provider response.',
      timestamp: new Date().toISOString(),
    };
  }

  if (id === 'maptiler') {
    const apiKey = process.env.MAPTILER_API_KEY || process.env.VITE_MAPTILER_API_KEY;
    if (!apiKey || apiKey.includes('your-') || apiKey.trim().length === 0) {
      return {
        source_id: id,
        operational: false,
        status: 'not_configured',
        response_time_ms: Date.now() - startTime,
        message: 'MAPTILER_API_KEY is not configured in .env. Basemaps will use OpenStreetMap fallback.',
        timestamp: new Date().toISOString(),
      };
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      // Handshake test with standard 0/0/0 basic tile
      const probeUrl = `https://api.maptiler.com/maps/basic-v2/0/0/0.png?key=${encodeURIComponent(apiKey.trim())}`;
      const res = await fetch(probeUrl, {
        headers: { 'User-Agent': 'BhoomiSetu-Platform/2.0' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const elapsed = Date.now() - startTime;
      if (res.ok) {
        return {
          source_id: id,
          operational: true,
          status: 'operational',
          response_time_ms: elapsed,
          message: `MapTiler Cloud basemap tile endpoint responded successfully in ${elapsed}ms.`,
          timestamp: new Date().toISOString(),
        };
      }
      return {
        source_id: id,
        operational: false,
        status: res.status === 429 ? 'rate_limited' : res.status === 401 || res.status === 403 ? 'error' : 'unavailable',
        response_time_ms: elapsed,
        message: `MapTiler API returned HTTP ${res.status}: ${res.statusText}`,
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      return {
        source_id: id,
        operational: false,
        status: 'unavailable',
        response_time_ms: Date.now() - startTime,
        message: `MapTiler probe connection error: ${err.message}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  return {
    source_id: id,
    operational: false,
    status: 'not_configured',
    response_time_ms: Date.now() - startTime,
    message: 'Unknown integration source.',
    timestamp: new Date().toISOString(),
  };
}
