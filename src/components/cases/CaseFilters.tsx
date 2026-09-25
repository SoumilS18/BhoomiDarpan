import React from 'react';
import { Filter, RotateCcw } from 'lucide-react';
import { Button } from '../common/Button';

interface CaseFiltersProps {
  availableStates: string[];
  availableDistricts: string[];
  selectedState: string;
  selectedDistrict: string;
  selectedStatus: string;
  selectedPriority: string;
  onStateChange: (state: string) => void;
  onDistrictChange: (district: string) => void;
  onStatusChange: (status: string) => void;
  onPriorityChange: (priority: string) => void;
  onReset: () => void;
}

export const CaseFilters: React.FC<CaseFiltersProps> = ({
  availableStates,
  availableDistricts,
  selectedState,
  selectedDistrict,
  selectedStatus,
  selectedPriority,
  onStateChange,
  onDistrictChange,
  onStatusChange,
  onPriorityChange,
  onReset,
}) => {
  const hasActiveFilters = Boolean(
    selectedState || selectedDistrict || selectedStatus || selectedPriority
  );

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-sm mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mr-1">
          <Filter className="h-3.5 w-3.5" />
          <span>Filters:</span>
        </div>

        {/* State Filter */}
        <select
          value={selectedState}
          onChange={(e) => onStateChange(e.target.value)}
          className="rounded-md border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-xs text-gov-slate focus:border-gov-navy focus:bg-white focus:outline-none"
        >
          <option value="">All States</option>
          {availableStates.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {/* District Filter */}
        <select
          value={selectedDistrict}
          onChange={(e) => onDistrictChange(e.target.value)}
          className="rounded-md border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-xs text-gov-slate focus:border-gov-navy focus:bg-white focus:outline-none"
        >
          <option value="">All Districts</option>
          {availableDistricts.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        {/* Status Filter */}
        <select
          value={selectedStatus}
          onChange={(e) => onStatusChange(e.target.value)}
          className="rounded-md border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-xs text-gov-slate focus:border-gov-navy focus:bg-white focus:outline-none"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="delayed">Delayed</option>
          <option value="under_review">Under Review</option>
          <option value="litigation">Litigation</option>
          <option value="completed">Completed</option>
        </select>

        {/* Priority Filter */}
        <select
          value={selectedPriority}
          onChange={(e) => onPriorityChange(e.target.value)}
          className="rounded-md border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-xs text-gov-slate focus:border-gov-navy focus:bg-white focus:outline-none"
        >
          <option value="">All Priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          leftIcon={<RotateCcw className="h-3 w-3" />}
          className="text-slate-500 hover:text-gov-slate"
        >
          Reset Filters
        </Button>
      )}
    </div>
  );
};
