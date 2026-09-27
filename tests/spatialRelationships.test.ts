import { describe, expect, it, beforeEach, beforeAll, afterAll } from 'bun:test';
import { startLiveApi, LiveApi } from './helpers/liveApi';
import '../server/index';
import {
  calculateRingAreaSqMeters,
  calculateGeometryAreaHectares,
  computeGeometryIntersection,
  detectCadastralCollisions,
  detectSpatialAndCadastralRelationships,
  getPortfolioSpatialRelationships,
  seedSpatialMemoryStore,
  clearSpatialMemoryStore,
} from '../server/services/spatialIntelligenceService';
import { clearInMemoryAuditLogs } from '../server/services/auditLogger';
import { resetPoliciesToDefaults } from '../server/services/policyEngine';
import { AcquisitionCase, Parcel } from '../shared/types';
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

describe('Spatial & Cadastral Relationship Detection and Warning Engine', () => {
  beforeEach(() => {
    resetPoliciesToDefaults();
    clearInMemoryAuditLogs();
    clearSpatialMemoryStore();
  });

  // Synthetic standard polygon helpers
  const polygonA = {
    type: 'Polygon',
    coordinates: [
      [
        [82.90, 25.30],
        [82.92, 25.30],
        [82.92, 25.32],
        [82.90, 25.32],
        [82.90, 25.30],
      ],
    ],
  };

  // Overlaps partially with polygonA (shares [82.91, 25.31] to [82.92, 25.32])
  const polygonB_PartialOverlap = {
    type: 'Polygon',
    coordinates: [
      [
        [82.91, 25.31],
        [82.93, 25.31],
        [82.93, 25.33],
        [82.91, 25.33],
        [82.91, 25.31],
      ],
    ],
  };

  // Completely inside polygonA
  const polygonC_Enclosed = {
    type: 'Polygon',
    coordinates: [
      [
        [82.905, 25.305],
        [82.915, 25.305],
        [82.915, 25.315],
        [82.905, 25.315],
        [82.905, 25.305],
      ],
    ],
  };

  // Completely separate from polygonA (> 50 km away)
  const polygonD_Disjoint = {
    type: 'Polygon',
    coordinates: [
      [
        [83.50, 26.00],
        [83.52, 26.00],
        [83.52, 26.02],
        [83.50, 26.02],
        [83.50, 26.00],
      ],
    ],
  };

  describe('1. Polygon Area and Intersection Metric Calculations', () => {
    it('calculates polygon area in hectares accurately and deterministically', () => {
      const areaHa = calculateGeometryAreaHectares(polygonA);
      expect(areaHa).toBeGreaterThan(0);
      // Roughly 2km x 2.2km = ~440-500 Ha
      expect(areaHa).toBeGreaterThan(400);
      expect(areaHa).toBeLessThan(600);
    });

    it('returns zero intersection for disjoint non-overlapping polygons', () => {
      const intersection = computeGeometryIntersection(polygonA, polygonD_Disjoint);
      expect(intersection.intersectionAreaHectares).toBe(0);
      expect(intersection.intersectionGeoJSON).toBeNull();
      expect(intersection.sourceOverlapPct).toBe(0);
    });

    it('detects partial overlap and calculates intersection area and overlap percentages for both cases', () => {
      const intersection = computeGeometryIntersection(polygonA, polygonB_PartialOverlap);
      expect(intersection.intersectionAreaHectares).toBeGreaterThan(50);
      expect(intersection.sourceOverlapPct).toBeGreaterThan(15);
      expect(intersection.sourceOverlapPct).toBeLessThan(40);
      expect(intersection.targetOverlapPct).toBeGreaterThan(15);
      expect(intersection.intersectionGeoJSON).toBeDefined();
      expect(intersection.intersectionGeoJSON?.type).toBe('Polygon');
    });

    it('detects complete enclosure of a smaller case inside a larger corridor', () => {
      const intersection = computeGeometryIntersection(polygonC_Enclosed, polygonA);
      expect(intersection.sourceOverlapPct).toBeGreaterThan(95);
    });

    it('honestly handles missing or invalid geometries without throwing', () => {
      const nullA = computeGeometryIntersection(null, polygonA);
      expect(nullA.intersectionAreaHectares).toBe(0);
      expect(nullA.intersectionGeoJSON).toBeNull();

      const undefB = computeGeometryIntersection(polygonA, undefined);
      expect(undefB.intersectionAreaHectares).toBe(0);

      const pointGeom = computeGeometryIntersection({ type: 'Point', coordinates: [82.9, 25.3] }, polygonA);
      expect(pointGeom.intersectionAreaHectares).toBe(0);

      const emptyPoly = computeGeometryIntersection({ type: 'Polygon', coordinates: [] }, polygonA);
      expect(emptyPoly.intersectionAreaHectares).toBe(0);
    });
  });

  describe('2. Cadastral Collision Detection', () => {
    it('detects shared survey numbers across parcels in same administrative village', () => {
      const parcelsA: Parcel[] = [
        {
          id: 'p1',
          case_id: 'case-1',
          survey_number: '45/1',
          khata_number: 'KH-102',
          landowner_names: ['Ramesh Singh'],
          area_acres: 1.2,
          land_type: 'agricultural',
          acquisition_status: 'identified',
          compensation_amount: 100000,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      const parcelsB: Parcel[] = [
        {
          id: 'p2',
          case_id: 'case-2',
          survey_number: '45/1', // Duplicate survey
          khata_number: 'KH-102', // Duplicate khata
          landowner_names: ['Ramesh Singh'],
          area_acres: 1.2,
          land_type: 'agricultural',
          acquisition_status: 'identified',
          compensation_amount: 100000,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      const collisions = detectCadastralCollisions(parcelsA, parcelsB, 'Village X', 'Village X');
      expect(collisions.sharedSurveyNumbers).toContain('45/1');
      expect(collisions.sharedKhataNumbers).toContain('KH-102');
      expect(collisions.hasCollision).toBe(true);
    });

    it('does not flag cadastral collision if survey numbers are in different villages', () => {
      const parcelsA: Parcel[] = [
        {
          id: 'p1',
          case_id: 'case-1',
          survey_number: '45/1',
          khata_number: 'KH-102',
          landowner_names: ['Ramesh Singh'],
          area_acres: 1.2,
          land_type: 'agricultural',
          acquisition_status: 'identified',
          compensation_amount: 100000,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      const parcelsB: Parcel[] = [
        {
          id: 'p2',
          case_id: 'case-2',
          survey_number: '45/1',
          khata_number: 'KH-102',
          landowner_names: ['Suresh Patel'],
          area_acres: 1.2,
          land_type: 'agricultural',
          acquisition_status: 'identified',
          compensation_amount: 100000,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      const collisions = detectCadastralCollisions(parcelsA, parcelsB, 'Village North', 'Village South');
      expect(collisions.hasCollision).toBe(false);
      expect(collisions.sharedSurveyNumbers.length).toBe(0);
    });
  });

  describe('3. Dynamic Multi-Case Spatial Relationship Classifier & Advisory Engine', () => {
    it('detects boundary overlap and generates advisory recommendations with statutory guardrails', async () => {
      const case1: AcquisitionCase = {
        id: 'synth-case-100',
        project_id: 'proj-1',
        case_number: 'SYNTH/2026/100',
        title: 'Synthetic Highway Bypass Alignment',
        state: 'Uttar Pradesh',
        district: 'Varanasi',
        tehsil: 'Pindra',
        village: 'Ahiran',
        total_area_hectares: 50.0,
        estimated_compensation: 50000000,
        status: 'in_progress',
        current_stage: 'section_11_notification',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        geojson_boundary: polygonA,
      };

      const case2: AcquisitionCase = {
        id: 'synth-case-200',
        project_id: 'proj-2',
        case_number: 'SYNTH/2026/200',
        title: 'Synthetic Industrial Corridor Spur',
        state: 'Uttar Pradesh',
        district: 'Varanasi',
        tehsil: 'Pindra',
        village: 'Ahiran',
        total_area_hectares: 45.0,
        estimated_compensation: 45000000,
        status: 'in_progress',
        current_stage: 'section_19_declaration',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        geojson_boundary: polygonB_PartialOverlap,
      };

      const relationships = await detectSpatialAndCadastralRelationships(case1, [case1, case2]);
      expect(relationships.length).toBe(1);
      const rel = relationships[0];

      expect(rel.related_case_id).toBe('synth-case-200');
      expect(rel.relationship_type).toBe('boundary_overlap');
      expect(rel.overlap_pct).toBeGreaterThan(0);
      expect(rel.intersection_area_hectares).toBeGreaterThan(0);
      expect(rel.intersection_geojson).toBeDefined();

      // Verify recommendations are advisory and have statutory guardrails
      expect(rel.recommendations.length).toBeGreaterThanOrEqual(2);
      expect(rel.recommendations[0].statutory_guardrail).toContain('Advisory');
      expect(rel.recommendations[0].action_type).toBeDefined();
    });

    it('does NOT hardcode or require demo case IDs (works with completely arbitrary names & locations)', async () => {
      const customCaseA: AcquisitionCase = {
        id: 'arbitrary-uuid-alpha',
        project_id: 'custom-proj-999',
        case_number: 'ARBITRARY/CASE/ALPHA',
        title: 'Custom Renewable Energy Grid Spur',
        state: 'Rajasthan',
        district: 'Jaisalmer',
        tehsil: 'Pokhran',
        village: 'Khetolai',
        total_area_hectares: 120.0,
        estimated_compensation: 80000000,
        status: 'in_progress',
        current_stage: 'preliminary',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        geojson_boundary: {
          type: 'Polygon',
          coordinates: [
            [
              [71.80, 26.90],
              [71.85, 26.90],
              [71.85, 26.95],
              [71.80, 26.95],
              [71.80, 26.90],
            ],
          ],
        },
      };

      const customCaseB: AcquisitionCase = {
        id: 'arbitrary-uuid-beta',
        project_id: 'custom-proj-888',
        case_number: 'ARBITRARY/CASE/BETA',
        title: 'Custom Solar Park Feeder Corridor',
        state: 'Rajasthan',
        district: 'Jaisalmer',
        tehsil: 'Pokhran',
        village: 'Khetolai',
        total_area_hectares: 100.0,
        estimated_compensation: 60000000,
        status: 'in_progress',
        current_stage: 'preliminary',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        geojson_boundary: {
          type: 'Polygon',
          coordinates: [
            [
              [71.82, 26.92],
              [71.87, 26.92],
              [71.87, 26.97],
              [71.82, 26.97],
              [71.82, 26.92],
            ],
          ],
        },
      };

      const relationships = await detectSpatialAndCadastralRelationships(customCaseA, [customCaseA, customCaseB]);
      expect(relationships.length).toBe(1);
      expect(relationships[0].related_case_number).toBe('ARBITRARY/CASE/BETA');
      expect(relationships[0].relationship_type).toBe('boundary_overlap');
      expect(relationships[0].overlap_pct).toBeGreaterThan(0);
      expect(relationships[0].shared_admin_unit.village).toBe('Khetolai');
    });
  });

  describe('4. Portfolio Spatial Relationships Summary API and Auth Scoping', () => {
    it('summarizes portfolio relationships accurately across memory store', async () => {
      const mockCases: AcquisitionCase[] = [
        {
          id: 'case-p1',
          project_id: 'proj-1',
          case_number: 'CASE-P1',
          title: 'Corridor 1',
          state: 'Uttar Pradesh',
          district: 'Varanasi',
          tehsil: 'Pindra',
          village: 'Ahiran',
          total_area_hectares: 50.0,
          estimated_compensation: 50000000,
          status: 'in_progress',
          current_stage: 'section_11_notification',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          geojson_boundary: polygonA,
        },
        {
          id: 'case-p2',
          project_id: 'proj-2',
          case_number: 'CASE-P2',
          title: 'Corridor 2',
          state: 'Uttar Pradesh',
          district: 'Varanasi',
          tehsil: 'Pindra',
          village: 'Ahiran',
          total_area_hectares: 45.0,
          estimated_compensation: 45000000,
          status: 'in_progress',
          current_stage: 'section_19_declaration',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          geojson_boundary: polygonB_PartialOverlap,
        },
        {
          id: 'case-p3',
          project_id: 'proj-3',
          case_number: 'CASE-P3',
          title: 'Corridor 3 Isolated',
          state: 'Uttar Pradesh',
          district: 'Lucknow',
          tehsil: 'Bakshi Ka Talab',
          village: 'Bhatgaon',
          total_area_hectares: 30.0,
          estimated_compensation: 30000000,
          status: 'in_progress',
          current_stage: 'section_11_notification',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          geojson_boundary: polygonD_Disjoint,
        },
      ];

      seedSpatialMemoryStore(mockCases, [], []);

      const adminUser: AuthenticatedUser = {
        id: 'admin-1',
        email: 'admin@bhoomisetu.gov.in',
        name: 'System Admin',
        role: 'admin',
      };

      const summary = await getPortfolioSpatialRelationships(adminUser);
      expect(summary.total_relationships_detected).toBeGreaterThan(0);
      expect(summary.boundary_overlaps_count).toBeGreaterThan(0);
      expect(summary.cases_requiring_spatial_review?.length).toBeGreaterThan(0);
    });

    it('enforces territorial scoping so non-authorized cases are excluded', async () => {
      const mockCases: AcquisitionCase[] = [
        {
          id: 'case-varanasi-1',
          project_id: 'proj-1',
          case_number: 'VAR-01',
          title: 'Varanasi Case 1',
          state: 'Uttar Pradesh',
          district: 'Varanasi',
          tehsil: 'Pindra',
          village: 'Ahiran',
          total_area_hectares: 50.0,
          estimated_compensation: 50000000,
          status: 'in_progress',
          current_stage: 'section_11_notification',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          geojson_boundary: polygonA,
        },
        {
          id: 'case-varanasi-2',
          project_id: 'proj-2',
          case_number: 'VAR-02',
          title: 'Varanasi Case 2',
          state: 'Uttar Pradesh',
          district: 'Varanasi',
          tehsil: 'Pindra',
          village: 'Ahiran',
          total_area_hectares: 45.0,
          estimated_compensation: 45000000,
          status: 'in_progress',
          current_stage: 'section_19_declaration',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          geojson_boundary: polygonB_PartialOverlap,
        },
      ];

      seedSpatialMemoryStore(mockCases, [], []);

      // User restricted to Lucknow district should not see Varanasi relationships
      const restrictedUser: AuthenticatedUser = {
        id: 'ri-lucknow',
        email: 'ri.lucknow@bhoomisetu.gov.in',
        name: 'Lucknow Revenue Inspector',
        role: 'revenue_inspector',
        jurisdiction_district: 'Lucknow',
      };

      const summary = await getPortfolioSpatialRelationships(restrictedUser);
      expect(summary.total_relationships_detected).toBe(0);
      expect(summary.cases_requiring_spatial_review?.length).toBe(0);
    });
  });
});
