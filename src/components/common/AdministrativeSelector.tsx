import React, { useState, useEffect } from 'react';
import {
  fetchStates,
  fetchDistricts,
  fetchSubDistricts,
  fetchVillages,
} from '../../lib/api';
import { AdministrativeUnit } from '../../../shared/types';
import { MapPin, Search, Loader2 } from 'lucide-react';

export interface AdministrativeSelectorProps {
  selectedStateCode?: string;
  selectedDistrictCode?: string;
  selectedSubDistrictCode?: string;
  selectedVillageCode?: string;
  onSelectState?: (state: AdministrativeUnit | null) => void;
  onSelectDistrict?: (district: AdministrativeUnit | null) => void;
  onSelectSubDistrict?: (subdistrict: AdministrativeUnit | null) => void;
  onSelectVillage?: (village: AdministrativeUnit | null) => void;
  disabled?: boolean;
  className?: string;
}

export const AdministrativeSelector: React.FC<AdministrativeSelectorProps> = ({
  selectedStateCode,
  selectedDistrictCode,
  selectedSubDistrictCode,
  selectedVillageCode,
  onSelectState,
  onSelectDistrict,
  onSelectSubDistrict,
  onSelectVillage,
  disabled = false,
  className = '',
}) => {
  const [states, setStates] = useState<AdministrativeUnit[]>([]);
  const [districts, setDistricts] = useState<AdministrativeUnit[]>([]);
  const [subDistricts, setSubDistricts] = useState<AdministrativeUnit[]>([]);
  const [villages, setVillages] = useState<AdministrativeUnit[]>([]);

  const [loadingStates, setLoadingStates] = useState(false);
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [loadingSubDistricts, setLoadingSubDistricts] = useState(false);
  const [loadingVillages, setLoadingVillages] = useState(false);

  const [villageSearch, setVillageSearch] = useState('');
  const [villageTotal, setVillageTotal] = useState(0);

  // 1. Fetch States on mount
  useEffect(() => {
    let mounted = true;
    setLoadingStates(true);
    fetchStates()
      .then((res) => {
        if (mounted) setStates(res.states || []);
      })
      .catch((err) => console.warn('[AdminSelector] Failed to load states:', err))
      .finally(() => {
        if (mounted) setLoadingStates(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // 2. Fetch Districts when State changes
  useEffect(() => {
    if (!selectedStateCode) {
      setDistricts([]);
      setSubDistricts([]);
      setVillages([]);
      return;
    }

    let mounted = true;
    setLoadingDistricts(true);
    fetchDistricts(selectedStateCode)
      .then((res) => {
        if (mounted) setDistricts(res.districts || []);
      })
      .catch((err) => console.warn('[AdminSelector] Failed to load districts:', err))
      .finally(() => {
        if (mounted) setLoadingDistricts(false);
      });

    return () => {
      mounted = false;
    };
  }, [selectedStateCode]);

  // 3. Fetch Sub-Districts when District changes
  useEffect(() => {
    if (!selectedDistrictCode) {
      setSubDistricts([]);
      setVillages([]);
      return;
    }

    let mounted = true;
    setLoadingSubDistricts(true);
    fetchSubDistricts(selectedDistrictCode)
      .then((res) => {
        if (mounted) setSubDistricts(res.subdistricts || []);
      })
      .catch((err) => console.warn('[AdminSelector] Failed to load sub-districts:', err))
      .finally(() => {
        if (mounted) setLoadingSubDistricts(false);
      });

    return () => {
      mounted = false;
    };
  }, [selectedDistrictCode]);

  // 4. Fetch Villages when Sub-District changes or search term changes
  useEffect(() => {
    if (!selectedSubDistrictCode) {
      setVillages([]);
      setVillageTotal(0);
      return;
    }

    let mounted = true;
    setLoadingVillages(true);
    fetchVillages(selectedSubDistrictCode, {
      limit: 100,
      search: villageSearch.trim() || undefined,
    })
      .then((res) => {
        if (mounted) {
          setVillages(res.villages || []);
          setVillageTotal(res.total || 0);
        }
      })
      .catch((err) => console.warn('[AdminSelector] Failed to load villages:', err))
      .finally(() => {
        if (mounted) setLoadingVillages(false);
      });

    return () => {
      mounted = false;
    };
  }, [selectedSubDistrictCode, villageSearch]);

  const handleStateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const code = e.target.value;
    const unit = states.find((s) => s.code === code) || null;
    onSelectState?.(unit);
    onSelectDistrict?.(null);
    onSelectSubDistrict?.(null);
    onSelectVillage?.(null);
  };

  const handleDistrictChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const code = e.target.value;
    const unit = districts.find((d) => d.code === code) || null;
    onSelectDistrict?.(unit);
    onSelectSubDistrict?.(null);
    onSelectVillage?.(null);
  };

  const handleSubDistrictChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const code = e.target.value;
    const unit = subDistricts.find((sd) => sd.code === code) || null;
    onSelectSubDistrict?.(unit);
    onSelectVillage?.(null);
  };

  const handleVillageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const code = e.target.value;
    const unit = villages.find((v) => v.code === code) || null;
    onSelectVillage?.(unit);
  };

  return (
    <div className={`space-y-4 bg-slate-900/60 p-4 rounded-xl border border-slate-700/60 ${className}`}>
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center space-x-2 text-emerald-400 text-sm font-semibold">
          <MapPin className="w-4 h-4" />
          <span>LGD Authoritative Geography Hierarchy</span>
        </div>
        <span className="text-[11px] text-slate-400 font-mono">Ministry of Panchayati Raj (GODL)</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Tier 1: State */}
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">
            State / UT {loadingStates && <Loader2 className="inline w-3 h-3 animate-spin text-emerald-400 ml-1" />}
          </label>
          <select
            value={selectedStateCode || ''}
            onChange={handleStateChange}
            disabled={disabled || loadingStates}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
          >
            <option value="">-- Select State --</option>
            {states.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name} (LGD: {s.code})
              </option>
            ))}
          </select>
        </div>

        {/* Tier 2: District */}
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">
            District {loadingDistricts && <Loader2 className="inline w-3 h-3 animate-spin text-emerald-400 ml-1" />}
          </label>
          <select
            value={selectedDistrictCode || ''}
            onChange={handleDistrictChange}
            disabled={disabled || !selectedStateCode || loadingDistricts}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
          >
            <option value="">{selectedStateCode ? '-- Select District --' : 'Select State first'}</option>
            {districts.map((d) => (
              <option key={d.code} value={d.code}>
                {d.name} (LGD: {d.code})
              </option>
            ))}
          </select>
        </div>

        {/* Tier 3: Sub-District / Tehsil */}
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">
            Sub-District / Tehsil {loadingSubDistricts && <Loader2 className="inline w-3 h-3 animate-spin text-emerald-400 ml-1" />}
          </label>
          <select
            value={selectedSubDistrictCode || ''}
            onChange={handleSubDistrictChange}
            disabled={disabled || !selectedDistrictCode || loadingSubDistricts}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
          >
            <option value="">{selectedDistrictCode ? '-- Select Sub-District --' : 'Select District first'}</option>
            {subDistricts.map((sd) => (
              <option key={sd.code} value={sd.code}>
                {sd.name} (LGD: {sd.code})
              </option>
            ))}
          </select>
        </div>

        {/* Tier 4: Village */}
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">
            Revenue Village {loadingVillages && <Loader2 className="inline w-3 h-3 animate-spin text-emerald-400 ml-1" />}
            {villageTotal > 0 && <span className="text-slate-400 text-[10px] ml-1">({villageTotal} total)</span>}
          </label>
          <select
            value={selectedVillageCode || ''}
            onChange={handleVillageChange}
            disabled={disabled || !selectedSubDistrictCode || loadingVillages}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
          >
            <option value="">{selectedSubDistrictCode ? '-- Select Village --' : 'Select Sub-District first'}</option>
            {villages.map((v) => (
              <option key={v.code} value={v.code}>
                {v.name} (LGD: {v.code})
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedSubDistrictCode && (
        <div className="flex items-center space-x-2 pt-1">
          <div className="relative flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
            <input
              type="text"
              placeholder="Search villages in this sub-district..."
              value={villageSearch}
              onChange={(e) => setVillageSearch(e.target.value)}
              className="w-full bg-slate-800/80 border border-slate-700/80 rounded-md pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          {villageSearch && (
            <button
              onClick={() => setVillageSearch('')}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
};
