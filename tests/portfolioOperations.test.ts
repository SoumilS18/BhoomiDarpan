import { describe, expect, it } from 'bun:test';
import {
  analyzePortfolioOperations,
  extractGeometryCentroid,
  CaseEnrichedForPortfolio,
} from '../server/services/portfolioAnalyzer';
import { WorkflowStage, StageDependency } from '../shared/types';

describe('Day 4 National & Portfolio Operations Layer', () => {
  const mockStages: WorkflowStage[] = [
    {
      id: 'stg-1',
      workflow_id: 'wf-expressway',
      stage_number: 1,
      code: 'SEC_4_SIA',
      title: 'Section 4 SIA Study',
      default_duration_days: 20,
      is_mandatory: true,
      required_documents: [],
      completion_criteria: {},
      escalation_threshold_days: 5,
      created_at: '2026-01-01',
    },
    {
      id: 'stg-2',
      workflow_id: 'wf-expressway',
      stage_number: 2,
      code: 'SEC_11_NOTIF',
      title: 'Section 11 Preliminary Notification',
      default_duration_days: 25,
      is_mandatory: true,
      required_documents: [],
      completion_criteria: {},
      escalation_threshold_days: 5,
      created_at: '2026-01-01',
    },
    {
      id: 'stg-3',
      workflow_id: 'wf-expressway',
      stage_number: 3,
      code: 'SEC_15_HEARING',
      title: 'Section 15 Hearing of Objections',
      default_duration_days: 30,
      is_mandatory: true,
      required_documents: [],
      completion_criteria: {},
      escalation_threshold_days: 5,
      created_at: '2026-01-01',
    },
  ];

  const mockDependencies: StageDependency[] = [
    {
      id: 'dep-1',
      workflow_id: 'wf-expressway',
      stage_id: 'stg-2',
      depends_on_stage_id: 'stg-1',
      dependency_type: 'finish_to_start',
      lag_days: 0,
      created_at: '2026-01-01',
    },
    {
      id: 'dep-2',
      workflow_id: 'wf-expressway',
      stage_id: 'stg-3',
      depends_on_stage_id: 'stg-2',
      dependency_type: 'finish_to_start',
      lag_days: 2,
      created_at: '2026-01-01',
    },
  ];

  const mockCases: CaseEnrichedForPortfolio[] = [
    // Case 1: Delayed with bottleneck and unverified documents
    {
      id: 'case-1',
      case_number: 'LA-2026-DELHI-001',
      title: 'Delhi-Meerut Corridor Section 1',
      project_id: 'proj-1',
      project: {
        id: 'proj-1',
        name: 'Delhi-Meerut Expressway',
        code: 'DME-01',
        project_type: 'highway',
        sponsoring_agency: 'NHAI',
        status: 'active',
        state: 'Delhi',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
      workflow_id: 'wf-expressway',
      workflow: { id: 'wf-expressway', name: 'NHAI Statutory Expressway Workflow' },
      state: 'Delhi',
      district: 'North East Delhi',
      village: 'Mandoli',
      total_area_hectares: 85.5,
      estimated_compensation: 35000000,
      status: 'delayed',
      priority: 'critical',
      start_date: '2026-01-01',
      expected_completion_date: '2026-04-15',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-02-15T00:00:00Z',
      stage_instances: [
        {
          id: 'inst-1',
          case_id: 'case-1',
          stage_id: 'stg-1',
          status: 'completed',
          expected_start_date: '2026-01-01',
          expected_end_date: '2026-01-20',
          actual_start_date: '2026-01-01',
          actual_end_date: '2026-01-20',
          delay_days: 0,
          updated_at: '2026-01-20',
          stage: mockStages[0],
        },
        {
          id: 'inst-2',
          case_id: 'case-1',
          stage_id: 'stg-2',
          status: 'in_progress',
          expected_start_date: '2026-01-21',
          expected_end_date: '2026-02-15',
          actual_start_date: '2026-01-21',
          delay_days: 14,
          updated_at: '2026-02-15',
          stage: mockStages[1],
        },
      ],
      documents: [
        {
          id: 'doc-1',
          case_id: 'case-1',
          title: 'Section 11 Gazette Notice',
          file_name: 'gazette.pdf',
          file_path: 'case-1/gazette.pdf',
          file_size_bytes: 1024,
          mime_type: 'application/pdf',
          document_type: 'section_11_preliminary',
          status: 'validation_required',
          created_at: '2026-01-25',
          updated_at: '2026-01-25',
        },
      ],
      parcels: [],
      geojson_boundary: {
        type: 'Polygon',
        coordinates: [
          [
            [77.20, 28.60],
            [77.25, 28.60],
            [77.25, 28.65],
            [77.20, 28.65],
            [77.20, 28.60],
          ],
        ],
      },
    },

    // Case 2: Clean, on-schedule case in Haryana
    {
      id: 'case-2',
      case_number: 'LA-2026-HAR-002',
      title: 'Kundli Bypass Expansion',
      project_id: 'proj-2',
      project: {
        id: 'proj-2',
        name: 'Western Peripheral Expressway',
        code: 'WPE-02',
        project_type: 'highway',
        sponsoring_agency: 'HSIIDC',
        status: 'active',
        state: 'Haryana',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
      workflow_id: 'wf-expressway',
      workflow: { id: 'wf-expressway', name: 'NHAI Statutory Expressway Workflow' },
      state: 'Haryana',
      district: 'Sonipat',
      village: 'Kundli',
      total_area_hectares: 42.0,
      estimated_compensation: 18000000,
      status: 'active',
      priority: 'medium',
      start_date: '2026-02-01',
      expected_completion_date: '2026-06-30',
      created_at: '2026-02-01T00:00:00Z',
      updated_at: '2026-02-15T00:00:00Z',
      stage_instances: [
        {
          id: 'inst-3',
          case_id: 'case-2',
          stage_id: 'stg-1',
          status: 'in_progress',
          expected_start_date: '2026-02-01',
          expected_end_date: '2026-03-15',
          actual_start_date: '2026-02-01',
          delay_days: 0,
          updated_at: '2026-02-01',
          stage: mockStages[0],
        },
      ],
      documents: [],
      parcels: [],
    },
  ];

  describe('Portfolio Aggregations & Multi-Case Analytics', () => {
    it('aggregates portfolio metrics accurately without hardcoding', () => {
      const result = analyzePortfolioOperations({
        cases: mockCases,
        workflows: [{ id: 'wf-expressway', name: 'Expressway Model', stages: mockStages }],
        dependencies: mockDependencies,
        currentDateStr: '2026-02-28',
      });

      expect(result.summary.total_cases).toBe(2);
      expect(result.summary.active_cases).toBe(2);
      expect(result.summary.delayed_cases).toBe(1);
      expect(result.summary.total_area_hectares).toBe(127.5);
      expect(result.summary.total_compensation_allocated).toBe(53000000);
      expect(result.available_filters.states).toContain('Delhi');
      expect(result.available_filters.states).toContain('Haryana');
    });

    it('handles empty database state with honest zeros and empty collections', () => {
      const result = analyzePortfolioOperations({
        cases: [],
      });

      expect(result.summary.total_cases).toBe(0);
      expect(result.summary.active_cases).toBe(0);
      expect(result.summary.delayed_cases).toBe(0);
      expect(result.summary.at_risk_cases).toBe(0);
      expect(result.attention_queue.length).toBe(0);
      expect(result.bottlenecks.length).toBe(0);
      expect(result.geographic_cases.length).toBe(0);
      expect(result.available_filters.states.length).toBe(0);
    });
  });

  describe('Operational Attention Queue', () => {
    it('filters cases into the Attention Queue based strictly on actual friction triggers', () => {
      const result = analyzePortfolioOperations({
        cases: mockCases,
        workflows: [{ id: 'wf-expressway', name: 'Expressway Model', stages: mockStages }],
        dependencies: mockDependencies,
        currentDateStr: '2026-02-28',
      });

      // Case 1 should enter Attention Queue (delay >= 10, bottleneck on stage 2, unverified doc)
      expect(result.attention_queue.length).toBe(1);
      const item = result.attention_queue[0];
      expect(item.case_id).toBe('case-1');
      expect(item.case_number).toBe('LA-2026-DELHI-001');
      expect(item.unverified_docs_count).toBe(1);
      expect(item.has_active_bottleneck).toBe(true);
      expect(item.primary_evidence).toContain('Active bottleneck');

      // Case 2 is clean and must NOT enter the Attention Queue
      const case2InQueue = result.attention_queue.find((q) => q.case_id === 'case-2');
      expect(case2InQueue).toBeUndefined();
    });
  });

  describe('Multi-Dimensional Query Filtering', () => {
    it('filters by state correctly', () => {
      const delhiResult = analyzePortfolioOperations({
        cases: mockCases,
        filters: { state: 'Delhi' },
        currentDateStr: '2026-02-28',
      });

      expect(delhiResult.summary.total_cases).toBe(1);
      expect(delhiResult.summary.delayed_cases).toBe(1);

      const haryanaResult = analyzePortfolioOperations({
        cases: mockCases,
        filters: { state: 'Haryana' },
        currentDateStr: '2026-02-28',
      });

      expect(haryanaResult.summary.total_cases).toBe(1);
      expect(haryanaResult.summary.delayed_cases).toBe(0);
    });

    it('filters by status correctly', () => {
      const delayedResult = analyzePortfolioOperations({
        cases: mockCases,
        filters: { status: 'delayed' },
        currentDateStr: '2026-02-28',
      });

      expect(delayedResult.summary.total_cases).toBe(1);
      expect(delayedResult.attention_queue.length).toBe(1);
    });
  });

  describe('Systemic Bottleneck Aggregations', () => {
    it('groups active bottlenecks by stage and computes accumulated delay', () => {
      const result = analyzePortfolioOperations({
        cases: mockCases,
        workflows: [{ id: 'wf-expressway', name: 'Expressway Model', stages: mockStages }],
        dependencies: mockDependencies,
        currentDateStr: '2026-02-28',
      });

      expect(result.bottlenecks.length).toBeGreaterThanOrEqual(1);
      const b11 = result.bottlenecks.find((b) => b.stage_title.includes('Section 11'));
      expect(b11).toBeDefined();
      expect(b11?.delayed_cases_count).toBe(1);
      expect(b11?.affected_case_ids).toContain('case-1');
      expect(b11?.average_delay_days).toBeGreaterThanOrEqual(10);
    });
  });

  describe('Workflow Duration Performance SLA Calculations', () => {
    it('computes expected vs actual durations across arbitrary workflows', () => {
      const result = analyzePortfolioOperations({
        cases: mockCases,
        workflows: [{ id: 'wf-expressway', name: 'NHAI Statutory Expressway Workflow', stages: mockStages }],
        dependencies: mockDependencies,
        currentDateStr: '2026-02-28',
      });

      expect(result.workflow_performance.length).toBe(1);
      const wf = result.workflow_performance[0];
      expect(wf.workflow_id).toBe('wf-expressway');
      expect(wf.total_cases).toBe(2);
      expect(wf.stage_metrics.length).toBeGreaterThanOrEqual(2);

      const stg1 = wf.stage_metrics.find((sm) => sm.stage_code === 'SEC_4_SIA');
      expect(stg1).toBeDefined();
      expect(stg1?.expected_duration_days).toBe(20);
    });
  });

  describe('Geographic Centroid Extraction (Zero Hardcoding)', () => {
    it('calculates genuine centroid [lat, lng] from GeoJSON polygon coordinates', () => {
      const polygonGeoJSON = {
        type: 'Polygon',
        coordinates: [
          [
            [77.0, 28.0],
            [78.0, 28.0],
            [78.0, 29.0],
            [77.0, 29.0],
            [77.0, 28.0],
          ],
        ],
      };

      const centroid = extractGeometryCentroid(polygonGeoJSON);
      expect(centroid).toBeDefined();
      expect(centroid?.[0]).toBeCloseTo(28.4, 1); // Lat
      expect(centroid?.[1]).toBeCloseTo(77.4, 1); // Lng
    });

    it('returns undefined when geometry is absent or invalid without fabricating coordinates', () => {
      expect(extractGeometryCentroid(null)).toBeUndefined();
      expect(extractGeometryCentroid({})).toBeUndefined();
      expect(extractGeometryCentroid({ type: 'Polygon', coordinates: [] })).toBeUndefined();
    });
  });
});
