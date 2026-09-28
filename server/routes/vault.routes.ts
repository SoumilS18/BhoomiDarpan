import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { getVaultDocuments, getDocumentVaultStats, addVaultDocument } from '../services/vaultService';
import { logAuditEvent } from '../services/auditService';

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

router.post('/vault', requireAuth, async (req: Request, res: Response) => {
  try {
    const doc = await addVaultDocument({
      ...req.body,
      uploaded_by: req.user?.email || req.user?.full_name || 'officer@bhoomidarpan.gov.in',
    });

    // Automatically record to immutable audit trail
    await logAuditEvent({
      entity_type: 'document',
      entity_id: doc.id,
      entity_title: doc.title,
      action: 'VAULT_DOCUMENT_UPLOADED',
      actor_name: req.user?.full_name || 'Authorized Officer',
      actor_email: req.user?.email || 'officer@bhoomidarpan.gov.in',
      actor_role: req.user?.role || 'lao',
      severity: 'info',
      changes_summary: `Document "${doc.title}" (${doc.category}) registered with SHA-256 hash ${doc.sha256_hash.substring(0, 16)}...`,
      statutory_ref: doc.case_number ? `Case ${doc.case_number}` : 'Central Document Repository',
    });

    res.status(201).json({ document: doc });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to add document to vault' });
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
