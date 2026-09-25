import {
  SatelliteLayerConfig,
  SatelliteMetadataResult,
  SatelliteGranuleMetadata,
} from '../../shared/types';
import { getIntegrationPolicySync } from './policyEngine';

export interface ISatelliteProvider {
  readonly name: string;
  readonly providerId: string;
  getLayerConfigs(): SatelliteLayerConfig[];
}

export interface ISatelliteMetadataProvider {
  readonly name: string;
  readonly providerId: string;
  searchImageryMetadata(
    bbox: [number, number, number, number],
    options?: { dateRange?: { from: string; to: string }; maxCloudCover?: number; limit?: number }
  ): Promise<SatelliteMetadataResult>;
}

import {
  BHUVAN_WMS_ROOT,
  BHUVAN_ATTRIBUTION,
  BHUVAN_STATUTORY_DISCLAIMER,
  BHUVAN_LAYER_CATALOGUE,
  BhuvanLayerContext,
  BhuvanResolutionResult,
  resolveBhuvanLayers,
} from './bhuvanCatalogue';
import { bhuvanProvider, IsroBhuvanProvider } from './bhuvanProvider';

export { bhuvanProvider, IsroBhuvanProvider, resolveBhuvanLayers, BHUVAN_LAYER_CATALOGUE };

export const BHUVAN_WMS_BASE_URL = BHUVAN_WMS_ROOT;

/**
 * Verified Bhuvan WMS Layers
 * Invalid legacy placeholders (lulc:BR_WL50K_0506 and flood:hazard_layer) have been removed
 * following empirical verification that they returned LayerNotDefined on bhuvan-vec2.
 */
export const BHUVAN_WMS_LAYERS = [
  {
    id: 'bhuvan_lulc_50k',
    name: 'Bhuvan Land Use / Land Cover (LULC 50K)',
    layers: 'lulc:MH_LULC50K_1516',
    opacity: 0.65,
    description: `Official NRSC Land Use and Land Cover reference cartography at 1:50,000 scale. ${BHUVAN_STATUTORY_DISCLAIMER}`,
  },
  {
    id: 'bhuvan_disaster_hazard',
    name: 'Bhuvan Disaster & Hazard Susceptibility',
    layers: 'disaster:LS_MAHARASHTRA_2023',
    opacity: 0.6,
    description: `Official NRSC landslide hazard susceptibility context. ${BHUVAN_STATUTORY_DISCLAIMER}`,
  },
] as const;

/**
 * Validate bounding box coordinates in [south, north, west, east] or [minLng, minLat, maxLng, maxLat]
 * Standard GeoJSON / STAC bbox format: [west, south, east, north] (minX, minY, maxX, maxY)
 */
export function validateBoundingBox(bbox: [number, number, number, number]): void {
  if (!Array.isArray(bbox) || bbox.length !== 4) {
    throw new Error('Invalid bounding box: must be a 4-element array [minLng, minLat, maxLng, maxLat].');
  }
  const [minLng, minLat, maxLng, maxLat] = bbox;
  if (
    typeof minLng !== 'number' || typeof minLat !== 'number' ||
    typeof maxLng !== 'number' || typeof maxLat !== 'number' ||
    isNaN(minLng) || isNaN(minLat) || isNaN(maxLng) || isNaN(maxLat)
  ) {
    throw new Error('Invalid bounding box coordinates: all elements must be numbers.');
  }

  if (minLat < -90 || minLat > 90 || maxLat < -90 || maxLat > 90) {
    throw new Error(`Invalid latitude in bbox [${minLat}, ${maxLat}]: must be between -90 and 90.`);
  }
  if (minLng < -180 || minLng > 180 || maxLng < -180 || maxLng > 180) {
    throw new Error(`Invalid longitude in bbox [${minLng}, ${maxLng}]: must be between -180 and 180.`);
  }
  if (minLat > maxLat) {
    throw new Error(`Invalid bbox: minLat (${minLat}) cannot be greater than maxLat (${maxLat}).`);
  }
  if (minLng > maxLng) {
    throw new Error(`Invalid bbox: minLng (${minLng}) cannot be greater than maxLng (${maxLng}).`);
  }
}

/**
 * Google Hybrid Tiles Provider
 * Satellite imagery with road and boundary labels via Google Maps Platform.
 * Requires GOOGLE_MAPS_API_KEY.
 */
export class GoogleHybridTileProvider implements ISatelliteProvider {
  readonly name = 'Google Maps Hybrid Satellite';
  readonly providerId = 'google_hybrid';

  getLayerConfigs(): SatelliteLayerConfig[] {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    const isConfigured = Boolean(apiKey && !apiKey.includes('your-google-maps-api-key'));

    return [
      {
        id: 'google_hybrid_tiles',
        name: 'Google Maps Satellite Hybrid',
        provider: this.providerId,
        layer_type: 'tile',
        // Never leak backend API key in layer URL response
        url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
        attribution: 'Imagery © Google Maps Platform',
        description: 'High-resolution global optical satellite imagery with integrated road overlay.',
        is_base_layer: true,
        max_zoom: 20,
        requires_credentials: true,
        status: isConfigured ? 'configured' : 'not_configured',
      },
    ];
  }
}

/**
 * Copernicus CDSE Sentinel-2 STAC Metadata Provider
 * Accesses ESA Copernicus Data Space Ecosystem STAC Catalog for genuine multispectral granule metadata.
 * Free tier: 10,000 Processing Units/month, 2,000 req/min.
 * Requires COPERNICUS_CDSE_CLIENT_ID and COPERNICUS_CDSE_CLIENT_SECRET for authenticated access,
 * but public STAC search metadata can be queried openly under CDSE fair usage policy.
 */
export class CopernicusCdseProvider implements ISatelliteMetadataProvider {
  readonly name = 'ESA Copernicus Data Space Ecosystem (Sentinel-2 STAC)';
  readonly providerId = 'copernicus';
  private stacSearchEndpoint = 'https://catalogue.dataspace.copernicus.eu/stac/search';
  private timeoutMs = 8000;

  async searchImageryMetadata(
    bbox: [number, number, number, number],
    options?: { dateRange?: { from: string; to: string }; maxCloudCover?: number; limit?: number }
  ): Promise<SatelliteMetadataResult> {
    validateBoundingBox(bbox);

    const clientId = process.env.COPERNICUS_CDSE_CLIENT_ID;
    const clientSecret = process.env.COPERNICUS_CDSE_CLIENT_SECRET;

    // Honest reporting when credentials are not configured
    if (!clientId || !clientSecret) {
      return {
        granules: [],
        total_results: 0,
        provider: this.providerId,
        query_bbox: bbox,
        status: 'not_configured',
        message: 'Copernicus CDSE credentials (COPERNICUS_CDSE_CLIENT_ID / COPERNICUS_CDSE_CLIENT_SECRET) not configured. Sentinel-2 metadata is unavailable until institutional credentials are supplied.',
        retrieved_at: new Date().toISOString(),
      };
    }

    try {
      // With credentials, query STAC catalog
      return await this.performStacQuery(bbox, options, clientId);
    } catch (err: any) {
      return {
        granules: [],
        total_results: 0,
        provider: this.providerId,
        query_bbox: bbox,
        status: 'unavailable',
        message: `Copernicus CDSE query error: ${err.message}`,
        retrieved_at: new Date().toISOString(),
      };
    }
  }

  private async performStacQuery(
    bbox: [number, number, number, number],
    options?: { dateRange?: { from: string; to: string }; maxCloudCover?: number; limit?: number },
    _authRef?: string
  ): Promise<SatelliteMetadataResult> {
    const limit = Math.min(Math.max(options?.limit || 5, 1), 50);
    const fromDate = options?.dateRange?.from || new Date(Date.now() - 30 * 86400000).toISOString();
    const toDate = options?.dateRange?.to || new Date().toISOString();
    const datetimeRange = `${fromDate}/${toDate}`;

    const payload: any = {
      bbox: bbox, // [minLng, minLat, maxLng, maxLat]
      datetime: datetimeRange,
      collections: ['SENTINEL-2'],
      limit,
    };

    if (typeof options?.maxCloudCover === 'number') {
      payload.query = {
        'eo:cloud_cover': {
          lte: options.maxCloudCover,
        },
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(this.stacSearchEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/geo+json,application/json',
          'User-Agent': 'BhoomiSetu-LandAcquisition/1.0',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        throw new Error(`Copernicus STAC catalogue responded with HTTP ${res.status}: ${res.statusText}`);
      }

      const data = (await res.json()) as any;
      if (!data || typeof data !== 'object') {
        throw new Error('Copernicus STAC returned a malformed JSON response.');
      }
      const features = Array.isArray(data.features) ? data.features.slice(0, limit) : [];

      const granules: SatelliteGranuleMetadata[] = features.map((f: any) => {
        if (!f || typeof f !== 'object') return null;
        const props = f.properties || {};
        const featureBbox = Array.isArray(f.bbox) && f.bbox.length === 4 && f.bbox.every((n: any) => typeof n === 'number' && Number.isFinite(n))
          ? (f.bbox as [number, number, number, number])
          : bbox;
        return {
          id: typeof f.id === 'string' ? f.id : 'unknown_granule',
          collection: f.collection || 'SENTINEL-2',
          datetime: props.datetime || props.created || new Date().toISOString(),
          cloud_cover_percentage: props['eo:cloud_cover'] ?? props.cloudCover,
          platform: props.platform || 'Sentinel-2',
          bbox: featureBbox,
          thumbnail_url: typeof f.assets?.thumbnail?.href === 'string' ? f.assets.thumbnail.href : undefined,
          quicklook_url: typeof f.assets?.visual?.href === 'string'
            ? f.assets.visual.href
            : typeof f.assets?.overview?.href === 'string'
              ? f.assets.overview.href
              : undefined,
          data_access_url: typeof f.assets?.PRODUCT?.href === 'string'
            ? f.assets.PRODUCT.href
            : f.links?.find((l: any) => l?.rel === 'self' && typeof l.href === 'string')?.href,
        };
      }).filter((item: SatelliteGranuleMetadata | null): item is SatelliteGranuleMetadata => item !== null);

      return {
        granules,
        total_results: granules.length,
        provider: this.providerId,
        query_bbox: bbox,
        status: 'operational',
        message: granules.length === 0 ? 'No Sentinel-2 acquisitions found for the specified bounding box and date range.' : undefined,
        retrieved_at: new Date().toISOString(),
      };
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error('Copernicus STAC search timed out after 8 seconds.');
      }
      throw err;
    }
  }
}

/**
 * MapTiler Cloud Tile Provider
 * High-resolution vector & raster cartography, satellite imagery, and topographic terrain layers.
 * Governed by MAPTILER_API_KEY (or VITE_MAPTILER_API_KEY).
 */
export class MapTilerTileProvider implements ISatelliteProvider {
  readonly name = 'MapTiler Cloud Cartography & Basemaps';
  readonly providerId = 'maptiler';

  getLayerConfigs(): SatelliteLayerConfig[] {
    const apiKey = process.env.MAPTILER_API_KEY || process.env.VITE_MAPTILER_API_KEY;
    const isConfigured = Boolean(apiKey && !apiKey.includes('your-') && apiKey.trim().length > 0);

    return [
      {
        id: 'maptiler_satellite',
        name: 'MapTiler Satellite Imagery',
        provider: this.providerId,
        layer_type: 'tile',
        // Never leak backend API key in layer URL response template
        url: 'https://api.maptiler.com/maps/satellite/256/{z}/{x}/{y}.jpg',
        attribution: '&copy; <a href="https://www.maptiler.com/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
        description: 'Global optical satellite imagery from MapTiler Cloud.',
        is_base_layer: true,
        max_zoom: 20,
        requires_credentials: true,
        status: isConfigured ? 'configured' : 'not_configured',
      },
      {
        id: 'maptiler_topo',
        name: 'MapTiler Topographic Terrain (Topo v2)',
        provider: this.providerId,
        layer_type: 'tile',
        url: 'https://api.maptiler.com/maps/topo-v2/256/{z}/{x}/{y}.png',
        attribution: '&copy; <a href="https://www.maptiler.com/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
        description: 'Topographic contour and relief context for corridor terrain evaluation.',
        is_base_layer: true,
        max_zoom: 19,
        requires_credentials: true,
        status: isConfigured ? 'configured' : 'not_configured',
      },
      {
        id: 'maptiler_streets',
        name: 'MapTiler Streets (Streets v2)',
        provider: this.providerId,
        layer_type: 'tile',
        url: 'https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png',
        attribution: '&copy; <a href="https://www.maptiler.com/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
        description: 'High-clarity street and infrastructure basemap.',
        is_base_layer: true,
        max_zoom: 19,
        requires_credentials: true,
        status: isConfigured ? 'configured' : 'not_configured',
      },
    ];
  }
}

/**
 * Universal Satellite Service Manager
 * Provides policy-governed map layers (Bhuvan WMS / Google Hybrid / MapTiler) and Sentinel-2 STAC metadata search.
 */
export class SatelliteService {
  private bhuvanProvider = new IsroBhuvanProvider();
  private googleHybridProvider = new GoogleHybridTileProvider();
  private mapTilerProvider = new MapTilerTileProvider();
  private copernicusProvider = new CopernicusCdseProvider();

  /**
   * Retrieve active satellite map overlay layers based on IntegrationPolicy
   */
  getAvailableLayers(): SatelliteLayerConfig[] {
    const policy = getIntegrationPolicySync();
    const layers: SatelliteLayerConfig[] = [];

    // Strictly policy-driven selection
    if (policy.satellite_layer_provider === 'bhuvan') {
      layers.push(...this.bhuvanProvider.getLayerConfigs());
    } else if (policy.satellite_layer_provider === 'google_hybrid') {
      layers.push(...this.googleHybridProvider.getLayerConfigs());
      // Thematic overlays from sovereign Bhuvan can be included as supplementary non-base layers
      const thematicOverlays = this.bhuvanProvider.getLayerConfigs().filter(l => !l.is_base_layer);
      layers.push(...thematicOverlays);
    } else if (policy.satellite_layer_provider === 'maptiler_satellite') {
      layers.push(...this.mapTilerProvider.getLayerConfigs());
      const thematicOverlays = this.bhuvanProvider.getLayerConfigs().filter(l => !l.is_base_layer);
      layers.push(...thematicOverlays);
    }

    return layers;
  }

  /**
   * Search satellite imagery metadata via STAC (Copernicus CDSE)
   */
  async searchImageryMetadata(
    bbox: [number, number, number, number],
    options?: { dateRange?: { from: string; to: string }; maxCloudCover?: number; limit?: number }
  ): Promise<SatelliteMetadataResult> {
    const policy = getIntegrationPolicySync();
    if (policy.satellite_metadata_provider === 'none') {
      return {
        granules: [],
        total_results: 0,
        provider: 'none',
        query_bbox: bbox,
        status: 'not_configured',
        message: 'Satellite metadata provider disabled by institutional integration policy.',
        retrieved_at: new Date().toISOString(),
      };
    }

    return this.copernicusProvider.searchImageryMetadata(bbox, options);
  }

  /**
   * Dynamically resolve Bhuvan layers for a case or project jurisdiction.
   * Completely data-driven with ZERO hardcoded state branching.
   */
  resolveBhuvanLayers(context: BhuvanLayerContext): BhuvanResolutionResult {
    return this.bhuvanProvider.resolveLayers(context);
  }

  /**
   * Get full data-driven Bhuvan layer catalogue
   */
  getBhuvanCatalogue() {
    return this.bhuvanProvider.getAvailableLayers();
  }

  /**
   * Fast health probe for Bhuvan WMS
   */
  async getBhuvanHealth() {
    return this.bhuvanProvider.getHealth();
  }
}

export const satelliteService = new SatelliteService();

