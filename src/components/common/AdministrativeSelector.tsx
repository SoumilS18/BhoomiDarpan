import React, { useState, useEffect, useRef } from 'react';
import {
  fetchStates,
  fetchDistricts,
  fetchSubDistricts,
  fetchVillages,
  fetchGeographyStatus,
  createSubDistrict,
  forwardGeocode,
  getGeographySource,
  getGeographyProvenance,
  geographySourceHint,
  subscribeGeographySource,
  GeographySource,
} from '../../lib/api';
import { AdministrativeUnit } from '../../../shared/types';
import { MapPin, Search, Loader2, Edit3, ListFilter, CloudOff, AlertTriangle, Plus, CheckCircle2, X } from 'lucide-react';
import { Badge } from './Badge';
import { Modal } from './Modal';
import { Button } from './Button';

export interface LocationChangePayload {
  name: string;
  unit_type: 'state' | 'district' | 'sub_district' | 'village';
  code: string;
  lat?: number;
  lng?: number;
  bbox?: [number, number, number, number];
  zoom?: number;
  source?: string;
}

export interface AdministrativeSelectorProps {
  selectedStateCode?: string;
  selectedDistrictCode?: string;
  selectedSubDistrictCode?: string;
  selectedVillageCode?: string;
  onSelectState?: (state: AdministrativeUnit | null) => void;
  onSelectDistrict?: (district: AdministrativeUnit | null) => void;
  onSelectSubDistrict?: (subdistrict: AdministrativeUnit | null) => void;
  onSelectVillage?: (village: AdministrativeUnit | null) => void;
  onLocationChange?: (location: LocationChangePayload) => void;
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
  onLocationChange,
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
  const [locationError, setLocationError] = useState<string | null>(null);
  const [geoSource, setGeoSource] = useState<GeographySource>(getGeographySource());

  // Missing Sub-District modal state
  const [isAddSubDistrictOpen, setIsAddSubDistrictOpen] = useState(false);
  const [newSubDistrictName, setNewSubDistrictName] = useState('');
  const [newSubDistrictCode, setNewSubDistrictCode] = useState('');
  const [newSubDistrictLocalName, setNewSubDistrictLocalName] = useState('');
  const [addSubDistrictLoading, setAddSubDistrictLoading] = useState(false);
  const [addSubDistrictError, setAddSubDistrictError] = useState<string | null>(null);
  const [addSubDistrictSuccess, setAddSubDistrictSuccess] = useState<string | null>(null);

  // Manual entry toggle for custom village name if needed
  const [isManualVillage, setIsManualVillage] = useState(false);
  const [manualVillageName, setManualVillageName] = useState('');

  useEffect(() => subscribeGeographySource(setGeoSource), []);

  const emptyTierHint = (length: number): string | null =>
    length === 0 && getGeographySource() === 'unavailable'
      ? geographySourceHint(getGeographyProvenance())
      : null;

  // 1. Fetch provenance, then States on mount
  useEffect(() => {
    let mounted = true;
    setLoadingStates(true);
    fetchGeographyStatus()
      .catch(() => undefined)
      .then(() => fetchStates())
      .then((res) => {
        if (mounted) {
          const list = res.states || [];
          setStates(list);
          setLocationError(emptyTierHint(list.length));
        }
      })
      .catch((err) => {
        console.warn('[AdminSelector] Failed to load states:', err);
        if (mounted) setLocationError('Unable to load administrative states data.');
      })
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
        if (mounted) {
          const list = res.districts || [];
          setDistricts(list);
          setLocationError(emptyTierHint(list.length));
        }
      })
      .catch((err) => {
        console.warn('[AdminSelector] Failed to load districts:', err);
        if (mounted) setLocationError('Unable to load districts for the selected state.');
      })
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
        if (mounted) {
          const list = res.subdistricts || [];
          setSubDistricts(list);
          setLocationError(emptyTierHint(list.length));
        }
      })
      .catch((err) => {
        console.warn('[AdminSelector] Failed to load sub-districts:', err);
        if (mounted) setLocationError('Unable to load sub-districts for the selected district.');
      })
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
      limit: 200,
      search: villageSearch.trim() || undefined,
    })
      .then((res) => {
        if (mounted) {
          setVillages(res.villages || []);
          setVillageTotal(res.total || (res.villages ? res.villages.length : 0));
          setLocationError(emptyTierHint(res.villages?.length ?? 0));
        }
      })
      .catch((err) => {
        console.warn('[AdminSelector] Failed to load villages:', err);
        if (mounted) setLocationError('Unable to load villages for the selected sub-district.');
      })
      .finally(() => {
        if (mounted) setLoadingVillages(false);
      });

    return () => {
      mounted = false;
    };
  }, [selectedSubDistrictCode, villageSearch]);

  // Resolve spatial location dynamically for location-aware map navigation
  const resolveLocationSpatial = async (
    unit: AdministrativeUnit | null,
    unitType: 'state' | 'district' | 'sub_district' | 'village',
    queryParts: string[]
  ) => {
    if (!onLocationChange || !unit) return;

    // Check if unit has pre-stored centroid
    if (unit.centroid && Array.isArray(unit.centroid) && unit.centroid.length === 2) {
      const zoomMap = { state: 6, district: 9, sub_district: 11, village: 14 };
      onLocationChange({
        name: unit.name,
        unit_type: unitType,
        code: unit.code,
        lat: unit.centroid[0],
        lng: unit.centroid[1],
        zoom: zoomMap[unitType],
        source: 'stored_centroid',
      });
      return;
    }

    // Dynamic geocoding fallback
    try {
      const query = [...queryParts, 'India'].join(', ');
      const geoRes = await forwardGeocode(query, 1);
      if (geoRes.results && geoRes.results.length > 0) {
        const item = geoRes.results[0];
        const zoomMap = { state: 6, district: 9, sub_district: 11, village: 14 };
        onLocationChange({
          name: unit.name,
          unit_type: unitType,
          code: unit.code,
          lat: item.latitude,
          lng: item.longitude,
          bbox: item.boundingbox,
          zoom: zoomMap[unitType],
          source: geoRes.provider,
        });
      }
    } catch {
      // If geocoder is unreachable, do not fabricate coordinates
    }
  };

  const handleStateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const code = e.target.value;
    const unit = states.find((s) => s.code === code) || null;
    onSelectState?.(unit);
    onSelectDistrict?.(null);
    onSelectSubDistrict?.(null);
    onSelectVillage?.(null);
    setIsManualVillage(false);
    setManualVillageName('');

    if (unit) {
      resolveLocationSpatial(unit, 'state', [unit.name]);
    }
  };

  const handleDistrictChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const code = e.target.value;
    const unit = districts.find((d) => d.code === code) || null;
    onSelectDistrict?.(unit);
    onSelectSubDistrict?.(null);
    onSelectVillage?.(null);
    setIsManualVillage(false);
    setManualVillageName('');

    if (unit) {
      const selectedState = states.find((s) => s.code === selectedStateCode);
      resolveLocationSpatial(unit, 'district', [unit.name, selectedState?.name || '']);
    }
  };

  const handleSubDistrictChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const code = e.target.value;
    const unit = subDistricts.find((sd) => sd.code === code) || null;
    onSelectSubDistrict?.(unit);
    onSelectVillage?.(null);
    setIsManualVillage(false);
    setManualVillageName('');

    if (unit) {
      const selectedState = states.find((s) => s.code === selectedStateCode);
      const selectedDistrict = districts.find((d) => d.code === selectedDistrictCode);
      resolveLocationSpatial(unit, 'sub_district', [
        unit.name,
        selectedDistrict?.name || '',
        selectedState?.name || '',
      ]);
    }
  };

  const handleVillageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const code = e.target.value;
    if (code === '__custom__') {
      setIsManualVillage(true);
      return;
    }
    const unit = villages.find((v) => v.code === code) || null;
    onSelectVillage?.(unit);

    if (unit) {
      const selectedState = states.find((s) => s.code === selectedStateCode);
      const selectedDistrict = districts.find((d) => d.code === selectedDistrictCode);
      const selectedSubDistrict = subDistricts.find((sd) => sd.code === selectedSubDistrictCode);
      resolveLocationSpatial(unit, 'village', [
        unit.name,
        selectedSubDistrict?.name || '',
        selectedDistrict?.name || '',
        selectedState?.name || '',
      ]);
    }
  };

  const handleManualVillageInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setManualVillageName(val);
    if (val.trim()) {
      const customUnit: AdministrativeUnit = {
        id: `custom-vil-${Date.now()}`,
        unit_type: 'village',
        code: `CUSTOM-${val.trim().toUpperCase().replace(/\s+/g, '_')}`,
        name: val.trim(),
        state_code: selectedStateCode,
        district_code: selectedDistrictCode,
        sub_district_code: selectedSubDistrictCode,
        is_active: true,
        source_id: 'manual_entry',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      onSelectVillage?.(customUnit);

      const selectedState = states.find((s) => s.code === selectedStateCode);
      const selectedDistrict = districts.find((d) => d.code === selectedDistrictCode);
      const selectedSubDistrict = subDistricts.find((sd) => sd.code === selectedSubDistrictCode);
      resolveLocationSpatial(customUnit, 'village', [
        val.trim(),
        selectedSubDistrict?.name || '',
        selectedDistrict?.name || '',
        selectedState?.name || '',
      ]);
    } else {
      onSelectVillage?.(null);
    }
  };

  const handleCreateSubDistrictSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddSubDistrictError(null);
    setAddSubDistrictSuccess(null);

    const name = newSubDistrictName.trim();
    const code = newSubDistrictCode.trim();

    if (!name || !code) {
      setAddSubDistrictError('Sub-District Name and LGD / Unit Code are required.');
      return;
    }

    if (!selectedStateCode || !selectedDistrictCode) {
      setAddSubDistrictError('Parent State and District must be selected.');
      return;
    }

    setAddSubDistrictLoading(true);
    try {
      const res = await createSubDistrict({
        name,
        code,
        state_code: selectedStateCode,
        district_code: selectedDistrictCode,
        local_name: newSubDistrictLocalName.trim() || undefined,
      });

      const created = res.subdistrict;
      setSubDistricts((prev) => [...prev, created]);
      onSelectSubDistrict?.(created);
      setAddSubDistrictSuccess(`Sub-District "${name}" (${code}) added successfully.`);

      // Reset form fields
      setNewSubDistrictName('');
      setNewSubDistrictCode('');
      setNewSubDistrictLocalName('');

      setTimeout(() => {
        setIsAddSubDistrictOpen(false);
        setAddSubDistrictSuccess(null);
      }, 800);
    } catch (err: any) {
      setAddSubDistrictError(err.message || 'Failed to create Sub-District');
    } finally {
      setAddSubDistrictLoading(false);
    }
  };

  const selectedState = states.find((s) => s.code === selectedStateCode);
  const selectedDistrict = districts.find((d) => d.code === selectedDistrictCode);

  return (
    <div className={`space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-gov ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2 text-gov-navy">
          <MapPin className="h-4 w-4 shrink-0" />
          <span className="text-xs font-bold">
            {geoSource === 'authoritative'
              ? 'LGD Authoritative Administrative Hierarchy (4-Tier)'
              : 'Administrative Hierarchy (4-Tier)'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={geoSource === 'authoritative' ? 'emerald' : 'amber'}>
            <span
              className={`h-1.5 w-1.5 rounded-full ${geoSource === 'authoritative' ? 'bg-emerald-500' : 'bg-amber-500'}`}
            />
            {geoSource === 'authoritative' ? 'Authoritative LGD' : 'Reference Mirror'}
          </Badge>
          <span className="text-[10px] text-slate-400 font-mono">
            {geoSource === 'authoritative' ? 'Ministry of Panchayati Raj (GODL)' : 'Temporary LGD Reference'}
          </span>
        </div>
      </div>

      {locationError && (
        <div
          role="alert"
          className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
          <AlertTriangle className="mt-0.5 w-3.5 h-3.5 shrink-0 text-amber-500" />
          <span>{locationError}</span>
        </div>
      )}

      {geoSource === 'unavailable' && (
        <div className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <CloudOff className="mt-0.5 w-3.5 h-3.5 shrink-0 text-amber-500" />
          <span>
            {geographySourceHint(getGeographyProvenance())} Hierarchy lists stay empty until a
            geography dataset is ingested — no partial or substituted geography is shown.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Tier 1: State */}
        <div>
          <label className="label label-required">
            State / UT{' '}
            {loadingStates && <Loader2 className="ml-1 inline w-3 h-3 animate-spin text-gov-navy" />}
          </label>
          <select
            value={selectedStateCode || ''}
            onChange={handleStateChange}
            disabled={disabled || loadingStates}
            className="input input-xs"
          >
            <option value="">{loadingStates ? 'Loading states...' : states.length ? '-- Select State / UT --' : 'No states available'}</option>
            {states.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name} (LGD: {s.code})
              </option>
            ))}
          </select>
        </div>

        {/* Tier 2: District */}
        <div>
          <label className="label label-required">
            District{' '}
            {loadingDistricts && <Loader2 className="ml-1 inline w-3 h-3 animate-spin text-gov-navy" />}
          </label>
          <select
            value={selectedDistrictCode || ''}
            onChange={handleDistrictChange}
            disabled={disabled || !selectedStateCode || loadingDistricts}
            className="input input-xs"
          >
            <option value="">
              {loadingDistricts
                ? 'Loading districts...'
                : !selectedStateCode
                ? 'Select State first'
                : districts.length
                ? '-- Select District --'
                : 'No districts found'}
            </option>
            {districts.map((d) => (
              <option key={d.code} value={d.code}>
                {d.name} (LGD: {d.code})
              </option>
            ))}
          </select>
        </div>

        {/* Tier 3: Sub-District / Tehsil */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="label label-required mb-0">
              Sub-District / Tehsil{' '}
              {loadingSubDistricts && <Loader2 className="ml-1 inline w-3 h-3 animate-spin text-gov-navy" />}
            </label>
            {selectedDistrictCode && (
              <button
                type="button"
                onClick={() => {
                  setAddSubDistrictError(null);
                  setAddSubDistrictSuccess(null);
                  setIsAddSubDistrictOpen(true);
                }}
                className="inline-flex cursor-pointer items-center gap-0.5 text-[10px] font-semibold text-gov-navy hover:text-gov-blue"
              >
                <Plus className="w-2.5 h-2.5" />
                Add Missing
              </button>
            )}
          </div>
          <select
            value={selectedSubDistrictCode || ''}
            onChange={handleSubDistrictChange}
            disabled={disabled || !selectedDistrictCode || loadingSubDistricts}
            className="input input-xs"
          >
            <option value="">
              {loadingSubDistricts
                ? 'Loading sub-districts...'
                : !selectedDistrictCode
                ? 'Select District first'
                : subDistricts.length
                ? '-- Select Sub-District / Tehsil --'
                : 'No sub-districts available'}
            </option>
            {subDistricts.map((sd) => (
              <option key={sd.code} value={sd.code}>
                {sd.name} (LGD: {sd.code})
              </option>
            ))}
          </select>
        </div>

        {/* Tier 4: Village */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="label label-required mb-0">
              Revenue Village{' '}
              {loadingVillages && <Loader2 className="ml-1 inline w-3 h-3 animate-spin text-gov-navy" />}
              {villageTotal > 0 && !isManualVillage && (
                <span className="ml-1 text-[10px] font-normal text-slate-400">({villageTotal})</span>
              )}
            </label>
            {selectedSubDistrictCode && (
              <button
                type="button"
                onClick={() => {
                  setIsManualVillage(!isManualVillage);
                  if (isManualVillage) {
                    setManualVillageName('');
                    onSelectVillage?.(null);
                  }
                }}
                className="inline-flex cursor-pointer items-center gap-0.5 text-[10px] font-semibold text-gov-navy hover:text-gov-blue"
              >
                {isManualVillage ? <ListFilter className="w-2.5 h-2.5" /> : <Edit3 className="w-2.5 h-2.5" />}
                {isManualVillage ? 'Choose from list' : 'Custom'}
              </button>
            )}
          </div>

          {isManualVillage ? (
            <input
              type="text"
              value={manualVillageName}
              onChange={handleManualVillageInput}
              placeholder="Enter village / locality name"
              disabled={disabled || !selectedSubDistrictCode}
              className="input input-xs"
            />
          ) : (
            <select
              value={selectedVillageCode || ''}
              onChange={handleVillageChange}
              disabled={disabled || !selectedSubDistrictCode || loadingVillages}
              className="input input-xs"
            >
              <option value="">
                {loadingVillages
                  ? 'Loading villages...'
                  : !selectedSubDistrictCode
                  ? 'Select Sub-District first'
                  : villages.length
                  ? '-- Select Revenue Village --'
                  : 'No villages found'}
              </option>
              {villages.map((v) => (
                <option key={v.code} value={v.code}>
                  {v.name} (LGD: {v.code})
                </option>
              ))}
              {selectedSubDistrictCode && (
                <option value="__custom__">+ Enter custom village name...</option>
              )}
            </select>
          )}
        </div>
      </div>

      {selectedSubDistrictCode && !isManualVillage && (
        <div className="flex items-center space-x-2 pt-0.5">
          <div className="relative flex-1 max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 w-3.5 h-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search villages in this sub-district..."
              value={villageSearch}
              onChange={(e) => setVillageSearch(e.target.value)}
              className="input input-xs pl-8"
            />
          </div>
          {villageSearch && (
            <button
              type="button"
              onClick={() => setVillageSearch('')}
              className="text-xs font-medium text-slate-500 hover:text-gov-slate"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Add Missing Sub-District / Tehsil Modal */}
      <Modal
        isOpen={isAddSubDistrictOpen}
        onClose={() => setIsAddSubDistrictOpen(false)}
        title="Add Missing Sub-District / Tehsil"
        subtitle="Register a missing administrative Tehsil under the selected State and District"
        maxWidth="md"
      >
        <form onSubmit={handleCreateSubDistrictSubmit} className="space-y-4">
          {addSubDistrictError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{addSubDistrictError}</span>
            </div>
          )}

          {addSubDistrictSuccess && (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{addSubDistrictSuccess}</span>
            </div>
          )}

          {/* Parent Context Display */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-1">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Parent Administrative Context
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">State / UT:</span>
              <strong className="text-gov-slate">
                {selectedState ? `${selectedState.name} (${selectedState.code})` : selectedStateCode || 'None'}
              </strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">District:</span>
              <strong className="text-gov-slate">
                {selectedDistrict ? `${selectedDistrict.name} (${selectedDistrict.code})` : selectedDistrictCode || 'None'}
              </strong>
            </div>
          </div>

          <div>
            <label htmlFor="new-subdistrict-name" className="label label-required">
              Sub-District / Tehsil Name
            </label>
            <input
              id="new-subdistrict-name"
              type="text"
              required
              placeholder="e.g. Jewar, Dadri, Bilaspur"
              value={newSubDistrictName}
              onChange={(e) => setNewSubDistrictName(e.target.value)}
              className="input text-xs"
            />
          </div>

          <div>
            <label htmlFor="new-subdistrict-code" className="label label-required">
              Sub-District / Tehsil LGD Code
            </label>
            <input
              id="new-subdistrict-code"
              type="text"
              required
              placeholder="e.g. 5982, TEH-JEWAR-01"
              value={newSubDistrictCode}
              onChange={(e) => setNewSubDistrictCode(e.target.value)}
              className="input text-xs font-mono"
            />
            <p className="mt-1 text-[10px] text-slate-400">
              Enter official LGD sub-district code if known, or regional administrative code. Must be unique.
            </p>
          </div>

          <div>
            <label htmlFor="new-subdistrict-local-name" className="label">
              Vernacular / Local Name (Optional)
            </label>
            <input
              id="new-subdistrict-local-name"
              type="text"
              placeholder="e.g. जेवर, दादरी"
              value={newSubDistrictLocalName}
              onChange={(e) => setNewSubDistrictLocalName(e.target.value)}
              className="input text-xs"
            />
          </div>

          <div className="rounded border border-blue-100 bg-blue-50/70 p-2.5 text-[11px] text-slate-600">
            <strong>Provenance Notice:</strong> Manually added sub-districts are persisted to PostgreSQL as
            reference records with provenance source <code className="font-mono text-gov-navy">manual_entry</code>.
            They do not masquerade as authoritative LGD records.
          </div>

          <div className="sticky bottom-[-1.25rem] flex items-center justify-end gap-2 border-t border-slate-100 bg-white py-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAddSubDistrictOpen(false)}
              disabled={addSubDistrictLoading}
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={addSubDistrictLoading} leftIcon={<Plus className="h-4 w-4" />}>
              Add Sub-District
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
