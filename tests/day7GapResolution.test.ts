import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { startLiveApi, LiveApi } from './helpers/liveApi';
import '../server/index';
import { calculateDeterministicRiskAssessment } from '../server/services/riskAssessment';
import { detectCaseBottlenecks } from '../server/services/bottleneckDetector';
import { detectMissingStageDocuments } from '../server/services/documentExtractor';
import { advanceStageInstance } from '../server/services/workflowEngine';
import { analyzePortfolioOutcomes } from '../server/services/portfolioAnalyzer';
import {
  AcquisitionCase,
  CaseStageInstance,
  WorkflowStage,
  StageDependency,
  CaseDocument,
  Parcel,
  CaseDispute,
  Recommendation,
} from '../shared/types';

let liveApi: LiveApi | null = null;
let API_BASE = '';

beforeAll(async () => {
  liveApi = await startLiveApi();
  API_BASE = `${liveApi.url}/api`;
}, 30000);

afterAll(async () => {
  await liveApi?.close();
});

const mockCase: AcquisitionCase = {
  id: 'case-day7-001',
  case_number: 'CASE-2026-D7-001',
  project_id: 'proj-001',
  workflow_id: 'wf-001',
  title: 'Day 7 Stabilization Corridor',
  state: 'Maharashtra',
  district: 'Pune',
  tehsil: 'Haveli',
  village: 'Hadapsar',
  status: 'active',
  priority: 'high',
  total_area_hectares: 45.2,
  estimated_compensation: 25000000,
  start_date: '2026-01-01',
  expected_completion_date: '2026-12-31',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const mockStages: WorkflowStage[] = [
  {
    id: 'stage-1',
    workflow_id: 'wf-001',
    stage_number: 1,
    code: 'SEC_4_SIA',
    title: 'Section 4 SIA Study',
    description: 'Social Impact Assessment',
    default_duration_days: 30,
    is_mandatory: true,
    required_documents: ['SIA_REPORT', 'SIMP_ENVIRONMENTAL_PLAN'],
    completion_criteria: {},
    escalation_threshold_days: 5,
    created_at: '2026-01-01',
  },
  {
    id: 'stage-2',
    workflow_id: 'wf-001',
    stage_number: 2,
    code: 'SEC_11_NOTIF',
    title: 'Section 11 Preliminary Notification',
    description: 'Preliminary Notification Publication',
    default_duration_days: 60,
    is_mandatory: true,
    required_documents: ['SEC_11_GAZETTE_NOTICE'],
    completion_criteria: {},
    escalation_threshold_days: 10,
    created_at: '2026-01-01',
  },
];

const mockInstances: CaseStageInstance[] = [
  {
    id: 'inst-1',
    case_id: 'case-day7-001',
    stage_id: 'stage-1',
    status: 'in_progress',
    expected_start_date: '2026-01-01',
    expected_end_date: '2026-01-31',
    actual_start_date: '2026-01-01',
    delay_days: 0,
    updated_at: '2026-01-01',
    stage: mockStages[0],
  },
  {
    id: 'inst-2',
    case_id: 'case-day7-001',
    stage_id: 'stage-2',
    status: 'not_started',
    expected_start_date: '2026-02-01',
    expected_end_date: '2026-04-01',
    delay_days: 0,
    updated_at: '2026-01-01',
    stage: mockStages[1],
  },
];

const mockDependencies: StageDependency[] = [
  {
    id: 'dep-1',
    workflow_id: 'wf-001',
    stage_id: 'stage-2',
    depends_on_stage_id: 'stage-1',
    dependency_type: 'finish_to_start',
    lag_days: 0,
    created_at: '2026-01-01',
  },
];

describe('Day 7 Product Gap Resolution & Stabilization Suite', () => {
  // ==========================================================================
  // 1. Missing Statutory Documents Detection & Risk Elevation
  // ==========================================================================
  describe('1. Missing Statutory Documents Detection & Risk Elevation', () => {
    it('detects missing documents for active stages accurately', () => {
      const missingReports = detectMissingStageDocuments({
        stages: mockStages,
        stageInstances: mockInstances,
        documents: [],
      });

      expect(missingReports.length).toBeGreaterThan(0);
      const stage1Report = missingReports.find((r) => r.stage_id === 'stage-1');
      expect(stage1Report).toBeDefined();
      expect(stage1Report?.missing_documents).toContain('SIA_REPORT');
      expect(stage1Report?.missing_documents).toContain('SIMP_ENVIRONMENTAL_PLAN');
      expect(stage1Report?.is_blocking).toBe(true);
    });

    it('elevates risk score and documents friction when mandatory statutory documents are missing', () => {
      const assessment = calculateDeterministicRiskAssessment({
        caseItem: mockCase,
        stageInstances: mockInstances,
        stages: mockStages,
        dependencies: mockDependencies,
        documents: [],
        currentDateStr: '2026-01-15',
      });

      expect(assessment.factor_breakdown.missing_documents_score).toBeGreaterThan(0);
      expect(assessment.factor_breakdown.missing_document_reports).toBeDefined();
      expect(assessment.factor_breakdown.missing_document_reports?.length).toBeGreaterThan(0);
      expect(
        assessment.observed_facts.some((f) => f.includes('mandatory statutory document(s) missing'))
      ).toBe(true);
    });

    it('flags missing statutory documents as active bottlenecks in bottleneckDetector', () => {
      const bottlenecks = detectCaseBottlenecks({
        caseId: mockCase.id,
        stageInstances: mockInstances,
        stages: mockStages,
        dependencies: mockDependencies,
        documents: [],
      });

      expect(bottlenecks.length).toBeGreaterThan(0);
      const docBottleneck = bottlenecks.find((b) => b.evidence.includes('Missing mandatory statutory document'));
      expect(docBottleneck).toBeDefined();
      expect(docBottleneck?.evidence).toContain('SIA_REPORT');
    });
  });

  // ==========================================================================
  // 2. Spatial Geometry Quality Risk Dimension (Dimension 7)
  // ==========================================================================
  describe('2. Spatial Geometry Quality Risk Dimension', () => {
    it('evaluates invalid geometry and elevates spatial risk impact score', () => {
      const invalidCase: AcquisitionCase = {
        ...mockCase,
        geojson_boundary: {
          type: 'Polygon',
          coordinates: [
            [
              [73.8567, 18.5204],
              [73.8600, 18.5250],
              [73.8567, 18.5204], // Invalid degenerate ring (< 4 points)
            ],
          ],
        },
      };

      const assessment = calculateDeterministicRiskAssessment({
        caseItem: invalidCase,
        stageInstances: mockInstances,
        stages: mockStages,
        dependencies: mockDependencies,
        documents: [],
      });

      expect(assessment.factor_breakdown.spatial_impact_score).toBeGreaterThan(0);
      expect(
        assessment.factor_breakdown.details.some((d) => d.category === 'spatial_quality')
      ).toBe(true);
    });

    it('flags unmapped parcels during survey stages as a systemic bottleneck', () => {
      const unmappedParcels: Parcel[] = [
        {
          id: 'p-1',
          case_id: mockCase.id,
          survey_number: '101/A',
          area_acres: 5.0,
          landowner_names: ['Ramesh'],
          land_type: 'Agricultural',
          acquisition_status: 'identified',
          geojson_geometry: null,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ];

      const bottlenecks = detectCaseBottlenecks({
        caseId: mockCase.id,
        stageInstances: mockInstances,
        stages: mockStages,
        dependencies: mockDependencies,
        parcels: unmappedParcels,
      });

      expect(
        bottlenecks.some((b) => b.evidence.includes('lack spatial survey demarcation'))
      ).toBe(true);
    });
  });

  // ==========================================================================
  // 3. Cadastral Disputes & Statutory Objections Integration
  // ==========================================================================
  describe('3. Cadastral Disputes & Statutory Objections Integration', () => {
    it('elevates cadastral risk score when active disputes and judicial stays are present', () => {
      const mockDisputes: CaseDispute[] = [
        {
          id: 'disp-1',
          case_id: mockCase.id,
          dispute_type: 'title_ownership',
          complainant_name: 'Gopal Patil & Bros',
          filing_date: '2026-01-10',
          description: 'Title dispute regarding Khata succession',
          priority: 'high',
          status: 'filed',
          created_at: '2026-01-10T00:00:00Z',
          updated_at: '2026-01-10T00:00:00Z',
        },
        {
          id: 'disp-2',
          case_id: mockCase.id,
          dispute_type: 'tribunal_reference',
          complainant_name: 'Suresh More',
          filing_date: '2026-01-12',
          description: 'High Court writ petition stay on corridor acquisition',
          priority: 'critical',
          status: 'referred_to_authority',
          stay_order_issued: true,
          created_at: '2026-01-12T00:00:00Z',
          updated_at: '2026-01-12T00:00:00Z',
        },
      ];

      const assessment = calculateDeterministicRiskAssessment({
        caseItem: mockCase,
        stageInstances: mockInstances,
        stages: mockStages,
        dependencies: mockDependencies,
        disputes: mockDisputes,
      });

      expect(assessment.factor_breakdown.cadastral_dispute_score).toBeGreaterThan(0);
      expect(
        assessment.observed_facts.some((f) => f.includes('statutory dispute(s)/objection(s) logged'))
      ).toBe(true);
    });
  });

  // ==========================================================================
  // 4. Recommendation Outcomes & Closed-Loop Portfolio Traceability
  // ==========================================================================
  describe('4. Recommendation Outcomes & Closed-Loop Portfolio Traceability', () => {
    it('aggregates realized savings and transitions portfolio state to observed_outcome', () => {
      const mockRecs: Recommendation[] = [
        {
          id: 'rec-1',
          case_id: mockCase.id,
          title: 'Special Land Tribunal Reference',
          description: 'Fast-track judicial resolution',
          action_type: 'legal_resolution',
          urgency: 'critical',
          expected_impact: 'Mitigates 21 days delay',
          confidence: 0.95,
          is_implemented: true,
          status: 'completed',
          observed_impact: {
            delay_reduction_days: 18,
            post_intervention_delay_days: 3,
            completion_notes: 'Tribunal approved award settlement',
            recorded_at: '2026-02-01T00:00:00Z',
          },
          created_at: '2026-01-15T00:00:00Z',
        },
      ];

      const outcomes = analyzePortfolioOutcomes({
        cases: [mockCase as any],
        recommendations: mockRecs,
      });

      expect(outcomes.state_breakdown).toBe('observed_outcome');
      expect(outcomes.interventions.implemented_count).toBe(1);
      expect(outcomes.interventions.realized_savings_days_total).toBe(18);
      expect(outcomes.interventions.observed_post_intervention_delay_days).toBe(3);
    });
  });

  // ==========================================================================
  // 5. Live HTTP Route Protection & RBAC Enforcement (Adversarial Security)
  // ==========================================================================
  describe('5. Live HTTP Route Protection & RBAC Enforcement', () => {
    it('rejects unauthenticated requests to DELETE parcel with 401', async () => {
      const res = await fetch(`${API_BASE}/cases/case-test/parcels/parcel-test`, {
        method: 'DELETE',
      });
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated requests to GET case intelligence with 401', async () => {
      const res = await fetch(`${API_BASE}/cases/case-test/intelligence`);
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated requests to GET case scenarios with 401', async () => {
      const res = await fetch(`${API_BASE}/cases/case-test/scenarios`);
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated requests to GET case disputes with 401', async () => {
      const res = await fetch(`${API_BASE}/cases/case-test/disputes`);
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated requests to POST case disputes with 401', async () => {
      const res = await fetch(`${API_BASE}/cases/case-test/disputes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          complainant_name: 'Test Claimant',
          dispute_type: 'title_ownership',
          description: 'Adversarial unauthenticated injection attempt',
        }),
      });
      expect(res.status).toBe(401);
    });

    it('authorizes authenticated officers to create, read, and update disputes over live HTTP', async () => {
      const authHeaders = {
        'Content-Type': 'application/json',
        'x-eval-role': 'lao',
        'x-eval-user-name': 'Dr. Vikramaditya Rao, IAS',
        'x-eval-user-id': 'eval-lao-id',
      };

      // 1. Create Dispute
      const postRes = await fetch(`${API_BASE}/cases/${mockCase.id}/disputes`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          complainant_name: 'Govind Shinde & Heirs',
          dispute_type: 'compensation_quantum',
          description: 'Section 15 objection demanding market rate enhancement per 2026 circle rate',
          claimed_amount: 1500000,
          priority: 'high',
        }),
      });

      expect([200, 201]).toContain(postRes.status);
      const postData = await postRes.json();
      expect(postData.success).toBe(true);
      expect(postData.dispute).toBeDefined();
      expect(postData.dispute.complainant_name).toBe('Govind Shinde & Heirs');

      const disputeId = postData.dispute.id;

      // 2. Fetch Disputes for Case
      const getRes = await fetch(`${API_BASE}/cases/${mockCase.id}/disputes`, {
        headers: authHeaders,
      });
      expect(getRes.status).toBe(200);
      const getData = await getRes.json();
      expect(Array.isArray(getData.disputes)).toBe(true);
      expect(getData.disputes.some((d: any) => d.id === disputeId)).toBe(true);

      // 3. Update Dispute Status (Hearing scheduled)
      const patchRes = await fetch(`${API_BASE}/cases/${mockCase.id}/disputes/${disputeId}`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({
          status: 'hearing_scheduled',
          hearing_date: '2026-03-15',
          resolution_notes: 'Notice issued to Sub-Divisional Officer for boundary survey verification',
        }),
      });
      expect(patchRes.status).toBe(200);
      const patchData = await patchRes.json();
      expect(patchData.success).toBe(true);
      expect(patchData.dispute.status).toBe('hearing_scheduled');
    });
  });
});
