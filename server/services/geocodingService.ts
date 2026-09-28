import { NormalizedGeocodeResult, NormalizedLocationResult } from '../../shared/types';

export interface IGeocodingProvider {
  name: string;
  forwardGeocode(query: string, options?: { limit?: number; countryCodes?: string }): Promise<NormalizedGeocodeResult[]>;
  reverseGeocode(latitude: number, longitude: number): Promise<NormalizedLocationResult | null>;
}

// In-memory query cache with TTL (24 hours) to respect provider usage policies
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const geocodeCache = new Map<string, CacheEntry<NormalizedGeocodeResult[]>>();
const reverseCache = new Map<string, CacheEntry<NormalizedLocationResult | null>>();

// Rate-limiting throttle state: max 1 request per second for Nominatim compliance
let lastNominatimRequestTime = 0;
const NOMINATIM_MIN_INTERVAL_MS = 1000;

async function throttleNominatim(): Promise<void> {
  const now = Date.now();
  const timeSinceLast = now - lastNominatimRequestTime;
  if (timeSinceLast < NOMINATIM_MIN_INTERVAL_MS) {
    const waitTime = NOMINATIM_MIN_INTERVAL_MS - timeSinceLast;
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }
  lastNominatimRequestTime = Date.now();
}

/**
 * OpenStreetMap Nominatim Provider Implementation
 * Follows Nominatim Usage Policy: https://operations.osmfoundation.org/policies/nominatim/
 */
export class NominatimProvider implements IGeocodingProvider {
  name = 'OpenStreetMap Nominatim';
  private userAgent = 'BhoomiDarpan-LandAcquisition/1.0 (contact: admin@bhoomidarpan.gov.in)';
  private baseUrl = 'https://nominatim.openstreetmap.org';
  private timeoutMs = 5000;

  async forwardGeocode(query: string, options?: { limit?: number; countryCodes?: string }): Promise<NormalizedGeocodeResult[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const cacheKey = `fwd:${trimmed}:${options?.limit || 5}:${options?.countryCodes || 'in'}`;
    const cached = geocodeCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    await throttleNominatim();

    const limit = Math.min(Math.max(options?.limit || 5, 1), 10);
    const countryCodes = (options?.countryCodes || 'in').replace(/[^a-z,]/gi, '').toLowerCase() || 'in';
    const url = `${this.baseUrl}/search?format=json&addressdetails=1&q=${encodeURIComponent(trimmed)}&limit=${limit}&countrycodes=${countryCodes}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        if (res.status === 429) {
          throw new Error('Nominatim geocoding rate limit exceeded. Please retry shortly.');
        }
        throw new Error(`Nominatim error: HTTP ${res.status} ${res.statusText}`);
      }

      const rawItems = (await res.json()) as any[];
      if (!Array.isArray(rawItems)) {
        return [];
      }

      const normalized: NormalizedGeocodeResult[] = rawItems.slice(0, limit).map((item): NormalizedGeocodeResult | null => {
        if (!item || typeof item !== 'object') return null;
        const lat = parseFloat(item.lat);
        const lon = parseFloat(item.lon);
        const addr = item.address || {};

        return {
          latitude: isNaN(lat) ? 0 : lat,
          longitude: isNaN(lon) ? 0 : lon,
          display_name: item.display_name || trimmed,
          state: addr.state || addr.state_district,
          district: addr.state_district || addr.county || addr.district,
          sub_district: addr.subdistrict || addr.taluk || addr.tehsil,
          locality: addr.village || addr.town || addr.city || addr.suburb,
          boundingbox: Array.isArray(item.boundingbox) && item.boundingbox.length === 4
            ? ([
                parseFloat(item.boundingbox[0]),
                parseFloat(item.boundingbox[1]),
                parseFloat(item.boundingbox[2]),
                parseFloat(item.boundingbox[3]),
              ] as [number, number, number, number])
            : undefined,
          provider: this.name,
          retrieved_at: new Date().toISOString(),
        };
      }).filter((item): item is NormalizedGeocodeResult =>
        item !== null &&
        Number.isFinite(item.latitude) &&
        Number.isFinite(item.longitude) &&
        item.latitude >= -90 &&
        item.latitude <= 90 &&
        item.longitude >= -180 &&
        item.longitude <= 180
      );

      // Cache result
      geocodeCache.set(cacheKey, {
        data: normalized,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });

      return normalized;
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error('Geocoding request timed out after 5 seconds.');
      }
      throw err;
    }
  }

  async reverseGeocode(latitude: number, longitude: number): Promise<NormalizedLocationResult | null> {
    // Statutory coordinate bounds checking (WGS-84)
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      throw new Error(`Coordinates [${latitude}, ${longitude}] violate statutory WGS-84 coordinate limits.`);
    }

    const cacheKey = `rev:${latitude.toFixed(5)}:${longitude.toFixed(5)}`;
    const cached = reverseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    await throttleNominatim();

    const url = `${this.baseUrl}/reverse?format=json&addressdetails=1&lat=${latitude}&lon=${longitude}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        if (res.status === 429) {
          throw new Error('Nominatim geocoding rate limit exceeded. Please retry shortly.');
        }
        throw new Error(`Nominatim reverse geocode error: HTTP ${res.status} ${res.statusText}`);
      }

      const item = (await res.json()) as any;
      if (!item || typeof item !== 'object' || !item.lat || !item.lon) {
        return null;
      }
      const parsedLat = parseFloat(item.lat);
      const parsedLon = parseFloat(item.lon);
      if (
        !Number.isFinite(parsedLat) ||
        !Number.isFinite(parsedLon) ||
        parsedLat < -90 ||
        parsedLat > 90 ||
        parsedLon < -180 ||
        parsedLon > 180
      ) {
        return null;
      }

      const addr = item.address || {};
      const normalized: NormalizedLocationResult = {
        latitude: parsedLat,
        longitude: parsedLon,
        display_name: item.display_name || `${latitude}, ${longitude}`,
        state: addr.state || addr.state_district,
        district: addr.state_district || addr.county || addr.district,
        sub_district: addr.subdistrict || addr.taluk || addr.tehsil,
        locality: addr.village || addr.town || addr.city || addr.suburb,
        postcode: addr.postcode,
        provider: this.name,
        retrieved_at: new Date().toISOString(),
      };

      reverseCache.set(cacheKey, {
        data: normalized,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });

      return normalized;
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error('Reverse geocoding request timed out after 5 seconds.');
      }
      throw err;
    }
  }
}

import { getIntegrationPolicySync } from './policyEngine';

/**
 * Google Maps Geocoding Provider Implementation
 * Uses Google Maps Geocoding API for high-precision address lookups.
 * Requires GOOGLE_MAPS_API_KEY. Gracefully falls back to Nominatim when unconfigured or on error.
 */
export class GoogleGeocodingProvider implements IGeocodingProvider {
  name = 'Google Maps Geocoding';
  private baseUrl = 'https://maps.googleapis.com/maps/api/geocode/json';
  private fallbackProvider = new NominatimProvider();
  private timeoutMs = 6000;

  async forwardGeocode(query: string, options?: { limit?: number; countryCodes?: string }): Promise<NormalizedGeocodeResult[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      const results = await this.fallbackProvider.forwardGeocode(query, options);
      return results.map(r => ({
        ...r,
        provider: `${r.provider} (Google fallback: unconfigured)`,
      }));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const countryParam = options?.countryCodes ? `&components=country:${options.countryCodes}` : '&components=country:in';
      const url = `${this.baseUrl}?address=${encodeURIComponent(trimmed)}${countryParam}&key=${apiKey}`;

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (!res.ok) {
        console.warn(`[GoogleGeocodingProvider] HTTP ${res.status}: falling back to Nominatim`);
        return this.fallbackProvider.forwardGeocode(query, options);
      }

      const data = (await res.json()) as any;
      if (!data || typeof data !== 'object' || data.status !== 'OK' || !Array.isArray(data.results)) {
        if (data.status === 'ZERO_RESULTS') return [];
        console.warn(`[GoogleGeocodingProvider] Status ${data.status}: falling back to Nominatim`);
        return this.fallbackProvider.forwardGeocode(query, options);
      }

      const limit = options?.limit || 5;
      const normalized: NormalizedGeocodeResult[] = data.results.slice(0, limit).map((item: any) => {
        let state: string | undefined;
        let district: string | undefined;
        let subDistrict: string | undefined;
        let locality: string | undefined;

        if (Array.isArray(item.address_components)) {
          for (const comp of item.address_components) {
            const types = comp.types as string[];
            if (types.includes('administrative_area_level_1')) state = comp.long_name;
            if (types.includes('administrative_area_level_2')) district = comp.long_name;
            if (types.includes('administrative_area_level_3')) subDistrict = comp.long_name;
            if (types.includes('locality') || types.includes('sublocality')) locality = comp.long_name;
          }
        }

        const lat = item.geometry?.location?.lat;
        const lng = item.geometry?.location?.lng;
        if (
          typeof lat !== 'number' ||
          typeof lng !== 'number' ||
          !Number.isFinite(lat) ||
          !Number.isFinite(lng) ||
          lat < -90 ||
          lat > 90 ||
          lng < -180 ||
          lng > 180
        ) {
          return null;
        }

        let boundingbox: [number, number, number, number] | undefined;
        if (item.geometry?.viewport) {
          const vp = item.geometry.viewport;
          boundingbox = [vp.southwest.lat, vp.northeast.lat, vp.southwest.lng, vp.northeast.lng];
        }

        return {
          latitude: lat,
          longitude: lng,
          display_name: item.formatted_address || trimmed,
          state,
          district,
          sub_district: subDistrict,
          locality,
          boundingbox,
          provider: this.name,
          retrieved_at: new Date().toISOString(),
        };
      }).filter((item: NormalizedGeocodeResult | null): item is NormalizedGeocodeResult => item !== null);

      return normalized;
    } catch (err: any) {
      clearTimeout(timer);
      console.warn(`[GoogleGeocodingProvider] Error: ${err.message}. Falling back to Nominatim.`);
      return this.fallbackProvider.forwardGeocode(query, options);
    }
  }

  async reverseGeocode(latitude: number, longitude: number): Promise<NormalizedLocationResult | null> {
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      throw new Error(`Coordinates [${latitude}, ${longitude}] violate statutory WGS-84 coordinate limits.`);
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      const res = await this.fallbackProvider.reverseGeocode(latitude, longitude);
      if (res) {
        return {
          ...res,
          provider: `${res.provider} (Google fallback: unconfigured)`,
        };
      }
      return null;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const url = `${this.baseUrl}?latlng=${latitude},${longitude}&key=${apiKey}`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (!res.ok) {
        return this.fallbackProvider.reverseGeocode(latitude, longitude);
      }

      const data = (await res.json()) as any;
      if (!data || typeof data !== 'object' || data.status !== 'OK' || !Array.isArray(data.results) || data.results.length === 0) {
        return this.fallbackProvider.reverseGeocode(latitude, longitude);
      }

      const item = data.results[0];
      let state: string | undefined;
      let district: string | undefined;
      let subDistrict: string | undefined;
      let locality: string | undefined;
      let postcode: string | undefined;

      if (Array.isArray(item.address_components)) {
        for (const comp of item.address_components) {
          const types = comp.types as string[];
          if (types.includes('administrative_area_level_1')) state = comp.long_name;
          if (types.includes('administrative_area_level_2')) district = comp.long_name;
          if (types.includes('administrative_area_level_3')) subDistrict = comp.long_name;
          if (types.includes('locality') || types.includes('sublocality')) locality = comp.long_name;
          if (types.includes('postal_code')) postcode = comp.long_name;
        }
      }

      return {
        latitude,
        longitude,
        display_name: item.formatted_address || `${latitude}, ${longitude}`,
        state,
        district,
        sub_district: subDistrict,
        locality,
        postcode,
        provider: this.name,
        retrieved_at: new Date().toISOString(),
      };
    } catch (err: any) {
      clearTimeout(timer);
      return this.fallbackProvider.reverseGeocode(latitude, longitude);
    }
  }
}

/**
 * Global Geocoding Service Adapter
 * Pluggable architecture governed by statutory IntegrationPolicy, supporting seamless
 * provider selection (Nominatim, Google Maps) with capability-downgrade fallback.
 */
class GeocodingService {
  private nominatimProvider: IGeocodingProvider = new NominatimProvider();
  private googleProvider: IGeocodingProvider = new GoogleGeocodingProvider();
  private customProvider?: IGeocodingProvider;

  setProvider(provider: IGeocodingProvider) {
    this.customProvider = provider;
  }

  resetProvider() {
    this.customProvider = undefined;
  }

  private resolveActiveProvider(): IGeocodingProvider {
    if (this.customProvider) {
      return this.customProvider;
    }
    const policy = getIntegrationPolicySync();
    if (policy.geocoding_provider === 'google_geocoding') {
      return this.googleProvider;
    }
    return this.nominatimProvider;
  }

  getProviderName(): string {
    return this.resolveActiveProvider().name;
  }

  async forwardGeocode(query: string, options?: { limit?: number; countryCodes?: string }): Promise<NormalizedGeocodeResult[]> {
    return this.resolveActiveProvider().forwardGeocode(query, options);
  }

  async reverseGeocode(latitude: number, longitude: number): Promise<NormalizedLocationResult | null> {
    return this.resolveActiveProvider().reverseGeocode(latitude, longitude);
  }
}

export const geocodingService = new GeocodingService();
