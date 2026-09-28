import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { getVaultDocuments, getDocumentVaultStats } from '../services/vaultService';

const router = Router();

router.get('/vault', requireAuth, async (req: Request, res: Response) => {
  try {
    const { category, case_id, project_id, status, search } = req.query;
    const documents = await getVaultDocuments({
      category: category as string,
      case_id: case_id as string,
      project_id: project_id as string,
      status: status as string,
      search: search as string,
    });
    res.json({ documents });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch document vault records' });
  }
});

router.get('/vault/stats', requireAuth, async (_req: Request, res: Response) => {
  try {
    const stats = await getDocumentVaultStats();
    res.json({ stats });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to calculate vault stats' });
  }
});

export default router;
