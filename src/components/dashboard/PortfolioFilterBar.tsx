import React, { useState, useEffect } from 'react';
import { PortfolioFilterParams, PortfolioOperationsData, AdministrativeUnit } from '../../../shared/types';
import { Filter, RotateCcw, Search, X } from 'lucide-react';
import { fetchDistricts, fetchSubDistricts, fetchVillages } from '../../lib/api';

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
  const [districts, setDistricts] = useState<AdministrativeUnit[]>([]);
  const [subDistricts, setSubDistricts] = useState<AdministrativeUnit[]>([]);
  const [villages, setVillages] = useState<AdministrativeUnit[]>([]);

  // 1. Fetch Districts when State changes
  useEffect(() => {
    if (!filters.state) {
      setDistricts([]);
      setSubDistricts([]);
      setVillages([]);
      return;
    }

    let mounted = true;
    fetchDistricts(filters.state)
      .then((res) => {
        if (mounted) {
          setDistricts(res.districts || []);
        }
      })
      .catch(() => {
        if (mounted) setDistricts([]);
      });

    return () => {
      mounted = false;
    };
  }, [filters.state]);

  // 2. Fetch Sub-Districts when District changes
  useEffect(() => {
    const districtKey = filters.district_lgd_code || filters.district;
    if (!districtKey) {
      setSubDistricts([]);
      setVillages([]);
      return;
    }

    let mounted = true;
    fetchSubDistricts(districtKey)
      .then((res) => {
        if (mounted) {
          setSubDistricts(res.subdistricts || []);
        }
      })
      .catch(() => {
        if (mounted) setSubDistricts([]);
      });

    return () => {
      mounted = false;
    };
  }, [filters.district, filters.district_lgd_code]);

  // 3. Fetch Villages when Sub-District changes
  useEffect(() => {
    const subDistrictKey = filters.subdistrict_lgd_code;
    if (!subDistrictKey) {
      setVillages([]);
      return;
    }

    let mounted = true;
    fetchVillages(subDistrictKey)
      .then((res) => {
        if (mounted) {
          setVillages(res.villages || []);
        }
      })
      .catch(() => {
        if (mounted) setVillages([]);
      });

    return () => {
      mounted = false;
    };
  }, [filters.subdistrict_lgd_code]);

  const hasActiveFilters = Object.values(filters).some((v) => v !== undefined && v !== '');

  const handleStateChange = (stateName: string) => {
    if (!stateName) {
      onFilterChange('state', undefined);
      onFilterChange('district', undefined);
      onFilterChange('district_lgd_code', undefined);
      onFilterChange('subdistrict_lgd_code', undefined);
      onFilterChange('village_lgd_code', undefined);
    } else {
      onFilterChange('state', stateName);
      onFilterChange('district', undefined);
      onFilterChange('district_lgd_code', undefined);
      onFilterChange('subdistrict_lgd_code', undefined);
      onFilterChange('village_lgd_code', undefined);
    }
  };

  const handleDistrictChange = (distCodeOrName: string) => {
    if (!distCodeOrName) {
      onFilterChange('district', undefined);
      onFilterChange('district_lgd_code', undefined);
      onFilterChange('subdistrict_lgd_code', undefined);
      onFilterChange('village_lgd_code', undefined);
    } else {
      const match = districts.find(
        (d) => d.code === distCodeOrName || d.name.toLowerCase() === distCodeOrName.toLowerCase()
      );
      onFilterChange('district', match ? match.name : distCodeOrName);
      onFilterChange('district_lgd_code', match ? match.code : undefined);
      onFilterChange('subdistrict_lgd_code', undefined);
      onFilterChange('village_lgd_code', undefined);
    }
  };

  const handleSubDistrictChange = (subDistrictCode: string) => {
    if (!subDistrictCode) {
      onFilterChange('subdistrict_lgd_code', undefined);
      onFilterChange('village_lgd_code', undefined);
    } else {
      onFilterChange('subdistrict_lgd_code', subDistrictCode);
      onFilterChange('village_lgd_code', undefined);
    }
  };

  const handleVillageChange = (villageCode: string) => {
    onFilterChange('village_lgd_code', villageCode || undefined);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-3 shadow-xs">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-2.5 text-xs">
        {/* Search */}
        <div className="relative col-span-1 sm:col-span-2 md:col-span-1 xl:col-span-2">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={filters.search || ''}
            onChange={(e) => onFilterChange('search', e.target.value || undefined)}
            placeholder="Search case, village, project..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs text-gov-slate focus:outline-none focus:ring-1 focus:ring-gov-navy"
          />
        </div>

        {/* State Filter */}
        <div>
          <select
            value={filters.state || ''}
            onChange={(e) => handleStateChange(e.target.value)}
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

        {/* District Filter */}
        <div>
          <select
            value={filters.district_lgd_code || filters.district || ''}
            onChange={(e) => handleDistrictChange(e.target.value)}
            disabled={!filters.state && districts.length === 0 && availableFilters.districts.length === 0}
            className="w-full py-1.5 px-2.5 rounded-lg border border-slate-200 text-xs text-gov-slate bg-white focus:outline-none focus:ring-1 focus:ring-gov-navy disabled:opacity-50"
          >
            <option value="">
              All Districts ({districts.length > 0 ? districts.length : availableFilters.districts.length})
            </option>
            {districts.length > 0
              ? districts.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.name}
                  </option>
                ))
              : availableFilters.districts.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
          </select>
        </div>

        {/* Sub-District / Tehsil Filter */}
        <div>
          <select
            value={filters.subdistrict_lgd_code || ''}
            onChange={(e) => handleSubDistrictChange(e.target.value)}
            disabled={subDistricts.length === 0}
            className="w-full py-1.5 px-2.5 rounded-lg border border-slate-200 text-xs text-gov-slate bg-white focus:outline-none focus:ring-1 focus:ring-gov-navy disabled:opacity-50"
          >
            <option value="">All Tehsils ({subDistricts.length})</option>
            {subDistricts.map((sd) => (
              <option key={sd.code} value={sd.code}>
                {sd.name}
              </option>
            ))}
          </select>
        </div>

        {/* Village Filter */}
        <div>
          <select
            value={filters.village_lgd_code || ''}
            onChange={(e) => handleVillageChange(e.target.value)}
            disabled={villages.length === 0}
            className="w-full py-1.5 px-2.5 rounded-lg border border-slate-200 text-xs text-gov-slate bg-white focus:outline-none focus:ring-1 focus:ring-gov-navy disabled:opacity-50"
          >
            <option value="">All Villages ({villages.length})</option>
            {villages.map((v) => (
              <option key={v.code} value={v.code}>
                {v.name}
              </option>
            ))}
          </select>
        </div>

        {/* Project Filter */}
        <div>
          <select
            value={filters.project_id || ''}
            onChange={(e) => onFilterChange('project_id', e.target.value || undefined)}
            className="w-full py-1.5 px-2.5 rounded-lg border border-slate-200 text-xs text-gov-slate bg-white focus:outline-none focus:ring-1 focus:ring-gov-navy truncate"
          >
            <option value="">All Projects</option>
            {availableFilters.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
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
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="delayed">Delayed</option>
            <option value="under_review">Under Review</option>
            <option value="litigation">Litigation</option>
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
            <option value="">All Risks</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
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
                <button type="button" onClick={() => onFilterChange('search', undefined)} className="hover:text-red-600 cursor-pointer">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}

            {filters.state && (
              <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md flex items-center gap-1 border border-blue-200">
                State: {filters.state}
                <button type="button" onClick={() => handleStateChange('')} className="hover:text-red-600 cursor-pointer">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}

            {filters.district && (
              <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md flex items-center gap-1 border border-blue-200">
                District: {filters.district}
                <button type="button" onClick={() => handleDistrictChange('')} className="hover:text-red-600 cursor-pointer">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}

            {filters.subdistrict_lgd_code && (
              <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md flex items-center gap-1 border border-blue-200">
                Tehsil: {subDistricts.find((s) => s.code === filters.subdistrict_lgd_code)?.name || filters.subdistrict_lgd_code}
                <button type="button" onClick={() => handleSubDistrictChange('')} className="hover:text-red-600 cursor-pointer">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}

            {filters.village_lgd_code && (
              <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md flex items-center gap-1 border border-blue-200">
                Village: {villages.find((v) => v.code === filters.village_lgd_code)?.name || filters.village_lgd_code}
                <button type="button" onClick={() => handleVillageChange('')} className="hover:text-red-600 cursor-pointer">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}

            {filters.project_id && (
              <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md flex items-center gap-1 border border-blue-200">
                Project: {availableFilters.projects.find((p) => p.id === filters.project_id)?.name || filters.project_id}
                <button type="button" onClick={() => onFilterChange('project_id', undefined)} className="hover:text-red-600 cursor-pointer">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}

            {filters.status && (
              <span className="bg-amber-50 text-amber-800 px-2 py-0.5 rounded-md flex items-center gap-1 border border-amber-200 uppercase font-mono text-[10px]">
                Status: {filters.status}
                <button type="button" onClick={() => onFilterChange('status', undefined)} className="hover:text-red-600 cursor-pointer">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}

            {filters.risk_level && (
              <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded-md flex items-center gap-1 border border-red-200 uppercase font-mono text-[10px]">
                Risk: {filters.risk_level}
                <button type="button" onClick={() => onFilterChange('risk_level', undefined)} className="hover:text-red-600 cursor-pointer">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onResetFilters}
            className="text-slate-500 hover:text-gov-red font-medium flex items-center gap-1 transition-colors cursor-pointer"
          >
            <RotateCcw className="h-3 w-3" /> Clear All Filters
          </button>
        </div>
      )}
    </div>
  );
};
