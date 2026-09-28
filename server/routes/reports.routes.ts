import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import {
  getStatutoryReportCatalogue,
  generateStatutoryReport,
} from '../services/reportsService';
import { StatutoryReportId } from '../../shared/types';

const router = Router();

router.get('/catalogue', requireAuth, async (_req: Request, res: Response) => {
  try {
    const catalogue = await getStatutoryReportCatalogue();
    res.json({ catalogue });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load statutory report catalogue' });
  }
});

router.get('/generate/:reportId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { reportId } = req.params;
    const { state, district, case_id, project_id, date_from, date_to } = req.query;

    const report = await generateStatutoryReport(reportId as StatutoryReportId, {
      state: state as string,
      district: district as string,
      case_id: case_id as string,
      project_id: project_id as string,
      date_from: date_from as string,
      date_to: date_to as string,
    });

    res.json({ report });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to generate statutory report' });
  }
});

router.get('/export/:reportId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { reportId } = req.params;
    const report = await generateStatutoryReport(reportId as StatutoryReportId, req.query as any);

    // Format as CSV
    const headers = report.columns.map((c) => c.label).join(',');
    const rows = report.rows
      .map((r) =>
        report.columns
          .map((c) => {
            const val = r[c.key] ?? '';
            return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
          })
          .join(',')
      )
      .join('\n');

    const csvContent = `${headers}\n${rows}`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${report.meta.code}_${Date.now()}.csv"`);
    res.send(csvContent);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to export statutory report' });
  }
});

export default router;
