import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { getAuditTrailEvents, logAuditEvent } from '../services/auditService';

const router = Router();

router.get('/audit-trail', requireAuth, async (req: Request, res: Response) => {
  try {
    const { entity_type, action, severity, actor_email, search, limit, offset } = req.query;

    const result = await getAuditTrailEvents({
      entity_type: entity_type as string,
      action: action as string,
      severity: severity as any,
      actor_email: actor_email as string,
      search: search as string,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch audit trail events' });
  }
});

router.post('/audit-trail', requireAuth, async (req: Request, res: Response) => {
  try {
    const { action, entity_type, entity_id, entity_title, severity, statutory_ref, changes_summary } = req.body;
    if (!action || !entity_type || !entity_id) {
      return res.status(400).json({ error: 'action, entity_type, and entity_id are required' });
    }

    const newEvent = await logAuditEvent({
      action,
      entity_type,
      entity_id,
      entity_title: entity_title || entity_id,
      severity: severity || 'info',
      statutory_ref: statutory_ref || 'Official Administrative Record',
      changes_summary: changes_summary || 'Inspection observation recorded.',
      actor_name: req.user?.full_name || 'Authorized Officer',
      actor_email: req.user?.email || 'officer@bhoomidarpan.gov.in',
      actor_role: req.user?.role || 'lao',
    });

    res.status(201).json({ event: newEvent });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to record audit observation' });
  }
});

router.get('/audit-trail/export', requireAuth, async (req: Request, res: Response) => {
  try {
    const { events } = await getAuditTrailEvents({ ...req.query, limit: 10000 });

    const headers = 'Sequence ID,Timestamp,Entity Type,Entity ID,Action,Actor,Role,Severity,Summary,Statutory Ref,Hash Signature';
    const rows = events
      .map((e) =>
        [
          e.sequence_id,
          e.timestamp,
          e.entity_type,
          e.entity_id,
          e.action,
          `"${e.actor_name} <${e.actor_email}>"`,
          e.actor_role,
          e.severity,
          `"${(e.changes_summary || '').replace(/"/g, '""')}"`,
          `"${(e.statutory_ref || '').replace(/"/g, '""')}"`,
          e.hash_signature,
        ].join(',')
      )
      .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="BhoomiDarpan_Audit_Trail_${Date.now()}.csv"`);
    res.send(`${headers}\n${rows}`);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to export audit trail' });
  }
});

export default router;
