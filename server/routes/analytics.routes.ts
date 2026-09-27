import { Router, Request, Response } from 'express';
import { getSupabase, isSupabaseConfigured } from '../config/supabase';
import { calculateCaseMetrics } from '../services/deviationCalculator';
import {
  analyzePortfolioOperations,
  analyzePortfolioOverview,
  analyzePortfolioDelays,
  analyzePortfolioRisks,
  analyzePortfolioBottlenecks,
  analyzePortfolioTrends,
  analyzePortfolioOutcomes,
  analyzePortfolioGeography,
} from '../services/portfolioAnalyzer';
import { getTotalUnitsCount } from '../services/administrativeGeographyService';
import { requireAuth, optionalAuth } from '../middleware/auth.middleware';
import {
  DashboardAnalytics,
  CasePriority,
  CaseStatus,
  PortfolioFilterParams,
} from '../../shared/types';

const router = Router();

/**
 * Helper to extract and sanitize query filter parameters.
 *
 * NOTE: every key here is also read by `applyScopeAndQueryParams` /
 * `analyzePortfolioOperations` in portfolioAnalyzer — the two lists must stay
 * in step or a control shown in the UI would silently reach nothing.
 */
function extractPortfolioFilters(req: Request): PortfolioFilterParams {
  return {
    project_id: req.query.project_id ? String(req.query.project_id) : undefined,
    state: req.query.state ? String(req.query.state) : undefined,
    district: req.query.district ? String(req.query.district) : undefined,
    state_lgd_code: req.query.state_lgd_code ? String(req.query.state_lgd_code) : undefined,
    district_lgd_code: req.query.district_lgd_code
      ? String(req.query.district_lgd_code)
      : undefined,
    subdistrict_lgd_code: req.query.subdistrict_lgd_code
      ? String(req.query.subdistrict_lgd_code)
      : undefined,
    village_lgd_code: req.query.village_lgd_code ? String(req.query.village_lgd_code) : undefined,
    workflow_id: req.query.workflow_id ? String(req.query.workflow_id) : undefined,
    status: req.query.status ? String(req.query.status) : undefined,
    risk_level: req.query.risk_level ? String(req.query.risk_level) : undefined,
    search: req.query.search ? String(req.query.search) : undefined,
  };
}

/**
 * Helper to fetch common portfolio data tables in parallel.
 */
async function fetchPortfolioRawData(supabase: any) {
  const [casesRes, workflowsRes, depsRes, recsRes] = await Promise.all([
    supabase
      .from('acquisition_cases')
      .select(`
        *,
        project:projects(id, name, code),
        workflow:workflows(id, name),
        stage_instances:case_stage_instances(
          *,
          stage:workflow_stages(*)
        ),
        parcels(id, survey_number, acquisition_status, area_acres, geojson_geometry),
        documents(id, title, status, document_type)
      `)
      .order('created_at', { ascending: false }),
    supabase
      .from('workflows')
      .select(`
        id,
        name,
        stages:workflow_stages(*)
      `),
    supabase
      .from('stage_dependencies')
      .select('*'),
    supabase
      .from('recommendations')
      .select('*')
      .order('created_at', { ascending: false }),
  ]);

  return {
    cases: (casesRes.data || []) as any[],
    workflows: (workflowsRes.data || []) as any[],
    dependencies: (depsRes.data || []) as any[],
    recommendations: (recsRes.data || []) as any[],
    casesError: casesRes.error,
  };
}

// -------------------------------------------------------------
// 1. GET /api/portfolio/overview (Executive Overview)
// -------------------------------------------------------------
router.get(['/portfolio/overview', '/overview'], requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const supabase = getSupabase();
    const { cases, casesError } = await fetchPortfolioRawData(supabase);
    if (casesError) {
      return res.status(500).json({ error: casesError.message });
    }

    const filters = extractPortfolioFilters(req);
    const overview = analyzePortfolioOverview({
      cases,
      user: req.user,
      filters,
    });

    res.json({ overview });
  } catch (err: any) {
    console.error('Portfolio overview error:', err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 2. GET /api/portfolio/delays (Delay Intelligence)
// -------------------------------------------------------------
router.get(['/portfolio/delays', '/delays'], requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const supabase = getSupabase();
    const { cases, casesError } = await fetchPortfolioRawData(supabase);
    if (casesError) {
      return res.status(500).json({ error: casesError.message });
    }

    const filters = extractPortfolioFilters(req);
    const delays = analyzePortfolioDelays({
      cases,
      user: req.user,
      filters,
    });

    res.json({ delays });
  } catch (err: any) {
    console.error('Portfolio delays error:', err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 3. GET /api/portfolio/risk (Aggregate Risk Intelligence)
// -------------------------------------------------------------
router.get(['/portfolio/risk', '/risk'], requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const supabase = getSupabase();
    const { cases, casesError } = await fetchPortfolioRawData(supabase);
    if (casesError) {
      return res.status(500).json({ error: casesError.message });
    }

    const filters = extractPortfolioFilters(req);
    const risk = analyzePortfolioRisks({
      cases,
      user: req.user,
      filters,
    });

    res.json({ risk, risks: risk });
  } catch (err: any) {
    console.error('Portfolio risk error:', err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 4. GET /api/portfolio/bottlenecks (Systemic Bottlenecks)
// -------------------------------------------------------------
router.get(['/portfolio/bottlenecks', '/bottlenecks'], requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const supabase = getSupabase();
    const { cases, dependencies, casesError } = await fetchPortfolioRawData(supabase);
    if (casesError) {
      return res.status(500).json({ error: casesError.message });
    }

    const filters = extractPortfolioFilters(req);
    const bottlenecks = analyzePortfolioBottlenecks({
      cases,
      dependencies,
      user: req.user,
      filters,
    });

    res.json({ bottlenecks });
  } catch (err: any) {
    console.error('Portfolio bottlenecks error:', err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 5. GET /api/portfolio/trends (Historical Trend Analysis)
// -------------------------------------------------------------
router.get(['/portfolio/trends', '/trends'], requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const supabase = getSupabase();
    const { cases, casesError } = await fetchPortfolioRawData(supabase);
    if (casesError) {
      return res.status(500).json({ error: casesError.message });
    }

    const filters = extractPortfolioFilters(req);
    const metricName = req.query.metric_name ? String(req.query.metric_name) : 'schedule_deviation';
    const minDays = req.query.min_days ? parseInt(String(req.query.min_days), 10) : undefined;
    const minCases = req.query.min_cases ? parseInt(String(req.query.min_cases), 10) : undefined;

    const trends = analyzePortfolioTrends({
      cases,
      metricName,
      user: req.user,
      filters,
      policyOverrides: {
        ...(minDays !== undefined ? { min_historical_days: minDays } : {}),
        ...(minCases !== undefined ? { min_cases_sample_size: minCases } : {}),
      },
    });

    res.json({ trends });
  } catch (err: any) {
    console.error('Portfolio trends error:', err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 6. GET /api/portfolio/geography (Geographic Drilldown Tree)
// -------------------------------------------------------------
router.get(['/portfolio/geography', '/geography'], requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const supabase = getSupabase();
    const [{ cases, casesError }, totalUnitsCount] = await Promise.all([
      fetchPortfolioRawData(supabase),
      getTotalUnitsCount(),
    ]);

    if (casesError) {
      return res.status(500).json({ error: casesError.message });
    }

    const filters = extractPortfolioFilters(req);
    const geography = analyzePortfolioGeography({
      cases,
      totalUnitsCount,
      user: req.user,
      filters,
    });

    res.json({ geography });
  } catch (err: any) {
    console.error('Portfolio geography error:', err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 7. GET /api/portfolio/outcomes (Recommendation & Outcome Analytics)
// -------------------------------------------------------------
router.get(['/portfolio/outcomes', '/outcomes'], requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const supabase = getSupabase();
    const { cases, recommendations, casesError } = await fetchPortfolioRawData(supabase);
    if (casesError) {
      return res.status(500).json({ error: casesError.message });
    }

    const filters = extractPortfolioFilters(req);
    const outcomes = analyzePortfolioOutcomes({
      cases,
      recommendations,
      user: req.user,
      filters,
    });

    res.json({ outcomes });
  } catch (err: any) {
    console.error('Portfolio outcomes error:', err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 8. GET /api/portfolio (Full Portfolio Bundle)
// -------------------------------------------------------------
router.get(['/portfolio', '/'], requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const supabase = getSupabase();
    const filters = extractPortfolioFilters(req);

    const { cases, workflows, dependencies, casesError } = await fetchPortfolioRawData(supabase);
    if (casesError) {
      return res.status(500).json({ error: casesError.message });
    }

    // Apply role-based scoping server-side
    const { getAuthorizedScopeFilter: getScope, applyScopeFilter: applyScope } = await import('../services/portfolioAnalyzer');
    const scope = getScope(req.user);
    const scopedCases = applyScope(cases, scope);

    const portfolioData = analyzePortfolioOperations({
      cases: scopedCases,
      workflows,
      dependencies,
      filters,
    });

    res.json({ portfolio: portfolioData });
  } catch (err: any) {
    console.error('Portfolio analytics error:', err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 9. GET /api/portfolio/attention-queue (Dedicated Attention Queue)
// -------------------------------------------------------------
router.get(['/attention-queue', '/portfolio/attention-queue'], requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const supabase = getSupabase();
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || 20), 10)));
    const offset = Math.max(0, parseInt(String(req.query.offset || 0), 10));

    const { cases, casesError } = await fetchPortfolioRawData(supabase);
    if (casesError) {
      return res.status(500).json({ error: casesError.message });
    }

    // Apply role-based scoping server-side
    const { getAuthorizedScopeFilter: getScope, applyScopeFilter: applyScope } = await import('../services/portfolioAnalyzer');
    const scope = getScope(req.user);
    const scopedCases = applyScope(cases, scope);

    const portfolioData = analyzePortfolioOperations({
      cases: scopedCases,
    });

    const paginated = portfolioData.attention_queue.slice(offset, offset + limit);

    res.json({
      total: portfolioData.attention_queue.length,
      limit,
      offset,
      queue: paginated,
      attention_queue: paginated,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 10. GET /api/analytics/dashboard (Legacy Backward-Compatible KPIs)
// -------------------------------------------------------------
router.get('/dashboard', optionalAuth, async (_req: Request, res: Response) => {
  try {
    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const supabase = getSupabase();

    const { data: cases, error } = await supabase
      .from('acquisition_cases')
      .select(`
        *,
        stage_instances:case_stage_instances(
          *,
          stage:workflow_stages(*)
        )
      `);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const casesList = cases || [];

    let totalAreaHectares = 0;
    let totalCompensationAllocated = 0;
    let activeCasesCount = 0;
    let delayedCasesCount = 0;
    let completedCasesCount = 0;
    let totalProgressSum = 0;
    let totalDelayDaysAccumulated = 0;

    const casesByPriority: Record<CasePriority, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    const casesByStatus: Record<CaseStatus, number> = {
      draft: 0,
      active: 0,
      under_review: 0,
      delayed: 0,
      litigation: 0,
      completed: 0,
    };

    const casesByState: Record<string, number> = {};
    const stageDelayMap = new Map<string, { title: string; count: number; totalDays: number }>();

    for (const c of casesList) {
      totalAreaHectares += Number(c.total_area_hectares || 0);
      totalCompensationAllocated += Number(c.estimated_compensation || 0);

      const status = (c.status || 'active') as CaseStatus;
      if (casesByStatus[status] !== undefined) {
        casesByStatus[status]++;
      }

      const priority = (c.priority || 'medium') as CasePriority;
      if (casesByPriority[priority] !== undefined) {
        casesByPriority[priority]++;
      }

      if (c.state) {
        casesByState[c.state] = (casesByState[c.state] || 0) + 1;
      }

      const metrics = calculateCaseMetrics({
        startDate: c.start_date,
        expectedCompletionDate: c.expected_completion_date,
        actualCompletionDate: c.actual_completion_date,
        stageInstances: c.stage_instances || [],
      });

      totalProgressSum += metrics.progress_percentage;
      totalDelayDaysAccumulated += metrics.net_delay_days;

      if (status === 'completed') {
        completedCasesCount++;
      } else if (metrics.is_delayed || status === 'delayed' || status === 'litigation') {
        delayedCasesCount++;
        activeCasesCount++;
      } else {
        activeCasesCount++;
      }

      (c.stage_instances || []).forEach((inst: any) => {
        if (inst.delay_days > 0 && inst.stage) {
          const entry = stageDelayMap.get(inst.stage.code) || {
            title: inst.stage.title,
            count: 0,
            totalDays: 0,
          };
          entry.count++;
          entry.totalDays += inst.delay_days;
          stageDelayMap.set(inst.stage.code, entry);
        }
      });
    }

    const totalCases = casesList.length;
    const averageCaseProgress = totalCases > 0 ? Math.round(totalProgressSum / totalCases) : 0;

    const bottleneckStages = Array.from(stageDelayMap.entries())
      .map(([code, val]) => ({
        stage_code: code,
        stage_title: val.title,
        delayed_cases_count: val.count,
        average_delay_days: Math.round(val.totalDays / val.count),
      }))
      .sort((a, b) => b.delayed_cases_count - a.delayed_cases_count)
      .slice(0, 5);

    const analytics: DashboardAnalytics = {
      total_cases: totalCases,
      active_cases: activeCasesCount,
      delayed_cases: delayedCasesCount,
      completed_cases: completedCasesCount,
      total_area_hectares: Math.round(totalAreaHectares * 100) / 100,
      total_compensation_allocated: totalCompensationAllocated,
      average_case_progress: averageCaseProgress,
      total_delay_days_accumulated: totalDelayDaysAccumulated,
      cases_by_priority: casesByPriority,
      cases_by_status: casesByStatus,
      cases_by_state: casesByState,
      bottleneck_stages: bottleneckStages,
    };

    res.json({ analytics });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
