import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import {
  getRehabilitationPlans,
  getRehabilitationPlanById,
  createRehabilitationPlan,
  updateRehabilitationPlanStatus,
  getAffectedFamilies,
  getAffectedFamilyById,
  createAffectedFamily,
  updateAffectedFamilyDisbursement,
  getRehabilitationSummary,
} from '../services/rehabilitationService';

const router = Router();

// ============================================================================
// REHABILITATION PLANS (RFCTLARR 2013 CHAPTER V)
// ============================================================================

router.get('/plans', requireAuth, async (req: Request, res: Response) => {
  try {
    const plans = await getRehabilitationPlans();
    res.json({ plans });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch rehabilitation plans' });
  }
});

router.get('/plans/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const plan = await getRehabilitationPlanById(req.params.id as string);
    if (!plan) {
      return res.status(404).json({ error: 'Rehabilitation plan not found' });
    }
    res.json({ plan });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch rehabilitation plan' });
  }
});

router.post(
  '/plans',
  requireAuth,
  requireRole(['admin', 'project_officer', 'lao']),
  async (req: Request, res: Response) => {
    try {
      const created = await createRehabilitationPlan(req.body);
      res.status(201).json({ plan: created });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to create rehabilitation plan' });
    }
  }
);

router.patch(
  '/plans/:id/status',
  requireAuth,
  requireRole(['admin', 'project_officer', 'lao', 'approver']),
  async (req: Request, res: Response) => {
    try {
      const { status } = req.body;
      if (!status) {
        return res.status(400).json({ error: 'Status is required' });
      }
      const updated = await updateRehabilitationPlanStatus(req.params.id as string, status);
      if (!updated) {
        return res.status(404).json({ error: 'Rehabilitation plan not found' });
      }
      res.json({ plan: updated });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to update plan status' });
    }
  }
);

// ============================================================================
// AFFECTED FAMILIES (PAF / PAP CENSUS REGISTER)
// ============================================================================

router.get('/families', requireAuth, async (req: Request, res: Response) => {
  try {
    const { case_id, project_id, vulnerability, status, search } = req.query;
    const families = await getAffectedFamilies({
      case_id: case_id as string,
      project_id: project_id as string,
      vulnerability: vulnerability as string,
      status: status as string,
      search: search as string,
    });
    res.json({ families });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch affected families' });
  }
});

router.get('/families/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const family = await getAffectedFamilyById(req.params.id as string);
    if (!family) {
      return res.status(404).json({ error: 'Affected family record not found' });
    }
    res.json({ family });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch family record' });
  }
});

router.post(
  '/families',
  requireAuth,
  requireRole(['admin', 'lao', 'revenue_inspector', 'project_officer']),
  async (req: Request, res: Response) => {
    try {
      const created = await createAffectedFamily(req.body);
      res.status(201).json({ family: created });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to add affected family record' });
    }
  }
);

router.patch(
  '/families/:id/disbursement',
  requireAuth,
  requireRole(['admin', 'lao', 'approver', 'revenue_inspector']),
  async (req: Request, res: Response) => {
    try {
      const { status, amount } = req.body;
      if (!status) {
        return res.status(400).json({ error: 'Disbursement status is required' });
      }
      const updated = await updateAffectedFamilyDisbursement(req.params.id as string, status, amount);
      if (!updated) {
        return res.status(404).json({ error: 'Affected family record not found' });
      }
      res.json({ family: updated });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to update disbursement status' });
    }
  }
);

// ============================================================================
// AGGREGATED SUMMARY
// ============================================================================

router.get('/summary', requireAuth, async (_req: Request, res: Response) => {
  try {
    const summary = await getRehabilitationSummary();
    res.json({ summary });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to calculate rehabilitation summary' });
  }
});

export default router;
