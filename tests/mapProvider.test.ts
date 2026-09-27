import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveBasemapConfig,
  createBasemapTileLayer,
  isMapTilerKeyValid,
  OSM_CONFIG,
  MAPTILER_STYLE_REGISTRY,
} from '../src/lib/mapProvider';
import { IntegrationPolicy } from '../shared/types';

describe('Map Provider Adapter & Basemap Cartography Abstraction Suite', () => {
  const TEST_VALID_KEY = 'maptiler_test_valid_key_12345';
  const TEST_PLACEHOLDER_KEYS = [
    '',
    '   ',
    'your-api-key',
    'your-maptiler-key',
    'placeholder',
    'demo',
    'short',
  ];

  // ==========================================================================
  // 1. CREDENTIAL VALIDATION
  // ==========================================================================
  describe('1. MapTiler Key Structural Validation', () => {
    it('identifies valid MapTiler keys accurately', () => {
      expect(isMapTilerKeyValid(TEST_VALID_KEY)).toBe(true);
      expect(isMapTilerKeyValid('pk.ey1234567890abcdef')).toBe(true);
    });

    it('strictly rejects placeholder, empty, or deficient keys', () => {
      for (const key of TEST_PLACEHOLDER_KEYS) {
        expect(isMapTilerKeyValid(key)).toBe(false);
      }
      expect(isMapTilerKeyValid(null as any)).toBe(false);
      expect(isMapTilerKeyValid(undefined)).toBe(false);
    });
  });

  // ==========================================================================
  // 2. OPENSTREETMAP (CANONICAL ZERO-CREDENTIAL FALLBACK)
  // ==========================================================================
  describe('2. Canonical OpenStreetMap Resolution', () => {
    it('resolves standard OSM when requested explicitly', () => {
      const config = resolveBasemapConfig({ provider: 'osm' });
      expect(config.provider).toBe('osm');
      expect(config.url).toBe(OSM_CONFIG.url);
      expect(config.url).toContain('tile.openstreetmap.org/{z}/{x}/{y}.png');
      expect(config.attribution).toContain('OpenStreetMap');
      expect(config.isFallback).toBe(false);
      expect(config.maxZoom).toBe(19);
    });

    it('resolves standard OSM by default when no provider or policy is given', () => {
      const config = resolveBasemapConfig({});
      expect(config.provider).toBe('osm');
      expect(config.url).toBe(OSM_CONFIG.url);
      expect(config.isFallback).toBe(false);
    });
  });

  // ==========================================================================
  // 3. MAPTILER RESOLUTION WITH OPERATIONAL CREDENTIALS
  // ==========================================================================
  describe('3. MapTiler Resolution (Configured & Operational)', () => {
    it('resolves MapTiler Streets v2 with valid key', () => {
      const config = resolveBasemapConfig({
        provider: 'maptiler',
        style: 'streets-v2',
        maptilerKey: TEST_VALID_KEY,
      });

      expect(config.provider).toBe('maptiler');
      expect(config.style).toBe('streets-v2');
      expect(config.isFallback).toBe(false);
      expect(config.url).toContain('https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=');
      expect(config.url).toContain(encodeURIComponent(TEST_VALID_KEY));
      expect(config.attribution).toContain('MapTiler');
      expect(config.attribution).toContain('OpenStreetMap contributors');
      expect(config.maxZoom).toBe(19);
    });

    it('resolves MapTiler Satellite imagery with .jpg extension and zoom 20', () => {
      const config = resolveBasemapConfig({
        provider: 'maptiler',
        style: 'satellite',
        maptilerKey: TEST_VALID_KEY,
      });

      expect(config.provider).toBe('maptiler');
      expect(config.style).toBe('satellite');
      expect(config.url).toContain('satellite/256/{z}/{x}/{y}.jpg');
      expect(config.maxZoom).toBe(20);
    });

    it('resolves MapTiler Topographic (Topo v2) with terrain contours', () => {
      const config = resolveBasemapConfig({
        provider: 'maptiler',
        style: 'topo-v2',
        maptilerKey: TEST_VALID_KEY,
      });

      expect(config.provider).toBe('maptiler');
      expect(config.style).toBe('topo-v2');
      expect(config.url).toContain('topo-v2/256/{z}/{x}/{y}.png');
    });

    it('handles compound aliases like "maptiler_streets", "maptiler_satellite", "maptiler_topo"', () => {
      const streets = resolveBasemapConfig({ provider: 'maptiler_streets', maptilerKey: TEST_VALID_KEY });
      expect(streets.provider).toBe('maptiler');
      expect(streets.style).toBe('streets-v2');

      const satellite = resolveBasemapConfig({ provider: 'maptiler_satellite', maptilerKey: TEST_VALID_KEY });
      expect(satellite.provider).toBe('maptiler');
      expect(satellite.style).toBe('satellite');

      const topo = resolveBasemapConfig({ provider: 'maptiler_topo', maptilerKey: TEST_VALID_KEY });
      expect(topo.provider).toBe('maptiler');
      expect(topo.style).toBe('topo-v2');
    });
  });

  // ==========================================================================
  // 4. GUARANTEED UNBREAKABLE FALLBACK WHEN MAPTILER IS UNCONFIGURED
  // ==========================================================================
  describe('4. Graceful Fallback When MapTiler Key Missing or Invalid', () => {
    it('seamlessly falls back to OpenStreetMap when MapTiler key is empty', () => {
      const config = resolveBasemapConfig({
        provider: 'maptiler',
        style: 'streets-v2',
        maptilerKey: '',
      });

      expect(config.provider).toBe('osm');
      expect(config.isFallback).toBe(true);
      expect(config.fallbackReason).toContain('VITE_MAPTILER_API_KEY is not configured');
      expect(config.url).toBe(OSM_CONFIG.url);
      expect(config.attribution).toContain('OpenStreetMap');
      // Must NEVER contain broken Carto or MapTiler keyless URL
      expect(config.url).not.toContain('cartocdn.com');
      expect(config.url).not.toContain('api.maptiler.com');
    });

    it('falls back to OpenStreetMap when key is a placeholder ("your-maptiler-key")', () => {
      const config = resolveBasemapConfig({
        provider: 'maptiler',
        maptilerKey: 'your-maptiler-api-key',
      });

      expect(config.provider).toBe('osm');
      expect(config.isFallback).toBe(true);
      expect(config.url).toBe(OSM_CONFIG.url);
    });
  });

  // ==========================================================================
  // 5. LIVE HIGH-RESOLUTION OPEN BASEMAP RESOLUTION
  // ==========================================================================
  describe('5. High-Resolution Live Open Basemap Resolution', () => {
    it('resolves Carto Positron clean light basemap', () => {
      const config = resolveBasemapConfig({ provider: 'positron' });
      expect(config.provider).toBe('positron');
      expect(config.isFallback).toBe(false);
      expect(config.url).toContain('basemaps.cartocdn.com/light_all');
      expect(config.attribution).toContain('CARTO');
    });

    it('resolves Carto Dark Matter basemap', () => {
      const config = resolveBasemapConfig({ provider: 'dark' });
      expect(config.provider).toBe('dark');
      expect(config.isFallback).toBe(false);
      expect(config.url).toContain('basemaps.cartocdn.com/dark_all');
      expect(config.attribution).toContain('CARTO');
    });

    it('resolves Esri World Imagery Satellite basemap', () => {
      const config = resolveBasemapConfig({ provider: 'satellite' });
      expect(config.provider).toBe('satellite');
      expect(config.isFallback).toBe(false);
      expect(config.url).toContain('server.arcgisonline.com/ArcGIS/rest/services/World_Imagery');
      expect(config.attribution).toContain('Esri');
    });

    it('resolves Esri Topographic terrain basemap', () => {
      const config = resolveBasemapConfig({ provider: 'topo' });
      expect(config.provider).toBe('topo');
      expect(config.isFallback).toBe(false);
      expect(config.url).toContain('server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map');
      expect(config.attribution).toContain('Esri');
    });

    it('resolves Carto Voyager detailed roads basemap', () => {
      const config = resolveBasemapConfig({ provider: 'voyager' });
      expect(config.provider).toBe('voyager');
      expect(config.isFallback).toBe(false);
      expect(config.url).toContain('basemaps.cartocdn.com/rastertiles/voyager');
    });
  });

  // ==========================================================================
  // 6. INTEGRATION POLICY GOVERNANCE
  // ==========================================================================
  describe('6. Policy-Governed Basemap Provider Selection', () => {
    it('uses IntegrationPolicy.map_provider when no explicit provider is given', () => {
      const policy: IntegrationPolicy = {
        routing_provider: 'osrm',
        geocoding_provider: 'nominatim',
        map_provider: 'maptiler',
        maptiler_style: 'topo-v2',
        satellite_layer_provider: 'bhuvan',
        satellite_metadata_provider: 'copernicus',
        translation_provider: 'bhashini',
        ocr_provider: 'gemini',
      };

      const configWithKey = resolveBasemapConfig({ policy, maptilerKey: TEST_VALID_KEY });
      expect(configWithKey.provider).toBe('maptiler');
      expect(configWithKey.style).toBe('topo-v2');

      const configWithoutKey = resolveBasemapConfig({ policy, maptilerKey: '' });
      expect(configWithoutKey.isFallback).toBe(true);
    });

    it('defaults to OSM when IntegrationPolicy.map_provider is "osm"', () => {
      const policy: IntegrationPolicy = {
        routing_provider: 'osrm',
        geocoding_provider: 'nominatim',
        map_provider: 'osm',
        satellite_layer_provider: 'bhuvan',
        satellite_metadata_provider: 'copernicus',
        translation_provider: 'bhashini',
        ocr_provider: 'gemini',
      };

      const config = resolveBasemapConfig({ policy, maptilerKey: TEST_VALID_KEY });
      expect(config.provider).toBe('osm');
      expect(config.isFallback).toBe(false);
      expect(config.url).toBe(OSM_CONFIG.url);
    });
  });

  // ==========================================================================
  // 7. SECURITY & ZERO CREDENTIAL LEAKAGE
  // ==========================================================================
  describe('7. Security & Zero Credential Leakage', () => {
    it('never leaks API key in fallback config or error messages', () => {
      const config = resolveBasemapConfig({
        provider: 'maptiler',
        maptilerKey: '',
      });

      expect(config.fallbackReason).not.toContain('key=');
      expect(config.url).not.toContain('key=');
    });

    it('dual attribution is always compliant for MapTiler (MapTiler + OSM)', () => {
      const config = resolveBasemapConfig({
        provider: 'maptiler',
        maptilerKey: TEST_VALID_KEY,
      });

      expect(config.attribution).toContain('https://www.maptiler.com/');
      expect(config.attribution).toContain('https://www.openstreetmap.org/copyright');
    });
  });

  // ==========================================================================
  // 8. RUNTIME TILE ERROR RESILIENCE (LEAFLET ADAPTER FALLBACK)
  // ==========================================================================
  describe('8. Runtime Tile Error Fallback Handling', () => {
    it('creates Leaflet TileLayer and registers error listener that swaps to OSM', () => {
      let registeredErrorHandler: ((err: any) => void) | null = null;
      let updatedUrl: string | null = null;

      const mockTileLayer = {
        on: (event: string, handler: (err: any) => void) => {
          if (event === 'tileerror') {
            registeredErrorHandler = handler;
          }
        },
        setUrl: (url: string) => {
          updatedUrl = url;
        },
      };

      const mockL = {
        tileLayer: (_url: string, _opts: any) => mockTileLayer,
      };

      let fallbackNotified = false;
      let notifiedReason = '';

      const { tileLayer, config } = createBasemapTileLayer(
        { provider: 'maptiler', maptilerKey: TEST_VALID_KEY },
        (reason, fbConfig) => {
          fallbackNotified = true;
          notifiedReason = reason;
          expect(fbConfig.isFallback).toBe(true);
        },
        mockL as any
      );

      expect(config.provider).toBe('maptiler');
      expect(tileLayer).toBe(mockTileLayer as any);
      expect(registeredErrorHandler).not.toBeNull();

      // Simulate a runtime tile load failure (e.g. MapTiler quota limit or 403)
      registeredErrorHandler!({ error: '403 Forbidden' });

      expect(updatedUrl).toBe(OSM_CONFIG.url);
      expect(fallbackNotified).toBe(true);
      expect(notifiedReason).toContain('MapTiler tile load failed at runtime');
    });
  });
});

