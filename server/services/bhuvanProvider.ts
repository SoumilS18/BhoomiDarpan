/**
 * BhoomiSetu - ISRO Bhuvan Geospatial Services Provider
 * 
 * Implements:
 * 1. OGC WMS 1.1.1 Thematic Layer Abstraction
 * 2. Data-Driven Dynamic Jurisdiction Resolution
 * 3. Lightweight Health Check Probing (Fast workspace-scoped capabilities, never global 44s XML)
 * 4. In-Memory Capabilities Caching with Safe TTL
 * 5. Strict Zero-Credential Public Access Boundary
 * 6. Non-Cadastral Thematic Context Guard (Never connects to numerical risk scoring)
 */

import { SatelliteLayerConfig } from '../../shared/types';
import {
  BHUVAN_WMS_ROOT,
  BHUVAN_LULC_WMS_ENDPOINT,
  BHUVAN_DISASTER_WMS_ENDPOINT,
  BHUVAN_ATTRIBUTION,
  BHUVAN_STATUTORY_DISCLAIMER,
  BHUVAN_LAYER_CATALOGUE,
  BhuvanWorkspace,
  BhuvanLayerEntry,
  BhuvanLayerContext,
  BhuvanResolutionResult,
  resolveBhuvanLayers,
} from './bhuvanCatalogue';

export interface BhuvanWorkspaceHealth {
  status: 'operational' | 'degraded' | 'unavailable';
  response_time_ms: number;
  message: string;
}

export interface BhuvanHealthStatus {
  status: 'operational' | 'degraded' | 'unavailable';
  response_time_ms: number;
  message: string;
  endpoint_checked: string;
  workspaces: {
    lulc: BhuvanWorkspaceHealth;
    disaster: BhuvanWorkspaceHealth;
  };
  verified_layers_count: number;
  timestamp: string;
}

export interface BhuvanCapabilitiesSummary {
  workspace: string;
  layer_count: number;
  layers: string[];
  endpoint: string;
  cached: boolean;
  retrieved_at: string;
}

export interface IBhuvanProvider {
  readonly name: string;
  readonly providerId: string;
  getLayerConfigs(): SatelliteLayerConfig[];
  getAvailableLayers(scope?: BhuvanWorkspace): BhuvanLayerEntry[];
  resolveLayers(context: BhuvanLayerContext): BhuvanResolutionResult;
  getCapabilities(scope?: BhuvanWorkspace): Promise<BhuvanCapabilitiesSummary>;
  getHealth(): Promise<BhuvanHealthStatus>;
}

export class IsroBhuvanProvider implements IBhuvanProvider {
  readonly name = 'ISRO Bhuvan Sovereign Earth Observation WMS';
  readonly providerId = 'bhuvan';
  private wmsBaseUrl = BHUVAN_WMS_ROOT;
  private lulcEndpoint = BHUVAN_LULC_WMS_ENDPOINT;
  private disasterEndpoint = BHUVAN_DISASTER_WMS_ENDPOINT;
  private capabilitiesCache: Map<string, { summary: BhuvanCapabilitiesSummary; expiresAt: number }> = new Map();
  private cacheTtlMs = 3600_000; // 1 hour default TTL
  private healthTimeoutMs = 5000; // Strict 5s timeout for health checks

  /**
   * Returns active SatelliteLayerConfig items for standard satellite service integration.
   * Only includes verified layers. Invalid legacy layers (wasteland 50k / flood hazard)
   * are completely removed from active layers.
   */
  getLayerConfigs(): SatelliteLayerConfig[] {
    const verifiedEntries = BHUVAN_LAYER_CATALOGUE.filter(
      l => l.enabled && l.verification_status === 'verified'
    );

    // Standard high-level thematic layer groups exposed to GIS layer selector
    const primaryLulc = verifiedEntries.find(l => l.layer_id === 'bhuvan_lulc_50k_mh_1516') || verifiedEntries[0];
    const primaryDisaster = verifiedEntries.find(l => l.layer_id === 'bhuvan_disaster_ls_mh_2023') ||
      verifiedEntries.find(l => l.workspace === 'disaster');

    const configs: SatelliteLayerConfig[] = [
      {
        id: 'bhuvan_lulc_50k',
        name: 'Bhuvan Land Use / Land Cover (LULC 50K)',
        provider: this.providerId,
        layer_type: 'wms',
        url: this.wmsBaseUrl,
        layers: primaryLulc ? primaryLulc.layer_name : 'lulc:MH_LULC50K_1516',
        format: 'image/png',
        transparent: true,
        attribution: BHUVAN_ATTRIBUTION,
        description: `Official NRSC Land Use and Land Cover reference cartography at 1:50,000 scale. ${BHUVAN_STATUTORY_DISCLAIMER}`,
        is_base_layer: false,
        opacity: primaryLulc?.default_opacity ?? 0.65,
        max_zoom: 18,
        requires_credentials: false,
        status: 'operational',
      },
    ];

    if (primaryDisaster) {
      configs.push({
        id: 'bhuvan_disaster_hazard',
        name: 'Bhuvan Disaster & Hazard Susceptibility',
        provider: this.providerId,
        layer_type: 'wms',
        url: this.wmsBaseUrl,
        layers: primaryDisaster.layer_name,
        format: 'image/png',
        transparent: true,
        attribution: BHUVAN_ATTRIBUTION,
        description: `Official NRSC disaster susceptibility overlay. ${BHUVAN_STATUTORY_DISCLAIMER}`,
        is_base_layer: false,
        opacity: primaryDisaster.default_opacity ?? 0.6,
        max_zoom: 18,
        requires_credentials: false,
        status: 'operational',
      });
    }

    const regionalGanga = verifiedEntries.find(l => l.layer_id === 'bhuvan_lulc_ganga_basin');
    if (regionalGanga) {
      configs.push({
        id: 'bhuvan_lulc_ganga_basin',
        name: 'Bhuvan Ganga Basin Land Cover',
        provider: this.providerId,
        layer_type: 'wms',
        url: this.wmsBaseUrl,
        layers: regionalGanga.layer_name,
        format: 'image/png',
        transparent: true,
        attribution: BHUVAN_ATTRIBUTION,
        description: `Official NRSC regional Ganga river basin land cover cartography. ${BHUVAN_STATUTORY_DISCLAIMER}`,
        is_base_layer: false,
        opacity: regionalGanga.default_opacity ?? 0.6,
        max_zoom: 18,
        requires_credentials: false,
        status: 'operational',
      });
    }

    return configs;
  }

  /**
   * Returns complete data-driven catalogue of Bhuvan layers
   */
  getAvailableLayers(scope?: BhuvanWorkspace): BhuvanLayerEntry[] {
    if (scope) {
      return BHUVAN_LAYER_CATALOGUE.filter(l => l.workspace === scope);
    }
    return [...BHUVAN_LAYER_CATALOGUE];
  }

  /**
   * Resolves layers dynamically based on project/case jurisdiction context.
   * Completely data-driven with ZERO hardcoded state branching.
   */
  resolveLayers(context: BhuvanLayerContext): BhuvanResolutionResult {
    return resolveBhuvanLayers(context);
  }

  /**
   * Fetches and parses lightweight workspace-scoped capabilities safely.
   * Uses cached response if available to avoid repeated remote fetches.
   */
  async getCapabilities(scope: BhuvanWorkspace = 'lulc'): Promise<BhuvanCapabilitiesSummary> {
    const cacheKey = `bhuvan_cap_${scope}`;
    const cached = this.capabilitiesCache.get(cacheKey);
    const now = Date.now();

    if (cached && cached.expiresAt > now) {
      return { ...cached.summary, cached: true };
    }

    // SSRF Safeguard: Only construct URL from trusted internal constants
    const targetEndpoint = `https://bhuvan-vec2.nrsc.gov.in/bhuvan/${encodeURIComponent(scope)}/wms`;
    const requestUrl = `${targetEndpoint}?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.1.1`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch(requestUrl, {
        signal: controller.signal,
        headers: { 'Accept': 'application/xml, text/xml' },
      });
      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`Bhuvan workspace "${scope}" responded with HTTP ${res.status}`);
      }

      const xml = await res.text();
      // Safe non-evaluating regex parsing of Layer names (immune to XXE)
      const matches = [...xml.matchAll(/<Layer[^>]*>[\s\S]*?<Name>([^<]+)<\/Name>/g)];
      const layerNames = matches
        .map(m => m[1])
        .filter(name => name && name !== 'OGC:WMS');

      const summary: BhuvanCapabilitiesSummary = {
        workspace: scope,
        layer_count: layerNames.length,
        layers: layerNames,
        endpoint: targetEndpoint,
        cached: false,
        retrieved_at: new Date().toISOString(),
      };

      this.capabilitiesCache.set(cacheKey, {
        summary,
        expiresAt: now + this.cacheTtlMs,
      });

      return summary;
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        throw new Error(`Bhuvan GetCapabilities for workspace "${scope}" timed out after 8s`);
      }
      throw err;
    }
  }

  private async probeWorkspace(endpoint: string, wsName: string): Promise<BhuvanWorkspaceHealth> {
    const startTime = Date.now();
    const probeUrl = `${endpoint}?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.1.1`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.healthTimeoutMs);

    try {
      const res = await fetch(probeUrl, {
        signal: controller.signal,
        headers: { Accept: 'text/xml, application/xml' },
      });
      clearTimeout(timer);
      const elapsed = Date.now() - startTime;

      if (!res.ok) {
        return {
          status: 'unavailable',
          response_time_ms: elapsed,
          message: `HTTP ${res.status} from ${wsName}`,
        };
      }

      const text = await res.text();
      const hasCapabilities = text.includes('WMT_MS_Capabilities') || text.includes('WMS_Capabilities');
      return {
        status: hasCapabilities ? 'operational' : 'degraded',
        response_time_ms: elapsed,
        message: hasCapabilities
          ? `${wsName} workspace operational (${elapsed}ms)`
          : `${wsName} returned non-standard XML`,
      };
    } catch (err: any) {
      clearTimeout(timer);
      const elapsed = Date.now() - startTime;
      const isTimeout = err.name === 'AbortError' || err.message?.includes('timeout');
      return {
        status: isTimeout ? 'degraded' : 'unavailable',
        response_time_ms: elapsed,
        message: isTimeout ? `${wsName} timed out after ${this.healthTimeoutMs}ms` : `${wsName} error: ${err.message}`,
      };
    }
  }

  /**
   * Fast, lightweight health probe across active workspaces (LULC and Disaster).
   * Probes workspace-scoped GetCapabilities (~800ms) with a strict 5000ms timeout,
   * completely avoiding the slow global 44s GetCapabilities.
   * Reports capability-specific health statuses for each active workspace.
   */
  async getHealth(): Promise<BhuvanHealthStatus> {
    const startTime = Date.now();
    const [lulcHealth, disasterHealth] = await Promise.all([
      this.probeWorkspace(this.lulcEndpoint, 'LULC'),
      this.probeWorkspace(this.disasterEndpoint, 'Disaster'),
    ]);
    const elapsed = Date.now() - startTime;

    let overallStatus: 'operational' | 'degraded' | 'unavailable' = 'operational';
    let message = 'All active ISRO Bhuvan workspaces operational.';

    if (lulcHealth.status === 'unavailable' && disasterHealth.status === 'unavailable') {
      overallStatus = 'unavailable';
      message = 'All ISRO Bhuvan workspaces are currently unavailable.';
    } else if (lulcHealth.status !== 'operational' || disasterHealth.status !== 'operational') {
      overallStatus = 'degraded';
      message = `Bhuvan degraded: LULC is ${lulcHealth.status}, Disaster is ${disasterHealth.status}.`;
    }

    return {
      status: overallStatus,
      response_time_ms: elapsed,
      message,
      endpoint_checked: this.lulcEndpoint,
      workspaces: {
        lulc: lulcHealth,
        disaster: disasterHealth,
      },
      verified_layers_count: BHUVAN_LAYER_CATALOGUE.filter(l => l.verification_status === 'verified').length,
      timestamp: new Date().toISOString(),
    };
  }
}

export const bhuvanProvider = new IsroBhuvanProvider();
