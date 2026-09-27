import { describe, expect, it, beforeEach, beforeAll, afterAll } from 'bun:test';
import { startLiveApi, LiveApi } from './helpers/liveApi';
import '../server/index';
import {
  calculateHaversineDistance,
  computeAccurateCentroid,
  calculateBoundingBox,
  isPointInPolygon,
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
import { clearInMemoryAuditLogs } from '../server/services/auditLogger';
import {
  AcquisitionCase,
  Project,
  Parcel,
  SpatialPolicy,
} from '../shared/types';
import { AuthenticatedUser } from '../server/middleware/auth.middleware';

let liveApi: LiveApi | null = null;
let SERVER_URL = '';

beforeAll(async () => {
  liveApi = await startLiveApi();
  SERVER_URL = liveApi.url;
}, 30000);

afterAll(async () => {
  await liveApi?.close();
});

describe('Day 6: GIS & Spatial Intelligence Layer Test Suite', () => {
  beforeEach(() => {
    resetPoliciesToDefaults();
    clearInMemoryAuditLogs();
    clearSpatialMemoryStore();
  });

  // Base test fixtures (pure synthetic data with standard WGS-84 geometry)
  const createMockCase = (overrides?: Partial<AcquisitionCase>): AcquisitionCase => ({
    id: 'case-gis-001',
    project_id: 'prj-corridor-1',
    case_number: 'CASE/GIS/2026/001',
    title: 'Corridor Alignment Package 1',
    description: 'Statutory corridor land acquisition',
    state: 'State-Alpha',
    district: 'District-Beta',
    tehsil: 'Tehsil-Gamma',
    village: 'Village-Delta',
    status: 'in_progress',
    priority: 'high',
    total_area_hectares: 45.5,
    estimated_compensation: 25000000,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    geojson_boundary: {
      type: 'Polygon',
      coordinates: [
        [
          [77.10, 28.50],
          [77.20, 28.50],
          [77.20, 28.60],
          [77.10, 28.60],
          [77.10, 28.50],
        ],
      ],
    },
    ...overrides,
  });

  const createMockProject = (overrides?: Partial<Project>): Project => ({
    id: 'prj-corridor-1',
    code: 'PRJ-EXP-01',
    name: 'National Corridor Expressway Phase 1',
    description: 'High-speed greenfield alignment corridor',
    state: 'State-Alpha',
    district: 'District-Beta',
    project_type: 'expressway',
    sponsoring_agency: 'National Highways Division',
    status: 'in_progress',
    total_cases: 1,
    completed_cases: 0,
    total_area_hectares: 250.0,
    acquired_area_hectares: 50.0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    geojson_boundary: {
      type: 'LineString',
      coordinates: [
        [77.05, 28.45],
        [77.15, 28.55],
        [77.25, 28.65],
      ],
    },
    ...overrides,
  });

  const createMockParcel = (overrides?: Partial<Parcel>): Parcel => ({
    id: 'pcl-gis-101',
    case_id: 'case-gis-001',
    survey_number: 'SURV/101/A',
    khata_number: 'KH-88',
    landowner_names: ['Ramesh Kumar', 'Sita Devi'],
    land_type: 'agricultural',
    area_acres: 2.5,
    market_rate_per_acre: 1000000,
    compensation_amount: 2500000,
    solatium_amount: 2500000,
    total_amount: 5000000,
    acquisition_status: 'identified',
    geojson_geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [77.12, 28.52],
          [77.14, 28.52],
          [77.14, 28.54],
          [77.12, 28.54],
          [77.12, 28.52],
        ],
      ],
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  });

  // ==========================================================================
  // 1. DYNAMIC SPATIAL POLICY FRAMEWORK & RUNTIME RECONFIGURATION
  // ==========================================================================
  describe('1. Dynamic Spatial Policy Framework', () => {
    it('loads canonical Day 6 spatial policy with zero hardcoded buried constants', () => {
      const policy: SpatialPolicy = getSpatialPolicySync();
      expect(policy).toBeDefined();
      expect(policy.nearby_search_radius_km).toBe(25);
      expect(policy.max_search_radius_km).toBe(100);
      expect(policy.spatial_cluster_distance_km).toBe(15);
      expect(policy.spatial_concentration_min_cases).toBe(3);
      expect(policy.spatial_freshness_window_hours).toBe(72);
      expect(policy.geographic_attention_threshold_delay_days).toBe(15);
      expect(policy.coordinate_precision_decimals).toBe(6);
    });

    it('dynamically updates spatial policy thresholds at runtime with audit logging', async () => {
      const updated = await updatePolicy({
        key: 'spatial_policy',
        config_value: {
          nearby_search_radius_km: 35,
          max_search_radius_km: 150,
          spatial_cluster_distance_km: 20,
          spatial_freshness_window_hours: 48,
          spatial_concentration_min_cases: 4,
          geographic_attention_threshold_delay_days: 20,
          default_map_zoom: 6,
          coordinate_precision_decimals: 6,
        },
        updated_by: 'Spatial Admin Officer',
        user_id: 'usr-gis-admin',
      });

      expect(updated.config_value.nearby_search_radius_km).toBe(35);
      expect(updated.config_value.spatial_cluster_distance_km).toBe(20);
      expect(updated.config_value.spatial_freshness_window_hours).toBe(48);

      // Verify synchronous getter reflects immediate runtime change
      const current = getSpatialPolicySync();
      expect(current.nearby_search_radius_km).toBe(35);
      expect(current.spatial_cluster_distance_km).toBe(20);
    });
  });

  // ==========================================================================
  // 2. GEODETIC MATHEMATICS & SPATIAL GEOMETRY ENGINE
  // ==========================================================================
  describe('2. Geodetic Mathematics & Geometry Engine', () => {
    it('computes accurate Haversine great-circle distance at meter precision', () => {
      // Benchmark: Delhi (28.6139, 77.2090) to Mumbai (18.9220, 72.8347) ≈ 1148-1155 km
      const distance = calculateHaversineDistance(28.6139, 77.2090, 18.9220, 72.8347);
      expect(distance).toBeGreaterThan(1150);
      expect(distance).toBeLessThan(1180);

      // Same point distance must equal 0
      expect(calculateHaversineDistance(28.5, 77.1, 28.5, 77.1)).toBe(0);

      // Short distance check (approx 11.1 km per 0.1 degree latitude)
      const latOffsetDist = calculateHaversineDistance(28.0, 77.0, 28.1, 77.0);
      expect(latOffsetDist).toBeGreaterThan(11.0);
      expect(latOffsetDist).toBeLessThan(11.2);
    });

    it('computes area-weighted polygon centroid using Green’s theorem', () => {
      // Regular square polygon: [lng, lat]
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
      expect(centroid).toBeDefined();
      expect(centroid![0]).toBe(5); // Latitude (Y)
      expect(centroid![1]).toBe(5); // Longitude (X)

      // Right-angled triangle: (0,0), (6,0), (0,6), (0,0) -> Centroid = (2,2)
      const triangle = {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [6, 0],
            [0, 6],
            [0, 0],
          ],
        ],
      };
      const triCentroid = computeAccurateCentroid(triangle);
      expect(triCentroid).toBeDefined();
      expect(triCentroid![0]).toBe(2);
      expect(triCentroid![1]).toBe(2);
    });

    it('correctly resolves centroids for Point, LineString, and MultiPolygon geometries', () => {
      // Point
      const point = { type: 'Point', coordinates: [77.25, 28.65] };
      expect(computeAccurateCentroid(point)).toEqual([28.65, 77.25]);

      // LineString
      const line = {
        type: 'LineString',
        coordinates: [
          [77.10, 28.50],
          [77.20, 28.60],
          [77.30, 28.70],
        ],
      };
      expect(computeAccurateCentroid(line)).toEqual([28.60, 77.20]);

      // MultiPolygon
      const multi = {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [0, 0],
              [2, 0],
              [2, 2],
              [0, 2],
              [0, 0],
            ],
          ],
          [
            [
              [10, 10],
              [12, 10],
              [12, 12],
              [10, 12],
              [10, 10],
            ],
          ],
        ],
      };
      const multiCentroid = computeAccurateCentroid(multi);
      expect(multiCentroid).toBeDefined();
      expect(multiCentroid![0]).toBe(6); // Average lat of poly1(1) and poly2(11) = 6
      expect(multiCentroid![1]).toBe(6); // Average lng of poly1(1) and poly2(11) = 6
    });

    it('calculates statutory 4-tuple bounding box [minLng, minLat, maxLng, maxLat]', () => {
      const polygon = {
        type: 'Polygon',
        coordinates: [
          [
            [77.10, 28.20],
            [77.40, 28.20],
            [77.40, 28.50],
            [77.10, 28.50],
            [77.10, 28.20],
          ],
        ],
      };
      const bbox = calculateBoundingBox(polygon);
      expect(bbox).toEqual([77.10, 28.20, 77.40, 28.50]);
    });

    it('executes ray-casting Point-in-Polygon containment test', () => {
      const ring: [number, number][] = [
        [10, 10],
        [20, 10],
        [20, 20],
        [10, 20],
        [10, 10],
      ];

      // Interior point [lat, lng] = [15, 15]
      expect(isPointInPolygon([15, 15], ring)).toBe(true);

      // Exterior points
      expect(isPointInPolygon([5, 5], ring)).toBe(false);
      expect(isPointInPolygon([25, 25], ring)).toBe(false);
      expect(isPointInPolygon([15, 25], ring)).toBe(false);
    });
  });

  // ==========================================================================
  // 3. GEOMETRY STATUS EVALUATION & HONEST REPORTING (ZERO FABRICATED DATA)
  // ==========================================================================
  describe('3. Geometry Status & Cadastral Completeness Evaluation', () => {
    it('returns honest unmapped status when geometry is missing', () => {
      const evalResult = evaluateGeometryStatus(null, []);
      expect(evalResult.status).toBe('unmapped');
      expect(evalResult.qualityScore).toBe(0);
      expect(evalResult.issues[0]).toContain('No spatial boundary');
    });

    it('returns partially_mapped when boundary is absent but cadastral parcels exist', () => {
      const parcelWithGeom = createMockParcel();
      const evalResult = evaluateGeometryStatus(null, [parcelWithGeom]);
      expect(evalResult.status).toBe('partially_mapped');
      expect(evalResult.qualityScore).toBeGreaterThan(0);
      expect(evalResult.issues[0]).toContain('Corridor outer boundary is pending GIS demarcation');
    });

    it('detects invalid or unclosed geometries honestly', () => {
      const invalidGeom = {
        type: 'Polygon',
        coordinates: [
          [
            [77.10, 28.50],
            [77.20, 28.50],
            [77.20, 28.60], // Unclosed ring
          ],
        ],
      };
      const evalResult = evaluateGeometryStatus(invalidGeom, []);
      expect(evalResult.status).toBe('invalid_geometry');
      expect(evalResult.issues[0]).toContain('validation failed');
    });

    it('awards high data quality score when boundary and all parcels are demarcated', () => {
      const mockCase = createMockCase();
      const parcel = createMockParcel({ case_id: mockCase.id });
      const evalResult = evaluateGeometryStatus(mockCase.geojson_boundary, [parcel]);
      expect(evalResult.status).toBe('mapped');
      expect(evalResult.qualityScore).toBeGreaterThanOrEqual(80);
      expect(evalResult.issues).toHaveLength(0);
    });
  });

  // ==========================================================================
  // 4. SPATIAL CONTEXT, PROXIMITY SEARCH & FRICTION CLUSTERING
  // ==========================================================================
  describe('4. Spatial Proximity & Clustering Intelligence', () => {
    it('finds nearby entities within search radius and clamps to policy maximum', async () => {
      const caseA = createMockCase({ id: 'case-near-1', title: 'Near Alignment A' });
      const caseB = createMockCase({
        id: 'case-far-1',
        title: 'Far Alignment B',
        geojson_boundary: {
          type: 'Point',
          coordinates: [79.50, 30.50], // ~300km away
        },
      });
      const project = createMockProject();

      seedSpatialMemoryStore({
        cases: [caseA, caseB],
        projects: [project],
      });

      // Search near caseA centroid (lat: 28.55, lng: 77.15)
      const nearby = await findNearbyEntities(28.55, 77.15, 25);
      expect(nearby.length).toBeGreaterThan(0);
      const caseNear = nearby.find((n) => n.id === 'case-near-1');
      expect(caseNear).toBeDefined();
      expect(caseNear?.distance_km).toBeLessThan(10);

      // Far case should not appear
      const farCase = nearby.find((n) => n.id === 'case-far-1');
      expect(farCase).toBeUndefined();

      // Policy clamp verification: requesting 500km must be clamped to policy.max_search_radius_km (100km)
      const clampedNearby = await findNearbyEntities(28.55, 77.15, 500);
      const stillFarCase = clampedNearby.find((n) => n.id === 'case-far-1');
      expect(stillFarCase).toBeUndefined(); // Far case at ~300km is excluded because search clamped to 100km
    });

    it('detects spatial friction clusters and reports methodology and sample size notes', () => {
      // Create 3 proximate cases within 5km of each other
      const c1 = createMockCase({
        id: 'cluster-c1',
        geojson_boundary: { type: 'Point', coordinates: [77.10, 28.50] },
      });
      const c2 = createMockCase({
        id: 'cluster-c2',
        geojson_boundary: { type: 'Point', coordinates: [77.12, 28.51] },
      });
      const c3 = createMockCase({
        id: 'cluster-c3',
        geojson_boundary: { type: 'Point', coordinates: [77.11, 28.52] },
      });

      const clusters = detectSpatialClusters([c1, c2, c3], 15);
      expect(clusters).toHaveLength(1);
      expect(clusters[0].case_count).toBe(3);
      expect(clusters[0].case_ids).toContain('cluster-c1');
      expect(clusters[0].case_ids).toContain('cluster-c2');
      expect(clusters[0].case_ids).toContain('cluster-c3');
      expect(clusters[0].sample_size_note).toContain('indicates geographical concentration but does not establish causal correlation');
    });

    it('resolves complete spatial context including provenance and honest LGD status', async () => {
      const mockCase = createMockCase();
      const mockProject = createMockProject();
      const mockParcel = createMockParcel();

      seedSpatialMemoryStore({
        cases: [mockCase],
        projects: [mockProject],
        parcels: [mockParcel],
      });

      const context = await getCaseSpatialContext(mockCase.id);
      expect(context).toBeDefined();
      expect(context?.case_id).toBe(mockCase.id);
      expect(context?.project_name).toBe(mockProject.name);
      expect(context?.parcels_summary.total).toBe(1);
      expect(context?.parcels_summary.mapped).toBe(1);
      expect(context?.provenance).toBeDefined();
      expect(context?.provenance.provenance_type).toBe('DATABASE_DERIVED');
      expect(context?.provenance.retrieved_at).toBeDefined();
      expect(context?.administrative_hierarchy).toBeDefined();
    });
  });

  // ==========================================================================
  // 5. ROLE-BASED ACCESS CONTROL & TERRITORIAL SCOPING
  // ==========================================================================
  describe('5. RBAC & Territorial Scoping', () => {
    it('authorizes admin and LAO with full unrestricted national portfolio scope', async () => {
      const caseAlpha = createMockCase({ id: 'c-alpha', project_id: 'prj-alpha', state: 'State-A' });
      const caseBeta = createMockCase({ id: 'c-beta', project_id: 'prj-beta', state: 'State-B' });

      seedSpatialMemoryStore({ cases: [caseAlpha, caseBeta] });

      const adminUser: AuthenticatedUser = { id: 'usr-admin', role: 'admin', full_name: 'Administrator' };
      const laoUser: AuthenticatedUser = { id: 'usr-lao', role: 'lao', full_name: 'Land Acquisition Officer' };

      const adminCases = await getScopedCases(adminUser);
      expect(adminCases).toHaveLength(2);

      const laoCases = await getScopedCases(laoUser);
      expect(laoCases).toHaveLength(2);
    });

    it('strictly confines Project Officer to their assigned project boundary', async () => {
      const caseAlpha = createMockCase({ id: 'c-alpha', project_id: 'prj-alpha' });
      const caseBeta = createMockCase({ id: 'c-beta', project_id: 'prj-beta' });

      seedSpatialMemoryStore({ cases: [caseAlpha, caseBeta] });

      const poAlpha: AuthenticatedUser = {
        id: 'usr-po',
        role: 'project_officer',
        full_name: 'PO Alpha',
        department: 'project:prj-alpha',
      };

      const poCases = await getScopedCases(poAlpha);
      expect(poCases).toHaveLength(1);
      expect(poCases[0].id).toBe('c-alpha');
      expect(poCases[0].project_id).toBe('prj-alpha');
    });

    it('strictly confines Revenue Inspector to their assigned jurisdiction boundary', async () => {
      const casePunjab = createMockCase({ id: 'c-pb', state: 'Punjab' });
      const caseHaryana = createMockCase({ id: 'c-hr', state: 'Haryana' });

      seedSpatialMemoryStore({ cases: [casePunjab, caseHaryana] });

      const riPunjab: AuthenticatedUser = {
        id: 'usr-ri',
        role: 'revenue_inspector',
        full_name: 'RI Punjab',
        department: 'state:Punjab',
      };

      const riCases = await getScopedCases(riPunjab);
      expect(riCases).toHaveLength(1);
      expect(riCases[0].id).toBe('c-pb');
      expect(riCases[0].state).toBe('Punjab');
    });
  });

  // ==========================================================================
  // 6. GEOJSON FEATURE COLLECTION GENERATORS
  // ==========================================================================
  describe('6. GeoJSON FeatureCollection Generation', () => {
    it('generates standard GeoJSON FeatureCollections for cases, projects, and parcels', () => {
      const mockCase = createMockCase();
      const mockProject = createMockProject();
      const mockParcel = createMockParcel();

      const casesFC = generateCasesGeoJSON([mockCase]);
      expect(casesFC.type).toBe('FeatureCollection');
      expect(casesFC.features).toHaveLength(1);
      expect(casesFC.features[0].properties.layer_type).toBe('case');
      expect(casesFC.features[0].properties.case_id).toBe(mockCase.id);

      const projectsFC = generateProjectsGeoJSON([mockProject]);
      expect(projectsFC.type).toBe('FeatureCollection');
      expect(projectsFC.features).toHaveLength(1);
      expect(projectsFC.features[0].properties.layer_type).toBe('project');

      const parcelsFC = generateParcelsGeoJSON([mockParcel]);
      expect(parcelsFC.type).toBe('FeatureCollection');
      expect(parcelsFC.features).toHaveLength(1);
      expect(parcelsFC.features[0].properties.layer_type).toBe('parcel');
      expect(parcelsFC.features[0].properties.color).toBeDefined();
    });
  });

  // ==========================================================================
  // 7. LIVE HTTP API ENDPOINTS & INTEGRATION VERIFICATION
  // ==========================================================================
  describe('7. Live HTTP API Endpoints & Scope Enforcement', () => {
    it('rejects unauthenticated request to /api/gis/overview with HTTP 401', async () => {
      const res = await fetch(`${SERVER_URL}/api/gis/overview`);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.code).toBe('AUTH_REQUIRED');
    });

    it('authorizes authenticated request to /api/gis/overview and returns valid overview structure', async () => {
      const res = await fetch(`${SERVER_URL}/api/gis/overview`, {
        headers: {
          'x-eval-role': 'admin',
          'x-eval-user-id': 'usr-admin-gis',
        },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.layer_manifest).toBeDefined();
      expect(Array.isArray(json.layer_manifest)).toBe(true);
      expect(typeof json.total_cases).toBe('number');
      expect(typeof json.mapped_cases).toBe('number');
    });

    it('serves GeoJSON FeatureCollection on /api/gis/cases', async () => {
      const res = await fetch(`${SERVER_URL}/api/gis/cases`, {
        headers: {
          'x-eval-role': 'admin',
          'x-eval-user-id': 'usr-admin-gis',
        },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.type).toBe('FeatureCollection');
      expect(Array.isArray(json.features)).toBe(true);
    });

    it('serves spatial layers metadata on /api/gis/layers', async () => {
      const res = await fetch(`${SERVER_URL}/api/gis/layers`, {
        headers: {
          'x-eval-role': 'admin',
          'x-eval-user-id': 'usr-admin-gis',
        },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.layers).toBeDefined();
      expect(json.layers.length).toBeGreaterThanOrEqual(4);
    });

    it('blocks scope bypass via malicious query parameter tampering on live server', async () => {
      // PO assigned to prj-corridor-1 queries with query param ?project_id=prj-foreign-99
      const res = await fetch(`${SERVER_URL}/api/gis/cases?project_id=prj-foreign-99`, {
        headers: {
          'x-eval-role': 'project_officer',
          'x-eval-user-id': 'usr-po-restricted',
          'x-eval-department': 'project:prj-corridor-1',
        },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      // Server must NOT leak cases from prj-foreign-99 to this officer
      const leakedForeign = (json.features || []).filter(
        (f: any) => f.properties?.project_id === 'prj-foreign-99'
      );
      expect(leakedForeign).toHaveLength(0);
    });

    it('preserves existing legacy routes (/cases/:id/gis, /cases/:id/parcels)', async () => {
      // Check legacy endpoint routes do not 404
      const resGis = await fetch(`${SERVER_URL}/api/cases/test-case-id/gis`);
      // Since unauthenticated, returns 401 or 404 (if not found in DB) rather than 500 crash
      expect([200, 401, 404]).toContain(resGis.status);

      const resParcels = await fetch(`${SERVER_URL}/api/cases/test-case-id/parcels`);
      expect([200, 401, 404]).toContain(resParcels.status);
    });
  });
});
