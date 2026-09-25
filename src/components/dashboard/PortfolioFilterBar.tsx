import React from 'react';
import { PortfolioFilterParams, PortfolioOperationsData } from '../../../shared/types';
import { Filter, RotateCcw, Search, X } from 'lucide-react';

interface PortfolioFilterBarProps {
  filters: PortfolioFilterParams;
  availableFilters: PortfolioOperationsData['available_filters'];
  onFilterChange: (key: keyof PortfolioFilterParams, value: string | undefined) => void;
  onResetFilters: () => void;
}

export const PortfolioFilterBar: React.FC<PortfolioFilterBarProps> = ({
  filters,
  availableFilters,
  onFilterChange,
  onResetFilters,
}) => {
  const hasActiveFilters = Object.values(filters).some((v) => v !== undefined && v !== '');

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-3 shadow-xs">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={filters.search || ''}
            onChange={(e) => onFilterChange('search', e.target.value || undefined)}
            placeholder="Search case, village..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs text-gov-slate focus:outline-none focus:ring-1 focus:ring-gov-navy"
          />
        </div>

        {/* State Filter */}
        <div>
          <select
            value={filters.state || ''}
            onChange={(e) => onFilterChange('state', e.target.value || undefined)}
            className="w-full py-1.5 px-2.5 rounded-lg border border-slate-200 text-xs text-gov-slate bg-white focus:outline-none focus:ring-1 focus:ring-gov-navy"
          >
            <option value="">All States ({availableFilters.states.length})</option>
            {availableFilters.states.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>

        {/* Project Filter */}
        <div>
          <select
            value={filters.project_id || ''}
            onChange={(e) => onFilterChange('project_id', e.target.value || undefined)}
            className="w-full py-1.5 px-2.5 rounded-lg border border-slate-200 text-xs text-gov-slate bg-white focus:outline-none focus:ring-1 focus:ring-gov-navy"
          >
            <option value="">All Infrastructure Projects</option>
            {availableFilters.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Workflow Engine Filter */}
        <div>
          <select
            value={filters.workflow_id || ''}
            onChange={(e) => onFilterChange('workflow_id', e.target.value || undefined)}
            className="w-full py-1.5 px-2.5 rounded-lg border border-slate-200 text-xs text-gov-slate bg-white focus:outline-none focus:ring-1 focus:ring-gov-navy"
          >
            <option value="">All Workflow Models</option>
            {availableFilters.workflows.map((wf) => (
              <option key={wf.id} value={wf.id}>
                {wf.name}
              </option>
            ))}
          </select>
        </div>

        {/* Case Status Filter */}
        <div>
          <select
            value={filters.status || ''}
            onChange={(e) => onFilterChange('status', e.target.value || undefined)}
            className="w-full py-1.5 px-2.5 rounded-lg border border-slate-200 text-xs text-gov-slate bg-white focus:outline-none focus:ring-1 focus:ring-gov-navy"
          >
            <option value="">All Operational Statuses</option>
            <option value="active">Active (Tracking)</option>
            <option value="delayed">Delayed (SLA Breach)</option>
            <option value="under_review">Under Review</option>
            <option value="litigation">Under Cadastral Litigation</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        {/* Risk Level Filter */}
        <div>
          <select
            value={filters.risk_level || ''}
            onChange={(e) => onFilterChange('risk_level', e.target.value || undefined)}
            className="w-full py-1.5 px-2.5 rounded-lg border border-slate-200 text-xs text-gov-slate bg-white focus:outline-none focus:ring-1 focus:ring-gov-navy"
          >
            <option value="">All Calculated Risk Levels</option>
            <option value="critical">Critical Risk</option>
            <option value="high">High Risk</option>
            <option value="medium">Medium Risk</option>
            <option value="low">Low / On Schedule</option>
          </select>
        </div>
      </div>

      {/* Active Filter Tags */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-[11px]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-slate-400 flex items-center gap-1">
              <Filter className="h-3 w-3" /> Active Filter:
            </span>

            {filters.search && (
              <span className="bg-slate-100 text-gov-slate px-2 py-0.5 rounded-md flex items-center gap-1 border border-slate-200">
                Search: "{filters.search}"
                <button type="button" onClick={() => onFilterChange('search', undefined)} className="hover:text-red-600">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}

            {filters.state && (
              <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md flex items-center gap-1 border border-blue-200">
                State: {filters.state}
                <button type="button" onClick={() => onFilterChange('state', undefined)} className="hover:text-red-600">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}

            {filters.project_id && (
              <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md flex items-center gap-1 border border-blue-200">
                Project: {availableFilters.projects.find((p) => p.id === filters.project_id)?.name || filters.project_id}
                <button type="button" onClick={() => onFilterChange('project_id', undefined)} className="hover:text-red-600">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}

            {filters.status && (
              <span className="bg-amber-50 text-amber-800 px-2 py-0.5 rounded-md flex items-center gap-1 border border-amber-200 uppercase font-mono text-[10px]">
                Status: {filters.status}
                <button type="button" onClick={() => onFilterChange('status', undefined)} className="hover:text-red-600">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}

            {filters.risk_level && (
              <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded-md flex items-center gap-1 border border-red-200 uppercase font-mono text-[10px]">
                Risk: {filters.risk_level}
                <button type="button" onClick={() => onFilterChange('risk_level', undefined)} className="hover:text-red-600">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onResetFilters}
            className="text-slate-500 hover:text-gov-red font-medium flex items-center gap-1 transition-colors"
          >
            <RotateCcw className="h-3 w-3" /> Clear All Filters
          </button>
        </div>
      )}
    </div>
  );
};
