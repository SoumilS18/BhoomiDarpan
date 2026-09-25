import React, { useState, useEffect, useMemo } from 'react';
import { fetchProjects, fetchCases } from '../lib/api';
import { Project, AcquisitionCase } from '../../shared/types';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { EmptyState } from '../components/common/EmptyState';
import {
  Building2,
  FolderKanban,
  MapPin,
  Clock,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  GitBranch,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Layers,
  FileText,
} from 'lucide-react';
import { clsx } from 'clsx';

interface ProjectsPageProps {
  onSelectCase: (caseId: string, tab?: string) => void;
  onOpenCreateCase?: () => void;
}

export const ProjectsPage: React.FC<ProjectsPageProps> = ({
  onSelectCase,
  onOpenCreateCase,
}) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [allCases, setAllCases] = useState<AcquisitionCase[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      <div className="flex flex-col items-center justify-center p-20 space-y-3 bg-white rounded-xl border border-slate-200">
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
    return (
      <div className="space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedProjectId(null)}
            leftIcon={<ArrowLeft className="h-4 w-4" />}
          >
            Back to Projects Portfolio
          </Button>
          <span className="font-mono text-xs text-gov-navy bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
            {selectedProject.code}
          </span>
        </div>

        {/* Project Header Banner */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="font-mono text-xs font-bold text-gov-navy bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  {selectedProject.code}
                </span>
                <span className="capitalize text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                  {selectedProject.project_type || 'Infrastructure'}
                </span>
                <span className="text-xs text-slate-500">
                  State: <strong>{selectedProject.state}</strong>
                </span>
              </div>
              <h1 className="text-xl font-bold text-gov-slate tracking-tight">
                {selectedProject.name}
              </h1>
              <p className="text-xs text-slate-500 mt-1 max-w-2xl">
                {selectedProject.description || 'National corridor acquisition proceedings.'}
              </p>
              <div className="text-[11px] text-slate-600 mt-2">
                Sponsoring Authority: <strong>{selectedProject.sponsoring_agency}</strong>
              </div>
            </div>

            {/* Health Score Pill */}
            <div className="p-4 rounded-xl border bg-slate-50/80 text-center shrink-0 min-w-[130px]">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">
                Project Health
              </span>
              <div
                className={clsx(
                  'text-2xl font-bold mt-0.5 tabular-nums',
                  projectMetrics.healthScore >= 80
                    ? 'text-emerald-700'
                    : projectMetrics.healthScore >= 60
                    ? 'text-amber-700'
                    : 'text-red-700'
                )}
              >
                {projectMetrics.healthScore}/100
              </div>
              <span className="text-[10px] text-slate-500">
                {projectMetrics.delayedCases === 0 ? 'On Track' : `${projectMetrics.delayedCases} Delayed`}
              </span>
            </div>
          </div>

          {/* Aggregated Project Vitals */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-6 pt-5 border-t border-slate-100 text-xs">
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">Total Cases</span>
              <strong className="text-gov-slate font-semibold block mt-0.5 text-sm">
                {projectMetrics.totalCases} Cases
              </strong>
            </div>

            <div>
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">Delayed Cases</span>
              <strong className={clsx('block mt-0.5 text-sm font-semibold', projectMetrics.delayedCases > 0 ? 'text-red-600' : 'text-slate-700')}>
                {projectMetrics.delayedCases} Cases ({projectMetrics.totalDelayDays}d delay)
              </strong>
            </div>

            <div>
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">Critical Risks</span>
              <strong className={clsx('block mt-0.5 text-sm font-semibold', projectMetrics.criticalCases > 0 ? 'text-amber-700' : 'text-slate-700')}>
                {projectMetrics.criticalCases} Critical
              </strong>
            </div>

            <div>
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">Demarcated Area</span>
              <strong className="text-gov-slate font-semibold block mt-0.5 text-sm">
                {projectMetrics.totalArea} Ha
              </strong>
            </div>

            <div>
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">Compensation Budget</span>
              <strong className="text-gov-slate font-semibold block mt-0.5 text-sm">
                {formatCurrency(projectMetrics.totalCompensation)}
              </strong>
            </div>
          </div>
        </div>

        {/* Aggregated Cases Registry for this Project */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-bold text-gov-slate text-sm">
                Acquisition Cases in this Corridor ({projectCases.length})
              </h3>
              <p className="text-[11px] text-slate-500">
                Direct statutory proceedings assigned to {selectedProject.name}.
              </p>
            </div>
          </div>

          {projectCases.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              No acquisition cases currently linked to this project.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider text-[10px] border-b border-slate-200">
                    <th className="py-2.5 px-3">Case Identifier</th>
                    <th className="py-2.5 px-3">Location</th>
                    <th className="py-2.5 px-3">Current Stage</th>
                    <th className="py-2.5 px-3">SLA Status</th>
                    <th className="py-2.5 px-3">Priority</th>
                    <th className="py-2.5 px-3">Land Area</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {projectCases.map((c) => {
                    const metrics = c.calculated_metrics;
                    const isDelayed = metrics?.is_delayed || c.status === 'delayed';

                    return (
                      <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[10px] font-bold text-gov-navy bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                              {c.case_number}
                            </span>
                            <span className="font-semibold text-gov-slate">{c.title}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-slate-600">
                          {c.village}, {c.district}
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-medium text-gov-slate">
                            {metrics?.current_stage_title || 'Initiation'}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          {isDelayed ? (
                            <span className="font-mono font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded text-[11px]">
                              +{metrics?.net_delay_days || 0}d Delay
                            </span>
                          ) : (
                            <span className="font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[11px]">
                              On Track
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <Badge variant={c.priority === 'critical' ? 'red' : c.priority === 'high' ? 'amber' : 'navy'}>
                            {c.priority.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="py-3 px-3 tabular-nums font-medium text-gov-slate">
                          {c.total_area_hectares} Ha
                        </td>
                        <td className="py-3 px-3 text-right">
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
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW B: PROJECTS PORTFOLIO OVERVIEW
  // =========================================================================
  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gov-navy bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
              Infrastructure Portfolio
            </span>
            <span className="text-xs text-slate-300">•</span>
            <span className="text-[11px] text-slate-500">
              Corridor Aggregations
            </span>
          </div>
          <h1 className="text-xl font-bold text-gov-slate tracking-tight">
            Infrastructure Projects Portfolio
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Sponsoring agencies, corridors, and project-level land acquisition budgets aggregated from real cases.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {projects.map((p) => {
          const matchingCases = allCases.filter((c) => c.project_id === p.id);
          const delayedCount = matchingCases.filter(
            (c) => c.status === 'delayed' || (c.calculated_metrics?.net_delay_days || 0) > 0
          ).length;

          return (
            <div
              key={p.id}
              onClick={() => setSelectedProjectId(p.id)}
              className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs hover:border-gov-navy/40 hover:shadow-gov transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <span className="font-mono text-xs font-bold text-gov-navy bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                      {p.code}
                    </span>
                    <h3 className="text-sm font-bold text-gov-slate mt-2 group-hover:text-gov-navy transition-colors">
                      {p.name}
                    </h3>
                  </div>
                  <span className="capitalize text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 shrink-0">
                    {p.project_type || 'Infrastructure'}
                  </span>
                </div>

                <p className="text-xs text-slate-500 mt-2 line-clamp-2">
                  {p.description || 'Statutory land acquisition corridor.'}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-600 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span>Sponsoring Agency:</span>
                  <strong className="text-gov-slate">{p.sponsoring_agency}</strong>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span>State:</span>
                  <strong className="text-gov-slate">{p.state}</strong>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-50 text-[11px]">
                  <span className="text-slate-500 font-medium">
                    {matchingCases.length} Acquisition Cases
                  </span>
                  {delayedCount > 0 ? (
                    <span className="text-gov-red font-bold flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {delayedCount} Delayed
                    </span>
                  ) : (
                    <span className="text-emerald-700 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      On Track
                    </span>
                  )}
                </div>

                <div className="pt-2 flex justify-end">
                  <span className="text-xs font-semibold text-gov-navy flex items-center gap-1 group-hover:underline">
                    <span>Inspect Corridor Workspace</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
