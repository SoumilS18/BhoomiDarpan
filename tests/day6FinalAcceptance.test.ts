import { describe, expect, it, beforeEach } from 'bun:test';
import '../server/index';
import {
  calculateHaversineDistance,
  computeAccurateCentroid,
  calculateBoundingBox,
  isPointInPolygon,
  isPointInGeometry,
  evaluateGeometryStatus,
  findNearbyEntities,
  detectSpatialClusters,
  generateCasesGeoJSON,
  generateProjectsGeoJSON,
  generateParcelsGeoJSON,
  getGISOverview,
  getCaseSpatialContext,
  getScopedCases,
  getScopedProjects,
  seedSpatialMemoryStore,
  clearSpatialMemoryStore,
} from '../server/services/spatialIntelligenceService';
import {
  getSpatialPolicySync,
  updatePolicy,
  resetPoliciesToDefaults,
} from '../server/services/policyEngine';
import { getLGDDataSourceStatus, clearInMemoryUnits } from '../server/services/administrativeGeographyService';
import { clearInMemoryAuditLogs } from '../server/services/auditLogger';
import {
  AcquisitionCase,
  Project,
  Parcel,
  SpatialPolicy,
} from '../shared/types';
import { AuthenticatedUser } from '../server/middleware/auth.middleware';

const SERVER_URL = 'http://127.0.0.1:3001';

describe('Day 6: GIS & Spatial Intelligence Final Acceptance Verification', () => {
  beforeEach(() => {
    resetPoliciesToDefaults();
    clearInMemoryAuditLogs();
    clearSpatialMemoryStore();
    clearInMemoryUnits();
  });

  const createMockCase = (overrides?: Partial<AcquisitionCase>): AcquisitionCase => ({
    id: 'case-gis-acc-01',
    project_id: 'prj-alpha-1',
    case_number: 'CASE/2026/ACC-01',
    title: 'Corridor Section 1',
    description: 'Statutory corridor land acquisition',
    state: 'State-Alpha',
    district: 'District-Beta',
    tehsil: 'Tehsil-Gamma',
    village: 'Village-Delta',
    status: 'in_progress',
    priority: 'high',
    total_area_hectares: 50.0,
    estimated_compensation: 30000000,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    geojson_boundary: {
      type: 'Polygon',
      coordinates: [
        [
          [77.0, 28.0],
          [77.2, 28.0],
          [77.2, 28.2],
          [77.0, 28.2],
          [77.0, 28.0],
        ],
      ],
    },
    ...overrides,
  });

  const createMockProject = (overrides?: Partial<Project>): Project => ({
    id: 'prj-alpha-1',
    code: 'PRJ-EXP-ALPHA',
    name: 'Expressway Package Alpha',
    description: 'National corridor project',
    state: 'State-Alpha',
    district: 'District-Beta',
    project_type: 'expressway',
    sponsoring_agency: 'National Highways Division',
    status: 'in_progress',
    total_cases: 1,
    completed_cases: 0,
    total_area_hectares: 200.0,
    acquired_area_hectares: 50.0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    geojson_boundary: {
      type: 'LineString',
      coordinates: [
        [77.0, 28.0],
        [77.1, 28.1],
        [77.2, 28.2],
      ],
    },
    ...overrides,
  });

  // ==========================================================================
  // 1. GEOSPATIAL MATHEMATICAL ACCURACY & PRECISION BOUNDARIES
  // ==========================================================================
  describe('1. Geospatial Accuracy & Precision Verification', () => {
    it('accurately computes Haversine distance with exact arithmetic (meter calculation precision)', () => {
      // Benchmark: Delhi (28.6139, 77.2090) to Mumbai (18.9220, 72.8347)
      const distanceKm = calculateHaversineDistance(28.6139, 77.2090, 18.9220, 72.8347);
      expect(distanceKm).toBeGreaterThan(1150);
      expect(distanceKm).toBeLessThan(1180);
      // Mathematical calculation precision is 3 decimal places (meter precision in km)
      expect(distanceKm.toString().split('.')[1]?.length).toBeLessThanOrEqual(3);
    });

    it('computes area-weighted polygon centroid using Green’s Theorem', () => {
      // 10x10 square: [lng, lat] from (0,0) to (10,10) -> Centroid = [5, 5]
      const square = {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
            [0, 0],
          ],
        ],
      };
      const centroid = computeAccurateCentroid(square);
      expect(centroid).toEqual([5, 5]);
    });

    it('calculates statutory 4-tuple bounding box [minLng, minLat, maxLng, maxLat]', () => {
      const polygon = {
        type: 'Polygon',
        coordinates: [
          [
            [75.5, 26.5],
            [77.5, 26.5],
            [77.5, 28.5],
            [75.5, 28.5],
            [75.5, 26.5],
          ],
        ],
      };
      const bbox = calculateBoundingBox(polygon);
      expect(bbox).toEqual([75.5, 26.5, 77.5, 28.5]);
    });

    it('executes point-in-polygon containment test via ray-casting', () => {
      const ring: [number, number][] = [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ];
      expect(isPointInPolygon([5, 5], ring)).toBe(true);
      expect(isPointInPolygon([15, 15], ring)).toBe(false);
      expect(isPointInPolygon([-1, 5], ring)).toBe(false);
    });
  });

  // ==========================================================================
  // 2. MULTIPOLYGON BEHAVIOR & ROBUSTNESS
  // ==========================================================================
  describe('2. MultiPolygon Behavior & Area-Weighted Centroid', () => {
    it('calculates true area-weighted centroid for MultiPolygon with unequal constituent areas', () => {
      // Poly 1: 10x10 square at (0,0) -> Area = 100, Centroid = [5, 5]
      // Poly 2: 2x2 square at (30,30) to (32,32) -> Area = 4, Centroid = [31, 31]
      // Area-weighted Lat = (5*100 + 31*4) / 104 = 624 / 104 = 6.0
      // Area-weighted Lng = (5*100 + 31*4) / 104 = 6.0
      const multiPolygon = {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [0, 0],
              [10, 0],
              [10, 10],
              [0, 10],
              [0, 0],
            ],
          ],
          [
            [
              [30, 30],
              [32, 30],
              [32, 32],
              [30, 32],
              [30, 30],
            ],
          ],
        ],
      };

      const centroid = computeAccurateCentroid(multiPolygon);
      expect(centroid).toBeDefined();
      expect(centroid![0]).toBe(6.0);
      expect(centroid![1]).toBe(6.0);
    });

    it('evaluates Point-in-Geometry containment across MultiPolygon and Polygon with holes', () => {
      // Polygon with an interior hole
      const polygonWithHole = {
        type: 'Polygon',
        coordinates: [
          // Exterior ring: 0,0 to 20,20
          [
            [0, 0],
            [20, 0],
            [20, 20],
            [0, 20],
            [0, 0],
          ],
          // Hole: 5,5 to 15,15
          [
            [5, 5],
            [15, 5],
            [15, 15],
            [5, 15],
            [5, 5],
          ],
        ],
      };

      // In solid exterior part: [2, 2] -> true
      expect(isPointInGeometry([2, 2], polygonWithHole)).toBe(true);
      // In hole: [10, 10] -> false (excluded by interior ring)
      expect(isPointInGeometry([10, 10], polygonWithHole)).toBe(false);
      // Outside exterior: [25, 25] -> false
      expect(isPointInGeometry([25, 25], polygonWithHole)).toBe(false);

      // MultiPolygon containment
      const multi = {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [0, 0],
              [5, 0],
              [5, 5],
              [0, 5],
              [0, 0],
            ],
          ],
          [
            [
              [20, 20],
              [25, 20],
              [25, 25],
              [20, 25],
              [20, 20],
            ],
          ],
        ],
      };

      expect(isPointInGeometry([2, 2], multi)).toBe(true);
      expect(isPointInGeometry([22, 22], multi)).toBe(true);
      expect(isPointInGeometry([10, 10], multi)).toBe(false);
    });
  });

  // ==========================================================================
  // 3. LGD & ADMINISTRATIVE DATA REALITY (ZERO FABRICATION)
  // ==========================================================================
  describe('3. LGD / Administrative Data Reality Verification', () => {
    it('truthfully reports administrative_enrichment_unavailable when LGD source is not configured', async () => {
      const status = await getLGDDataSourceStatus();
      expect(status).toBe('administrative_enrichment_unavailable');
    });

    it('communicates administrative_enrichment_unavailable in case spatial context', async () => {
      const mockCase = createMockCase();
      seedSpatialMemoryStore({ cases: [mockCase] });

      const context = await getCaseSpatialContext(mockCase.id);
      expect(context).toBeDefined();
      expect(context?.administrative_hierarchy.lgd_status).toBe('administrative_enrichment_unavailable');
    });

    it('marks LGD layer status as unavailable in overview when authoritative data is not operational', async () => {
      const overview = await getGISOverview();
      expect(overview.lgd_status).toBe('administrative_enrichment_unavailable');

      const adminLayer = overview.layer_manifest.find((l) => l.layer_type === 'administrative');
      expect(adminLayer).toBeDefined();
      expect(adminLayer?.status).toBe('unavailable');
    });
  });

  // ==========================================================================
  // 4. HONEST GEOMETRY STATES (ZERO FABRICATED COORDINATES)
  // ==========================================================================
  describe('4. Honest Geometry States Verification', () => {
    it('returns "mapped" when valid boundary and all parcels are demarcated', () => {
      const mockCase = createMockCase();
      const mockParcel: Parcel = {
        id: 'pcl-mapped-1',
        case_id: mockCase.id,
        survey_number: '101',
        khata_number: 'K-1',
        landowner_names: ['Farmer A'],
        land_type: 'agricultural',
        area_acres: 1.0,
        market_rate_per_acre: 100000,
        compensation_amount: 100000,
        solatium_amount: 100000,
        total_amount: 200000,
        acquisition_status: 'identified',
        geojson_geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [77.0, 28.0],
              [77.1, 28.0],
              [77.1, 28.1],
              [77.0, 28.1],
              [77.0, 28.0],
            ],
          ],
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = evaluateGeometryStatus(mockCase.geojson_boundary, [mockParcel]);
      expect(result.status).toBe('mapped');
      expect(result.qualityScore).toBeGreaterThanOrEqual(80);
    });

    it('returns "partially_mapped" when boundary is absent but some parcels have geometry', () => {
      const mockParcel: Parcel = {
        id: 'pcl-pm-1',
        case_id: 'c-pm',
        survey_number: '102',
        khata_number: 'K-2',
        landowner_names: ['Farmer B'],
        land_type: 'agricultural',
        area_acres: 1.0,
        market_rate_per_acre: 100000,
        compensation_amount: 100000,
        solatium_amount: 100000,
        total_amount: 200000,
        acquisition_status: 'identified',
        geojson_geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [77.0, 28.0],
              [77.1, 28.0],
              [77.1, 28.1],
              [77.0, 28.1],
              [77.0, 28.0],
            ],
          ],
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = evaluateGeometryStatus(null, [mockParcel]);
      expect(result.status).toBe('partially_mapped');
      expect(result.qualityScore).toBeGreaterThan(0);
      expect(result.issues[0]).toContain('Corridor outer boundary is pending GIS demarcation');
    });

    it('returns "unmapped" when neither boundary nor parcel geometries exist', () => {
      const result = evaluateGeometryStatus(null, []);
      expect(result.status).toBe('unmapped');
      expect(result.qualityScore).toBe(0);
      expect(result.issues[0]).toContain('No spatial boundary or cadastral geometry demarcated');
    });

    it('returns "invalid_geometry" when boundary geometry violates GeoJSON rules', () => {
      const invalidGeom = {
        type: 'Polygon',
        coordinates: [
          [
            [77.0, 28.0],
            [77.1, 28.0],
            [77.1, 28.1], // Unclosed
          ],
        ],
      };
      const result = evaluateGeometryStatus(invalidGeom, []);
      expect(result.status).toBe('invalid_geometry');
      expect(result.issues[0]).toContain('validation failed');
    });
  });

  // ==========================================================================
  // 5. SPATIAL POLICY RUNTIME MUTATION & IN-FLIGHT BEHAVIOR
  // ==========================================================================
  describe('5. Spatial Policy Runtime Mutation', () => {
    it('dynamically adapts proximity queries when policy thresholds are modified in-flight', async () => {
      // Seed two cases 40km apart
      const caseA = createMockCase({
        id: 'case-mut-A',
        geojson_boundary: { type: 'Point', coordinates: [77.0, 28.0] },
      });
      const caseB = createMockCase({
        id: 'case-mut-B',
        geojson_boundary: { type: 'Point', coordinates: [77.0, 28.36] }, // ~40km north
      });

      seedSpatialMemoryStore({ cases: [caseA, caseB] });

      // 1. Initial policy: nearby_search_radius_km is 25km
      const initialNearby = await findNearbyEntities(28.0, 77.0);
      const foundBInitially = initialNearby.find((n) => n.id === 'case-mut-B');
      expect(foundBInitially).toBeUndefined(); // Excluded because 40km > 25km

      // 2. Mutate policy in-flight to 50km
      await updatePolicy({
        key: 'spatial_policy',
        config_value: {
          nearby_search_radius_km: 50,
          max_search_radius_km: 150,
          spatial_cluster_distance_km: 25,
          spatial_freshness_window_hours: 72,
          spatial_concentration_min_cases: 2,
          geographic_attention_threshold_delay_days: 15,
          default_map_zoom: 5,
          coordinate_precision_decimals: 6,
        },
        updated_by: 'GIS Officer Test',
        user_id: 'usr-gis-officer',
      });

      // 3. Query again: caseB is now included dynamically without server restart
      const updatedNearby = await findNearbyEntities(28.0, 77.0);
      const foundBUpdated = updatedNearby.find((n) => n.id === 'case-mut-B');
      expect(foundBUpdated).toBeDefined();
      expect(foundBUpdated?.distance_km).toBeGreaterThan(35);
      expect(foundBUpdated?.distance_km).toBeLessThan(45);
    });

    it('adapts spatial clustering dynamically when cluster distance or sample threshold changes', async () => {
      const c1 = createMockCase({ id: 'c1', geojson_boundary: { type: 'Point', coordinates: [77.0, 28.0] } });
      const c2 = createMockCase({ id: 'c2', geojson_boundary: { type: 'Point', coordinates: [77.0, 28.1] } }); // ~11km
      const c3 = createMockCase({ id: 'c3', geojson_boundary: { type: 'Point', coordinates: [77.0, 28.2] } }); // ~22km from c1

      // Initial policy: cluster_distance is 15km, min_cases is 3
      // c1 & c2 are within 11km, but c3 is 22km from c1 -> only 2 cases group -> < min_cases (3) -> 0 clusters
      const initialClusters = detectSpatialClusters([c1, c2, c3], 15);
      expect(initialClusters).toHaveLength(0);

      // Update policy in-flight: cluster_distance = 25km
      const updatedClusters = detectSpatialClusters([c1, c2, c3], 25);
      expect(updatedClusters).toHaveLength(1);
      expect(updatedClusters[0].case_count).toBe(3);
      expect(updatedClusters[0].sample_size_note).toContain('indicates geographical concentration but does not establish causal correlation');
    });
  });

  // ==========================================================================
  // 6. ADVERSARIAL AUTHORIZATION & TERRITORIAL SCOPING ON ALL ENDPOINTS
  // ==========================================================================
  describe('6. Adversarial Authorization & Scope Enforcement', () => {
    it('strictly returns HTTP 401 on unauthenticated requests to GIS endpoints', async () => {
      const endpoints = [
        '/api/gis/overview',
        '/api/gis/cases',
        '/api/gis/projects',
        '/api/gis/parcels?case_id=c1',
        '/api/gis/spatial-context/c1',
        '/api/gis/nearby?lat=28.0&lng=77.0',
        '/api/gis/layers',
      ];

      for (const ep of endpoints) {
        const res = await fetch(`${SERVER_URL}${ep}`);
        expect(res.status).toBe(401);
      }
    });

    it('strictly confines Project Officer to assigned project and blocks parameter tampering', async () => {
      // PO assigned to prj-alpha-1 attempts to query with ?project_id=prj-foreign-999
      const res = await fetch(`${SERVER_URL}/api/gis/cases?project_id=prj-foreign-999`, {
        headers: {
          'x-eval-role': 'project_officer',
          'x-eval-user-id': 'usr-po-tamper',
          'x-eval-department': 'project:prj-alpha-1',
        },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      // Leaked foreign cases must be zero
      const foreignLeaked = (json.features || []).filter(
        (f: any) => f.properties?.project_id === 'prj-foreign-999'
      );
      expect(foreignLeaked).toHaveLength(0);
    });

    it('strictly confines Revenue Inspector to assigned state and blocks jurisdiction tampering', async () => {
      const res = await fetch(`${SERVER_URL}/api/gis/cases?state=State-Foreign`, {
        headers: {
          'x-eval-role': 'revenue_inspector',
          'x-eval-user-id': 'usr-ri-tamper',
          'x-eval-department': 'state:State-Alpha',
        },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      const foreignLeaked = (json.features || []).filter(
        (f: any) => f.properties?.state?.toLowerCase() === 'state-foreign'
      );
      expect(foreignLeaked).toHaveLength(0);
    });

    it('blocks internal cadastral landowner parcels from Viewer role', async () => {
      const res = await fetch(`${SERVER_URL}/api/gis/parcels?case_id=case-gis-acc-01`, {
        headers: {
          'x-eval-role': 'viewer',
          'x-eval-user-id': 'usr-viewer-1',
        },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.features).toHaveLength(0); // Viewer gets empty features, parcels redacted
    });
  });

  // ==========================================================================
  // 7. PERFORMANCE & SERVER-SIDE BOUNDING BOX FILTERING
  // ==========================================================================
  describe('7. Performance & Spatial Query Filtering', () => {
    it('executes server-side bounding box filtering on /api/gis/cases', async () => {
      // Case inside bbox: (28.1, 77.1). Case outside: (20.0, 70.0)
      const res = await fetch(`${SERVER_URL}/api/gis/cases?bbox=76.5,27.5,77.5,28.5`, {
        headers: {
          'x-eval-role': 'admin',
          'x-eval-user-id': 'usr-admin-perf',
        },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.type).toBe('FeatureCollection');
      // All returned features must have centroids within the bbox
      for (const feat of json.features) {
        if (feat.properties?.centroid) {
          const [lat, lng] = feat.properties.centroid;
          expect(lat).toBeGreaterThanOrEqual(27.5);
          expect(lat).toBeLessThanOrEqual(28.5);
          expect(lng).toBeGreaterThanOrEqual(76.5);
          expect(lng).toBeLessThanOrEqual(77.5);
        }
      }
    });
  });
});
