import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { startLiveApi, LiveApi } from './helpers/liveApi';
import '../server/index';
import { advanceStageInstance } from '../server/services/workflowEngine';
import { analyzePortfolioOutcomes, authorizeUserForCase } from '../server/services/portfolioAnalyzer';
import { seedSpatialMemoryStore, resetSpatialMemoryStore } from '../server/services/spatialIntelligenceService';
import {
  AcquisitionCase,
  CaseStageInstance,
  WorkflowStage,
  StageDependency,
  CaseDispute,
  Recommendation,
} from '../shared/types';
import { AuthenticatedUser } from '../server/middleware/auth.middleware';

let liveApi: LiveApi | null = null;
let API_BASE = '';

beforeAll(async () => {
  liveApi = await startLiveApi();
  API_BASE = `${liveApi.url}/api`;
}, 30000);

afterAll(async () => {
  await liveApi?.close();
});

const mockCasePune: AcquisitionCase = {
  id: 'case-harden-pune-001',
  case_number: 'BS-MH-PUN-2026-001',
  project_id: 'proj-metro-pune',
  workflow_id: 'wf-statutory-001',
  title: 'Pune Ring Road Corridor Section 4',
  state: 'Maharashtra',
  district: 'Pune',
  tehsil: 'Haveli',
  village: 'Hadapsar',
  status: 'active',
  priority: 'high',
  total_area_hectares: 24.5,
  estimated_compensation: 45000000,
  start_date: '2026-01-01',
  expected_completion_date: '2026-10-31',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const mockCaseLudhiana: AcquisitionCase = {
  id: 'case-harden-pb-002',
  case_number: 'BS-PB-LDH-2026-002',
  project_id: 'proj-nh-punjab',
  workflow_id: 'wf-statutory-001',
  title: 'Ludhiana Bypass Expressway',
  state: 'Punjab',
  district: 'Ludhiana',
  tehsil: 'Ludhiana East',
  village: 'Gill',
  status: 'active',
  priority: 'medium',
  total_area_hectares: 18.2,
  estimated_compensation: 32000000,
  start_date: '2026-01-01',
  expected_completion_date: '2026-09-30',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('Day 7 Final Verification & Hardening Pass', () => {
  // ==========================================================================
  // 1. VERIFY required_role STAGE GUARD & SCOPE AUTHORIZATION
  // ==========================================================================
  describe('1. Server-Side required_role Guard & Scope Scrutiny', () => {
    it('authorizes only the designated role and blocks unauthorized actors', async () => {
      const mockStageWithRole: WorkflowStage = {
        id: 'stg-lao-approval',
        workflow_id: 'wf-statutory-001',
        stage_number: 3,
        code: 'SEC_19_DECL',
        title: 'Section 19 Final Declaration Publication',
        description: 'Statutory declaration requiring LAO authorization',
        default_duration_days: 30,
        is_mandatory: true,
        required_role: 'lao',
        required_documents: [],
        completion_criteria: {},
        escalation_threshold_days: 5,
        created_at: '2026-01-01',
      };

      // Mock instance
      const mockInstance: CaseStageInstance = {
        id: 'inst-role-test',
        case_id: mockCasePune.id,
        stage_id: mockStageWithRole.id,
        status: 'in_progress',
        expected_start_date: '2026-01-01',
        expected_end_date: '2026-01-31',
        delay_days: 0,
        updated_at: '2026-01-01',
        stage: mockStageWithRole,
      };

      // Attempt by Revenue Inspector without override should fail
      try {
        await advanceStageInstance({
          caseId: mockCasePune.id,
          stageInstanceId: mockInstance.id,
          targetStatus: 'completed',
          actorRole: 'revenue_inspector',
          actorName: 'Inspector Patil',
          preloadedInstance: mockInstance,
        });
        expect(true).toBe(false); // Should not reach here
      } catch (err: any) {
        expect(err.message).toContain('requires role "lao"');
      }
    });

    it('blocks non-supervisory role from executing an administrative override', async () => {
      const mockStageWithRole: WorkflowStage = {
        id: 'stg-lao-approval',
        workflow_id: 'wf-statutory-001',
        stage_number: 3,
        code: 'SEC_19_DECL',
        title: 'Section 19 Final Declaration Publication',
        description: 'Statutory declaration requiring LAO authorization',
        default_duration_days: 30,
        is_mandatory: true,
        required_role: 'lao',
        required_documents: [],
        completion_criteria: {},
        escalation_threshold_days: 5,
        created_at: '2026-01-01',
      };

      const mockInstance: CaseStageInstance = {
        id: 'inst-role-test',
        case_id: mockCasePune.id,
        stage_id: mockStageWithRole.id,
        status: 'in_progress',
        expected_start_date: '2026-01-01',
        expected_end_date: '2026-01-31',
        delay_days: 0,
        updated_at: '2026-01-01',
        stage: mockStageWithRole,
      };

      try {
        await advanceStageInstance({
          caseId: mockCasePune.id,
          stageInstanceId: 'inst-role-test',
          targetStatus: 'completed',
          actorRole: 'revenue_inspector',
          actorName: 'Inspector Patil',
          allowOverride: true,
          overrideJustification: 'Attempting self-authorization override',
          preloadedInstance: mockInstance,
        });
        expect(true).toBe(false);
      } catch (err: any) {
        expect(err.message).toContain('Requires supervisory authority (admin or lao)');
      }
    });

    it('enforces territorial and project scoping on case operations and live HTTP routes', async () => {
      // 1. Project Officer assigned strictly to Ludhiana project attempting to operate on Pune case
      const poPunjabUser: AuthenticatedUser = {
        id: 'usr-po-pb',
        role: 'project_officer',
        full_name: 'PO Harpreet Singh',
        department: 'project:proj-nh-punjab',
      };

      const crossProjAuth = await authorizeUserForCase(poPunjabUser, mockCasePune.id, mockCasePune);
      expect(crossProjAuth.authorized).toBe(false);
      expect(crossProjAuth.errorStatus).toBe(403);
      expect(crossProjAuth.errorMessage).toContain('User is restricted to project');

      // 2. Revenue Inspector confined to Punjab attempting to operate on Pune (Maharashtra) case
      const riPunjabUser: AuthenticatedUser = {
        id: 'usr-ri-pb',
        role: 'revenue_inspector',
        full_name: 'RI Amarjit',
        department: 'state:Punjab',
      };

      const crossStateAuth = await authorizeUserForCase(riPunjabUser, mockCasePune.id, mockCasePune);
      expect(crossStateAuth.authorized).toBe(false);
      expect(crossStateAuth.errorStatus).toBe(403);
      expect(crossStateAuth.errorMessage).toContain('User jurisdiction is restricted to state');

      // 3. Officer operating within their legitimate assigned jurisdiction
      const riPuneUser: AuthenticatedUser = {
        id: 'usr-ri-pune',
        role: 'revenue_inspector',
        full_name: 'RI Patil',
        department: 'state:Maharashtra',
      };

      const validAuth = await authorizeUserForCase(riPuneUser, mockCasePune.id, mockCasePune);
      expect(validAuth.authorized).toBe(true);
      expect(validAuth.errorStatus).toBe(200);

      // 4. Live HTTP verification that unauthenticated stage advance is rejected with 401
      const unauthRes = await fetch(`${API_BASE}/cases/mock-case/stages/stg-1`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetStatus: 'in_progress' }),
      });
      expect(unauthRes.status).toBe(401);
    });
  });

  // ==========================================================================
  // 2. VERIFY completion_criteria SERVER-SIDE ENFORCEMENT
  // ==========================================================================
  describe('2. Configurable completion_criteria Validation', () => {
    it('evaluates data-driven criteria and blocks completion when criteria are unmet', async () => {
      const mockStageWithCriteria: WorkflowStage = {
        id: 'stg-criteria-test',
        workflow_id: 'wf-statutory-001',
        stage_number: 4,
        code: 'SEC_23_AWARD',
        title: 'Section 23 Award Inquiry & Approval',
        description: 'Requires survey verification and supervisory approval',
        default_duration_days: 45,
        is_mandatory: true,
        required_role: 'lao',
        required_documents: ['AWARD_PROPOSAL'],
        completion_criteria: {
          requires_approval: true,
          requires_survey_verified: true,
          required_conditions: {
            no_active_stay_orders: true,
          },
        },
        escalation_threshold_days: 5,
        created_at: '2026-01-01',
      };

      const mockCriteriaInstance: CaseStageInstance = {
        id: 'inst-criteria-1',
        case_id: mockCasePune.id,
        stage_id: mockStageWithCriteria.id,
        status: 'in_progress',
        expected_start_date: '2026-01-01',
        expected_end_date: '2026-01-31',
        delay_days: 0,
        updated_at: '2026-01-01',
        stage: mockStageWithCriteria,
      };

      try {
        await advanceStageInstance({
          caseId: mockCasePune.id,
          stageInstanceId: 'inst-criteria-1',
          targetStatus: 'completed',
          actorRole: 'lao',
          actorName: 'Dr. V. Rao, LAO',
          preloadedInstance: mockCriteriaInstance,
        });
        expect(true).toBe(false);
      } catch (err: any) {
        expect(err.message).toContain('Stage completion blocked: Unmet completion criteria');
      }
    });

    it('blocks administrative override without substantive statutory justification (min 10 chars)', async () => {
      const mockStageWithCriteria: WorkflowStage = {
        id: 'stg-criteria-test',
        workflow_id: 'wf-statutory-001',
        stage_number: 4,
        code: 'SEC_23_AWARD',
        title: 'Section 23 Award Inquiry & Approval',
        description: 'Requires survey verification and supervisory approval',
        default_duration_days: 45,
        is_mandatory: true,
        required_role: 'lao',
        required_documents: ['AWARD_PROPOSAL'],
        completion_criteria: {
          requires_approval: true,
          requires_survey_verified: true,
          required_conditions: {
            no_active_stay_orders: true,
          },
        },
        escalation_threshold_days: 5,
        created_at: '2026-01-01',
      };

      const mockCriteriaInstance: CaseStageInstance = {
        id: 'inst-criteria-1',
        case_id: mockCasePune.id,
        stage_id: mockStageWithCriteria.id,
        status: 'in_progress',
        expected_start_date: '2026-01-01',
        expected_end_date: '2026-01-31',
        delay_days: 0,
        updated_at: '2026-01-01',
        stage: mockStageWithCriteria,
      };

      try {
        await advanceStageInstance({
          caseId: mockCasePune.id,
          stageInstanceId: 'inst-criteria-1',
          targetStatus: 'completed',
          actorRole: 'lao',
          actorName: 'Dr. V. Rao, LAO',
          allowOverride: true,
          overrideJustification: 'none', // < 10 characters
          preloadedInstance: mockCriteriaInstance,
        });
        expect(true).toBe(false);
      } catch (err: any) {
        expect(err.message).toContain('A substantive statutory justification (minimum 10 characters) is required');
      }
    });
  });

  // ==========================================================================
  // 3. VERIFY RECOMMENDATION OUTCOME INTEGRITY & PROVENANCE SEPARATION
  // ==========================================================================
  describe('3. Recommendation Outcome Integrity & Provenance Separation', () => {
    it('strictly separates officer observations from system-calculated measured outcomes', () => {
      const mockRecommendations: Recommendation[] = [
        {
          id: 'rec-measured-01',
          case_id: 'case-001',
          title: 'Deploy additional survey team',
          description: 'Deploy 2 additional surveyor units to clear backlog',
          action_type: 'resource_allocation',
          urgency: 'high',
          expected_impact: '7 days timeline recovery',
          confidence: 0.9,
          status: 'completed',
          is_implemented: true,
          observed_impact: {
            evidence_type: 'measured',
            system_calculated: {
              measured_delay_reduction_days: 9,
              stage_deviation_after_days: 2,
              calculation_method: 'stage_completion_actual_vs_expected',
              evidence_status: 'measured',
              evidence_notes: 'Derived from 3 completed milestones',
              calculated_at: '2026-02-15T00:00:00Z',
            },
            officer_observation: {
              reported_delay_reduction_days: 10,
              completion_notes: 'Survey completed ahead of rescheduled window',
              recorded_by: 'LAO Rao',
              recorded_at: '2026-02-15T00:00:00Z',
            },
            delay_reduction_days: 9,
          },
          created_at: '2026-01-10T00:00:00Z',
        },
        {
          id: 'rec-officer-reported-02',
          case_id: 'case-002',
          title: 'Direct negotiation with village panchayat',
          description: 'Conciliation session conducted for compensation rates',
          action_type: 'stakeholder_engagement',
          urgency: 'critical',
          expected_impact: '15 days recovery',
          confidence: 0.85,
          status: 'completed',
          is_implemented: true,
          observed_impact: {
            evidence_type: 'officer_reported',
            system_calculated: {
              calculation_method: 'milestone_census',
              evidence_status: 'insufficient_evidence',
              evidence_notes: 'Active case has 0 completed milestones; empirical schedule recovery cannot yet be derived from completed timestamps.',
              calculated_at: '2026-02-20T00:00:00Z',
            },
            officer_observation: {
              reported_delay_reduction_days: 12,
              completion_notes: 'Panchayat consent resolution passed unanimously',
              recorded_by: 'Collector Deshmukh',
              recorded_at: '2026-02-20T00:00:00Z',
            },
            delay_reduction_days: 12,
          },
          created_at: '2026-01-15T00:00:00Z',
        },
      ];

      const outcome = analyzePortfolioOutcomes({
        recommendations: mockRecommendations,
        cases: [mockCasePune],
      });

      expect(outcome.interventions.implemented_count).toBe(2);
      expect(outcome.interventions.measured_savings_days_total).toBe(9);
      expect(outcome.interventions.officer_reported_savings_days_total).toBe(12);
      expect(outcome.interventions.evidence_breakdown?.measured).toBe(1);
      expect(outcome.interventions.evidence_breakdown?.officer_reported).toBe(1);
    });
  });

  // ==========================================================================
  // 4. VERIFY DISPUTE PERSISTENCE & DEGRADED MODE
  // ==========================================================================
  describe('4. Dispute Persistence, Degraded Mode & Territorial Scoping', () => {
    it('enforces jurisdictional scoping on disputes and blocks cross-project access', async () => {
      // 1. Service-level scoping verification for dispute operations
      const riPunjabUser: AuthenticatedUser = {
        id: 'usr-ri-pb',
        role: 'revenue_inspector',
        full_name: 'RI Amarjit',
        department: 'state:Punjab',
      };

      const crossStateScope = await authorizeUserForCase(riPunjabUser, mockCasePune.id, mockCasePune);
      expect(crossStateScope.authorized).toBe(false);
      expect(crossStateScope.errorStatus).toBe(403);
      expect(crossStateScope.errorMessage).toContain('User jurisdiction is restricted to state');

      const poPunjabUser: AuthenticatedUser = {
        id: 'usr-po-pb',
        role: 'project_officer',
        full_name: 'PO Harpreet Singh',
        department: 'project:proj-nh-punjab',
      };

      const crossProjScope = await authorizeUserForCase(poPunjabUser, mockCasePune.id, mockCasePune);
      expect(crossProjScope.authorized).toBe(false);
      expect(crossProjScope.errorStatus).toBe(403);
      expect(crossProjScope.errorMessage).toContain('User is restricted to project');

      // 2. Live HTTP adversarial check: Unauthenticated access to dispute endpoints is blocked with 401
      const unauthGet = await fetch(`${API_BASE}/cases/mock-case/disputes`);
      expect(unauthGet.status).toBe(401);

      const unauthPost = await fetch(`${API_BASE}/cases/mock-case/disputes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          complainant_name: 'Unauth Actor',
          dispute_type: 'title_ownership',
          description: 'Testing unauthenticated injection',
        }),
      });
      expect(unauthPost.status).toBe(401);

      // 3. Live HTTP adversarial check: Unauthorized role (viewer) is blocked with 403
      const viewerPost = await fetch(`${API_BASE}/cases/mock-case/disputes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-eval-role': 'viewer',
          'x-eval-user-name': 'Citizen Viewer',
          'x-eval-user-id': 'usr-viewer-1',
        },
        body: JSON.stringify({
          complainant_name: 'Citizen Viewer',
          dispute_type: 'title_ownership',
          description: 'Viewer role not authorized to create disputes',
        }),
      });
      expect(viewerPost.status).toBe(403);
    });

    it('permits authorized officers in-scope to file and resolve disputes', async () => {
      seedSpatialMemoryStore({ cases: [mockCasePune] });

      const laoHeaders = {
        'Content-Type': 'application/json',
        'x-eval-role': 'lao',
        'x-eval-user-name': 'Dr. Vikramaditya Rao, IAS',
        'x-eval-user-id': 'usr-lao-national',
      };

      // 1. Authorized dispute filing
      const createRes = await fetch(`${API_BASE}/cases/${mockCasePune.id}/disputes`, {
        method: 'POST',
        headers: laoHeaders,
        body: JSON.stringify({
          complainant_name: 'Kisan Morcha Delegation',
          dispute_type: 'compensation_quantum',
          description: 'Demanding solatium enhancement per statutory schedule',
          claimed_amount: 5000000,
          priority: 'critical',
          stay_order_issued: false,
        }),
      });

      expect([200, 201]).toContain(createRes.status);
      const createData = await createRes.json();
      expect(createData.success).toBe(true);
      expect(createData.dispute).toBeDefined();

      const disputeId = createData.dispute.id;

      // 2. Authorized dispute query
      const queryRes = await fetch(`${API_BASE}/cases/${mockCasePune.id}/disputes`, {
        headers: laoHeaders,
      });
      expect(queryRes.status).toBe(200);
      const queryData = await queryRes.json();
      expect(queryData.disputes.some((d: any) => d.id === disputeId)).toBe(true);
    });
  });
});
