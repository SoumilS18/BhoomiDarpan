import { Router, Request, Response } from 'express';
import { getSupabase, isSupabaseConfigured } from '../config/supabase';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { logCaseEvent } from '../services/auditLogger';

const router = Router();

// GET /api/workflows - Get all active workflows with stages
router.get('/', requireAuth, async (_req: Request, res: Response) => {
  try {
    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const supabase = getSupabase();
    const { data: workflows, error } = await supabase
      .from('workflows')
      .select(`
        *,
        stages:workflow_stages(
          *,
          dependencies:stage_dependencies!stage_id(
            *,
            depends_on_stage:workflow_stages!depends_on_stage_id(*)
          )
        )
      `)
      .order('created_at', { ascending: true });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // Sort stages inside each workflow by stage_number
    const sortedWorkflows = (workflows || []).map((wf: any) => ({
      ...wf,
      stages: (wf.stages || []).sort((a: any, b: any) => a.stage_number - b.stage_number),
    }));

    res.json({ workflows: sortedWorkflows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workflows/:id - Get single workflow with details
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const supabase = getSupabase();
    const { id } = req.params;

    const { data: workflow, error } = await supabase
      .from('workflows')
      .select(`
        *,
        stages:workflow_stages(
          *,
          dependencies:stage_dependencies!stage_id(
            *,
            depends_on_stage:workflow_stages!depends_on_stage_id(*)
          )
        )
      `)
      .eq('id', id)
      .single();

    if (error || !workflow) {
      return res.status(404).json({ error: error?.message || 'Workflow not found' });
    }

    const sortedStages = (workflow.stages || []).sort((a: any, b: any) => a.stage_number - b.stage_number);

    res.json({ workflow: { ...workflow, stages: sortedStages } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/workflows - Create a new configurable workflow (Admin & Project Officers)
router.post('/', requireAuth, requireRole(['admin', 'project_officer']), async (req: Request, res: Response) => {
  try {
    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const supabase = getSupabase();
    const { code, name, description, legal_framework, stages } = req.body;

    if (!code || !name || !Array.isArray(stages) || stages.length === 0) {
      return res.status(400).json({ error: 'code, name, and non-empty stages array are required' });
    }

    // Insert workflow
    const { data: wf, error: wfError } = await supabase
      .from('workflows')
      .insert({
        code,
        name,
        description: description || '',
        legal_framework: legal_framework || '',
      })
      .select('*')
      .single();

    if (wfError || !wf) {
      return res.status(500).json({ error: `Failed to create workflow: ${wfError?.message}` });
    }

    // Insert stages
    const stagesToInsert = stages.map((s: any, idx: number) => ({
      workflow_id: wf.id,
      stage_number: s.stage_number || idx + 1,
      code: s.code || `STAGE_${idx + 1}`,
      title: s.title,
      description: s.description || '',
      default_duration_days: Number(s.default_duration_days || 15),
      is_mandatory: s.is_mandatory !== false,
      required_role: s.required_role || 'lao',
      required_documents: s.required_documents || [],
      completion_criteria: s.completion_criteria || {},
    }));

    const { data: insertedStages, error: stagesError } = await supabase
      .from('workflow_stages')
      .insert(stagesToInsert)
      .select('*');

    if (stagesError) {
      return res.status(500).json({ error: `Failed to create stages: ${stagesError.message}` });
    }

    // Log audit event
    await logCaseEvent({
      event_type: 'WORKFLOW_CONFIGURED',
      title: `Workflow Template Created: ${name} (${code})`,
      description: `Configurable workflow template created with ${stagesToInsert.length} statutory stages under ${legal_framework || 'Custom Legal Framework'}.`,
      actor_name: (req as any).user?.full_name || 'System Operator',
      actor_id: (req as any).user?.id,
      metadata: {
        workflow_id: wf.id,
        code,
        stages_count: stagesToInsert.length,
      },
    });

    res.status(201).json({ workflow: { ...wf, stages: insertedStages } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

