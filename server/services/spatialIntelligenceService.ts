import { getSupabase, isSupabaseConfigured } from '../config/supabase';
import {
  AcquisitionCase,
  Project,
  Parcel,
  CaseSpatialContext,
  SpatialCluster,
  GISOverview,
  SpatialLayerInfo,
  NearbySpatialEntity,
  SpatialGeometryStatus,
  DataProvenance,
  SpatialRelationship,
  SpatialRelationshipType,
  SpatialRelationshipRecommendation,
  SpatialAlternativeSolution,
  PortfolioSpatialRelationshipsSummary,
} from '../../shared/types';
import { AuthenticatedUser } from '../middleware/auth.middleware';
import { getAuthorizedScopeFilter, AuthorizedScopeFilter } from './portfolioAnalyzer';
import { getSpatialPolicySync } from './policyEngine';
import { validateGeoJSON } from '../utils/geojsonValidator';
import { getTotalUnitsCount, getLGDDataSourceStatus } from './administrativeGeographyService';
import { PARCEL_STATUS_COLORS } from '../../shared/utils/geojson';

/**
 * Calculates Great-Circle (Haversine) distance between two geographic positions in kilometers.
 * Standard geodetic earth radius: 6371.0 km (WGS-84 spherical approximation).
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (lat1 === lat2 && lon1 === lon2) return 0;

  const R = 6371.0; // Earth's mean radius in km
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return Math.round(distance * 1000) / 1000; // 3 decimal places (meter precision)
}

/**
 * Computes an area-weighted polygon centroid using Green's Theorem,
 * with fallback to bounding box center for degenerate geometries or multi-polygons.
 * Returns [latitude, longitude].
 */
export function computeAccurateCentroid(geojson: any): [number, number] | null {
  if (!geojson) return null;

  try {
    // 1. Point
    if (geojson.type === 'Point' && Array.isArray(geojson.coordinates) && geojson.coordinates.length >= 2) {
      const [lng, lat] = geojson.coordinates;
      return typeof lat === 'number' && typeof lng === 'number' ? [lat, lng] : null;
    }

    // 2. Feature wrapper unwrap
    if (geojson.type === 'Feature' && geojson.geometry) {
      return computeAccurateCentroid(geojson.geometry);
    }

    // 3. FeatureCollection
    if (geojson.type === 'FeatureCollection' && Array.isArray(geojson.features) && geojson.features.length > 0) {
      const centroids: [number, number][] = [];
      for (const f of geojson.features) {
        const c = computeAccurateCentroid(f);
        if (c) centroids.push(c);
      }
      if (centroids.length === 0) return null;
      const avgLat = centroids.reduce((sum, c) => sum + c[0], 0) / centroids.length;
      const avgLng = centroids.reduce((sum, c) => sum + c[1], 0) / centroids.length;
      return [Math.round(avgLat * 1e6) / 1e6, Math.round(avgLng * 1e6) / 1e6];
    }

    // 4. LineString
    if (geojson.type === 'LineString' && Array.isArray(geojson.coordinates) && geojson.coordinates.length >= 2) {
      const midIdx = Math.floor(geojson.coordinates.length / 2);
      const [lng, lat] = geojson.coordinates[midIdx];
      return [lat, lng];
    }

    // 5. Polygon: Area-weighted centroid
    if (geojson.type === 'Polygon' && Array.isArray(geojson.coordinates) && geojson.coordinates.length > 0) {
      const ring = geojson.coordinates[0]; // Exterior ring
      if (!Array.isArray(ring) || ring.length < 3) return null;

      let signedArea = 0;
      let cx = 0;
      let cy = 0;

      for (let i = 0; i < ring.length - 1; i++) {
        const x0 = ring[i][0];
        const y0 = ring[i][1];
        const x1 = ring[i + 1][0];
        const y1 = ring[i + 1][1];

        const a = x0 * y1 - x1 * y0;
        signedArea += a;
        cx += (x0 + x1) * a;
        cy += (y0 + y1) * a;
      }

      signedArea *= 0.5;

      if (Math.abs(signedArea) > 1e-9) {
        cx /= 6 * signedArea;
        cy /= 6 * signedArea;
        return [Math.round(cy * 1e6) / 1e6, Math.round(cx * 1e6) / 1e6];
      }

      // Fallback to bounding box center if area is zero/degenerate
      let minLat = Infinity,
        maxLat = -Infinity,
        minLng = Infinity,
        maxLng = -Infinity;
      for (const [lng, lat] of ring) {
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
      }
      return [(minLat + maxLat) / 2, (minLng + maxLng) / 2];
    }

    // 6. MultiPolygon: Area-weighted centroid across constituent polygons
    if (geojson.type === 'MultiPolygon' && Array.isArray(geojson.coordinates) && geojson.coordinates.length > 0) {
      let totalArea = 0;
      let weightedLat = 0;
      let weightedLng = 0;

      for (const polyCoords of geojson.coordinates) {
        if (!Array.isArray(polyCoords) || polyCoords.length === 0) continue;
        const ring = polyCoords[0]; // Exterior ring
        if (!Array.isArray(ring) || ring.length < 3) continue;

        let signedArea = 0;
        let cx = 0;
        let cy = 0;

        for (let i = 0; i < ring.length - 1; i++) {
          const x0 = ring[i][0];
          const y0 = ring[i][1];
          const x1 = ring[i + 1][0];
          const y1 = ring[i + 1][1];

          const a = x0 * y1 - x1 * y0;
          signedArea += a;
          cx += (x0 + x1) * a;
          cy += (y0 + y1) * a;
        }

        signedArea *= 0.5;
        const absArea = Math.abs(signedArea);

        if (absArea > 1e-9) {
          cx /= 6 * signedArea;
          cy /= 6 * signedArea;
          totalArea += absArea;
          weightedLat += cy * absArea;
          weightedLng += cx * absArea;
        }
      }

      if (totalArea > 1e-9) {
        return [
          Math.round((weightedLat / totalArea) * 1e6) / 1e6,
          Math.round((weightedLng / totalArea) * 1e6) / 1e6,
        ];
      }

      // Fallback to bounding box center if area is zero
      const bbox = calculateBoundingBox(geojson);
      if (bbox) {
        return [(bbox[1] + bbox[3]) / 2, (bbox[0] + bbox[2]) / 2];
      }
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Calculates statutory 4-tuple bounding box: [minLng, minLat, maxLng, maxLat].
 */
export function calculateBoundingBox(geojson: any): [number, number, number, number] | null {
  if (!geojson) return null;

  let minLng = Infinity,
    minLat = Infinity,
    maxLng = -Infinity,
    maxLat = -Infinity;
  let count = 0;

  function traverse(coords: any) {
    if (!Array.isArray(coords)) return;
    if (coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      const [lng, lat] = coords;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      count++;
      return;
    }
    for (const c of coords) traverse(c);
  }

  if (geojson.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
    for (const f of geojson.features) {
      if (f.geometry) traverse(f.geometry.coordinates);
    }
  } else if (geojson.type === 'Feature' && geojson.geometry) {
    traverse(geojson.geometry.coordinates);
  } else if (geojson.coordinates) {
    traverse(geojson.coordinates);
  }

  if (count === 0 || !isFinite(minLng) || !isFinite(minLat)) return null;

  return [
    Math.round(minLng * 1e6) / 1e6,
    Math.round(minLat * 1e6) / 1e6,
    Math.round(maxLng * 1e6) / 1e6,
    Math.round(maxLat * 1e6) / 1e6,
  ];
}

/**
 * Computes metric surface area in square meters for a closed coordinate ring `[[lng, lat], ...]`.
 * Uses geodesic projection conversion factors based on mean latitude and Shoelace formula.
 */
export function calculateRingAreaSqMeters(ring: [number, number][]): number {
  if (!ring || ring.length < 3) return 0;
  let avgLat = 0;
  for (let i = 0; i < ring.length; i++) {
    avgLat += ring[i][1];
  }
  avgLat /= ring.length;

  const latRad = (avgLat * Math.PI) / 180;
  const mPerDegLat = 111132.954 - 559.822 * Math.cos(2 * latRad) + 1.175 * Math.cos(4 * latRad);
  const mPerDegLng = 111132.954 * Math.cos(latRad);

  let signedArea = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const x0 = ring[i][0] * mPerDegLng;
    const y0 = ring[i][1] * mPerDegLat;
    const x1 = ring[i + 1][0] * mPerDegLng;
    const y1 = ring[i + 1][1] * mPerDegLat;
    signedArea += x0 * y1 - x1 * y0;
  }
  return 0.5 * Math.abs(signedArea);
}

/**
 * Computes metric surface area in Hectares for any GeoJSON geometry (Polygon / MultiPolygon).
 * Returns area in Hectares rounded to 2 decimal places.
 */
export function calculateGeometryAreaHectares(geojson: any): number {
  if (!geojson) return 0;
  const geom =
    geojson.type === 'Feature'
      ? geojson.geometry
      : geojson.type === 'FeatureCollection'
      ? geojson.features[0]?.geometry
      : geojson;

  if (!geom || !geom.type || !Array.isArray(geom.coordinates)) return 0;

  try {
    if (geom.type === 'Polygon') {
      const rings = geom.coordinates;
      if (!Array.isArray(rings) || rings.length === 0) return 0;
      const exteriorRing = rings[0];
      if (!Array.isArray(exteriorRing) || exteriorRing.length < 3) return 0;

      let exteriorArea = calculateRingAreaSqMeters(exteriorRing);
      let holesArea = 0;
      for (let h = 1; h < rings.length; h++) {
        if (Array.isArray(rings[h]) && rings[h].length >= 3) {
          holesArea += calculateRingAreaSqMeters(rings[h]);
        }
      }
      const netSqMeters = Math.max(0, exteriorArea - holesArea);
      return Math.round((netSqMeters / 10000) * 100) / 100;
    }

    if (geom.type === 'MultiPolygon') {
      let totalSqMeters = 0;
      for (const polyCoords of geom.coordinates) {
        if (!Array.isArray(polyCoords) || polyCoords.length === 0) continue;
        const exterior = polyCoords[0];
        if (!Array.isArray(exterior) || exterior.length < 3) continue;
        let polyArea = calculateRingAreaSqMeters(exterior);
        for (let h = 1; h < polyCoords.length; h++) {
          if (Array.isArray(polyCoords[h]) && polyCoords[h].length >= 3) {
            polyArea -= calculateRingAreaSqMeters(polyCoords[h]);
          }
        }
        totalSqMeters += Math.max(0, polyArea);
      }
      return Math.round((totalSqMeters / 10000) * 100) / 100;
    }
  } catch {
    return 0;
  }

  return 0;
}

/**
 * Checks whether two statutory bounding boxes intersect.
 */
export function doBoundingBoxesIntersect(
  bboxA: [number, number, number, number] | null,
  bboxB: [number, number, number, number] | null
): boolean {
  if (!bboxA || !bboxB) return false;
  const [minLngA, minLatA, maxLngA, maxLatA] = bboxA;
  const [minLngB, minLatB, maxLngB, maxLatB] = bboxB;
  return (
    minLngA <= maxLngB &&
    maxLngA >= minLngB &&
    minLatA <= maxLatB &&
    maxLatA >= minLatB
  );
}

/**
 * Sutherland-Hodgman Polygon Clipping algorithm for computing intersection polygon of two coordinate rings.
 * Returns clipped ring coordinates `[[lng, lat], ...]`.
 */
export function clipPolygonSutherlandHodgman(
  subjectRing: [number, number][],
  clipRing: [number, number][]
): [number, number][] {
  if (!subjectRing || subjectRing.length < 3 || !clipRing || clipRing.length < 3) {
    return [];
  }

  const cleanSubject =
    subjectRing[0][0] === subjectRing[subjectRing.length - 1][0] &&
    subjectRing[0][1] === subjectRing[subjectRing.length - 1][1]
      ? subjectRing.slice(0, subjectRing.length - 1)
      : [...subjectRing];

  const cleanClip =
    clipRing[0][0] === clipRing[clipRing.length - 1][0] &&
    clipRing[0][1] === clipRing[clipRing.length - 1][1]
      ? clipRing.slice(0, clipRing.length - 1)
      : [...clipRing];

  let clipSignedArea = 0;
  for (let i = 0; i < cleanClip.length; i++) {
    const next = cleanClip[(i + 1) % cleanClip.length];
    clipSignedArea += cleanClip[i][0] * next[1] - next[0] * cleanClip[i][1];
  }
  const isCCW = clipSignedArea >= 0;

  function isInside(p: [number, number], cp1: [number, number], cp2: [number, number]): boolean {
    const cross = (cp2[0] - cp1[0]) * (p[1] - cp1[1]) - (cp2[1] - cp1[1]) * (p[0] - cp1[0]);
    return isCCW ? cross >= -1e-9 : cross <= 1e-9;
  }

  function computeIntersection(
    s: [number, number],
    e: [number, number],
    cp1: [number, number],
    cp2: [number, number]
  ): [number, number] {
    const dc = [cp1[0] - cp2[0], cp1[1] - cp2[1]];
    const dp = [s[0] - e[0], s[1] - e[1]];
    const n1 = cp1[0] * cp2[1] - cp1[1] * cp2[0];
    const n2 = s[0] * e[1] - s[1] * e[0];
    const n3 = dc[0] * dp[1] - dc[1] * dp[0];

    if (Math.abs(n3) < 1e-12) return [(s[0] + e[0]) / 2, (s[1] + e[1]) / 2];

    const x = (n1 * dp[0] - n2 * dc[0]) / n3;
    const y = (n1 * dp[1] - n2 * dc[1]) / n3;
    return [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6];
  }

  let outputList: [number, number][] = [...cleanSubject];

  for (let j = 0; j < cleanClip.length; j++) {
    const cp1 = cleanClip[j];
    const cp2 = cleanClip[(j + 1) % cleanClip.length];
    const inputList = outputList;
    outputList = [];

    if (inputList.length === 0) break;

    let s = inputList[inputList.length - 1];

    for (let i = 0; i < inputList.length; i++) {
      const e = inputList[i];
      if (isInside(e, cp1, cp2)) {
        if (isInside(s, cp1, cp2)) {
          outputList.push(e);
        } else {
          outputList.push(computeIntersection(s, e, cp1, cp2));
          outputList.push(e);
        }
      } else if (isInside(s, cp1, cp2)) {
        outputList.push(computeIntersection(s, e, cp1, cp2));
      }
      s = e;
    }
  }

  if (outputList.length >= 3) {
    const first = outputList[0];
    const last = outputList[outputList.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      outputList.push([first[0], first[1]]);
    }
    return outputList;
  }

  return [];
}

/**
 * Computes polygon intersection between two GeoJSON boundary geometries.
 * Calculates intersection geometry, intersection area in Hectares, and overlap percentage relative to both cases.
 */
export function computeGeometryIntersection(
  geomA: any,
  geomB: any
): {
  intersectionGeoJSON: any | null;
  intersectionAreaHectares: number;
  sourceOverlapPct: number;
  targetOverlapPct: number;
} {
  const empty = {
    intersectionGeoJSON: null,
    intersectionAreaHectares: 0,
    sourceOverlapPct: 0,
    targetOverlapPct: 0,
  };

  if (!geomA || !geomB) return empty;

  const bboxA = calculateBoundingBox(geomA);
  const bboxB = calculateBoundingBox(geomB);
  if (!bboxA || !bboxB || !doBoundingBoxesIntersect(bboxA, bboxB)) {
    return empty;
  }

  const unwrap = (g: any) =>
    g.type === 'Feature'
      ? g.geometry
      : g.type === 'FeatureCollection'
      ? g.features[0]?.geometry
      : g;

  const gA = unwrap(geomA);
  const gB = unwrap(geomB);
  if (!gA || !gB || !gA.coordinates || !gB.coordinates) return empty;

  const areaA = calculateGeometryAreaHectares(gA);
  const areaB = calculateGeometryAreaHectares(gB);

  // Extract exterior rings
  const ringA = gA.type === 'Polygon' ? gA.coordinates[0] : gA.coordinates[0]?.[0];
  const ringB = gB.type === 'Polygon' ? gB.coordinates[0] : gB.coordinates[0]?.[0];

  if (!Array.isArray(ringA) || ringA.length < 3 || !Array.isArray(ringB) || ringB.length < 3) {
    return empty;
  }

  // Clip A against B
  let clipped = clipPolygonSutherlandHodgman(ringA, ringB);
  if (clipped.length < 3) {
    // Try clipping B against A in case of reversed nesting
    clipped = clipPolygonSutherlandHodgman(ringB, ringA);
  }

  if (clipped.length >= 3) {
    const interAreaSqM = calculateRingAreaSqMeters(clipped);
    const interAreaHa = Math.round((interAreaSqM / 10000) * 100) / 100;

    if (interAreaHa > 0) {
      const sourcePct = areaA > 0 ? Math.min(100, Math.round((interAreaHa / areaA) * 1000) / 10) : 0;
      const targetPct = areaB > 0 ? Math.min(100, Math.round((interAreaHa / areaB) * 1000) / 10) : 0;

      return {
        intersectionGeoJSON: {
          type: 'Polygon',
          coordinates: [clipped],
        },
        intersectionAreaHectares: interAreaHa,
        sourceOverlapPct: sourcePct,
        targetOverlapPct: targetPct,
      };
    }
  }

  return empty;
}

/**
 * Detects duplicate cadastral survey/khata numbers across active parcels in the same village context.
 */
export function detectCadastralCollisions(
  parcelsA: Parcel[],
  parcelsB: Parcel[],
  villageA?: string,
  villageB?: string
): Array<{ survey_number?: string; khata_number?: string; landowner_names?: string; area_acres?: number }> & {
  sharedSurveyNumbers: string[];
  sharedKhataNumbers: string[];
  hasCollision: boolean;
} {
  const matches: any = [];
  matches.sharedSurveyNumbers = [];
  matches.sharedKhataNumbers = [];
  matches.hasCollision = false;

  if (villageA && villageB && villageA.trim().toLowerCase() !== villageB.trim().toLowerCase()) {
    return matches;
  }

  const normalize = (s?: string) => (s || '').trim().toLowerCase().replace(/^0+/, '');

  for (const pA of parcelsA) {
    const sA = normalize(pA.survey_number);
    const kA = normalize(pA.khata_number);
    if (!sA && !kA) continue;

    for (const pB of parcelsB) {
      const sB = normalize(pB.survey_number);
      const kB = normalize(pB.khata_number);

      const surveyMatch = Boolean(sA && sB && sA === sB);
      const khataMatch = Boolean(kA && kB && kA === kB);

      if (surveyMatch || khataMatch) {
        if (!matches.some((m: any) => normalize(m.survey_number) === sA && normalize(m.khata_number) === kA)) {
          matches.push({
            survey_number: pA.survey_number || pB.survey_number,
            khata_number: pA.khata_number || pB.khata_number,
            landowner_names: pA.landowner_names || pB.landowner_names,
            area_acres: Number(pA.area_acres || pB.area_acres || 0),
          });
          if (surveyMatch && pA.survey_number && !matches.sharedSurveyNumbers.includes(pA.survey_number)) {
            matches.sharedSurveyNumbers.push(pA.survey_number);
          }
          if (khataMatch && pA.khata_number && !matches.sharedKhataNumbers.includes(pA.khata_number)) {
            matches.sharedKhataNumbers.push(pA.khata_number);
          }
        }
      }
    }
  }

  matches.hasCollision = matches.length > 0;
  return matches;
}

/**
 * Ray-casting algorithm for Point-in-Polygon test.
 * Point: [lat, lng]. Ring: [[lng, lat], [lng, lat], ...]
 */
export function isPointInPolygon(point: [number, number], ring: [number, number][]): boolean {
  const [lat, lng] = point;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0],
      yi = ring[i][1];
    const xj = ring[j][0],
      yj = ring[j][1];

    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Evaluates whether a geographic point [lat, lng] is contained within a GeoJSON Polygon or MultiPolygon.
 * Respects exterior boundary and interior exclusion holes.
 */
export function isPointInGeometry(point: [number, number], geojson: any): boolean {
  if (!geojson) return false;

  const geom =
    geojson.type === 'Feature'
      ? geojson.geometry
      : geojson.type === 'FeatureCollection'
      ? geojson.features[0]?.geometry
      : geojson;

  if (!geom || !geom.type || !Array.isArray(geom.coordinates)) return false;

  if (geom.type === 'Polygon') {
    const rings = geom.coordinates;
    if (rings.length === 0) return false;
    // Must be inside exterior ring
    if (!isPointInPolygon(point, rings[0])) return false;
    // Must NOT be inside any interior holes
    for (let h = 1; h < rings.length; h++) {
      if (isPointInPolygon(point, rings[h])) return false;
    }
    return true;
  }

  if (geom.type === 'MultiPolygon') {
    // True if inside ANY constituent polygon
    for (const polyCoords of geom.coordinates) {
      if (!Array.isArray(polyCoords) || polyCoords.length === 0) continue;
      if (isPointInPolygon(point, polyCoords[0])) {
        // Check holes in this polygon
        let inHole = false;
        for (let h = 1; h < polyCoords.length; h++) {
          if (isPointInPolygon(point, polyCoords[h])) {
            inHole = true;
            break;
          }
        }
        if (!inHole) return true;
      }
    }
    return false;
  }

  return false;
}

/**
 * Evaluates spatial geometry quality, mapping status, and precision.
 */
export function evaluateGeometryStatus(
  boundaryGeoJSON: any,
  parcels: Parcel[] = []
): {
  status: SpatialGeometryStatus;
  qualityScore: number;
  issues: string[];
  geometryType?: string;
} {
  const issues: string[] = [];

  const totalParcels = parcels.length;
  const mappedParcels = parcels.filter((p) => Boolean(p.geojson_geometry)).length;

  if (!boundaryGeoJSON) {
    if (mappedParcels > 0) {
      return {
        status: 'partially_mapped',
        qualityScore: Math.round((mappedParcels / Math.max(totalParcels, 1)) * 50),
        issues: ['Corridor outer boundary is pending GIS demarcation; some cadastral parcels mapped.'],
      };
    }
    return {
      status: 'unmapped',
      qualityScore: 0,
      issues: ['No spatial boundary or cadastral geometry demarcated.'],
    };
  }

  // Validate boundary GeoJSON
  const validation = validateGeoJSON(boundaryGeoJSON);
  if (!validation.valid) {
    return {
      status: 'invalid_geometry',
      qualityScore: 10,
      issues: [`Geometry validation failed: ${validation.error}`],
      geometryType: boundaryGeoJSON?.type,
    };
  }

  // Quality score derivation (0-100)
  let score = 50; // Valid outer boundary = 50 pts

  if (totalParcels > 0) {
    const parcelCoverageRatio = mappedParcels / totalParcels;
    score += Math.round(parcelCoverageRatio * 35); // Parcel mapping coverage = up to 35 pts
    if (parcelCoverageRatio < 1.0) {
      issues.push(`${totalParcels - mappedParcels} of ${totalParcels} parcels await spatial survey upload.`);
    }
  } else {
    score += 25; // No parcels registered yet, boundary is demarcated
  }

  const bbox = calculateBoundingBox(boundaryGeoJSON);
  if (bbox) {
    // Coordinate precision check (up to 15 pts)
    const spanLng = bbox[2] - bbox[0];
    const spanLat = bbox[3] - bbox[1];
    if (spanLng > 0.0001 && spanLat > 0.0001) {
      score += 15;
    } else {
      score += 5;
      issues.push('Demarcated geometry has very small or degenerate spatial extent.');
    }
  }

  const finalStatus: SpatialGeometryStatus =
    totalParcels > 0 && mappedParcels < totalParcels ? 'partially_mapped' : 'mapped';

  return {
    status: finalStatus,
    qualityScore: Math.min(score, 100),
    issues,
    geometryType: validation.type,
  };
}

/**
 * In-memory fallback cases for development and testing.
 */
let inMemoryCases: AcquisitionCase[] = [];
let inMemoryProjects: Project[] = [];
let inMemoryParcels: Parcel[] = [];

export function seedSpatialMemoryStore(
  data:
    | {
        cases?: AcquisitionCase[];
        projects?: Project[];
        parcels?: Parcel[];
      }
    | AcquisitionCase[],
  projectsArg?: Project[],
  parcelsArg?: Parcel[]
) {
  if (Array.isArray(data)) {
    inMemoryCases = [...data];
    if (projectsArg) inMemoryProjects = [...projectsArg];
    if (parcelsArg) inMemoryParcels = [...parcelsArg];
  } else if (data && typeof data === 'object') {
    if (data.cases) inMemoryCases = [...data.cases];
    if (data.projects) inMemoryProjects = [...data.projects];
    if (data.parcels) inMemoryParcels = [...data.parcels];
  }
}

export function clearSpatialMemoryStore() {
  inMemoryCases = [];
  inMemoryProjects = [];
  inMemoryParcels = [];
}

/**
 * Retrieves all accessible cases respecting server-side role and jurisdiction scoping.
 */
export async function getScopedCases(user?: AuthenticatedUser): Promise<AcquisitionCase[]> {
  const scope: AuthorizedScopeFilter = getAuthorizedScopeFilter(user);

  let cases: AcquisitionCase[] = [];

  if (inMemoryCases.length > 0) {
    cases = [...inMemoryCases];
  } else if (isSupabaseConfigured) {
    try {
      const supabase = getSupabase();
      let query = supabase.from('acquisition_cases').select('*').order('created_at', { ascending: false });

      if (scope.isRestricted) {
        if (scope.projectIds && scope.projectIds.length > 0) {
          query = query.in('project_id', scope.projectIds);
        }
        if (scope.allowedStates && scope.allowedStates.length > 0) {
          query = query.in('state', scope.allowedStates);
        }
        if (scope.allowedDistricts && scope.allowedDistricts.length > 0) {
          query = query.in('district', scope.allowedDistricts);
        }
      }

      const { data, error } = await query;
      if (!error && data) {
        cases = data as AcquisitionCase[];
      }
    } catch (err: any) {
      console.warn('[SpatialIntelligence] Database query failed, using in-memory store:', err.message);
    }
  }

  if (scope.isRestricted) {
    cases = cases.filter((c) => {
      if (scope.projectIds && !scope.projectIds.includes(c.project_id)) return false;
      if (scope.allowedStates && !scope.allowedStates.some((s) => s.toLowerCase() === c.state.toLowerCase())) return false;
      if (scope.allowedDistricts && !scope.allowedDistricts.some((d) => d.toLowerCase() === c.district.toLowerCase())) return false;
      return true;
    });
  }

  return cases;
}

/**
 * Retrieves all accessible projects respecting server-side role scoping.
 */
export async function getScopedProjects(user?: AuthenticatedUser): Promise<Project[]> {
  const scope: AuthorizedScopeFilter = getAuthorizedScopeFilter(user);

  let projects: Project[] = [];

  if (inMemoryProjects.length > 0) {
    projects = [...inMemoryProjects];
  } else if (isSupabaseConfigured) {
    try {
      const supabase = getSupabase();
      let query = supabase.from('projects').select('*').order('name', { ascending: true });

      if (scope.isRestricted && scope.projectIds && scope.projectIds.length > 0) {
        query = query.in('id', scope.projectIds);
      }

      const { data, error } = await query;
      if (!error && data) {
        projects = data as Project[];
      }
    } catch (err: any) {
      console.warn('[SpatialIntelligence] DB projects query failed, using memory store:', err.message);
    }
  }

  if (scope.isRestricted && scope.projectIds) {
    projects = projects.filter((p) => scope.projectIds!.includes(p.id));
  }

  return projects;
}

/**
 * Retrieves parcels for a given case.
 */
export async function getParcelsForCase(caseId: string): Promise<Parcel[]> {
  const parcels: Parcel[] = [];

  if (isSupabaseConfigured) {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('parcels')
        .select('*')
        .eq('case_id', caseId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        parcels.push(...(data as Parcel[]));
      }
    } catch {}
  }

  // Merge in-memory parcels for this case
  for (const imp of inMemoryParcels) {
    if (imp.case_id === caseId && !parcels.some((p) => p.id === imp.id)) {
      parcels.push(imp);
    }
  }

  return parcels;
}

/**
 * Resolves complete spatial context for an acquisition case.
 * Combines case geometry, parent project alignment, parcel spatial distribution,
 * administrative hierarchy status, nearby infrastructure, and statutory provenance.
 */
export async function getCaseSpatialContext(
  caseId: string,
  user?: AuthenticatedUser
): Promise<CaseSpatialContext | null> {
  const scopedCases = await getScopedCases(user);
  const targetCase = scopedCases.find((c) => c.id === caseId);

  if (!targetCase) return null;

  // 1. Fetch parent project
  const projects = await getScopedProjects(user);
  const project = projects.find((p) => p.id === targetCase.project_id);

  // 2. Fetch parcels
  const parcels = await getParcelsForCase(caseId);

  // 3. Evaluate geometry status & quality
  const geomEval = evaluateGeometryStatus(targetCase.geojson_boundary, parcels);
  const centroid = computeAccurateCentroid(targetCase.geojson_boundary);
  const bbox = calculateBoundingBox(targetCase.geojson_boundary);

  // 4. Parcels breakdown
  const mappedParcels = parcels.filter((p) => Boolean(p.geojson_geometry));
  const disputedParcels = parcels.filter((p) => p.acquisition_status === 'disputed');
  const disputedWithGeom = disputedParcels.filter((p) => Boolean(p.geojson_geometry));

  // 5. Check LGD administrative unit status from registry
  const lgdOperational = await getLGDDataSourceStatus();
  const lgdStatus = lgdOperational === 'operational' ? 'mapped' : 'administrative_enrichment_unavailable';

  // 6. Proximity search: find nearby cases within policy radius
  const spatialPolicy = getSpatialPolicySync();
  const nearbyCases: CaseSpatialContext['nearby_cases'] = [];

  if (centroid) {
    const [cLat, cLng] = centroid;
    for (const other of scopedCases) {
      if (other.id === caseId) continue;
      const otherCentroid = computeAccurateCentroid(other.geojson_boundary);
      if (otherCentroid) {
        const dist = calculateHaversineDistance(cLat, cLng, otherCentroid[0], otherCentroid[1]);
        if (dist <= spatialPolicy.nearby_search_radius_km) {
          nearbyCases.push({
            id: other.id,
            case_number: other.case_number,
            title: other.title,
            distance_km: dist,
            status: other.status,
            risk_level: (other as any).risk_level || 'medium',
          });
        }
      }
    }
    nearbyCases.sort((a, b) => a.distance_km - b.distance_km);
  }

  // 7. Detect Spatial and Cadastral Relationships
  const spatialRelationships = await detectSpatialAndCadastralRelationships(targetCase, scopedCases);

  // 8. Provenance trail
  const now = new Date().toISOString();
  const provenance: DataProvenance = {
    id: `prov-spatial-${targetCase.id}`,
    entity_type: 'case_spatial_context',
    entity_id: targetCase.id,
    field_name: 'geojson_boundary',
    provenance_type: 'DATABASE_DERIVED',
    source_id: 'supabase_postgres',
    retrieved_at: now,
    verification_status: targetCase.geojson_boundary ? 'system_verified' : 'unverified',
    freshness_state: 'fresh',
    created_at: now,
    metadata: {
      data_quality_score: geomEval.qualityScore,
      is_authoritative: Boolean(targetCase.geojson_boundary),
      detected_relationships_count: spatialRelationships.length,
    },
  };

  return {
    case_id: targetCase.id,
    case_number: targetCase.case_number,
    title: targetCase.title,
    project_id: targetCase.project_id,
    project_name: project?.name,
    state: targetCase.state,
    district: targetCase.district,
    tehsil: targetCase.tehsil,
    village: targetCase.village,
    centroid,
    bbox,
    total_area_hectares: Number(targetCase.total_area_hectares || 0),
    geometry_status: geomEval.status,
    geometry_quality_score: geomEval.qualityScore,
    geometry_type: geomEval.geometryType,
    parcels_summary: {
      total: parcels.length,
      mapped: mappedParcels.length,
      unmapped: parcels.length - mappedParcels.length,
      disputed: disputedParcels.length,
      disputed_with_geometry: disputedWithGeom.length,
    },
    project_geometry_available: Boolean(project?.geojson_boundary),
    nearby_cases: nearbyCases.slice(0, 10),
    spatial_relationships: spatialRelationships,
    administrative_hierarchy: {
      state: targetCase.state,
      district: targetCase.district,
      sub_district: targetCase.tehsil,
      locality: targetCase.village,
      lgd_status: lgdStatus,
    },
    provenance,
  };
}

/**
 * Detects meaningful spatial and cadastral relationships between a source case and all candidate cases.
 * Calculates intersection area, percentage overlap, duplicate survey numbers, and review-oriented recommendations.
 */
export async function detectSpatialAndCadastralRelationships(
  sourceCase: AcquisitionCase,
  candidateCases: AcquisitionCase[],
  parcelsMap?: Map<string, Parcel[]>
): Promise<SpatialRelationship[]> {
  const relationships: SpatialRelationship[] = [];
  const sourceParcels = parcelsMap?.get(sourceCase.id) ?? (await getParcelsForCase(sourceCase.id));

  for (const other of candidateCases) {
    if (other.id === sourceCase.id) continue;

    // 1. Check spatial boundary intersection
    const geomIntersect = computeGeometryIntersection(sourceCase.geojson_boundary, other.geojson_boundary);

    // 2. Check shared administrative geography
    const sameVillage = Boolean(
      (sourceCase.village && other.village && sourceCase.village.toLowerCase() === other.village.toLowerCase()) ||
      (sourceCase.village_lgd_code && other.village_lgd_code && sourceCase.village_lgd_code === other.village_lgd_code)
    );
    const sameSubdistrict = Boolean(
      (sourceCase.tehsil && other.tehsil && sourceCase.tehsil.toLowerCase() === other.tehsil.toLowerCase()) ||
      (sourceCase.subdistrict_lgd_code && other.subdistrict_lgd_code && sourceCase.subdistrict_lgd_code === other.subdistrict_lgd_code)
    );

    // 3. Check shared cadastral parcels
    let sharedCadastral: Array<{ survey_number?: string; khata_number?: string; landowner_names?: string; area_acres?: number }> = [];
    if (sameVillage || sameSubdistrict) {
      const otherParcels = parcelsMap?.get(other.id) ?? (await getParcelsForCase(other.id));
      sharedCadastral = detectCadastralCollisions(sourceParcels, otherParcels);
    }

    let distKm: number | undefined;
    let relType: SpatialRelationshipType | null = null;
    let severity: 'warning' | 'alert' | 'advisory' | 'info' = 'info';

    if (geomIntersect.intersectionAreaHectares > 0) {
      if (geomIntersect.sourceOverlapPct >= 95 || geomIntersect.targetOverlapPct >= 95) {
        relType = 'complete_enclosure';
      } else {
        relType = 'boundary_overlap';
      }
      severity = (geomIntersect.sourceOverlapPct >= 20 || geomIntersect.targetOverlapPct >= 20 || geomIntersect.intersectionAreaHectares >= 5) ? 'alert' : 'warning';
    } else if (sharedCadastral.length > 0 && sameVillage) {
      relType = 'cadastral_collision';
      severity = 'warning';
    } else {
      // Proximity distance check
      const centroidSource = computeAccurateCentroid(sourceCase.geojson_boundary);
      const centroidOther = computeAccurateCentroid(other.geojson_boundary);
      if (centroidSource && centroidOther) {
        distKm = calculateHaversineDistance(centroidSource[0], centroidSource[1], centroidOther[0], centroidOther[1]);
        if (distKm <= 5.0) {
          relType = 'nearby';
          severity = 'info';
        }
      }
      if (!relType && sameVillage) {
        relType = 'same_administrative_unit';
        severity = 'advisory';
      }
    }

    if (relType) {
      const recs: SpatialRelationshipRecommendation[] = [];
      const surveyListStr = sharedCadastral.map((p) => p.survey_number).filter(Boolean).join(', ');

      if (relType === 'boundary_overlap' || relType === 'complete_enclosure') {
        recs.push({
          id: `rec-boundary-${sourceCase.id}-${other.id}`,
          type: 'boundary_review',
          title: `Conduct Boundary Demarcation Review with Case ${other.case_number}`,
          description: `Calculated boundary intersection of ${geomIntersect.intersectionAreaHectares} Ha (${geomIntersect.sourceOverlapPct}% of this case) detected with active acquisition case "${other.title}" in ${other.village || 'shared locality'}. Review GIS boundary coordinates with the Competent Authority to resolve spatial demarcation overlap prior to statutory Section 19 declaration.`,
          suggested_action: 'Open GIS Workspace to inspect overlapping boundary demarcation.',
        });
        if (sharedCadastral.length > 0) {
          recs.push({
            id: `rec-cadastral-${sourceCase.id}-${other.id}`,
            type: 'field_resurvey',
            title: `Verify Shared Cadastral Survey Numbers (${surveyListStr})`,
            description: `Shared cadastral survey number(s) [${surveyListStr}] registered in both Case ${sourceCase.case_number} and Case ${other.case_number}. Field verification by Revenue Inspector recommended to establish parcel boundaries. Note: shared identifier detection is an administrative verification signal and does not assert a legal title conclusion.`,
            suggested_action: 'Schedule field verification by Revenue Inspector in Case Workspace.',
          });
        }
        recs.push({
          id: `rec-coord-${sourceCase.id}-${other.id}`,
          type: 'coordination_review',
          title: `Convene Inter-Project Coordination Review for ${other.village || 'Shared Locality'}`,
          description: `Multiple active acquisition schemes active in ${other.village || 'same jurisdiction'} (${sourceCase.title} & ${other.title}). Align statutory milestone dates to avoid redundant Gazette publication & compensation processing.`,
          suggested_action: 'Initiate inter-project coordination review in Case Overview.',
        });
      } else if (relType === 'cadastral_collision') {
        recs.push({
          id: `rec-cadastral-${sourceCase.id}-${other.id}`,
          type: 'field_resurvey',
          title: `Verify Shared Cadastral Survey Numbers (${surveyListStr}) in ${other.village || 'village'}`,
          description: `Shared cadastral survey identifier(s) [${surveyListStr}] detected across active cases in ${other.village || 'village'}. Field re-demarcation by Revenue Inspector recommended. Note: shared identifier detection is an administrative verification flag and does not assert a legal title conclusion.`,
          suggested_action: 'Assign field verification task to Revenue Inspector in Case Workspace.',
        });
        recs.push({
          id: `rec-coord-${sourceCase.id}-${other.id}`,
          type: 'coordination_review',
          title: `Coordinate Acquisition Schedule with Case ${other.case_number}`,
          description: `Coordinate acquisition processing between Case ${sourceCase.case_number} and Case ${other.case_number} to prevent duplicate compensation claims on shared survey numbers.`,
          suggested_action: 'Schedule joint review in Administration console.',
        });
      } else if (relType === 'nearby' || relType === 'same_administrative_unit') {
        recs.push({
          id: `rec-coord-${sourceCase.id}-${other.id}`,
          type: 'coordination_review',
          title: `Regional Milestone Alignment for ${other.village || other.district}`,
          description: `Active acquisition case "${other.title}" operates in close proximity. Align survey teams and hearing dates for administrative efficiency.`,
          suggested_action: 'Review regional progress in Portfolio Operations.',
        });
      }

      let evidenceSummary = '';
      if (relType === 'boundary_overlap' || relType === 'complete_enclosure') {
        evidenceSummary = `Observed Fact: Case boundaries intersect. Calculated Metric: ${geomIntersect.intersectionAreaHectares} Hectares (${geomIntersect.sourceOverlapPct}% overlap with Case ${sourceCase.case_number}, ${geomIntersect.targetOverlapPct}% with Case ${other.case_number}). Administrative Locality: ${other.village}, ${other.district}, ${other.state}.`;
        if (sharedCadastral.length > 0) {
          evidenceSummary += ` Cadastral Evidence: Shared survey identifiers [${surveyListStr}] detected.`;
        }
      } else if (relType === 'cadastral_collision') {
        evidenceSummary = `Cadastral Evidence: Shared survey identifiers [${surveyListStr}] registered across active cases in village ${other.village}, ${other.district}.`;
      } else if (relType === 'nearby') {
        evidenceSummary = `Proximity Evidence: Active case located nearby in ${other.village || other.district}.`;
      } else {
        evidenceSummary = `Administrative Evidence: Co-located in administrative unit ${other.village}, ${other.district}.`;
      }

      const surveyList = sharedCadastral.map((p) => p.survey_number).filter(Boolean) as string[];
      const khataList = sharedCadastral.map((p) => p.khata_number).filter(Boolean) as string[];

      // Compute Alternative Spacing & Harmonization Solutions
      const alternativeSolutions: SpatialAlternativeSolution[] = [];
      const centroidSource = computeAccurateCentroid(sourceCase.geojson_boundary);
      const centroidOther = computeAccurateCentroid(other.geojson_boundary);

      let shiftDirection = 'Eastward';
      let bufferMeters = 35;
      if (centroidSource && centroidOther) {
        const dLat = centroidSource[0] - centroidOther[0];
        const dLng = centroidSource[1] - centroidOther[1];
        if (Math.abs(dLng) >= Math.abs(dLat)) {
          shiftDirection = dLng >= 0 ? 'Eastward' : 'Westward';
        } else {
          shiftDirection = dLat >= 0 ? 'Northward' : 'Southward';
        }
      }

      if (geomIntersect.intersectionAreaHectares > 0) {
        const approxSideMeters = Math.round(Math.sqrt(geomIntersect.intersectionAreaHectares * 10000));
        bufferMeters = Math.max(15, Math.min(150, Math.round(approxSideMeters * 0.35)));

        const retainedHa = Math.max(0.1, Math.round((sourceCase.total_area_hectares - geomIntersect.intersectionAreaHectares) * 100) / 100);
        const retainedPct = sourceCase.total_area_hectares > 0
          ? Math.min(100, Math.round((retainedHa / sourceCase.total_area_hectares) * 1000) / 10)
          : 0;

        alternativeSolutions.push({
          id: `alt-offset-${sourceCase.id}-${other.id}`,
          strategy_name: `Corridor Clearance Offset (${shiftDirection} by ~${bufferMeters}m)`,
          strategy_type: 'boundary_offset_clearance',
          clearance_direction: shiftDirection,
          recommended_buffer_meters: bufferMeters,
          retained_area_hectares: retainedHa,
          retained_area_percentage: retainedPct,
          justification: `Shift corridor boundary ${shiftDirection.toLowerCase()} by approximately ${bufferMeters}m to eliminate the ${geomIntersect.intersectionAreaHectares} Ha overlap with Case ${other.case_number}. Retains ${retainedPct}% (${retainedHa} Ha) of statutory planned footprint.`,
          statutory_procedure: `Competent Authority must issue rectified spatial schedule under RFCTLARR Act Section 11(1) and gazette rectified boundary coordinates.`,
        });

        alternativeSolutions.push({
          id: `alt-phased-${sourceCase.id}-${other.id}`,
          strategy_name: 'Phased Right-of-Way & Sequential Possession',
          strategy_type: 'phased_acquisition_taking',
          retained_area_hectares: sourceCase.total_area_hectares,
          retained_area_percentage: 100,
          justification: `Retain 100% planned footprint for both schemes by synchronizing construction milestones: Primary linear corridor taking executes in Phase 1, followed by secondary infrastructure in Phase 2.`,
          statutory_procedure: `Execute Inter-Departmental Possession Protocol under RFCTLARR Section 38 with Collector's approval.`,
        });
      }

      if (sharedCadastral.length > 0 || geomIntersect.intersectionAreaHectares > 0) {
        alternativeSolutions.push({
          id: `alt-joint-award-${sourceCase.id}-${other.id}`,
          strategy_name: 'Joint Valuation & Consolidated Award Schedule',
          strategy_type: 'joint_award_alignment',
          retained_area_hectares: sourceCase.total_area_hectares,
          retained_area_percentage: 100,
          justification: sharedCadastral.length > 0
            ? `Consolidate compensation determination for shared survey numbers [${surveyListStr}] into a single coordinated hearing to prevent duplicate disbursements and title litigation.`
            : `Coordinate joint inquiry across overlapping corridor zones under RFCTLARR Section 23 to synchronize award declarations and prevent contradictory land valuation rates.`,
          statutory_procedure: `Joint inquiry conducted by Land Acquisition Officer under RFCTLARR Act Section 23 with single apportionment order under Section 30.`,
        });
      }

      relationships.push({
        id: `rel-${sourceCase.id}-${other.id}`,
        source_case_id: sourceCase.id,
        source_case_number: sourceCase.case_number,
        source_case_title: sourceCase.title,
        source_project_id: sourceCase.project_id,
        target_case_id: other.id,
        target_case_number: other.case_number,
        target_case_title: other.title,
        target_project_id: other.project_id,
        related_case_id: other.id,
        related_case_number: other.case_number,
        related_project_name: other.project?.name || other.project_id,
        relationship_type: relType,
        relationship_severity: severity,
        intersection_area_hectares: geomIntersect.intersectionAreaHectares > 0 ? geomIntersect.intersectionAreaHectares : undefined,
        source_overlap_percentage: geomIntersect.sourceOverlapPct > 0 ? geomIntersect.sourceOverlapPct : undefined,
        target_overlap_percentage: geomIntersect.targetOverlapPct > 0 ? geomIntersect.targetOverlapPct : undefined,
        overlap_pct: geomIntersect.sourceOverlapPct > 0 ? geomIntersect.sourceOverlapPct : undefined,
        distance_km: distKm,
        shared_survey_numbers: surveyList.length > 0 ? surveyList : undefined,
        shared_khata_numbers: khataList.length > 0 ? khataList : undefined,
        shared_cadastral_identifiers: sharedCadastral.length > 0 ? sharedCadastral : undefined,
        shared_geography: {
          state: other.state,
          district: other.district,
          tehsil: other.tehsil,
          village: other.village,
          state_lgd_code: other.state_lgd_code,
          district_lgd_code: other.district_lgd_code,
          subdistrict_lgd_code: other.subdistrict_lgd_code,
          village_lgd_code: other.village_lgd_code,
        },
        shared_admin_unit: {
          village: other.village,
          village_lgd_code: other.village_lgd_code,
          district: other.district,
          state: other.state,
        },
        intersection_geojson: geomIntersect.intersectionGeoJSON,
        evidence_summary: evidenceSummary,
        recommendations: recs.map((r) => ({
          ...r,
          action_type: r.type,
          statutory_guardrail: 'Advisory only. Statutory decisions require competent authority order under RFCTLARR Act.',
        })),
        alternative_solutions: alternativeSolutions.length > 0 ? alternativeSolutions : undefined,
        detected_at: new Date().toISOString(),
      });
    }
  }

  relationships.sort((a, b) => {
    const sevOrder = { alert: 0, warning: 1, advisory: 2, info: 3 };
    const sevDiff = (sevOrder[a.relationship_severity] || 3) - (sevOrder[b.relationship_severity] || 3);
    if (sevDiff !== 0) return sevDiff;
    return (b.intersection_area_hectares || 0) - (a.intersection_area_hectares || 0);
  });

  return relationships;
}

/**
 * Retrieves portfolio-wide spatial and cadastral relationships across all authorized cases.
 */
export async function getPortfolioSpatialRelationships(
  user?: AuthenticatedUser
): Promise<PortfolioSpatialRelationshipsSummary> {
  const scopedCases = await getScopedCases(user);
  const allRelationships: SpatialRelationship[] = [];
  const visitedPairs = new Set<string>();

  const parcelsMap = new Map<string, Parcel[]>();
  for (const c of scopedCases) {
    const pList = await getParcelsForCase(c.id);
    parcelsMap.set(c.id, pList);
  }

  for (const c of scopedCases) {
    const rels = await detectSpatialAndCadastralRelationships(c, scopedCases, parcelsMap);
    for (const r of rels) {
      const pairKey = [r.source_case_id, r.target_case_id].sort().join(':');
      if (!visitedPairs.has(pairKey)) {
        visitedPairs.add(pairKey);
        allRelationships.push(r);
      }
    }
  }

  const boundaryOverlaps = allRelationships.filter(
    (r) => r.relationship_type === 'boundary_overlap' || r.relationship_type === 'complete_enclosure'
  ).length;
  const cadastralCollisions = allRelationships.filter(
    (r) => r.relationship_type === 'cadastral_collision' || (r.shared_cadastral_identifiers && r.shared_cadastral_identifiers.length > 0)
  ).length;
  const requiringReview = allRelationships.filter(
    (r) => r.relationship_severity === 'alert' || r.relationship_severity === 'warning'
  ).length;

  const reviewCaseIds = Array.from(
    new Set(allRelationships.flatMap((r) => [r.source_case_id, r.target_case_id]))
  );

  return {
    total_relationships: allRelationships.length,
    total_relationships_detected: allRelationships.length,
    boundary_overlaps_count: boundaryOverlaps,
    cadastral_collisions_count: cadastralCollisions,
    cases_requiring_review_count: requiringReview,
    cases_requiring_spatial_review: reviewCaseIds,
    relationships: allRelationships,
  };
}

/**
 * Retrieves spatial and cadastral relationships for a single case within authorized scope.
 */
export async function getCaseSpatialRelationships(
  caseId: string,
  scopeFilter?: AuthorizedScopeFilter
): Promise<SpatialRelationship[]> {
  const scopedCases = await getScopedCases(scopeFilter ? { role: 'admin' } as any : undefined);
  const sourceCase = scopedCases.find((c) => c.id === caseId);
  if (!sourceCase) return [];
  return detectSpatialAndCadastralRelationships(sourceCase, scopedCases);
}

/**
 * Searches for cases and projects within a radius around a geographic coordinate.
 * Strictly clamped to policy maximum search radius.
 */
export async function findNearbyEntities(
  lat: number,
  lng: number,
  requestedRadiusKm?: number,
  user?: AuthenticatedUser
): Promise<NearbySpatialEntity[]> {
  const spatialPolicy = getSpatialPolicySync();
  const radius = Math.min(
    requestedRadiusKm || spatialPolicy.nearby_search_radius_km,
    spatialPolicy.max_search_radius_km
  );

  const scopedCases = await getScopedCases(user);
  const scopedProjects = await getScopedProjects(user);

  const results: NearbySpatialEntity[] = [];

  // Scan cases
  for (const c of scopedCases) {
    const centroid = computeAccurateCentroid(c.geojson_boundary);
    if (!centroid) continue;

    const dist = calculateHaversineDistance(lat, lng, centroid[0], centroid[1]);
    if (dist <= radius) {
      results.push({
        id: c.id,
        entity_type: 'case',
        name: c.title,
        code: c.case_number,
        distance_km: dist,
        centroid,
        state: c.state,
        district: c.district,
        status: c.status,
        risk_level: (c as any).risk_level || 'medium',
        geometry_type: c.geojson_boundary?.type || 'Polygon',
      });
    }
  }

  // Scan projects
  for (const p of scopedProjects) {
    const centroid = computeAccurateCentroid(p.geojson_boundary);
    if (!centroid) continue;

    const dist = calculateHaversineDistance(lat, lng, centroid[0], centroid[1]);
    if (dist <= radius) {
      results.push({
        id: p.id,
        entity_type: 'project',
        name: p.name,
        code: p.code,
        distance_km: dist,
        centroid,
        state: p.state,
        district: p.district,
        status: p.status,
        geometry_type: p.geojson_boundary?.type || 'Corridor',
      });
    }
  }

  results.sort((a, b) => a.distance_km - b.distance_km);
  return results;
}

/**
 * Groups spatially proximate cases into clusters.
 * Discloses methodology, aggregate statistics, and sample size limitations.
 */
export function detectSpatialClusters(
  cases: AcquisitionCase[],
  clusterDistanceKm?: number
): SpatialCluster[] {
  const policy = getSpatialPolicySync();
  const maxDistance = clusterDistanceKm || policy.spatial_cluster_distance_km;
  const minCases = policy.spatial_concentration_min_cases;

  const validCases = cases
    .map((c) => ({
      caseItem: c,
      centroid: computeAccurateCentroid(c.geojson_boundary),
    }))
    .filter((item): item is { caseItem: AcquisitionCase; centroid: [number, number] } => Boolean(item.centroid));

  if (validCases.length < minCases) {
    return [];
  }

  const visited = new Set<string>();
  const clusters: SpatialCluster[] = [];

  for (let i = 0; i < validCases.length; i++) {
    const current = validCases[i];
    if (visited.has(current.caseItem.id)) continue;

    const group: { caseItem: AcquisitionCase; centroid: [number, number] }[] = [current];
    visited.add(current.caseItem.id);

    for (let j = i + 1; j < validCases.length; j++) {
      const neighbor = validCases[j];
      if (visited.has(neighbor.caseItem.id)) continue;

      const dist = calculateHaversineDistance(
        current.centroid[0],
        current.centroid[1],
        neighbor.centroid[0],
        neighbor.centroid[1]
      );

      if (dist <= maxDistance) {
        group.push(neighbor);
        visited.add(neighbor.caseItem.id);
      }
    }

    if (group.length >= minCases) {
      // Calculate cluster centroid
      const avgLat = group.reduce((sum, g) => sum + g.centroid[0], 0) / group.length;
      const avgLng = group.reduce((sum, g) => sum + g.centroid[1], 0) / group.length;

      // Calculate max radius from centroid
      let maxR = 0;
      for (const g of group) {
        const d = calculateHaversineDistance(avgLat, avgLng, g.centroid[0], g.centroid[1]);
        if (d > maxR) maxR = d;
      }

      const totalArea = group.reduce((sum, g) => sum + Number(g.caseItem.total_area_hectares || 0), 0);

      const statusMap: Record<string, number> = {};
      const riskMap: Record<string, number> = {};

      for (const g of group) {
        const st = g.caseItem.status || 'active';
        statusMap[st] = (statusMap[st] || 0) + 1;

        const rk = (g.caseItem as any).risk_level || 'medium';
        riskMap[rk] = (riskMap[rk] || 0) + 1;
      }

      clusters.push({
        cluster_id: `cluster-${clusters.length + 1}`,
        center: [Math.round(avgLat * 1e6) / 1e6, Math.round(avgLng * 1e6) / 1e6],
        radius_km: Math.max(Math.round(maxR * 10) / 10, 1.0),
        case_ids: group.map((g) => g.caseItem.id),
        case_count: group.length,
        aggregate_area_hectares: Math.round(totalArea * 100) / 100,
        risk_concentration: riskMap,
        status_concentration: statusMap,
        sample_size_note: `Cluster identified via ${group.length} cases within ${maxDistance}km proximity threshold. Spatial clustering indicates geographical concentration but does not establish causal correlation.`,
      });
    }
  }

  return clusters;
}

/**
 * Builds GeoJSON FeatureCollection of cases with thematic styling properties.
 */
export function generateCasesGeoJSON(cases: AcquisitionCase[]): any {
  const features: any[] = [];

  for (const c of cases) {
    if (c.geojson_boundary) {
      const boundaryGeom =
        c.geojson_boundary.type === 'Feature'
          ? c.geojson_boundary.geometry
          : c.geojson_boundary.type === 'FeatureCollection'
          ? c.geojson_boundary.features[0]?.geometry
          : c.geojson_boundary;

      if (boundaryGeom) {
        const centroid = computeAccurateCentroid(c.geojson_boundary);
        features.push({
          type: 'Feature',
          id: `case-${c.id}`,
          properties: {
            layer_type: 'case',
            case_id: c.id,
            case_number: c.case_number,
            title: c.title,
            state: c.state,
            district: c.district,
            tehsil: c.tehsil,
            village: c.village,
            state_lgd_code: c.state_lgd_code,
            district_lgd_code: c.district_lgd_code,
            subdistrict_lgd_code: c.subdistrict_lgd_code,
            village_lgd_code: c.village_lgd_code,
            status: c.status,
            priority: c.priority,
            total_area_hectares: c.total_area_hectares,
            risk_level: (c as any).risk_level || 'medium',
            centroid,
          },
          geometry: boundaryGeom,
        });
      }
    }
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

/**
 * Builds GeoJSON FeatureCollection of projects (corridors or polygons).
 */
export function generateProjectsGeoJSON(projects: Project[]): any {
  const features: any[] = [];

  for (const p of projects) {
    if (p.geojson_boundary) {
      const geom =
        p.geojson_boundary.type === 'Feature'
          ? p.geojson_boundary.geometry
          : p.geojson_boundary.type === 'FeatureCollection'
          ? p.geojson_boundary.features[0]?.geometry
          : p.geojson_boundary;

      if (geom) {
        features.push({
          type: 'Feature',
          id: `project-${p.id}`,
          properties: {
            layer_type: 'project',
            project_id: p.id,
            code: p.code,
            name: p.name,
            project_type: p.project_type,
            sponsoring_agency: p.sponsoring_agency,
            status: p.status,
            state: p.state,
            district: p.district,
          },
          geometry: geom,
        });
      }
    }
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

/**
 * Builds GeoJSON FeatureCollection of cadastral parcels with status colors.
 */
export function generateParcelsGeoJSON(parcels: Parcel[]): any {
  const features: any[] = [];

  for (const p of parcels) {
    if (p.geojson_geometry) {
      const geom =
        p.geojson_geometry.type === 'Feature'
          ? p.geojson_geometry.geometry
          : p.geojson_geometry;

      const statusColor =
        PARCEL_STATUS_COLORS[p.acquisition_status] || PARCEL_STATUS_COLORS.identified;

      features.push({
        type: 'Feature',
        id: `parcel-${p.id}`,
        properties: {
          layer_type: 'parcel',
          parcel_id: p.id,
          case_id: p.case_id,
          survey_number: p.survey_number,
          khata_number: p.khata_number,
          landowner_names: p.landowner_names,
          land_type: p.land_type,
          area_acres: p.area_acres,
          compensation_amount: p.compensation_amount,
          acquisition_status: p.acquisition_status,
          color: statusColor.stroke,
          fillColor: statusColor.fill,
        },
        geometry: geom,
      });
    }
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

/**
 * Aggregates high-level GIS overview metrics across the authorized portfolio.
 */
export async function getGISOverview(user?: AuthenticatedUser): Promise<GISOverview> {
  const scopedCases = await getScopedCases(user);
  const scopedProjects = await getScopedProjects(user);

  let mappedCount = 0;
  let partiallyMappedCount = 0;
  let unmappedCount = 0;
  let invalidCount = 0;

  const validGeometries: any[] = [];

  for (const c of scopedCases) {
    if (!c.geojson_boundary) {
      unmappedCount++;
    } else {
      const v = validateGeoJSON(c.geojson_boundary);
      if (!v.valid) {
        invalidCount++;
      } else {
        mappedCount++;
        validGeometries.push(c.geojson_boundary);
      }
    }
  }

  const projectsWithGeom = scopedProjects.filter((p) => Boolean(p.geojson_boundary)).length;

  // Derive bounding box of all mapped cases
  const portfolioBbox = calculateBoundingBox({
    type: 'FeatureCollection',
    features: validGeometries.map((g) => ({ type: 'Feature', geometry: g })),
  });

  // Detect spatial clusters
  const clusters = detectSpatialClusters(scopedCases);

  // Administrative LGD status from authoritative data registry
  const totalUnits = await getTotalUnitsCount();
  const lgdStatus = await getLGDDataSourceStatus();

  // Layer manifest
  const layerManifest: SpatialLayerInfo[] = [
    {
      id: 'layer-cases',
      name: 'Land Acquisition Cases',
      layer_type: 'cases',
      feature_count: mappedCount,
      is_visible_by_default: true,
      status: mappedCount > 0 ? 'operational' : 'empty',
      description: 'Demarcated case corridor boundaries and center coordinates.',
    },
    {
      id: 'layer-projects',
      name: 'Infrastructure Projects Alignment',
      layer_type: 'projects',
      feature_count: projectsWithGeom,
      is_visible_by_default: true,
      status: projectsWithGeom > 0 ? 'operational' : 'empty',
      description: 'National highway, railway, and metro project alignments and footprints.',
    },
    {
      id: 'layer-clusters',
      name: 'Spatial Friction & Proximity Clusters',
      layer_type: 'clusters',
      feature_count: clusters.length,
      is_visible_by_default: clusters.length > 0,
      status: clusters.length > 0 ? 'operational' : 'empty',
      description: 'Statutory density clusters of proximate land acquisition cases.',
    },
    {
      id: 'layer-parcels',
      name: 'Cadastral Land Parcels (Khasra/Survey)',
      layer_type: 'parcels',
      feature_count: 0, // Loaded dynamically on case drilldown
      is_visible_by_default: false,
      status: 'operational',
      description: 'Survey boundaries and landowner plot demarcations.',
    },
    {
      id: 'layer-admin',
      name: 'Administrative LGD Boundaries',
      layer_type: 'administrative',
      feature_count: totalUnits,
      is_visible_by_default: false,
      status: lgdStatus === 'operational' ? 'operational' : 'unavailable',
      description: 'State, district, and village administrative boundaries from Local Government Directory.',
    },
  ];

  return {
    total_cases: scopedCases.length,
    mapped_cases: mappedCount,
    partially_mapped_cases: partiallyMappedCount,
    unmapped_cases: unmappedCount,
    invalid_geometry_cases: invalidCount,
    total_projects: scopedProjects.length,
    projects_with_geometry: projectsWithGeom,
    total_parcels: 0,
    mapped_parcels: 0,
    portfolio_bbox: portfolioBbox,
    spatial_clusters_count: clusters.length,
    clusters,
    layer_manifest: layerManifest,
    lgd_status: lgdStatus,
  };
}
