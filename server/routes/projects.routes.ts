import { Router, Request, Response } from 'express';
import { getSupabase, isSupabaseConfigured } from '../config/supabase';
import { CreateProjectSchema } from '../utils/validators';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { logCaseEvent } from '../services/auditLogger';

const router = Router();

// GET /api/projects - List all projects with case statistics
router.get('/', requireAuth, async (_req: Request, res: Response) => {
  try {
    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const supabase = getSupabase();
    const { data: projects, error } = await supabase
      .from('projects')
      .select(`
        *,
        cases:acquisition_cases(id, status, total_area_hectares, estimated_compensation)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const enrichedProjects = (projects || []).map((p: any) => {
      const cases = p.cases || [];
      const totalArea = cases.reduce((acc: number, c: any) => acc + Number(c.total_area_hectares || 0), 0);
      const totalCompensation = cases.reduce((acc: number, c: any) => acc + Number(c.estimated_compensation || 0), 0);
      const activeCases = cases.filter((c: any) => c.status === 'active' || c.status === 'delayed').length;
      const completedCases = cases.filter((c: any) => c.status === 'completed').length;

      return {
        ...p,
        total_cases: cases.length,
        active_cases: activeCases,
        completed_cases: completedCases,
        total_area_hectares: Math.round(totalArea * 100) / 100,
        total_compensation: totalCompensation,
      };
    });

    res.json({ projects: enrichedProjects });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects - Create new project (Authorized officers only)
router.post('/', requireAuth, requireRole(['admin', 'project_officer', 'lao']), async (req: Request, res: Response) => {
  try {
    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const supabase = getSupabase();
    const parseResult = CreateProjectSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
      });
    }

    const {
      code,
      name,
      description,
      project_type,
      sponsoring_agency,
      estimated_budget,
      target_completion_date,
      state,
      district,
      state_lgd_code,
      district_lgd_code,
      subdistrict_lgd_code,
    } = parseResult.data;

    const user = (req as any).user;
    if (user) {
      if (user.jurisdiction_state_lgd_code && state_lgd_code && user.jurisdiction_state_lgd_code !== state_lgd_code) {
        return res.status(403).json({
          error: `Territorial jurisdiction mismatch: User is restricted to state "${user.jurisdiction_state_lgd_code}".`,
        });
      }
      if (user.jurisdiction_district_lgd_code && district_lgd_code && user.jurisdiction_district_lgd_code !== district_lgd_code) {
        return res.status(403).json({
          error: `Territorial jurisdiction mismatch: User is restricted to district "${user.jurisdiction_district_lgd_code}".`,
        });
      }
    }

    const { data: newProject, error } = await supabase
      .from('projects')
      .insert({
        code,
        name,
        description: description || '',
        project_type,
        sponsoring_agency,
        estimated_budget: estimated_budget ? Number(estimated_budget) : null,
        target_completion_date: target_completion_date || null,
        state,
        district: district || null,
        state_lgd_code: state_lgd_code || null,
        district_lgd_code: district_lgd_code || null,
        subdistrict_lgd_code: subdistrict_lgd_code || null,
      })
      .select('*')
      .single();

    if (error) {
      const isConflict = error.code === '23505' || error.message.includes('unique') || error.message.includes('duplicate');
      return res.status(isConflict ? 409 : 500).json({
        error: isConflict ? `A project with code "${code}" already exists.` : error.message,
      });
    }

    // Log immutable audit trail for project creation
    await logCaseEvent({
      project_id: newProject.id,
      event_type: 'PROJECT_CREATED',
      title: `Project Created: ${name} (${code})`,
      description: `Project registered by ${(req as any).user?.full_name || 'Officer'}. Sponsoring Agency: ${sponsoring_agency}.`,
      actor_name: (req as any).user?.full_name || 'Project Officer',
      actor_id: (req as any).user?.id,
      metadata: {
        project_id: newProject.id,
        code,
        project_type,
        state,
        estimated_budget,
      },
    });

    res.status(201).json({ project: newProject });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/projects/:id - Delete an infrastructure project (Admins only)
router.delete('/:id', requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const rawId = req.params.id;
    const projectId = Array.isArray(rawId) ? rawId[0] : rawId;
    const caller = (req as any).user;

    if (!projectId || projectId.trim().length === 0) {
      return res.status(400).json({ error: 'Project ID is required.' });
    }

    const supabase = getSupabase();

    // 1. Fetch project to verify existence
    const { data: project, error: fetchErr } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (fetchErr || !project) {
      return res.status(404).json({ error: `Project "${projectId}" not found.` });
    }

    // 2. Check if project has associated cases
    const { data: associatedCases } = await supabase
      .from('acquisition_cases')
      .select('id, case_number')
      .eq('project_id', projectId);

    const caseCount = associatedCases?.length || 0;

    // Unlink cases from deleted project so cases are preserved safely
    if (caseCount > 0) {
      await supabase
        .from('acquisition_cases')
        .update({ project_id: null })
        .eq('project_id', projectId);
    }

    // 3. Delete project record
    const { error: delErr } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId);

    if (delErr) {
      return res.status(500).json({ error: delErr.message });
    }

    // 4. Log audit event
    await logCaseEvent({
      project_id: null,
      event_type: 'PROJECT_DELETED',
      title: `Project Deleted: ${project.name} (${project.code})`,
      description: `Administrator ${caller?.full_name || 'Admin'} deleted project ${project.name} (${project.code}). ${caseCount} associated cases were unlinked.`,
      actor_id: caller?.id,
      actor_name: caller?.full_name || 'Administrator',
      metadata: {
        deleted_project_id: projectId,
        deleted_project_code: project.code,
        deleted_project_name: project.name,
        unlinked_case_count: caseCount,
      },
    });

    res.json({
      success: true,
      message: `Project ${project.name} (${project.code}) deleted successfully.`,
      unlinked_cases: caseCount,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
