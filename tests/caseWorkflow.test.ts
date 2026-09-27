import { describe, expect, it, beforeAll, afterAll } from 'bun:test';
import { startLiveApi, LiveApi } from './helpers/liveApi';
import { seedSpatialMemoryStore } from '../server/services/spatialIntelligenceService';
import { PRESET_WORKFLOW_DEFINITIONS } from '../server/services/workflowEngine';

let liveApi: LiveApi | null = null;
let SERVER_URL = '';

beforeAll(async () => {
  liveApi = await startLiveApi();
  SERVER_URL = liveApi.url;
}, 30000);

afterAll(async () => {
  await liveApi?.close();
});

describe('Case Statutory Workflow Creation & Schedule Management Suite', () => {
  it('returns all preset workflow definitions via /api/cases/workflow/presets', async () => {
    const res = await fetch(`${SERVER_URL}/api/cases/workflow/presets`, {
      headers: {
        'Authorization': 'Bearer valid-test-token-admin',
        'x-eval-role': 'admin',
      },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.presets).toBeDefined();
    expect(data.presets.rfctlarr_statutory_2013).toBeDefined();
    expect(data.presets.rfctlarr_statutory_2013.stages.length).toBe(7);
    expect(data.presets.direct_purchase_consent.stages.length).toBe(5);
    expect(data.presets.nhai_fasttrack_highway.stages.length).toBe(5);
  });

  it('initializes RFCTLARR 2013 7-stage statutory workflow on a case without stages', async () => {
    const caseId = 'case-wf-init-01';
    seedSpatialMemoryStore([
      {
        id: caseId,
        case_number: 'WF-TEST-001',
        title: 'Industrial Corridor Acquisition Package A',
        state: 'Maharashtra',
        district: 'Pune',
        tehsil: 'Haveli',
        village: 'Hadapsar',
        total_area_hectares: 50.0,
        estimated_compensation: 80000000,
        status: 'active',
        current_stage: 'section_11_notification',
        start_date: '2026-01-15',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ], [], []);

    const initRes = await fetch(`${SERVER_URL}/api/cases/${caseId}/workflow/initialize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-test-token-admin',
        'x-eval-role': 'admin',
      },
      body: JSON.stringify({
        preset_type: 'rfctlarr_statutory_2013',
        start_date: '2026-01-15',
      }),
    });

    expect(initRes.status).toBe(200);
    const initData = await initRes.json();
    expect(initData.success).toBe(true);
    expect(initData.stages.length).toBe(7);
    expect(initData.stages[0].stage.title).toBe('Preliminary Notification (Section 11)');
    expect(initData.stages[0].expected_start_date).toBe('2026-01-15');
    expect(initData.stages[0].expected_end_date).toBe('2026-03-16');

    // Verify stage 1 is in_progress and later stages are not_started
    expect(initData.stages[0].status).toBe('in_progress');
    expect(initData.stages[1].status).toBe('not_started');
  });

  it('updates mentioned target completion date and calculates delayed / early status in between', async () => {
    const caseId = 'case-wf-sched-01';
    seedSpatialMemoryStore([
      {
        id: caseId,
        case_number: 'WF-TEST-002',
        title: 'Ring Road Phase 1',
        state: 'Maharashtra',
        district: 'Pune',
        tehsil: 'Haveli',
        village: 'Loni Kalbhor',
        total_area_hectares: 25.0,
        estimated_compensation: 30000000,
        status: 'active',
        start_date: '2026-02-01',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ], [], []);

    // 1. Initialize workflow
    const initRes = await fetch(`${SERVER_URL}/api/cases/${caseId}/workflow/initialize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-test-token-admin',
        'x-eval-role': 'admin',
      },
      body: JSON.stringify({
        preset_type: 'direct_purchase_consent',
        start_date: '2026-02-01',
      }),
    });
    const initData = await initRes.json();
    const stage1 = initData.stages[0];

    // 2. Change target date in between (reschedule target completion deadline)
    const updateRes = await fetch(`${SERVER_URL}/api/cases/${caseId}/stages/${stage1.id}/schedule`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-test-token-admin',
        'x-eval-role': 'admin',
      },
      body: JSON.stringify({
        expected_start_date: '2026-02-01',
        expected_end_date: '2026-03-15',
        actual_start_date: '2026-02-01',
        actual_end_date: '2026-03-10', // Completed 5 days early!
        status: 'completed',
        notes: 'Accelerated voluntary agreement with 100% consent.',
      }),
    });

    expect(updateRes.status).toBe(200);
    const updateData = await updateRes.json();
    expect(updateData.success).toBe(true);
    expect(updateData.stage.status).toBe('completed');
    expect(updateData.stage.expected_end_date).toBe('2026-03-15');
    expect(updateData.stage.actual_end_date).toBe('2026-03-10');
    // Deviation calculation: actual_end (10) - expected_end (15) = -5 days (Early!)
    expect(updateData.stage.stage_deviation_days).toBe(-5);
  });

  it('allows adding a custom milestone task to an existing workflow', async () => {
    const caseId = 'case-wf-custom-01';
    seedSpatialMemoryStore([
      {
        id: caseId,
        case_number: 'WF-TEST-003',
        title: 'Metro Rail Viaduct Sector 4',
        state: 'Maharashtra',
        district: 'Pune',
        tehsil: 'Haveli',
        village: 'Kothrud',
        total_area_hectares: 12.0,
        estimated_compensation: 25000000,
        status: 'active',
        start_date: '2026-03-01',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ], [], []);

    const addStageRes = await fetch(`${SERVER_URL}/api/cases/${caseId}/stages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-test-token-admin',
        'x-eval-role': 'admin',
      },
      body: JSON.stringify({
        title: 'Special Utility Relocation Clearance',
        code: 'SPECIAL_UTILITY_CLEARANCE',
        description: 'Underground high-tension electrical cabling shifting approval.',
        expected_start_date: '2026-03-01',
        expected_end_date: '2026-04-15',
        required_role: 'project_officer',
        default_duration_days: 45,
        status: 'in_progress',
        notes: 'Coordination with State Electricity Transmission Utility.',
      }),
    });

    expect(addStageRes.status).toBe(200);
    const addStageData = await addStageRes.json();
    expect(addStageData.success).toBe(true);
    expect(addStageData.stage.stage.title).toBe('Special Utility Relocation Clearance');
    expect(addStageData.stage.expected_end_date).toBe('2026-04-15');
  });
});
