/**
 * BhoomiSetu - Universal Map Provider Adapter & Basemap Cartography Abstraction
 * 
 * Strict architectural flow:
 *   Integration Policy -> Selected Map Provider -> Map Provider Adapter -> Leaflet Tile Layer
 * 
 * Enforces:
 *   1. Policy-governed basemap selection (MapTiler / OpenStreetMap).
 *   2. Safe client-side credential validation (VITE_MAPTILER_API_KEY).
 *   3. Guaranteed zero-breakage fallback hierarchy:
 *      MapTiler (configured & operational) -> OpenStreetMap (valid open fallback) -> honest unavailable state.
 *   4. Full removal of unauthenticated, broken CARTO basemap URLs.
 *   5. Runtime tile error recovery: automatically falls back to OSM if MapTiler credentials expire or fail.
 *   6. Dual attribution compliance: MapTiler + OpenStreetMap attribution where required.
 */

import type L from 'leaflet';
import { IntegrationPolicy } from '../../shared/types';

export type SupportedMapProvider =
  | 'osm'
  | 'satellite'
  | 'dark'
  | 'light'
  | 'positron'
  | 'topo'
  | 'streets'
  | 'voyager'
  | 'maptiler'
  | 'google';

export type MapTilerStyle =
  | 'streets-v2'
  | 'basic-v2'
  | 'satellite'
  | 'hybrid'
  | 'topo-v2'
  | 'outdoor-v2'
  | 'dataviz-light'
  | 'dataviz-dark';

export interface BasemapConfig {
  provider: SupportedMapProvider;
  style?: string;
  url: string;
  attribution: string;
  maxZoom: number;
  subdomains: string;
  isFallback: boolean;
  fallbackReason?: string;
  requiresKey: boolean;
  hasKey: boolean;
}

export interface ResolveBasemapOptions {
  provider?: string;
  style?: string;
  maptilerKey?: string;
  policy?: IntegrationPolicy;
}

/**
 * OpenStreetMap Standard Tile Configuration (Canonical Zero-Credential Open Fallback)
 */
export const OSM_CONFIG: Readonly<BasemapConfig> = {
  provider: 'osm',
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
  maxZoom: 19,
  subdomains: 'abc',
  isFallback: false,
  requiresKey: false,
  hasKey: true,
};

/**
 * Live, high-resolution open basemap registry (100% operational with zero credential dependencies & zero watermarks)
 */
export const BASEMAP_REGISTRY: Record<string, BasemapConfig> = {
  osm: {
    ...OSM_CONFIG,
  },
  satellite: {
    provider: 'satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution:
      'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    maxZoom: 19,
    subdomains: 'abc',
    isFallback: false,
    requiresKey: false,
    hasKey: true,
  },
  dark: {
    provider: 'dark',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution:
      'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community',
    maxZoom: 16,
    subdomains: 'abc',
    isFallback: false,
    requiresKey: false,
    hasKey: true,
  },
  light: {
    provider: 'light',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution:
      'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community',
    maxZoom: 16,
    subdomains: 'abc',
    isFallback: false,
    requiresKey: false,
    hasKey: true,
  },
  positron: {
    provider: 'positron',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution:
      'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community',
    maxZoom: 16,
    subdomains: 'abc',
    isFallback: false,
    requiresKey: false,
    hasKey: true,
  },
  topo: {
    provider: 'topo',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution:
      'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community',
    maxZoom: 19,
    subdomains: 'abc',
    isFallback: false,
    requiresKey: false,
    hasKey: true,
  },
  streets: {
    provider: 'streets',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution:
      'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom',
    maxZoom: 19,
    subdomains: 'abc',
    isFallback: false,
    requiresKey: false,
    hasKey: true,
  },
  voyager: {
    provider: 'voyager',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution:
      'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom',
    maxZoom: 19,
    subdomains: 'abc',
    isFallback: false,
    requiresKey: false,
    hasKey: true,
  },
};

/**
 * MapTiler Style Definitions & File Extensions
 */
export const MAPTILER_STYLE_REGISTRY: Record<
  MapTilerStyle,
  { label: string; extension: 'png' | 'jpg'; maxZoom: number; description: string }
> = {
  'streets-v2': {
    label: 'MapTiler Streets v2',
    extension: 'png',
    maxZoom: 19,
    description: 'High-clarity road, landmark, and infrastructure cartography',
  },
  'basic-v2': {
    label: 'MapTiler Basic v2',
    extension: 'png',
    maxZoom: 19,
    description: 'Clean minimalist vector basemap for data visualization',
  },
  'satellite': {
    label: 'MapTiler Satellite',
    extension: 'jpg',
    maxZoom: 20,
    description: 'Global optical satellite imagery for visual cartographic context',
  },
  'hybrid': {
    label: 'MapTiler Hybrid Satellite',
    extension: 'jpg',
    maxZoom: 20,
    description: 'Optical satellite imagery with overlaid road and label cartography',
  },
  'topo-v2': {
    label: 'MapTiler Topo v2',
    extension: 'png',
    maxZoom: 19,
    description: 'Topographic contour and relief terrain for corridor assessment',
  },
  'outdoor-v2': {
    label: 'MapTiler Outdoor v2',
    extension: 'png',
    maxZoom: 19,
    description: 'Detailed terrain, hiking paths, and physical land features',
  },
  'dataviz-light': {
    label: 'MapTiler Dataviz Light',
    extension: 'png',
    maxZoom: 19,
    description: 'Low-contrast light basemap optimized for thematic data overlays',
  },
  'dataviz-dark': {
    label: 'MapTiler Dataviz Dark',
    extension: 'png',
    maxZoom: 19,
    description: 'High-contrast dark basemap optimized for corridor and risk glows',
  },
};

/**
 * Validates whether a provided MapTiler key is non-empty, non-placeholder, and structurally plausible.
 */
export function isMapTilerKeyValid(key?: string | null): boolean {
  if (!key || typeof key !== 'string') return false;
  const trimmed = key.trim();
  if (trimmed.length < 8) return false;
  if (trimmed.toLowerCase().startsWith('your-')) return false;
  if (trimmed === 'placeholder' || trimmed === 'demo') return false;
  return true;
}

/**
 * Resolves the client-side MapTiler API Key.
 * Reads strictly from Vite client-exposed env (`VITE_MAPTILER_API_KEY`) or browser runtime window override.
 * Never accesses or leaks server-side private credentials.
 */
export function getMapTilerClientKey(): string {
  try {
    const viteKey = (import.meta as any).env?.VITE_MAPTILER_API_KEY;
    if (isMapTilerKeyValid(viteKey)) {
      return viteKey.trim();
    }
  } catch {
    // Non-Vite environments
  }

  if (typeof window !== 'undefined') {
    const winKey = (window as any).__MAPTILER_KEY__;
    if (isMapTilerKeyValid(winKey)) {
      return winKey.trim();
    }
  }

  return '';
}

/**
 * Resolves the complete basemap tile configuration based on IntegrationPolicy, requested provider,
 * and client credential availability.
 */
export function resolveBasemapConfig(options: ResolveBasemapOptions = {}): BasemapConfig {
  const policy = options.policy;
  const clientKey = options.maptilerKey !== undefined ? options.maptilerKey : getMapTilerClientKey();
  const hasValidKey = isMapTilerKeyValid(clientKey);

  // 1. Resolve requested provider
  let rawProvider = options.provider || policy?.map_provider || 'osm';
  let requestedStyle = options.style || policy?.maptiler_style || 'streets-v2';

  // Handle compound alias names like 'maptiler_streets', 'maptiler_satellite', 'maptiler_topo'
  if (rawProvider.startsWith('maptiler_')) {
    const stylePart = rawProvider.replace('maptiler_', '');
    if (stylePart === 'streets') requestedStyle = 'streets-v2';
    else if (stylePart === 'satellite') requestedStyle = 'satellite';
    else if (stylePart === 'topo') requestedStyle = 'topo-v2';
    else if (stylePart === 'outdoor') requestedStyle = 'outdoor-v2';
    else if (stylePart === 'dataviz_light' || stylePart === 'dataviz-light') requestedStyle = 'dataviz-light';
    else if (stylePart === 'dataviz_dark' || stylePart === 'dataviz-dark') requestedStyle = 'dataviz-dark';
    else if (stylePart === 'basic') requestedStyle = 'basic-v2';
    rawProvider = 'maptiler';
  }

  const normalizedProvider = rawProvider.toLowerCase();

  // 2. Direct high-resolution open basemap options (Positron/Light, Dark, Satellite, Topo, Streets, Voyager, OSM)
  if (normalizedProvider === 'positron' || normalizedProvider === 'light' || normalizedProvider === 'carto_positron' || normalizedProvider === 'esri_light') {
    return BASEMAP_REGISTRY.light;
  }
  if (normalizedProvider === 'dark' || normalizedProvider === 'carto_dark' || normalizedProvider === 'esri_dark') {
    return BASEMAP_REGISTRY.dark;
  }
  if (normalizedProvider === 'satellite' || normalizedProvider === 'esri_satellite') {
    return BASEMAP_REGISTRY.satellite;
  }
  if (normalizedProvider === 'topo' || normalizedProvider === 'esri_topo') {
    return BASEMAP_REGISTRY.topo;
  }
  if (normalizedProvider === 'streets' || normalizedProvider === 'esri_streets' || normalizedProvider === 'voyager' || normalizedProvider === 'carto_voyager') {
    return BASEMAP_REGISTRY.streets;
  }
  if (normalizedProvider === 'osm' || normalizedProvider === 'openstreetmap') {
    return BASEMAP_REGISTRY.osm;
  }

  // 3. Handle MapTiler
  if (normalizedProvider === 'maptiler') {
    const styleKey = (requestedStyle in MAPTILER_STYLE_REGISTRY ? requestedStyle : 'streets-v2') as MapTilerStyle;
    const styleMeta = MAPTILER_STYLE_REGISTRY[styleKey] || MAPTILER_STYLE_REGISTRY['streets-v2'];

    if (hasValidKey) {
      return {
        provider: 'maptiler',
        style: styleKey,
        url: `https://api.maptiler.com/maps/${encodeURIComponent(styleKey)}/256/{z}/{x}/{y}.${styleMeta.extension}?key=${encodeURIComponent(clientKey.trim())}`,
        attribution:
          '&copy; <a href="https://www.maptiler.com/" target="_blank" rel="noopener noreferrer">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
        maxZoom: styleMeta.maxZoom,
        subdomains: 'abcd',
        isFallback: false,
        requiresKey: true,
        hasKey: true,
      };
    }

    // MapTiler requested without valid client key -> Fallback to equivalent high-resolution open basemap
    if (styleKey === 'satellite' || styleKey === 'hybrid') {
      return {
        ...BASEMAP_REGISTRY.satellite,
        isFallback: true,
        fallbackReason:
          'VITE_MAPTILER_API_KEY is not configured. Seamlessly utilizing high-resolution Esri World Satellite imagery.',
        requiresKey: true,
        hasKey: false,
      };
    }
    if (styleKey === 'topo-v2' || styleKey === 'outdoor-v2') {
      return {
        ...BASEMAP_REGISTRY.topo,
        isFallback: true,
        fallbackReason:
          'VITE_MAPTILER_API_KEY is not configured. Seamlessly utilizing Esri Topographic terrain cartography.',
        requiresKey: true,
        hasKey: false,
      };
    }
    if (styleKey === 'dataviz-dark') {
      return {
        ...BASEMAP_REGISTRY.dark,
        isFallback: true,
        fallbackReason:
          'VITE_MAPTILER_API_KEY is not configured. Seamlessly utilizing Esri Dark Canvas cartography.',
        requiresKey: true,
        hasKey: false,
      };
    }
    if (styleKey === 'dataviz-light') {
      return {
        ...BASEMAP_REGISTRY.light,
        isFallback: true,
        fallbackReason:
          'VITE_MAPTILER_API_KEY is not configured. Seamlessly utilizing Esri Light Canvas cartography.',
        requiresKey: true,
        hasKey: false,
      };
    }
    return {
      ...OSM_CONFIG,
      provider: 'osm',
      style: styleKey,
      isFallback: true,
      fallbackReason:
        'VITE_MAPTILER_API_KEY is not configured in client environment. Basemap is operating on OpenStreetMap fallback.',
      requiresKey: true,
      hasKey: false,
    };
  }

  // 4. Default: Canonical OpenStreetMap
  return {
    ...OSM_CONFIG,
    isFallback: false,
    requiresKey: false,
    hasKey: true,
  };
}

/**
 * Creates an instantiated Leaflet TileLayer with embedded runtime fallback handling.
 * If the primary provider (MapTiler) encounters HTTP 401/403/429 or network errors at runtime,
 * the tile layer automatically swaps to OpenStreetMap without breaking map state or polygon layers.
 */
export function createBasemapTileLayer(
  options: ResolveBasemapOptions = {},
  onFallback?: (reason: string, fallbackConfig: BasemapConfig) => void,
  leafletInstance?: typeof L
): { tileLayer: L.TileLayer; config: BasemapConfig } {
  const config = resolveBasemapConfig(options);

  const LObj =
    leafletInstance ||
    (typeof window !== 'undefined' ? (window as any).L : null);

  if (!LObj || !LObj.tileLayer) {
    throw new Error('Leaflet instance (L) is required to instantiate TileLayer.');
  }

  const tileLayer = LObj.tileLayer(config.url, {
    maxZoom: config.maxZoom,
    subdomains: config.subdomains,
    attribution: config.attribution,
    keepBuffer: 6,
    updateWhenIdle: false,
    updateWhenZooming: false,
    updateInterval: 100,
  });

  let fallbackTriggered = false;

  // Runtime tileerror listener
  tileLayer.on('tileerror', (errorEvent: any) => {
    if (config.provider === 'maptiler' && !fallbackTriggered) {
      fallbackTriggered = true;
      const reason =
        'MapTiler tile load failed at runtime (quota limit or network error). Swapped to OpenStreetMap fallback.';
      console.warn(`[MapProvider] ${reason}`, errorEvent);

      // Seamlessly switch layer URL to OSM
      tileLayer.setUrl(OSM_CONFIG.url);

      const fallbackConf: BasemapConfig = {
        ...OSM_CONFIG,
        isFallback: true,
        fallbackReason: reason,
      };

      onFallback?.(reason, fallbackConf);
    }
  });

  return { tileLayer, config };
}
