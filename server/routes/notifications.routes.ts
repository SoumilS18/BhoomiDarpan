import { Router, Request, Response } from 'express';
import {
  fetchNotifications,
  fetchNotificationCounts,
  acknowledgeNotification,
  resolveNotification,
  dismissNotification,
  escalateNotification,
  evaluateOperationalTriggers,
} from '../services/notificationService';
import { getSupabase, isSupabaseConfigured } from '../config/supabase';
import { requireAuth } from '../middleware/auth.middleware';
import { getAuthorizedScopeFilter } from '../services/portfolioAnalyzer';
import { getCaseSpatialRelationships } from '../services/spatialIntelligenceService';

const router = Router();

// ============================================================================
// 1. GET /api/notifications - List notifications (scoped to authenticated user)
// ============================================================================
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { case_id, project_id, status, severity, event_type, limit } = req.query;

    const notifications = await fetchNotifications({
      case_id: case_id as string,
      project_id: project_id as string,
      status: status as string,
      severity: severity as string,
      event_type: event_type as string,
      limit: limit ? Number(limit) : 100,
      user: req.user,
    });

    res.json({
      notifications,
      total_count: notifications.length,
      unread_count: notifications.filter((n) => n.status === 'unread').length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch notifications' });
  }
});

// ============================================================================
// 2. GET /api/notifications/count - Summary metrics across categories/severities
// ============================================================================
router.get('/count', requireAuth, async (req: Request, res: Response) => {
  try {
    const counts = await fetchNotificationCounts(req.user);
    res.json({ counts });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch notification counts' });
  }
});

// ============================================================================
// 3. GET /api/notifications/attention - Attention queue alerts join
// ============================================================================
router.get('/attention', requireAuth, async (req: Request, res: Response) => {
  try {
    const notifications = await fetchNotifications({
      status: 'unread',
      user: req.user,
      limit: 50,
    });

    const highPriorityAlerts = notifications.filter(
      (n) => n.severity === 'urgent' || n.severity === 'critical'
    );

    res.json({
      attention_alerts: highPriorityAlerts,
      total_active: notifications.length,
      critical_count: highPriorityAlerts.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch attention alerts' });
  }
});

// ============================================================================
// 4. GET /api/notifications/:id - Single notification with evidence
// ============================================================================
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
    const notifications = await fetchNotifications({ user: req.user });
    const notification = notifications.find((n) => n.id === id);

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found or access denied' });
    }

    res.json({ notification });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch notification details' });
  }
});

// ============================================================================
// Helper: Verify User Authorization to Act on a Notification
// ============================================================================
function verifyNotificationAccess(req: Request, notification: any): boolean {
  if (!req.user) return false;

  // Viewers cannot perform lifecycle mutations
  if (req.user.role === 'viewer') return false;

  // Admin & LAO have national authority
  if (req.user.role === 'admin' || req.user.role === 'lao') return true;

  const scope = getAuthorizedScopeFilter(req.user);

  // Project Officer: must match assigned project
  if (req.user.role === 'project_officer' && scope.projectIds) {
    if (!notification.project_id || !scope.projectIds.includes(notification.project_id)) {
      return false;
    }
  }

  // Revenue Inspector: must match assigned state/district
  if (req.user.role === 'revenue_inspector') {
    if (scope.allowedStates && notification.state && !scope.allowedStates.some((s) => s.toLowerCase() === notification.state.toLowerCase())) {
      return false;
    }
    if (scope.allowedDistricts && notification.district && !scope.allowedDistricts.some((d) => d.toLowerCase() === notification.district.toLowerCase())) {
      return false;
    }
  }

  return true;
}

// ============================================================================
// 5. POST & PATCH /api/notifications/:id/acknowledge
// ============================================================================
const handleAcknowledge = async (req: Request, res: Response) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
    const notifications = await fetchNotifications(); // unscoped fetch to check existence
    const notification = notifications.find((n) => n.id === id);

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    if (!verifyNotificationAccess(req, notification)) {
      return res.status(403).json({
        error: 'Access Denied: You do not have authorization to acknowledge this notification.',
        code: 'FORBIDDEN_SCOPE',
      });
    }

    const actorName = req.user?.full_name || 'Authorized Officer';
    const actorId = req.user?.id;

    const result = await acknowledgeNotification(id, actorName, actorId);
    res.json({
      success: true,
      message: 'Notification acknowledged successfully.',
      notification: result,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to acknowledge notification', code: 'INVALID_STATE_TRANSITION' });
  }
};

router.post('/:id/acknowledge', requireAuth, handleAcknowledge);
router.patch('/:id/acknowledge', requireAuth, handleAcknowledge);

// ============================================================================
// 6. POST & PATCH /api/notifications/:id/resolve
// ============================================================================
const handleResolve = async (req: Request, res: Response) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
    const notifications = await fetchNotifications();
    const notification = notifications.find((n) => n.id === id);

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    if (!verifyNotificationAccess(req, notification)) {
      return res.status(403).json({
        error: 'Access Denied: You do not have authorization to resolve this notification.',
        code: 'FORBIDDEN_SCOPE',
      });
    }

    const actorName = req.user?.full_name || 'Authorized Officer';
    const actorId = req.user?.id;
    const actionTaken = req.body?.actionTaken || req.body?.notes || 'Direct operational remediation executed.';

    const result = await resolveNotification(id, actorName, actorId, actionTaken);
    res.json({
      success: true,
      message: 'Notification resolved successfully.',
      notification: result,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to resolve notification', code: 'INVALID_STATE_TRANSITION' });
  }
};

router.post('/:id/resolve', requireAuth, handleResolve);
router.patch('/:id/resolve', requireAuth, handleResolve);

// ============================================================================
// 7. POST /api/notifications/:id/dismiss
// ============================================================================
router.post('/:id/dismiss', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
    const notifications = await fetchNotifications();
    const notification = notifications.find((n) => n.id === id);

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    if (!verifyNotificationAccess(req, notification)) {
      return res.status(403).json({
        error: 'Access Denied: You do not have authorization to dismiss this notification.',
        code: 'FORBIDDEN_SCOPE',
      });
    }

    const actorName = req.user?.full_name || 'Authorized Officer';
    const actorId = req.user?.id;
    const reason = req.body?.reason || 'Dismissed as non-actionable upon review.';

    const result = await dismissNotification(id, actorName, actorId, reason);
    res.json({
      success: true,
      message: 'Notification dismissed successfully.',
      notification: result,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to dismiss notification', code: 'INVALID_STATE_TRANSITION' });
  }
});

// ============================================================================
// 8. POST /api/notifications/:id/escalate
// ============================================================================
router.post('/:id/escalate', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
    const notifications = await fetchNotifications();
    const notification = notifications.find((n) => n.id === id);

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    if (!verifyNotificationAccess(req, notification)) {
      return res.status(403).json({
        error: 'Access Denied: You do not have authorization to escalate this notification.',
        code: 'FORBIDDEN_SCOPE',
      });
    }

    const actorName = req.user?.full_name || 'Institutional Officer';
    const actorId = req.user?.id;
    const reason = req.body?.reason || 'Manual officer escalation to supervisory authority.';

    const result = await escalateNotification(id, actorName, actorId, reason);
    res.json({
      success: true,
      message: 'Notification escalated successfully.',
      notification: result,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to escalate notification', code: 'INVALID_STATE_TRANSITION' });
  }
});

// ============================================================================
// 9. POST /api/notifications/evaluate - Trigger data-driven evaluation
// ============================================================================
router.post('/evaluate', requireAuth, async (req: Request, res: Response) => {
  try {
    const { case_id } = req.body;

    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const supabase = getSupabase();
    let casesQuery = supabase.from('acquisition_cases').select('*');
    if (case_id) casesQuery = casesQuery.eq('id', case_id);

    const { data: casesList, error: casesErr } = await casesQuery;
    if (casesErr || !casesList || casesList.length === 0) {
      return res.status(404).json({ error: 'No acquisition cases found for evaluation' });
    }

    const scopeFilter = getAuthorizedScopeFilter(req.user);
    const allGenerated = [];
    for (const caseItem of casesList) {
      const [stagesRes, docsRes, parcelsRes, riskRes, spatialRels] = await Promise.all([
        supabase.from('case_stage_instances').select('*, stage:workflow_stages(*)').eq('case_id', caseItem.id),
        supabase.from('documents').select('*').eq('case_id', caseItem.id),
        supabase.from('parcels').select('*').eq('case_id', caseItem.id),
        supabase.from('risk_assessments').select('*').eq('case_id', caseItem.id).order('generated_at', { ascending: false }).limit(1),
        getCaseSpatialRelationships(caseItem.id, scopeFilter).catch(() => []),
      ]);

      const generated = await evaluateOperationalTriggers({
        caseItem,
        stageInstances: stagesRes.data || [],
        documents: docsRes.data || [],
        parcels: parcelsRes.data || [],
        riskAssessment: riskRes.data?.[0],
        spatialRelationships: spatialRels,
      });
      allGenerated.push(...generated);
    }

    res.json({
      success: true,
      evaluated_cases: casesList.length,
      generated_or_updated_count: allGenerated.length,
      notifications: allGenerated,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to evaluate notifications' });
  }
});

export default router;
