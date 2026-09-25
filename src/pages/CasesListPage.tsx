import React, { useState, useEffect, useMemo } from 'react';
import { fetchCases, fetchProjects } from '../lib/api';
import { useQueryParams } from '../router';
import { AcquisitionCase, Project } from '../../shared/types';
import { CaseCard } from '../components/cases/CaseCard';
import { EmptyState } from '../components/common/EmptyState';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import {
  FolderKanban,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  ChevronDown,
  ChevronRight,
  ArrowUpDown,
  Clock,
  AlertTriangle,
  FileText,
  MapPin,
  Layers,
  Sparkles,
  Scale,
  GitBranch,
  Table as TableIcon,
  LayoutGrid,
  CheckCircle2,
  FileWarning,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { clsx } from 'clsx';
import { formatDate } from '../lib/utils';

interface CasesListPageProps {
  onSelectCase: (caseId: string, tab?: string) => void;
  onOpenCreateCase: () => void;
}

type SortField = 'case_number' | 'title' | 'delay' | 'priority' | 'area' | 'updated_at';
type SortOrder = 'asc' | 'desc';

/** Permitted `?sort=` values, used to reject junk from hand-edited URLs. */
const SORT_FIELDS: SortField[] = ['case_number', 'title', 'delay', 'priority', 'area', 'updated_at'];

export const CasesListPage: React.FC<CasesListPageProps> = ({
  onSelectCase,
  onOpenCreateCase,
}) => {
  const [cases, setCases] = useState<AcquisitionCase[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Filter / sort / view state lives in the URL query string.
  //
  // Rationale: a filtered registry view is a legitimate shareable artefact
  // ("Sonipat, delayed, sorted by SLA"), and the global header search delivers
  // its term here as `?q=`. Writes use `replace` so adjusting a filter does not
  // flood browser history.
  // -------------------------------------------------------------------------
  const { query, setQuery } = useQueryParams();

  // View mode: 'table' (high-density operational table) vs 'cards'
  const viewMode: 'table' | 'cards' = query.view === 'cards' ? 'cards' : 'table';
  const setViewMode = (next: 'table' | 'cards') =>
    setQuery({ view: next === 'table' ? undefined : next });

  // Search & Filter state
  const searchQuery = query.q ?? '';
  const setSearchQuery = (next: string) => setQuery({ q: next });
  const selectedState = query.state ?? '';
  const setSelectedState = (next: string) => setQuery({ state: next });
  const selectedDistrict = query.district ?? '';
  const setSelectedDistrict = (next: string) => setQuery({ district: next });
  const selectedProjectId = query.project ?? '';
  const setSelectedProjectId = (next: string) => setQuery({ project: next });
  const selectedStatus = query.status ?? '';
  const setSelectedStatus = (next: string) => setQuery({ status: next });
  const selectedPriority = query.priority ?? '';
  const setSelectedPriority = (next: string) => setQuery({ priority: next });
  const selectedStage = query.stage ?? '';
  const setSelectedStage = (next: string) => setQuery({ stage: next });
  const onlyDelayedOrBlocked = query.delay === '1';
  const setOnlyDelayedOrBlocked = (next: boolean) =>
    setQuery({ delay: next ? '1' : undefined });

  // Sorting
  const sortField: SortField = SORT_FIELDS.includes(query.sort as SortField)
    ? (query.sort as SortField)
    : 'delay';
  const setSortField = (next: SortField) =>
    setQuery({ sort: next === 'delay' ? undefined : next });
  const sortOrder: SortOrder = query.order === 'asc' ? 'asc' : 'desc';
  const setSortOrder = (next: SortOrder) =>
    setQuery({ order: next === 'desc' ? undefined : next });

  // Progressive disclosure: expanded row IDs
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set());

  const toggleRowExpansion = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    loadProjects();
    loadCases();
  }, []);

  const loadProjects = async () => {
    try {
      const res = await fetchProjects();
      setProjects(res.projects || []);
    } catch {
      // Ignored in degraded mode
    }
  };

  const loadCases = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchCases({
        state: selectedState || undefined,
        district: selectedDistrict || undefined,
        status: selectedStatus || undefined,
        priority: selectedPriority || undefined,
        search: searchQuery || undefined,
      });
      setCases(res.cases || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load cases from database');
    } finally {
      setIsLoading(false);
    }
  };

  // Dynamic filter lists derived from data
  const availableStates = useMemo(() => {
    return Array.from(new Set(cases.map((c) => c.state).filter(Boolean))).sort();
  }, [cases]);

  const availableDistricts = useMemo(() => {
    const pool = selectedState ? cases.filter((c) => c.state === selectedState) : cases;
    return Array.from(new Set(pool.map((c) => c.district).filter(Boolean))).sort();
  }, [cases, selectedState]);

  const availableStages = useMemo(() => {
    const set = new Set<string>();
    cases.forEach((c) => {
      if (c.calculated_metrics?.current_stage_title) {
        set.add(c.calculated_metrics.current_stage_title);
      }
    });
    return Array.from(set).sort();
  }, [cases]);

  // Client-side filtering & sorting
  const filteredCases = useMemo(() => {
    let result = [...cases];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.case_number.toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q) ||
          c.village.toLowerCase().includes(q) ||
          c.district.toLowerCase().includes(q) ||
          (c.project?.name && c.project.name.toLowerCase().includes(q))
      );
    }

    if (selectedState) {
      result = result.filter((c) => c.state === selectedState);
    }

    if (selectedDistrict) {
      result = result.filter((c) => c.district === selectedDistrict);
    }

    if (selectedProjectId) {
      result = result.filter((c) => c.project_id === selectedProjectId);
    }

    if (selectedStatus) {
      result = result.filter((c) => c.status === selectedStatus);
    }

    if (selectedPriority) {
      result = result.filter((c) => c.priority === selectedPriority);
    }

    if (selectedStage) {
      result = result.filter(
        (c) => c.calculated_metrics?.current_stage_title === selectedStage
      );
    }

    if (onlyDelayedOrBlocked) {
      result = result.filter(
        (c) =>
          c.status === 'delayed' ||
          (c.calculated_metrics?.net_delay_days || 0) > 0 ||
          c.priority === 'critical'
      );
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'case_number') {
        comparison = a.case_number.localeCompare(b.case_number);
      } else if (sortField === 'title') {
        comparison = a.title.localeCompare(b.title);
      } else if (sortField === 'delay') {
        const delayA = a.calculated_metrics?.net_delay_days || 0;
        const delayB = b.calculated_metrics?.net_delay_days || 0;
        comparison = delayA - delayB;
      } else if (sortField === 'priority') {
        const weight: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
        comparison = (weight[a.priority] || 0) - (weight[b.priority] || 0);
      } else if (sortField === 'area') {
        comparison = (a.total_area_hectares || 0) - (b.total_area_hectares || 0);
      } else if (sortField === 'updated_at') {
        comparison = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [
    cases,
    searchQuery,
    selectedState,
    selectedDistrict,
    selectedProjectId,
    selectedStatus,
    selectedPriority,
    selectedStage,
    onlyDelayedOrBlocked,
    sortField,
    sortOrder,
  ]);

  const handleSortToggle = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  /**
   * Clears every registry filter in a single history update.
   * Issuing one call per setter would trigger eight successive `replaceState`
   * navigations.
   */
  const handleResetFilters = () => {
    setQuery({
      q: undefined,
      state: undefined,
      district: undefined,
      project: undefined,
      status: undefined,
      priority: undefined,
      stage: undefined,
      delay: undefined,
    });
  };

  const formatCurrency = (amount: number) => {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
    return `₹${amount.toLocaleString('en-IN')}`;
  };

  const priorityBadgeVariant: Record<string, 'red' | 'amber' | 'navy' | 'slate'> = {
    critical: 'red',
    high: 'amber',
    medium: 'navy',
    low: 'slate',
  };

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gov-navy bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
              National Digital Registry
            </span>
            <span className="text-xs text-slate-300">•</span>
            <span className="text-[11px] text-slate-500">
              RFCTLARR 2013 Statutory Workspace
            </span>
          </div>
          <h1 className="text-xl font-bold text-gov-slate tracking-tight">
            Land Acquisition Case Registry
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Operational registry workspace with real-time milestone tracking, SLA delay telemetry, and progressive statutory disclosure.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={clsx(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all font-medium cursor-pointer',
                viewMode === 'table'
                  ? 'bg-white text-gov-navy font-bold shadow-xs'
                  : 'text-slate-500 hover:text-gov-slate'
              )}
              title="Dense Operational Table"
            >
              <TableIcon className="h-3.5 w-3.5" />
              <span>Table</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={clsx(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all font-medium cursor-pointer',
                viewMode === 'cards'
                  ? 'bg-white text-gov-navy font-bold shadow-xs'
                  : 'text-slate-500 hover:text-gov-slate'
              )}
              title="Card Grid View"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>Cards</span>
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={loadCases}
            leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
          >
            Refresh
          </Button>
          <Button size="sm" onClick={onOpenCreateCase} leftIcon={<Plus className="h-3.5 w-3.5" />}>
            Initiate Case
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 shadow-xs">
        {/* Search Row */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by case number, title, village, district, corridor..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50/70 pl-9 pr-3 py-1.5 text-xs text-gov-slate placeholder:text-slate-400 focus:bg-white focus:border-gov-navy focus:outline-none focus:ring-1 focus:ring-gov-navy transition-all"
            />
          </div>

          {/* Quick SLA / Friction Toggle */}
          <button
            type="button"
            onClick={() => setOnlyDelayedOrBlocked(!onlyDelayedOrBlocked)}
            className={clsx(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer',
              onlyDelayedOrBlocked
                ? 'bg-red-50 text-gov-red border-red-200 shadow-xs'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            )}
          >
            <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
            <span>Delayed / Critical Only</span>
          </button>

          {(searchQuery ||
            selectedState ||
            selectedDistrict ||
            selectedProjectId ||
            selectedStatus ||
            selectedPriority ||
            selectedStage ||
            onlyDelayedOrBlocked) && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-xs text-slate-500 hover:text-gov-red font-medium underline cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Structured Dropdown Filters */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 text-xs">
          {/* State */}
          <select
            value={selectedState}
            onChange={(e) => {
              setSelectedState(e.target.value);
              setSelectedDistrict('');
            }}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-gov-slate focus:bg-white focus:outline-none focus:ring-1 focus:ring-gov-navy"
          >
            <option value="">All States ({availableStates.length})</option>
            {availableStates.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          {/* District */}
          <select
            value={selectedDistrict}
            onChange={(e) => setSelectedDistrict(e.target.value)}
            disabled={!selectedState && availableDistricts.length === 0}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-gov-slate focus:bg-white focus:outline-none focus:ring-1 focus:ring-gov-navy disabled:opacity-60"
          >
            <option value="">All Districts ({availableDistricts.length})</option>
            {availableDistricts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          {/* Project */}
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-gov-slate focus:bg-white focus:outline-none focus:ring-1 focus:ring-gov-navy"
          >
            <option value="">All Projects ({projects.length})</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {/* Status */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-gov-slate focus:bg-white focus:outline-none focus:ring-1 focus:ring-gov-navy"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="delayed">Delayed</option>
            <option value="under_review">Under Review</option>
            <option value="litigation">Litigation / Stays</option>
            <option value="completed">Completed</option>
          </select>

          {/* Priority */}
          <select
            value={selectedPriority}
            onChange={(e) => setSelectedPriority(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-gov-slate focus:bg-white focus:outline-none focus:ring-1 focus:ring-gov-navy"
          >
            <option value="">All Priorities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          {/* Stage */}
          <select
            value={selectedStage}
            onChange={(e) => setSelectedStage(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-gov-slate focus:bg-white focus:outline-none focus:ring-1 focus:ring-gov-navy truncate"
          >
            <option value="">All Stages ({availableStages.length})</option>
            {availableStages.map((stg) => (
              <option key={stg} value={stg}>
                {stg}
              </option>
            ))}
          </select>
        </div>

        {/* Results count indicator */}
        <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-100 flex items-center justify-between">
          <span>
            Showing <strong>{filteredCases.length}</strong> of <strong>{cases.length}</strong> acquisition cases
          </span>
          <span className="text-[10px] text-slate-400">
            Sorted by {sortField.replace('_', ' ')} ({sortOrder.toUpperCase()})
          </span>
        </div>
      </div>

      {/* Content Viewport */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-20 space-y-3 bg-white rounded-xl border border-slate-200">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gov-navy" />
          <p className="text-xs text-slate-500 font-medium">
            Querying land acquisition registry and calculating SLA trajectories...
          </p>
        </div>
      ) : error ? (
        <EmptyState
          title="Database Query Error"
          description={error}
          actionLabel="Retry Query"
          onAction={loadCases}
        />
      ) : filteredCases.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="h-8 w-8 text-slate-400" />}
          title="No Matching Acquisition Cases"
          description="Zero cases match the specified search query and operational filter criteria."
          actionLabel="Clear Filters"
          onAction={handleResetFilters}
          secondaryActionLabel="Initiate New Case"
          onSecondaryAction={onOpenCreateCase}
        />
      ) : viewMode === 'cards' ? (
        /* Card Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCases.map((c) => (
            <CaseCard key={c.id} caseItem={c} onClick={() => onSelectCase(c.id)} />
          ))}
        </div>
      ) : (
        /* High-Information Operational Table */
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-3 w-8 text-center">#</th>
                  <th
                    onClick={() => handleSortToggle('case_number')}
                    className="py-3 px-3 cursor-pointer hover:text-gov-navy select-none"
                  >
                    <div className="flex items-center gap-1">
                      <span>Case Identification</span>
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </th>
                  <th className="py-3 px-3">Corridor &amp; Project</th>
                  <th className="py-3 px-3">Administrative Geography</th>
                  <th className="py-3 px-3">Current Stage &amp; Progress</th>
                  <th
                    onClick={() => handleSortToggle('delay')}
                    className="py-3 px-3 cursor-pointer hover:text-gov-navy select-none text-center"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>SLA Status</span>
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSortToggle('priority')}
                    className="py-3 px-3 cursor-pointer hover:text-gov-navy select-none"
                  >
                    <div className="flex items-center gap-1">
                      <span>Priority</span>
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </th>
                  <th className="py-3 px-3">Friction Flags</th>
                  <th
                    onClick={() => handleSortToggle('updated_at')}
                    className="py-3 px-3 cursor-pointer hover:text-gov-navy select-none text-right"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Last Activity</span>
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCases.map((item) => {
                  const metrics = item.calculated_metrics;
                  const isDelayed = metrics?.is_delayed || item.status === 'delayed';
                  const delayDays = metrics?.net_delay_days || 0;
                  const isExpanded = expandedRowIds.has(item.id);
                  const unverifiedDocsCount = (item.documents || []).filter(
                    (d) => d.status === 'validation_required'
                  ).length;
                  const disputedParcelsCount = (item.parcels || []).filter(
                    (p) => p.acquisition_status === 'disputed'
                  ).length;

                  return (
                    <React.Fragment key={item.id}>
                      <tr
                        onClick={() => onSelectCase(item.id)}
                        className={clsx(
                          'hover:bg-slate-50/80 transition-colors group cursor-pointer',
                          isExpanded && 'bg-blue-50/20'
                        )}
                      >
                        {/* Expand toggle */}
                        <td className="py-3 px-2 text-center" onClick={(e) => toggleRowExpansion(item.id, e)}>
                          <button
                            type="button"
                            className="p-1 rounded text-slate-400 hover:text-gov-navy hover:bg-slate-100 transition-colors"
                            title={isExpanded ? 'Collapse details' : 'Expand progressive disclosure'}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5 text-gov-navy" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </td>

                        {/* Case Number & Title */}
                        <td className="py-3 px-3">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-[10px] font-bold text-gov-navy bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                                {item.case_number}
                              </span>
                              <strong className="text-gov-slate font-semibold text-xs group-hover:text-gov-navy transition-colors line-clamp-1">
                                {item.title}
                              </strong>
                            </div>
                            <p className="text-[10px] text-slate-400 line-clamp-1">
                              {item.description || 'Statutory land acquisition proceeding'}
                            </p>
                          </div>
                        </td>

                        {/* Project */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="text-xs font-medium text-gov-slate truncate max-w-[140px]">
                            {item.project?.name || 'Standard Corridor'}
                          </div>
                          <span className="text-[10px] text-slate-400 block font-mono">
                            {item.project?.code || 'CORR-01'}
                          </span>
                        </td>

                        {/* Administrative Geography */}
                        <td className="py-3 px-3 whitespace-nowrap text-slate-600">
                          <div className="font-semibold text-gov-slate text-xs">
                            {item.village}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {item.district}, {item.state}
                          </div>
                        </td>

                        {/* Stage & Progress */}
                        <td className="py-3 px-3 min-w-[140px]">
                          <div className="flex justify-between text-[11px] mb-1">
                            <span className="font-medium text-gov-slate truncate max-w-[100px]">
                              {metrics?.current_stage_title || 'Stage 1'}
                            </span>
                            <span className="font-mono text-slate-500 text-[10px]">
                              {metrics?.progress_percentage ?? 0}%
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div
                              style={{ width: `${metrics?.progress_percentage ?? 0}%` }}
                              className={clsx(
                                'h-full rounded-full transition-all',
                                isDelayed ? 'bg-red-500' : 'bg-gov-navy'
                              )}
                            />
                          </div>
                        </td>

                        {/* SLA Status */}
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          {isDelayed ? (
                            <span className="inline-flex items-center gap-1 font-mono font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded text-[11px]">
                              <Clock className="h-3 w-3" />
                              <span>+{delayDays}d SLA</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[11px]">
                              <CheckCircle2 className="h-3 w-3" />
                              <span>On Track</span>
                            </span>
                          )}
                        </td>

                        {/* Priority */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <Badge variant={priorityBadgeVariant[item.priority] || 'slate'}>
                            {item.priority.toUpperCase()}
                          </Badge>
                        </td>

                        {/* Friction Flags */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {unverifiedDocsCount > 0 && (
                              <span
                                className="inline-flex items-center gap-0.5 bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded text-[10px] font-semibold"
                                title={`${unverifiedDocsCount} unverified documents`}
                              >
                                <FileWarning className="h-3 w-3 text-amber-600" />
                                <span>{unverifiedDocsCount} Docs</span>
                              </span>
                            )}
                            {disputedParcelsCount > 0 && (
                              <span
                                className="inline-flex items-center gap-0.5 bg-red-50 text-red-700 border border-red-200 px-1.5 py-0.5 rounded text-[10px] font-semibold"
                                title={`${disputedParcelsCount} disputed parcels`}
                              >
                                <Scale className="h-3 w-3 text-red-600" />
                                <span>{disputedParcelsCount} Disputes</span>
                              </span>
                            )}
                            {unverifiedDocsCount === 0 && disputedParcelsCount === 0 && (
                              <span className="text-[10px] text-slate-400">Clear</span>
                            )}
                          </div>
                        </td>

                        {/* Last Activity */}
                        <td className="py-3 px-3 text-right whitespace-nowrap text-[10px] text-slate-400 font-mono">
                          {formatDate(item.updated_at || item.created_at)}
                        </td>

                        {/* Action */}
                        <td className="py-3 px-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => onSelectCase(item.id, 'workflow')}
                              className="px-2 py-1 text-[11px] font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
                              title="Jump to Workflow Timeline"
                            >
                              Workflow
                            </button>
                            <button
                              type="button"
                              onClick={() => onSelectCase(item.id, 'intelligence')}
                              className="px-2.5 py-1 text-[11px] font-semibold text-white bg-gov-navy hover:bg-gov-blue rounded shadow-xs transition-colors"
                            >
                              Open
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Progressive Disclosure Inline Drawer */}
                      {isExpanded && (
                        <tr className="bg-slate-50/70 border-b border-slate-200">
                          <td colSpan={10} className="p-4 pl-12 text-xs">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                              {/* Vitals Summary */}
                              <div className="space-y-1">
                                <span className="text-[10px] uppercase font-bold text-slate-400">
                                  Cadastral Area &amp; Value
                                </span>
                                <div className="text-xs text-gov-slate font-medium">
                                  Land Area: <strong>{item.total_area_hectares} Hectares</strong>
                                </div>
                                <div className="text-xs text-gov-slate font-medium">
                                  Compensation: <strong>{formatCurrency(item.estimated_compensation)}</strong>
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  Workflow Model: {item.workflow?.name || 'Standard'}
                                </div>
                              </div>

                              {/* Dates & Timeline */}
                              <div className="space-y-1">
                                <span className="text-[10px] uppercase font-bold text-slate-400">
                                  Statutory Milestones
                                </span>
                                <div className="text-[11px] text-slate-600">
                                  Initiated: <strong>{item.start_date || 'N/A'}</strong>
                                </div>
                                <div className="text-[11px] text-slate-600">
                                  Expected End: <strong>{item.expected_completion_date || 'N/A'}</strong>
                                </div>
                                {metrics?.projected_completion_date && (
                                  <div className="text-[11px] text-red-600 font-medium">
                                    Projected SLA: <strong>{metrics.projected_completion_date}</strong>
                                  </div>
                                )}
                              </div>

                              {/* Direct Tab Shortcuts */}
                              <div className="md:col-span-2 space-y-1">
                                <span className="text-[10px] uppercase font-bold text-slate-400">
                                  Contextual Workspace Shortcuts
                                </span>
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                  <button
                                    type="button"
                                    onClick={() => onSelectCase(item.id, 'overview')}
                                    className="px-2 py-1 rounded bg-white border border-slate-200 text-[11px] text-slate-700 hover:border-gov-navy transition-colors flex items-center gap-1"
                                  >
                                    <FileText className="h-3 w-3 text-slate-400" />
                                    <span>Overview</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onSelectCase(item.id, 'workflow')}
                                    className="px-2 py-1 rounded bg-white border border-slate-200 text-[11px] text-slate-700 hover:border-gov-navy transition-colors flex items-center gap-1"
                                  >
                                    <Clock className="h-3 w-3 text-gov-navy" />
                                    <span>Workflow</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onSelectCase(item.id, 'intelligence')}
                                    className="px-2 py-1 rounded bg-white border border-slate-200 text-[11px] text-slate-700 hover:border-gov-navy transition-colors flex items-center gap-1"
                                  >
                                    <Sparkles className="h-3 w-3 text-amber-500" />
                                    <span>Intelligence</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onSelectCase(item.id, 'gis')}
                                    className="px-2 py-1 rounded bg-white border border-slate-200 text-[11px] text-slate-700 hover:border-gov-navy transition-colors flex items-center gap-1"
                                  >
                                    <Layers className="h-3 w-3 text-emerald-600" />
                                    <span>GIS Map</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onSelectCase(item.id, 'documents')}
                                    className="px-2 py-1 rounded bg-white border border-slate-200 text-[11px] text-slate-700 hover:border-gov-navy transition-colors flex items-center gap-1"
                                  >
                                    <FileText className="h-3 w-3 text-blue-600" />
                                    <span>Documents</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onSelectCase(item.id, 'disputes')}
                                    className="px-2 py-1 rounded bg-white border border-slate-200 text-[11px] text-slate-700 hover:border-gov-navy transition-colors flex items-center gap-1"
                                  >
                                    <Scale className="h-3 w-3 text-red-600" />
                                    <span>Disputes</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
