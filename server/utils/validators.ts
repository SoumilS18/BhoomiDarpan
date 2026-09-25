import { z } from 'zod';

export const CreateCaseSchema = z.object({
  project_id: z.string().uuid('Invalid project ID format'),
  workflow_id: z.string().uuid('Invalid workflow ID format'),
  title: z.string().min(3, 'Title must be at least 3 characters').max(200),
  description: z.string().max(1000).optional(),
  state: z.string().min(2, 'State name is required').max(100),
  district: z.string().min(2, 'District name is required').max(100),
  tehsil: z.string().max(100).optional(),
  village: z.string().min(2, 'Village name is required').max(100),
  state_lgd_code: z.string().max(50).optional().nullable(),
  district_lgd_code: z.string().max(50).optional().nullable(),
  subdistrict_lgd_code: z.string().max(50).optional().nullable(),
  village_lgd_code: z.string().max(50).optional().nullable(),
  total_area_hectares: z.number().positive('Total area must be a positive number'),
  estimated_compensation: z.number().nonnegative().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be in YYYY-MM-DD format').optional(),
  assigned_officer_id: z.string().uuid().optional().nullable(),
  geojson_boundary: z.record(z.any()).optional().nullable(),
  parcels: z.array(
    z.object({
      survey_number: z.string().min(1, 'Survey number is required'),
      khata_number: z.string().optional().nullable(),
      landowner_names: z.array(z.string()).default([]),
      land_type: z.string().default('Agricultural'),
      area_acres: z.number().nonnegative().default(0),
      compensation_amount: z.number().nonnegative().default(0),
    })
  ).optional(),
});

export const AdvanceStageSchema = z.object({
  targetStatus: z.enum(['in_progress', 'completed', 'blocked', 'skipped']),
  actualDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format').optional(),
  notes: z.string().max(2000).optional(),
  actorName: z.string().max(100).optional(),
  allowOverride: z.boolean().optional(),
  overrideJustification: z.string().max(1000).optional(),
});

export const CreateProjectSchema = z.object({
  code: z.string().min(2).max(50),
  name: z.string().min(3).max(200),
  description: z.string().max(1000).optional(),
  project_type: z.enum(['highway', 'railway', 'irrigation', 'metro', 'industrial', 'urban', 'energy', 'airport']),
  sponsoring_agency: z.string().min(2).max(200),
  estimated_budget: z.number().positive().optional().nullable(),
  target_completion_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  state: z.string().min(2).max(100),
  district: z.string().max(100).optional().nullable(),
  state_lgd_code: z.string().max(50).optional().nullable(),
  district_lgd_code: z.string().max(50).optional().nullable(),
  subdistrict_lgd_code: z.string().max(50).optional().nullable(),
});

export const RunSimulationSchema = z.object({
  name: z.string().min(3, 'Simulation name must be at least 3 characters').max(100),
  description: z.string().max(500).optional(),
  proposed_actions: z.array(
    z.object({
      action_type: z.enum([
        'compress_stage_duration',
        'fast_track_hearing',
        'waive_dependency_lag',
        'resolve_active_bottleneck',
        'resolve_document_backlog',
        'resolve_data_discrepancy',
        'disburse_advance_compensation',
      ]),
      target_stage_id: z.string().optional(),
      duration_delta_days: z.number().int(),
      description: z.string().max(300),
    })
  ).min(1, 'At least one proposed intervention action is required'),
});

export const UpdateRecommendationSchema = z.object({
  status: z.enum(['proposed', 'accepted', 'rejected', 'implemented', 'completed']),
  actorName: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
  observed_impact: z
    .object({
      evidence_type: z.enum(['measured', 'officer_reported', 'insufficient_evidence']).optional(),
      delay_reduction_days: z.number().nonnegative().optional(),
      post_intervention_delay_days: z.number().nonnegative().optional(),
      completion_notes: z.string().max(1000).optional(),
      system_calculated: z.any().optional(),
      officer_observation: z.any().optional(),
    })
    .optional(),
});

export const DisputeStatusEnum = z.enum([
  'filed',
  'under_review',
  'under_investigation',
  'hearing_scheduled',
  'hearing_held',
  'decision_pending',
  'resolved',
  'settled',
  'rejected',
  'dismissed',
  'escalated',
  'referred_to_authority',
]);

export const CreateDisputeSchema = z.object({
  parcel_id: z.string().uuid().optional().nullable(),
  dispute_type: z.enum([
    'title_ownership',
    'compensation_quantum',
    'boundary_encroachment',
    'statutory_eligibility',
    'tribunal_reference',
    'other',
  ]),
  complainant_name: z.string().min(2, 'Complainant name is required').max(200).optional(),
  claimant_name: z.string().optional(),
  complainant_contact: z.string().max(100).optional().nullable(),
  filing_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Filing date must be YYYY-MM-DD').optional(),
  description: z.string().min(5, 'Dispute description must be at least 5 characters').max(2000),
  statutory_provision: z.string().max(100).optional().nullable(),
  claimed_amount: z.number().nonnegative().optional().default(0),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  court_case_number: z.string().max(100).optional().nullable(),
  stay_order_issued: z.boolean().optional().default(false),
  hearing_date: z.string().optional().nullable(),
  authority: z.string().max(200).optional().nullable(),
  decision_summary: z.string().max(2000).optional().nullable(),
  resolution_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Resolution date must be YYYY-MM-DD').optional().nullable(),
  resolution_notes: z.string().max(2000).optional().nullable(),
  evidence_documents: z.array(z.object({
    title: z.string(),
    url: z.string().optional(),
    document_type: z.string().optional(),
  })).optional(),
  status: DisputeStatusEnum.optional(),
});

export const UpdateDisputeSchema = z.object({
  status: DisputeStatusEnum,
  hearing_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Hearing date must be YYYY-MM-DD').optional().nullable(),
  authority: z.string().max(200).optional().nullable(),
  decision_summary: z.string().max(2000).optional().nullable(),
  stay_order_issued: z.boolean().optional(),
  resolution_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Resolution date must be YYYY-MM-DD').optional().nullable(),
  resolution_notes: z.string().max(2000).optional().nullable(),
  settled_compensation: z.number().nonnegative().optional().nullable(),
  evidence_documents: z.array(z.object({
    title: z.string(),
    url: z.string().optional(),
    document_type: z.string().optional(),
  })).optional(),
  actorName: z.string().max(100).optional(),
});

