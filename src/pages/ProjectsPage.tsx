import React, { useState, useEffect, useMemo } from 'react';
import { fetchProjects, fetchCases } from '../lib/api';
import { Project, AcquisitionCase } from '../../shared/types';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { EmptyState } from '../components/common/EmptyState';
import { PageHeader, PageEyebrow } from '../components/common/PageHeader';
import { SectionHeading } from '../components/common/SectionHeading';
import { StatCard } from '../components/common/StatCard';
import { CreateProjectModal } from '../components/projects/CreateProjectModal';
import {
  Building2,
  FolderKanban,
  Clock,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Layers,
  Activity,
  Plus,
} from 'lucide-react';
import { clsx } from 'clsx';

interface ProjectsPageProps {
  onSelectCase: (caseId: string, tab?: string) => void;
  onOpenCreateCase?: () => void;
  projectId?: string;
  initialView?: string;
  onSelectProject?: (projectId: string, view?: string) => void;
  onBack?: () => void;
}

export const ProjectsPage: React.FC<ProjectsPageProps> = ({
  onSelectCase,
  onOpenCreateCase,
  projectId,
  onSelectProject,
  onBack,
}) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [allCases, setAllCases] = useState<AcquisitionCase[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(projectId ?? null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [projRes, casesRes] = await Promise.all([
        fetchProjects(),
        fetchCases(),
      ]);
      setProjects(projRes.projects || []);
      setAllCases(casesRes.cases || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load projects and cases');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    setSelectedProjectId(projectId ?? null);
  }, [projectId]);

  const formatCurrency = (amount: number) => {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
    return `₹${amount.toLocaleString('en-IN')}`;
  };

  // Selected project detail calculations
  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const projectCases = useMemo(() => {
    if (!selectedProjectId) return [];
    return allCases.filter((c) => c.project_id === selectedProjectId);
  }, [allCases, selectedProjectId]);

  const projectMetrics = useMemo(() => {
    if (!selectedProject || projectCases.length === 0) {
      return {
        totalCases: projectCases.length,
        delayedCases: 0,
        totalDelayDays: 0,
        totalArea: 0,
        totalCompensation: 0,
        criticalCases: 0,
        completedCases: 0,
        healthScore: 100,
      };
    }

    const totalCases = projectCases.length;
    const delayedCases = projectCases.filter(
      (c) => c.status === 'delayed' || (c.calculated_metrics?.net_delay_days || 0) > 0
    ).length;
    const totalDelayDays = projectCases.reduce(
      (acc, c) => acc + (c.calculated_metrics?.net_delay_days || 0),
      0
    );
    const totalArea = projectCases.reduce(
      (acc, c) => acc + (c.total_area_hectares || 0),
      0
    );
    const totalCompensation = projectCases.reduce(
      (acc, c) => acc + (c.estimated_compensation || 0),
      0
    );
    const criticalCases = projectCases.filter((c) => c.priority === 'critical').length;
    const completedCases = projectCases.filter((c) => c.status === 'completed').length;

    // Real calculated project health score (0-100)
    const delayDeduction = Math.min(40, (delayedCases / (totalCases || 1)) * 50);
    const criticalDeduction = Math.min(30, (criticalCases / (totalCases || 1)) * 40);
    const healthScore = Math.max(0, Math.round(100 - delayDeduction - criticalDeduction));

    return {
      totalCases,
      delayedCases,
      totalDelayDays,
      totalArea: Math.round(totalArea * 10) / 10,
      totalCompensation,
      criticalCases,
      completedCases,
      healthScore,
    };
  }, [selectedProject, projectCases]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 space-y-3 bg-white rounded-xl border border-slate-200 shadow-gov">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gov-navy" />
        <p className="text-xs text-slate-500 font-medium">
          Loading infrastructure projects portfolio and aggregating real case metrics...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        title="Project Service Error"
        description={error}
        actionLabel="Retry"
        onAction={loadData}
      />
    );
  }

  // =========================================================================
  // VIEW A: DETAILED PROJECT WORKSPACE (AGGREGATING REAL CASES)
  // =========================================================================
  if (selectedProject) {
    const statusBadgeVariant: Record<string, 'slate' | 'navy' | 'emerald' | 'amber' | 'red'> = {
      planning: 'slate',
      in_progress: 'navy',
      delayed: 'red',
      completed: 'emerald',
      halted: 'amber',
    };
    const healthTone =
      projectMetrics.healthScore >= 80
        ? 'emerald'
        : projectMetrics.healthScore >= 60
        ? 'amber'
        : 'red';

    return (
      <div className="space-y-6">
        {/* Project Workspace Header */}
        <PageHeader
          eyebrow={
            <>
              <PageEyebrow>{selectedProject.code}</PageEyebrow>
              <Badge variant={statusBadgeVariant[selectedProject.status] || 'slate'}>
                {selectedProject.status.replace(/_/g, ' ').toUpperCase()}
              </Badge>
              <span className="text-[11px] font-semibold capitalize text-slate-500">
                {selectedProject.project_type || 'Unspecified'}
              </span>
            </>
          }
          title={selectedProject.name}
          subtitle={
            <>
              {selectedProject.description || 'No description recorded.'}
              <span className="mt-1 block">
                Sponsoring Authority: <strong>{selectedProject.sponsoring_agency}</strong>
                <span className="mx-1.5 text-slate-300">•</span>
                State: <strong>{selectedProject.state}</strong>
              </span>
            </>
          }
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => (onBack ? onBack() : setSelectedProjectId(null))}
              leftIcon={<ArrowLeft className="h-4 w-4" />}
            >
              Back to Projects Portfolio
            </Button>
          }
        />

        {/* Aggregated Project Vitals */}
        <section>
          <SectionHeading
            title="Aggregated Project Vitals"
            hint="Computed from real linked acquisition cases"
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <StatCard
              label="Project Health"
              value={`${projectMetrics.healthScore}/100`}
              hint={projectMetrics.delayedCases === 0 ? 'On Track' : `${projectMetrics.delayedCases} Delayed`}
              icon={<Activity className="h-4 w-4" />}
              tone={healthTone as 'emerald' | 'amber' | 'red'}
            />
            <StatCard
              label="Total Cases"
              value={projectMetrics.totalCases}
              hint="Linked proceedings"
              icon={<FolderKanban className="h-4 w-4" />}
              tone="navy"
            />
            <StatCard
              label="Delayed Cases"
              value={projectMetrics.delayedCases}
              hint={`${projectMetrics.totalDelayDays}d accumulated delay`}
              icon={<Clock className="h-4 w-4" />}
              tone={projectMetrics.delayedCases > 0 ? 'red' : 'emerald'}
            />
            <StatCard
              label="Critical Risks"
              value={projectMetrics.criticalCases}
              hint="Critical priority cases"
              icon={<ShieldAlert className="h-4 w-4" />}
              tone={projectMetrics.criticalCases > 0 ? 'amber' : 'slate'}
            />
            <StatCard
              label="Demarcated Area"
              value={`${projectMetrics.totalArea} Ha`}
              icon={<Layers className="h-4 w-4" />}
              tone="slate"
            />
            <StatCard
              label="Compensation Budget"
              value={formatCurrency(projectMetrics.totalCompensation)}
              icon={<TrendingUp className="h-4 w-4" />}
              tone="navy"
            />
          </div>
        </section>

        {/* Aggregated Cases Registry for this Project */}
        <section>
          <SectionHeading
            title={`Acquisition Cases in this Corridor (${projectCases.length})`}
            hint={`Direct statutory proceedings assigned to ${selectedProject.name}`}
          />

          {projectCases.length === 0 ? (
            <EmptyState
              icon={<FolderKanban className="h-8 w-8 text-slate-400" />}
              title="No Linked Acquisition Cases"
              description="No acquisition cases are currently assigned to this project corridor. Cases aggregate here automatically once linked."
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-gov">
              <div className="overflow-x-auto">
                <table className="table-shell">
                  <thead>
                    <tr>
                      <th>Case Identifier</th>
                      <th>Location</th>
                      <th>Current Stage</th>
                      <th>SLA Status</th>
                      <th>Priority</th>
                      <th>Land Area</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {projectCases.map((c) => {
                      const metrics = c.calculated_metrics;
                      const isDelayed = metrics?.is_delayed || c.status === 'delayed';

                      return (
                        <tr key={c.id}>
                          <td>
                            <div className="flex items-center gap-1.5">
                              <span className="rounded border border-blue-100 bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-gov-navy">
                                {c.case_number}
                              </span>
                              <span className="font-semibold text-gov-slate">{c.title}</span>
                            </div>
                          </td>
                          <td className="text-slate-600">
                            {c.village}, {c.district}
                          </td>
                          <td>
                            <span className="font-medium text-gov-slate">
                              {metrics?.current_stage_title || '—'}
                            </span>
                          </td>
                          <td>
                            {isDelayed ? (
                              <span className="rounded border border-red-200 bg-red-50 px-2 py-0.5 font-mono text-[11px] font-bold text-red-700">
                                +{metrics?.net_delay_days || 0}d Delay
                              </span>
                            ) : (
                              <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[11px] text-emerald-700">
                                On Track
                              </span>
                            )}
                          </td>
                          <td>
                            <Badge variant={c.priority === 'critical' ? 'red' : c.priority === 'high' ? 'amber' : 'navy'}>
                              {c.priority.toUpperCase()}
                            </Badge>
                          </td>
                          <td className="tabular-nums font-medium text-gov-slate">
                            {c.total_area_hectares} Ha
                          </td>
                          <td className="text-right">
                            <Button size="sm" onClick={() => onSelectCase(c.id)}>
                              Inspect Case
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>
    );
  }

  // =========================================================================
  // VIEW B: PROJECTS PORTFOLIO OVERVIEW
  // =========================================================================
  return (
    <div className="space-y-6">
      {/* Page header */}
      <PageHeader
        eyebrow={
          <PageEyebrow>
            <Building2 className="h-3 w-3" />
            Infrastructure Portfolio
          </PageEyebrow>
        }
        title="Infrastructure Projects Portfolio"
        subtitle="Sponsoring agencies, infrastructure corridors, and project-level acquisition budgets."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
            >
              Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsCreateOpen(true)}
              leftIcon={<Plus className="h-3.5 w-3.5" />}
            >
              Create Project
            </Button>
          </div>
        }
      />

      {/* Projects Grid */}
      {projects.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-7 w-7 text-slate-400" />}
          title="No Infrastructure Projects"
          description="No sponsoring projects have been registered yet. Create a project to begin tracking land acquisition corridors."
          actionLabel="Create Infrastructure Project"
          onAction={() => setIsCreateOpen(true)}
        />
      ) : (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {projects.map((p) => {
          const matchingCases = allCases.filter((c) => c.project_id === p.id);
          const delayedCount = matchingCases.filter(
            (c) => c.status === 'delayed' || (c.calculated_metrics?.net_delay_days || 0) > 0
          ).length;

          return (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              aria-label={`Open project workspace for ${p.name} (${p.code})`}
              onClick={() =>
                onSelectProject ? onSelectProject(p.id) : setSelectedProjectId(p.id)
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectProject ? onSelectProject(p.id) : setSelectedProjectId(p.id);
                }
              }}
              className="group flex cursor-pointer flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-gov transition-all hover:border-gov-navy/40 hover:shadow-gov-md"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="rounded border border-blue-100 bg-blue-50 px-2 py-0.5 font-mono text-xs font-bold text-gov-navy">
                      {p.code}
                    </span>
                    <h3 className="mt-2 text-sm font-bold text-gov-slate transition-colors group-hover:text-gov-navy">
                      {p.name}
                    </h3>
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold capitalize text-slate-700">
                    {p.project_type || 'Unspecified'}
                  </span>
                </div>

                <p className="mt-2 line-clamp-2 text-xs text-slate-500">
                  {p.description || 'No description recorded.'}
                </p>
              </div>

              <div className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-xs text-slate-600">
                <div className="flex items-center justify-between text-[11px]">
                  <span>Sponsoring Agency:</span>
                  <strong className="text-gov-slate">{p.sponsoring_agency}</strong>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span>State:</span>
                  <strong className="text-gov-slate">{p.state}</strong>
                </div>

                <div className="flex items-center justify-between border-t border-slate-50 pt-1 text-[11px]">
                  <span className="font-medium text-slate-500">
                    {matchingCases.length} Acquisition Cases
                  </span>
                  {delayedCount > 0 ? (
                    <span className="flex items-center gap-1 font-bold text-gov-red">
                      <AlertTriangle className="h-3 w-3" />
                      {delayedCount} Delayed
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 font-semibold text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" />
                      On Track
                    </span>
                  )}
                </div>

                <div className="flex justify-end pt-2">
                  <span className="flex items-center gap-1 text-xs font-semibold text-gov-navy group-hover:underline">
                    <span>Inspect Corridor Workspace</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}

      <CreateProjectModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onProjectCreated={(newProject) => {
          setProjects((prev) => [newProject, ...prev]);
          setIsCreateOpen(false);
          setSelectedProjectId(newProject.id);
        }}
      />
    </div>
  );
};
