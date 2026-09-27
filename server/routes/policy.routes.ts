import { Router, Request, Response } from 'express';
import {
  getAllPolicies,
  getPolicy,
  updatePolicy,
} from '../services/policyEngine';
import { requireAuth, requireRole } from '../middleware/auth.middleware';

const router = Router();

// GET /api/policies - List all configurable policies
router.get('/', requireAuth, async (_req: Request, res: Response) => {
  try {
    const policies = await getAllPolicies();
    res.json({ policies });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve policies' });
  }
});

// GET /api/policies/:key - Retrieve single policy
router.get('/:key', requireAuth, async (req: Request, res: Response) => {
  try {
    const key = typeof req.params.key === 'string' ? req.params.key : req.params.key[0];
    const policy = await getPolicy(key);
    res.json({ policy });
  } catch (err: any) {
    res.status(404).json({ error: err.message || 'Policy not found' });
  }
});

// PUT /api/policies/:key - Update configurable policy (Admin authorization required)
router.put('/:key', requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const key = typeof req.params.key === 'string' ? req.params.key : req.params.key[0];
    const { config_value } = req.body;

    if (!config_value || typeof config_value !== 'object') {
      return res.status(400).json({ error: 'config_value must be a valid JSON object' });
    }

    const updated = await updatePolicy({
      key,
      config_value,
      actor_name: (req as any).user?.full_name || 'System Administrator',
      actor_id: (req as any).user?.id,
    });

    res.json({
      success: true,
      message: `Policy ${key} updated successfully.`,
      policy: updated,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update policy' });
  }
});

export default router;
