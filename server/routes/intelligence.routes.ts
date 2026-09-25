import { Router, Request, Response } from 'express';
import { getSupabase, isSupabaseConfigured } from '../config/supabase';
import { calculateDeterministicRiskAssessment } from '../services/riskAssessment';
import { detectCaseBottlenecks } from '../services/bottleneckDetector';
import { analyzeCaseRootCauses } from '../services/rootCauseAnalyzer';
import { calculateDownstreamDAGImpact } from '../services/impactAnalyzer';
import { generateEvidenceBasedRecommendations } from '../services/recommendationEngine';
import { runWhatIfScenarioSimulation } from '../services/scenarioSimulator';
import { logCaseEvent } from '../services/auditLogger';
import { getCachedObservation } from '../services/weatherAdapter';
import { listDiscrepancies } from '../services/discrepancyDetector';
import { RunSimulationSchema, UpdateRecommendationSchema } from '../utils/validators';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { evaluateOperationalTriggers } from '../services/notificationService';
import { getDisputesForCaseSync } from './cases.routes';
import { authorizeUserForCase } from '../services/portfolioAnalyzer';

const router = Router();

// Helper to fetch complete case context
async function fetchFullCaseContext(caseId: string) {
  const supabase = getSupabase();

  // 1. Fetch case
  const { data: caseItem, error: caseErr } = await supabase
    .from('acquisition_cases')
    .select('*, project:projects(*), workflow:workflows(*)')
    .eq('id', caseId)
    .single();

  if (caseErr || !caseItem) {
    throw new Error('Case not found');
  }

  // 2. Fetch stage instances with joined stage definition
  const { data: stageInstances } = await supabase
    .from('case_stage_instances')
    .select('*, stage:workflow_stages(*)')
    .eq('case_id', caseId)
    .order('created_at', { ascending: true });

  // 3. Fetch workflow stages & dependencies
  const { data: workflowStages } = await supabase
    .from('workflow_stages')
    .select('*')
    .eq('workflow_id', caseItem.workflow_id)
    .order('stage_number', { ascending: true });

  const stageIds = (workflowStages || []).map((s) => s.id);
  const { data: dependencies } = await supabase
    .from('stage_dependencies')
    .select('*')
    .in('stage_id', stageIds);

  // 4. Fetch documents & extractions
  const { data: documents } = await supabase
    .from('documents')
    .select('*, extractions:document_extractions(*)')
    .eq('case_id', caseId);

  // 5. Fetch parcels
  const { data: parcels } = await supabase
    .from('parcels')
    .select('*')
    .eq('case_id', caseId);

  // 6. Fetch recent audit logs
  const { data: auditLogs } = await supabase
    .from('case_events')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: false })
    .limit(20);

  // 7. Fetch statutory disputes & objections
  let disputes: any[] = [];
  try {
    const { data: dbDisputes } = await supabase
      .from('case_disputes')
      .select('*')
      .eq('case_id', caseId);
    disputes = dbDisputes || [];
  } catch {
    disputes = [];
  }
  if (disputes.length === 0) {
    disputes = getDisputesForCaseSync(caseId);
  }

  return {
    caseItem,
    stageInstances: stageInstances || [],
    workflowStages: workflowStages || [],
    dependencies: dependencies || [],
    documents: documents || [],
    parcels: parcels || [],
    auditLogs: auditLogs || [],
    disputes: disputes || [],
  };
}

// GET /api/cases/:id/intelligence - Complete Predictive Intelligence Bundle
router.get('/cases/:id/intelligence', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const { id: rawCaseId } = req.params;
    const caseId = typeof rawCaseId === 'string' ? rawCaseId : rawCaseId[0];

    const ctx = await fetchFullCaseContext(caseId);

    // Fetch external observations & discrepancies if available for case
    const [externalObs, discrepancies] = await Promise.all([
      getCachedObservation('case', caseId),
      listDiscrepancies({ entityType: 'case', entityId: caseId }),
    ]);

    // 1. Risk Assessment
    const risk = calculateDeterministicRiskAssessment({
      caseItem: ctx.caseItem,
      stageInstances: ctx.stageInstances,
      stages: ctx.workflowStages,
      dependencies: ctx.dependencies,
      documents: ctx.documents,
      parcels: ctx.parcels,
      disputes: ctx.disputes,
      externalObservation: externalObs,
      discrepancies,
    });

    // 2. Bottlenecks
    const bottlenecks = detectCaseBottlenecks({
      caseId,
      stageInstances: ctx.stageInstances,
      stages: ctx.workflowStages,
      dependencies: ctx.dependencies,
      documents: ctx.documents,
      parcels: ctx.parcels,
    });

    // 3. Root Causes
    const rootCauses = await analyzeCaseRootCauses({
      caseTitle: ctx.caseItem.title,
      stageInstances: ctx.stageInstances,
      stages: ctx.workflowStages,
      dependencies: ctx.dependencies,
      documents: ctx.documents,
      parcels: ctx.parcels,
      auditLogs: ctx.auditLogs,
    });

    // 4. Downstream Impact
    const impact = calculateDownstreamDAGImpact({
      stageInstances: ctx.stageInstances,
      stages: ctx.workflowStages,
      dependencies: ctx.dependencies,
    });

    // 5. Action Recommendations
    const recommendations = generateEvidenceBasedRecommendations({
      caseId,
      bottlenecks,
      rootCauses,
      stageInstances: ctx.stageInstances,
      stages: ctx.workflowStages,
      documents: ctx.documents,
      parcels: ctx.parcels,
      externalObservation: externalObs,
      discrepancies,
    });

    // Persist latest risk assessment asynchronously
    const supabase = getSupabase();
    supabase
      .from('risk_assessments')
      .insert({
        case_id: caseId,
        overall_risk_score: risk.overall_risk_score,
        risk_level: risk.risk_level,
        factor_breakdown: risk.factor_breakdown,
        observed_facts: risk.observed_facts,
        ai_inferences: risk.ai_inferences,
      })
      .then(
        () => {},
        (e: any) => console.warn('[RiskDB] Could not persist assessment:', e?.message || e)
      );

    // Persist recommendations asynchronously with valid UUIDs
    if (recommendations.length > 0) {
      supabase
        .from('recommendations')
        .upsert(
          recommendations.map((r) => ({
            id: r.id,
            case_id: r.case_id,
            stage_instance_id: r.stage_instance_id || null,
            title: r.title,
            description: r.description,
            action_type: r.action_type,
            urgency: r.urgency,
            expected_impact: r.expected_impact,
            confidence: r.confidence,
            responsible_stakeholder: r.responsible_stakeholder || null,
            is_implemented: r.is_implemented,
            reason: r.reason || null,
            supporting_evidence: r.supporting_evidence || [],
            source: r.source || 'deterministic',
            status: r.status || 'proposed',
          })),
          { onConflict: 'id', ignoreDuplicates: true }
        )
        .then(
          () => {},
          (e: any) => console.warn('[RecDB] Could not persist recommendations:', e?.message || e)
        );
    }

    res.json({
      intelligence: {
        case_id: caseId,
        risk_assessment: risk,
        bottlenecks,
        root_causes: rootCauses,
        downstream_impact: impact,
        recommendations,
        predictive_delay: risk.factor_breakdown.predictive_delay,
        evidence_ledger: risk.evidence_ledger,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cases/:id/intelligence/simulate - Run In-Memory What-If Simulation
router.post('/cases/:id/intelligence/simulate', requireAuth, requireRole(['admin', 'project_officer', 'lao', 'approver']), async (req: Request, res: Response) => {
  try {
    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const { id: rawCaseId } = req.params;
    const caseId = typeof rawCaseId === 'string' ? rawCaseId : rawCaseId[0];

    const parseResult = RunSimulationSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
      });
    }

    const { name, description, proposed_actions } = parseResult.data;

    const ctx = await fetchFullCaseContext(caseId);

    // Execute in-memory simulation (strictly zero mutation of production case)
    const simulation = runWhatIfScenarioSimulation({
      caseItem: ctx.caseItem,
      stageInstances: ctx.stageInstances,
      stages: ctx.workflowStages,
      dependencies: ctx.dependencies,
      scenarioName: name,
      scenarioDescription: description,
      proposedActions: proposed_actions,
    });

    // Save simulation record in scenarios table
    const supabase = getSupabase();
    const { data: savedScenario, error: saveErr } = await supabase
      .from('scenarios')
      .insert({
        case_id: caseId,
        name: simulation.name,
        description: simulation.description,
        proposed_actions: simulation.proposed_actions,
        original_projected_date: simulation.original_projected_date,
        simulated_projected_date: simulation.simulated_projected_date,
        delay_recovered_days: simulation.delay_recovered_days,
        simulation_result: simulation.simulation_result,
      })
      .select('*')
      .single();

    // Log audit event for scenario exploration
    await logCaseEvent({
      case_id: caseId,
      event_type: 'SIMULATION_RUN',
      title: `What-If Simulation Explored: ${name}`,
      description: `Simulated intervention: ${simulation.delay_recovered_days} days projected recovery. Baseline: ${simulation.original_projected_date} → Simulated: ${simulation.simulated_projected_date}.`,
      actor_name: req.body.actorName || 'Planning Officer',
      metadata: {
        scenario_id: savedScenario?.id,
        days_saved: simulation.delay_recovered_days,
      },
    });

    res.json({
      simulation: savedScenario || simulation,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cases/:id/scenarios - Fetch Saved Scenarios
router.get('/cases/:id/scenarios', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const { id: rawCaseId } = req.params;
    const caseId = typeof rawCaseId === 'string' ? rawCaseId : rawCaseId[0];
    const supabase = getSupabase();

    const { data: scenarios, error } = await supabase
      .from('scenarios')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ scenarios: scenarios || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/cases/:id/recommendations/:recId - Human Decision on Recommendation
router.patch('/cases/:id/recommendations/:recId', requireAuth, requireRole(['admin', 'project_officer', 'lao', 'approver']), async (req: Request, res: Response) => {
  try {
    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const { id: rawCaseId, recId } = req.params;
    const caseId = typeof rawCaseId === 'string' ? rawCaseId : rawCaseId[0];

    // Verify user is authorized for this case within their project and territorial scope
    const authCheck = await authorizeUserForCase((req as any).user, caseId);
    if (!authCheck.authorized) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    const parseResult = UpdateRecommendationSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Validation failed' });
    }

    const { status, actorName, notes, observed_impact } = parseResult.data;
    const supabase = getSupabase();

    // Verify current recommendation status for valid lifecycle transition
    const { data: currentRec } = await supabase
      .from('recommendations')
      .select('*')
      .eq('id', recId)
      .eq('case_id', caseId)
      .single();

    if (currentRec) {
      const currentStatus = currentRec.status || 'proposed';
      const VALID_REC_TRANSITIONS: Record<string, string[]> = {
        proposed: ['accepted', 'rejected'],
        accepted: ['implemented', 'in_progress', 'completed', 'rejected'],
        implemented: ['completed', 'rejected'],
        in_progress: ['completed', 'rejected'],
        completed: [],
        rejected: ['proposed'],
      };
      const allowed = VALID_REC_TRANSITIONS[currentStatus] || [];
      if (!allowed.includes(status) && currentStatus !== status) {
        return res.status(400).json({
          error: `Invalid recommendation transition from "${currentStatus}" to "${status}". Allowed transitions: [${allowed.join(', ')}]`,
        });
      }
    }

    const updatePayload: any = {
      status,
      is_implemented: status === 'completed' || status === 'implemented',
    };

    if (status === 'completed') {
      // Calculate measurable outcome from actual workflow stage instances
      const { data: stageInstances } = await supabase
        .from('case_stage_instances')
        .select('*')
        .eq('case_id', caseId)
        .order('expected_start_date', { ascending: true });

      const completedStages = (stageInstances || []).filter((s: any) => s.status === 'completed' && s.actual_end_date);
      let systemCalculated: any = null;

      if (completedStages.length > 0) {
        const totalDeviation = completedStages.reduce((acc: number, s: any) => acc + (s.delay_days || 0), 0);
        systemCalculated = {
          measured_delay_reduction_days: observed_impact?.delay_reduction_days !== undefined ? observed_impact.delay_reduction_days : 0,
          stage_deviation_after_days: totalDeviation,
          calculation_method: 'stage_completion_actual_vs_expected',
          evidence_status: 'measured',
          evidence_notes: `Derived from ${completedStages.length} completed milestone(s) across case lifecycle.`,
          calculated_at: new Date().toISOString(),
        };
      } else {
        systemCalculated = {
          calculation_method: 'milestone_census',
          evidence_status: 'insufficient_evidence',
          evidence_notes: 'Active case has 0 completed milestones; empirical schedule recovery cannot yet be derived from completed timestamps.',
          calculated_at: new Date().toISOString(),
        };
      }

      const officerObservation = {
        reported_delay_reduction_days: observed_impact?.delay_reduction_days,
        completion_notes: observed_impact?.completion_notes || notes,
        recorded_by: actorName || (req as any).user?.name || 'Authorized Officer',
        recorded_at: new Date().toISOString(),
      };

      const finalObservedImpact: any = {
        evidence_type: systemCalculated.evidence_status === 'measured' ? 'measured' : (officerObservation.reported_delay_reduction_days !== undefined ? 'officer_reported' : 'insufficient_evidence'),
        system_calculated: systemCalculated,
        officer_observation: officerObservation,
        delay_reduction_days: observed_impact?.delay_reduction_days ?? (systemCalculated.measured_delay_reduction_days || 0),
        post_intervention_delay_days: observed_impact?.post_intervention_delay_days,
        completion_notes: observed_impact?.completion_notes || notes,
        recorded_at: new Date().toISOString(),
        recorded_by: actorName || (req as any).user?.name || 'Authorized Officer',
      };

      updatePayload.observed_impact = finalObservedImpact;
    } else if (observed_impact) {
      updatePayload.observed_impact = observed_impact;
    }

    const { data: updatedRec, error } = await supabase
      .from('recommendations')
      .update(updatePayload)
      .eq('id', recId)
      .eq('case_id', caseId)
      .select('*')
      .single();

    // Log decision in audit history
    await logCaseEvent({
      case_id: caseId,
      event_type: 'RECOMMENDATION_ACTIONED',
      title: `Recommendation ${status.toUpperCase()}: ${updatedRec?.title || recId}`,
      description: `Officer decision: ${status.toUpperCase()} by ${actorName || 'Authorized Officer'}. ${notes ? `Notes: ${notes}` : ''}`,
      actor_name: actorName || 'Authorized Officer',
      metadata: {
        recommendation_id: recId,
        status,
        observed_impact: observed_impact || null,
      },
    });

    // Asynchronously evaluate operational triggers when intervention is completed
    if (status === 'completed') {
      fetchFullCaseContext(caseId)
        .then((fullCtx) => {
          evaluateOperationalTriggers({
            caseItem: fullCtx.caseItem,
            stageInstances: fullCtx.stageInstances,
            documents: fullCtx.documents,
            parcels: fullCtx.parcels,
          }).catch((err) => console.warn('[TriggerEval] Operational trigger error:', err));
        })
        .catch((e) => console.warn('[TriggerEval] Context fetch error:', e));
    }

    res.json({ success: true, recommendation: updatedRec });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
