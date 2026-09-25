import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { initializeCaseWorkflow, advanceStageInstance } from '../server/services/workflowEngine';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('your-supabase-project')) {
  console.error('\n❌ ERROR: Supabase credentials not found in .env!');
  console.error('Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) in .env before running seed.\n');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seed() {
  console.log('🌱 Starting BhoomiSetu Database Seed...');

  // 1. Seed Workflows
  console.log('1. Seeding Workflows...');
  const { data: existingWf } = await supabase.from('workflows').select('id, code');
  
  let rfctlarrWorkflowId: string = '';
  let directPurchaseWorkflowId: string = '';

  const rfctlarrFound = existingWf?.find((w) => w.code === 'RFCTLARR_2013');
  if (rfctlarrFound) {
    rfctlarrWorkflowId = rfctlarrFound.id;
  } else {
    const { data: wf1, error: e1 } = await supabase
      .from('workflows')
      .insert({
        code: 'RFCTLARR_2013',
        name: 'RFCTLARR Act 2013 Standard Acquisition',
        description: 'Statutory land acquisition under Right to Fair Compensation and Transparency in Land Acquisition, Rehabilitation and Resettlement Act, 2013.',
        legal_framework: 'RFCTLARR Act 2013',
        version: '1.0',
      })
      .select('*')
      .single();
    if (e1) throw e1;
    rfctlarrWorkflowId = wf1.id;
  }

  const directFound = existingWf?.find((w) => w.code === 'DIRECT_PURCHASE');
  if (directFound) {
    directPurchaseWorkflowId = directFound.id;
  } else {
    const { data: wf2, error: e2 } = await supabase
      .from('workflows')
      .insert({
        code: 'DIRECT_PURCHASE',
        name: 'Direct Land Purchase & Consent Model',
        description: 'Expedited acquisition via mutual agreement with landowners with direct compensation settlement.',
        legal_framework: 'State Direct Purchase Policy',
        version: '1.0',
      })
      .select('*')
      .single();
    if (e2) throw e2;
    directPurchaseWorkflowId = wf2.id;
  }

  // 2. Seed RFCTLARR Stages & Dependencies
  console.log('2. Seeding Workflow Stages for RFCTLARR 2013...');
  const { data: existingStages } = await supabase
    .from('workflow_stages')
    .select('id, code')
    .eq('workflow_id', rfctlarrWorkflowId);

  const stageDefs = [
    {
      stage_number: 1,
      code: 'SEC_11_NOTIFICATION',
      title: 'Preliminary Notification (Section 11)',
      description: 'Publication of preliminary notification in official gazette, newspapers, and panchayat/village offices.',
      default_duration_days: 30,
      is_mandatory: true,
      required_role: 'lao',
      required_documents: ['preliminary_notice', 'survey_report'],
      completion_criteria: { requires_all_documents: true },
    },
    {
      stage_number: 2,
      code: 'SEC_15_HEARING',
      title: 'Objection Hearing & Verification (Section 15)',
      description: '60-day statutory window for receiving objections, holding hearings, and submitting report to Collector.',
      default_duration_days: 60,
      is_mandatory: true,
      required_role: 'lao',
      required_documents: ['hearing_minutes'],
      completion_criteria: { requires_approval: true },
    },
    {
      stage_number: 3,
      code: 'SEC_19_DECLARATION',
      title: 'Declaration of Acquisition (Section 19)',
      description: 'Formal declaration published by appropriate government after reviewing the Section 15 report.',
      default_duration_days: 30,
      is_mandatory: true,
      required_role: 'approver',
      required_documents: ['sec_19_declaration'],
      completion_criteria: { requires_approval: true },
    },
    {
      stage_number: 4,
      code: 'SEC_26_VALUATION',
      title: 'Land Measurement & Valuation (Section 26-29)',
      description: 'Joint measurement survey, market value determination, and solatium calculation.',
      default_duration_days: 45,
      is_mandatory: true,
      required_role: 'revenue_inspector',
      required_documents: ['valuation_record', 'survey_report'],
      completion_criteria: { requires_survey_verified: true },
    },
    {
      stage_number: 5,
      code: 'SEC_30_AWARD',
      title: 'Determination of Award (Section 30)',
      description: 'Formal award enquiry and pronouncement of compensation award by the Collector.',
      default_duration_days: 30,
      is_mandatory: true,
      required_role: 'lao',
      required_documents: ['award_order'],
      completion_criteria: { requires_approval: true },
    },
    {
      stage_number: 6,
      code: 'SEC_37_COMPENSATION',
      title: 'Compensation Disbursement (Section 37)',
      description: 'Direct benefit transfer or deposit of compensation into landowners verified bank accounts.',
      default_duration_days: 45,
      is_mandatory: true,
      required_role: 'revenue_inspector',
      required_documents: ['disbursement_slips'],
      completion_criteria: {},
    },
    {
      stage_number: 7,
      code: 'SEC_38_POSSESSION',
      title: 'Physical Possession & Handover (Section 38)',
      description: 'Taking physical possession of land and execution of possession memo to project authority.',
      default_duration_days: 30,
      is_mandatory: true,
      required_role: 'lao',
      required_documents: ['possession_memo'],
      completion_criteria: { requires_approval: true },
    },
  ];

  const stageIdMap = new Map<string, string>();

  if (!existingStages || existingStages.length === 0) {
    for (const s of stageDefs) {
      const { data: inserted, error } = await supabase
        .from('workflow_stages')
        .insert({
          ...s,
          workflow_id: rfctlarrWorkflowId,
        })
        .select('id, code')
        .single();
      if (error) throw error;
      stageIdMap.set(inserted.code, inserted.id);
    }

    // Add dependencies
    console.log('2.1 Linking sequential stage dependencies...');
    const stageCodes = stageDefs.map((s) => s.code);
    for (let i = 1; i < stageCodes.length; i++) {
      const currentCode = stageCodes[i];
      const prevCode = stageCodes[i - 1];
      await supabase.from('stage_dependencies').insert({
        stage_id: stageIdMap.get(currentCode)!,
        depends_on_stage_id: stageIdMap.get(prevCode)!,
        dependency_type: 'finish_to_start',
        lag_days: 0,
      });
    }
  } else {
    existingStages.forEach((s) => stageIdMap.set(s.code, s.id));
  }

  // 3. Seed Projects
  console.log('3. Seeding Infrastructure Projects...');
  const { data: existingProjects } = await supabase.from('projects').select('id, code');
  let dmicProjectId: string = '';
  let edfcProjectId: string = '';
  let nh44ProjectId: string = '';

  const pDefs = [
    {
      code: 'PRJ-DMIC-01',
      name: 'Delhi-Mumbai Industrial Corridor (Node 4)',
      description: 'Multi-modal logistics hub and industrial corridor package covering 450 hectares.',
      project_type: 'industrial',
      sponsoring_agency: 'National Industrial Corridor Development Corporation (NICDC)',
      estimated_budget: 850000000,
      target_completion_date: '2027-12-31',
      status: 'in_progress',
      state: 'Maharashtra',
    },
    {
      code: 'PRJ-EDFC-02',
      name: 'Eastern Dedicated Freight Corridor (Package C)',
      description: 'Electrified double-track freight railway corridor alignment.',
      project_type: 'railway',
      sponsoring_agency: 'Dedicated Freight Corridor Corporation of India (DFCCIL)',
      estimated_budget: 1200000000,
      target_completion_date: '2028-06-30',
      status: 'in_progress',
      state: 'Uttar Pradesh',
    },
    {
      code: 'PRJ-NH44-03',
      name: 'National Highway NH-44 6-Laning Bypass',
      description: 'Expressway bypass expansion to alleviate arterial traffic congestion.',
      project_type: 'highway',
      sponsoring_agency: 'National Highways Authority of India (NHAI)',
      estimated_budget: 450000000,
      target_completion_date: '2026-11-30',
      status: 'in_progress',
      state: 'Haryana',
    },
  ];

  for (const p of pDefs) {
    const found = existingProjects?.find((ep) => ep.code === p.code);
    if (found) {
      if (p.code === 'PRJ-DMIC-01') dmicProjectId = found.id;
      if (p.code === 'PRJ-EDFC-02') edfcProjectId = found.id;
      if (p.code === 'PRJ-NH44-03') nh44ProjectId = found.id;
    } else {
      const { data: inserted, error } = await supabase.from('projects').insert(p).select('*').single();
      if (error) throw error;
      if (p.code === 'PRJ-DMIC-01') dmicProjectId = inserted.id;
      if (p.code === 'PRJ-EDFC-02') edfcProjectId = inserted.id;
      if (p.code === 'PRJ-NH44-03') nh44ProjectId = inserted.id;
    }
  }

  // 4. Seed Acquisition Cases
  console.log('4. Seeding Acquisition Cases across Indian States...');
  const { data: existingCases } = await supabase.from('acquisition_cases').select('id, case_number');

  const casesToSeed = [
    {
      case_number: 'BS-MH-PUN-2026-104',
      project_id: dmicProjectId,
      workflow_id: rfctlarrWorkflowId,
      title: 'Talegaon Industrial Node Land Parcel Cluster A',
      description: 'Acquisition of agricultural and fallow land for multi-modal freight hub connection.',
      state: 'Maharashtra',
      district: 'Pune',
      tehsil: 'Maval',
      village: 'Talegaon Dabhade',
      total_area_hectares: 34.5,
      estimated_compensation: 145000000,
      status: 'delayed',
      priority: 'high',
      start_date: '2026-03-01',
      expected_completion_date: '2026-12-15',
    },
    {
      case_number: 'BS-UP-VNS-2026-208',
      project_id: edfcProjectId,
      workflow_id: rfctlarrWorkflowId,
      title: 'Mughalsarai-Chandauli Railway Bypass Sector 3',
      description: 'Right-of-way corridor acquisition for dedicated freight tracks crossing agricultural holdings.',
      state: 'Uttar Pradesh',
      district: 'Chandauli',
      tehsil: 'Mughalsarai',
      village: 'Kailahat',
      total_area_hectares: 18.2,
      estimated_compensation: 82000000,
      status: 'active',
      priority: 'medium',
      start_date: '2026-05-10',
      expected_completion_date: '2027-02-28',
    },
    {
      case_number: 'BS-HR-PAN-2026-315',
      project_id: nh44ProjectId,
      workflow_id: rfctlarrWorkflowId,
      title: 'Samalkha NH-44 Expressway Bypass Interchange',
      description: 'Cloverleaf junction land acquisition involving 12 private landowners.',
      state: 'Haryana',
      district: 'Panipat',
      tehsil: 'Samalkha',
      village: 'Pattikalyana',
      total_area_hectares: 12.8,
      estimated_compensation: 96000000,
      status: 'active',
      priority: 'critical',
      start_date: '2026-06-01',
      expected_completion_date: '2027-03-15',
    },
  ];

  for (let idx = 0; idx < casesToSeed.length; idx++) {
    const c = casesToSeed[idx];
    const exists = existingCases?.find((ec) => ec.case_number === c.case_number);
    if (!exists) {
      const { data: newCase, error: caseErr } = await supabase
        .from('acquisition_cases')
        .insert(c)
        .select('*')
        .single();
      if (caseErr) throw caseErr;

      // Seed Parcels for this case
      await supabase.from('parcels').insert([
        {
          case_id: newCase.id,
          survey_number: `SY-${Math.floor(100 + Math.random() * 800)}/1`,
          khata_number: `KH-${Math.floor(10 + Math.random() * 90)}`,
          landowner_names: ['Rameshwar Sharma', 'Sunita Sharma'],
          land_type: 'Agricultural Irrigated',
          area_acres: 4.25,
          compensation_amount: 18500000,
          acquisition_status: 'notified',
        },
        {
          case_id: newCase.id,
          survey_number: `SY-${Math.floor(100 + Math.random() * 800)}/2`,
          khata_number: `KH-${Math.floor(10 + Math.random() * 90)}`,
          landowner_names: ['Vikram Patel', 'Mahesh Patel'],
          land_type: 'Agricultural Fallow',
          area_acres: 6.8,
          compensation_amount: 24000000,
          acquisition_status: 'identified',
        },
      ]);

      // Initialize workflow stages dynamically using the real Workflow Engine!
      const { stageInstances, expectedCompletionDate } = await initializeCaseWorkflow(
        newCase.id,
        rfctlarrWorkflowId,
        c.start_date
      );

      // Update expected completion date on case
      await supabase
        .from('acquisition_cases')
        .update({ expected_completion_date: expectedCompletionDate })
        .eq('id', newCase.id);

      // For Case 1 (Talegaon), advance stages 1, 2, and 3 to demonstrate progression
      if (idx === 0 && stageInstances.length >= 4) {
        // Complete stage 1
        await advanceStageInstance({
          caseId: newCase.id,
          stageInstanceId: stageInstances[0].id,
          targetStatus: 'completed',
          actualDate: '2026-03-25',
          notes: 'Preliminary notification gazetted under No. 442/LAO.',
          actorName: 'Dr. Vikramaditya Rao, IAS (LAO)',
        });
        // Complete stage 2
        await advanceStageInstance({
          caseId: newCase.id,
          stageInstanceId: stageInstances[1].id,
          targetStatus: 'completed',
          actualDate: '2026-05-20',
          notes: 'Public hearing completed. 8 objections received and resolved with valuation committee.',
          actorName: 'Dr. Vikramaditya Rao, IAS (LAO)',
        });
        // Complete stage 3
        await advanceStageInstance({
          caseId: newCase.id,
          stageInstanceId: stageInstances[2].id,
          targetStatus: 'completed',
          actualDate: '2026-06-18',
          notes: 'Section 19 declaration approved and published.',
          actorName: 'Smt. Ananya Deshmukh (Competent Authority)',
        });
      }

      // Seed audit event
      await supabase.from('case_events').insert({
        case_id: newCase.id,
        event_type: 'CASE_CREATED',
        title: `Acquisition Case ${c.case_number} Registered`,
        description: `Registered with ${c.total_area_hectares} hectares under ${c.state} administration.`,
        actor_name: 'Lead LAO Officer',
      });
    }
  }

  console.log('✅ Seed completed successfully! All projects, workflows, and cases loaded.');
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
