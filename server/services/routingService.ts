import {
  CalculateRouteInput,
  NormalizedRouteResult,
  RouteStep,
  RouteCapabilityTracking,
} from '../../shared/types';
import { getIntegrationPolicySync } from './policyEngine';

export interface IRoutingProvider {
  readonly name: string;
  readonly providerId: string;
  calculateRoute(input: CalculateRouteInput): Promise<NormalizedRouteResult>;
}

// In-memory route cache (10 minutes TTL)
interface CacheEntry {
  data: NormalizedRouteResult;
  expiresAt: number;
}
const CACHE_TTL_MS = 10 * 60 * 1000;
const routeCache = new Map<string, CacheEntry>();

/**
 * Validate WGS-84 coordinates
 */
export function validateCoordinatePoint(lat: number, lng: number, label: string = 'Coordinate'): void {
  if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng) || !isFinite(lat) || !isFinite(lng)) {
    throw new Error(`Invalid ${label}: latitude and longitude must be valid numbers (finite, non-NaN values required).`);
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error(`Invalid ${label} [${lat}, ${lng}]: coordinates violate statutory WGS-84 limits (-90..90 lat, -180..180 lng).`);
  }
}

/**
 * OSRM Routing Provider Implementation
 * Open/public routing engine based on OpenStreetMap road topological graph.
 * Zero credentials required. Subject to OSRM public usage policy.
 * Static topological road distances without live congestion telemetry.
 */
export class OsrmRoutingProvider implements IRoutingProvider {
  readonly name = 'OpenStreetMap OSRM (Topological)';
  readonly providerId = 'osrm';
  private baseUrl = 'https://router.project-osrm.org';
  private timeoutMs = 8000;

  async calculateRoute(input: CalculateRouteInput): Promise<NormalizedRouteResult> {
    validateCoordinatePoint(input.origin.lat, input.origin.lng, 'Origin');
    validateCoordinatePoint(input.destination.lat, input.destination.lng, 'Destination');

    const profile = input.profile === 'walking' ? 'foot' : input.profile === 'cycling' ? 'bicycle' : 'driving';
    const coords = `${input.origin.lng},${input.origin.lat};${input.destination.lng},${input.destination.lat}`;
    const url = `${this.baseUrl}/route/v1/${profile}/${coords}?overview=full&geometries=geojson&steps=true`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'BhoomiDarpan-LandAcquisition/1.0 (contact: admin@bhoomidarpan.gov.in)',
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        if (res.status === 429) {
          throw new Error('OSRM public routing rate limit exceeded. Please retry in a few seconds.');
        }
        throw new Error(`OSRM routing service responded with HTTP ${res.status}: ${res.statusText}`);
      }

      const data = (await res.json()) as any;
      if (!data || typeof data !== 'object' || data.code !== 'Ok' || !Array.isArray(data.routes) || data.routes.length === 0) {
        throw new Error(`OSRM route calculation failed: ${data?.message || 'No route found between coordinates'}`);
      }

      const primaryRoute = data.routes[0];
      if (
        !primaryRoute ||
        typeof primaryRoute !== 'object' ||
        typeof primaryRoute.distance !== 'number' ||
        typeof primaryRoute.duration !== 'number' ||
        !Number.isFinite(primaryRoute.distance) ||
        !Number.isFinite(primaryRoute.duration) ||
        primaryRoute.distance <= 0 ||
        primaryRoute.duration <= 0
      ) {
        throw new Error('OSRM returned malformed route metrics.');
      }

      const distanceMeters = Math.round(primaryRoute.distance);
      const durationSeconds = Math.round(primaryRoute.duration);

      const steps: RouteStep[] = [];
      if (Array.isArray(primaryRoute.legs)) {
        for (const leg of primaryRoute.legs) {
          if (Array.isArray(leg.steps)) {
            for (const step of leg.steps) {
              const instruction = step.maneuver?.type 
                ? `${step.maneuver.type}${step.name ? ' onto ' + step.name : ''}`
                : step.name || 'Proceed along path';
              steps.push({
                instruction,
                distance_meters: Math.round(step.distance || 0),
                duration_seconds: Math.round(step.duration || 0),
              });
            }
          }
        }
      }

      const capabilities: RouteCapabilityTracking = {
        traffic_aware: false,
        toll_info_available: false,
        elevation_profile: false,
        snapped_to_road_network: true,
        fallback_occurred: false,
        lost_capabilities: [],
      };

      return {
        distance_meters: distanceMeters,
        distance_km: Math.round((distanceMeters / 1000) * 100) / 100,
        duration_seconds: durationSeconds,
        duration_minutes: Math.round((durationSeconds / 60) * 10) / 10,
        geometry_geojson: primaryRoute.geometry,
        steps: steps.slice(0, 50),
        provider: this.providerId,
        capabilities,
        attribution: 'Route data © OpenStreetMap contributors, OSRM routing engine (ODbL) - Public service subject to usage policy',
        calculated_at: new Date().toISOString(),
      };
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error('OSRM routing request timed out after 8 seconds.');
      }
      throw err;
    }
  }
}

/**
 * Google Routes Provider Implementation
 * Enterprise traffic-aware routing using Google Maps Platform Compute Routes API.
 * Requires GOOGLE_MAPS_API_KEY.
 * Gracefully degrades to OSRM with explicit capability loss tracking when unconfigured or on failure.
 */
export class GoogleRoutesProvider implements IRoutingProvider {
  readonly name = 'Google Routes (Compute Routes)';
  readonly providerId = 'google_routes';
  private endpoint = 'https://routes.googleapis.com/directions/v2:computeRoutes';
  private timeoutMs = 8000;

  async calculateRoute(input: CalculateRouteInput): Promise<NormalizedRouteResult> {
    validateCoordinatePoint(input.origin.lat, input.origin.lng, 'Origin');
    validateCoordinatePoint(input.destination.lat, input.destination.lng, 'Destination');

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      // Capability-specific fallback to OSRM with lost capability telemetry
      const osrm = new OsrmRoutingProvider();
      const osrmResult = await osrm.calculateRoute(input);
      return {
        ...osrmResult,
        provider: 'osrm',
        capabilities: {
          ...osrmResult.capabilities,
          fallback_occurred: true,
          lost_capabilities: ['traffic_aware', 'live_congestion_estimates', 'toll_pricing'],
        },
        attribution: `${osrmResult.attribution} [Fallback from Google Routes: GOOGLE_MAPS_API_KEY not configured]`,
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const payload = {
        origin: {
          location: {
            latLng: {
              latitude: input.origin.lat,
              longitude: input.origin.lng,
            },
          },
        },
        destination: {
          location: {
            latLng: {
              latitude: input.destination.lat,
              longitude: input.destination.lng,
            },
          },
        },
        travelMode: input.profile === 'walking' ? 'WALK' : input.profile === 'cycling' ? 'BICYCLE' : 'DRIVE',
        routingPreference: input.profile === 'walking' || input.profile === 'cycling' ? undefined : 'TRAFFIC_AWARE',
      };

      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.geoJsonLinestring,routes.legs.steps',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        console.warn(`[GoogleRoutesProvider] HTTP ${res.status}: falling back to OSRM`);
        return this.fallbackToOsrm(input, `HTTP ${res.status} ${res.statusText}`);
      }

      const data = (await res.json()) as any;
      if (!data || typeof data !== 'object' || !Array.isArray(data.routes) || data.routes.length === 0) {
        return this.fallbackToOsrm(input, 'Google Routes returned zero routes');
      }

      const primary = data.routes[0];
      if (!primary || typeof primary !== 'object' || typeof primary.distanceMeters !== 'number' || !Number.isFinite(primary.distanceMeters) || primary.distanceMeters <= 0) {
        return this.fallbackToOsrm(input, 'Google Routes returned malformed route metrics');
      }

      const distanceMeters = primary.distanceMeters;
      // Duration format in Google Routes API is string e.g. "1245s"
      let durationSeconds = 0;
      if (typeof primary.duration === 'string') {
        durationSeconds = parseInt(primary.duration.replace('s', ''), 10) || 0;
      } else if (typeof primary.duration === 'number') {
        durationSeconds = primary.duration;
      }

      const steps: RouteStep[] = [];
      if (Array.isArray(primary.legs)) {
        for (const leg of primary.legs) {
          if (Array.isArray(leg.steps)) {
            for (const step of leg.steps) {
              const instruction = step.navigationInstruction?.instructions || 'Proceed';
              const dist = step.distanceMeters || 0;
              const dur = typeof step.staticDuration === 'string'
                ? parseInt(step.staticDuration.replace('s', ''), 10) || 0
                : 0;
              steps.push({
                instruction,
                distance_meters: dist,
                duration_seconds: dur,
              });
            }
          }
        }
      }

      const capabilities: RouteCapabilityTracking = {
        traffic_aware: true,
        toll_info_available: true,
        elevation_profile: false,
        snapped_to_road_network: true,
        fallback_occurred: false,
        lost_capabilities: [],
      };

      return {
        distance_meters: distanceMeters,
        distance_km: Math.round((distanceMeters / 1000) * 100) / 100,
        duration_seconds: durationSeconds,
        duration_minutes: Math.round((durationSeconds / 60) * 10) / 10,
        geometry_geojson: primary.polyline?.geoJsonLinestring,
        steps: steps.slice(0, 50),
        provider: this.providerId,
        capabilities,
        attribution: 'Map and routing data © Google Maps Platform (Routes API)',
        calculated_at: new Date().toISOString(),
      };
    } catch (err: any) {
      clearTimeout(timer);
      console.warn(`[GoogleRoutesProvider] Network error: ${err.message}. Falling back to OSRM.`);
      return this.fallbackToOsrm(input, err.message);
    }
  }

  private async fallbackToOsrm(input: CalculateRouteInput, reason: string): Promise<NormalizedRouteResult> {
    const osrm = new OsrmRoutingProvider();
    const result = await osrm.calculateRoute(input);
    return {
      ...result,
      provider: 'osrm',
      capabilities: {
        ...result.capabilities,
        fallback_occurred: true,
        lost_capabilities: ['traffic_aware', 'live_congestion_estimates', 'toll_pricing'],
      },
      attribution: `${result.attribution} [Fallback from Google Routes: ${reason}]`,
    };
  }
}

/**
 * Universal Routing Service Manager
 * Governed by statutory IntegrationPolicy. Supports caching, bounds validation, and dynamic provider swapping.
 */
export class RoutingService {
  private osrmProvider = new OsrmRoutingProvider();
  private googleProvider = new GoogleRoutesProvider();

  /**
   * Determine provider instance based on active integration policy
   */
  private getActiveProvider(): IRoutingProvider {
    const policy = getIntegrationPolicySync();
    if (policy.routing_provider === 'google_routes') {
      return this.googleProvider;
    }
    return this.osrmProvider;
  }

  /**
   * Calculate normalized route between two coordinate points
   */
  async calculateRoute(input: CalculateRouteInput): Promise<NormalizedRouteResult> {
    validateCoordinatePoint(input.origin.lat, input.origin.lng, 'Origin');
    validateCoordinatePoint(input.destination.lat, input.destination.lng, 'Destination');

    const profile = input.profile || 'driving';
    const cacheKey = `${input.origin.lat.toFixed(5)},${input.origin.lng.toFixed(5)}->${input.destination.lat.toFixed(5)},${input.destination.lng.toFixed(5)}:${profile}`;

    const cached = routeCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const provider = this.getActiveProvider();
    let result: NormalizedRouteResult;

    try {
      result = await provider.calculateRoute(input);
    } catch (err: any) {
      // If primary provider was not OSRM and failed, attempt fallback to OSRM
      if (provider.providerId !== 'osrm') {
        console.warn(`[RoutingService] Primary provider ${provider.name} failed (${err.message}). Attempting fallback to OSRM.`);
        const fallbackRes = await this.osrmProvider.calculateRoute(input);
        result = {
          ...fallbackRes,
          capabilities: {
            ...fallbackRes.capabilities,
            fallback_occurred: true,
            lost_capabilities: ['traffic_aware', 'live_congestion_estimates'],
          },
          attribution: `${fallbackRes.attribution} [Fallback after ${provider.name} error: ${err.message}]`,
        };
      } else {
        throw err;
      }
    }

    routeCache.set(cacheKey, {
      data: result,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return result;
  }

  /**
   * Clear in-memory route cache (primarily for tests)
   */
  clearCache(): void {
    routeCache.clear();
  }
}

export const routingService = new RoutingService();
