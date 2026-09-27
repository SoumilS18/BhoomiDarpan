import React, { useState, useEffect } from 'react';
import { ProjectCorridorDetails } from '../../../shared/types';
import { fetchCaseCorridor, updateCaseCorridor } from '../../lib/api';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import {
  X,
  MapPin,
  Compass,
  Sliders,
  Sparkles,
  Layers,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  RefreshCw,
  Navigation,
  Globe,
  FileCode,
} from 'lucide-react';

interface ProjectCorridorModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  caseTitle: string;
  onCorridorUpdated?: (corridor: ProjectCorridorDetails) => void;
}

export const ProjectCorridorModal: React.FC<ProjectCorridorModalProps> = ({
  isOpen,
  onClose,
  caseId,
  caseTitle,
  onCorridorUpdated,
}) => {
  const [corridor, setCorridor] = useState<ProjectCorridorDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<'coordinates' | 'geojson'>('coordinates');

  // Form states
  const [corridorName, setCorridorName] = useState('');
  const [corridorType, setCorridorType] = useState<ProjectCorridorDetails['corridor_type']>('highway');
  const [totalLengthKm, setTotalLengthKm] = useState<number>(25);
  const [rowWidthMeters, setRowWidthMeters] = useState<number>(60);
  const [sponsoringAgency, setSponsoringAgency] = useState('');

  // Coordinate endpoints
  const [startLat, setStartLat] = useState<number>(18.5204);
  const [startLng, setStartLng] = useState<number>(73.8567);
  const [startLandmark, setStartLandmark] = useState('Origin Junction / KM 0.0');

  const [endLat, setEndLat] = useState<number>(18.5913);
  const [endLng, setEndLng] = useState<number>(73.7389);
  const [endLandmark, setEndLandmark] = useState('Terminus Junction / Bypass Intersect');

  const [waypoints, setWaypoints] = useState<Array<{ latitude: number; longitude: number; name?: string }>>([]);
  const [rawGeoJSON, setRawGeoJSON] = useState('');

  // Load corridor details
  useEffect(() => {
    if (!isOpen || !caseId) return;

    let mounted = true;
    setIsLoading(true);
    setError(null);
    setSuccessMsg(null);

    fetchCaseCorridor(caseId)
      .then((data) => {
        if (!mounted) return;
        setCorridor(data);
        setCorridorName(data.corridor_name || `Corridor Alignment: ${caseTitle}`);
        setCorridorType(data.corridor_type || 'highway');
        setTotalLengthKm(data.total_length_km || 25);
        setRowWidthMeters(data.right_of_way_width_meters || 60);
        setSponsoringAgency(data.sponsoring_agency || '');

        if (data.start_point) {
          setStartLat(data.start_point.latitude);
          setStartLng(data.start_point.longitude);
          setStartLandmark(data.start_point.landmark || 'Origin Junction');
        }
        if (data.end_point) {
          setEndLat(data.end_point.latitude);
          setEndLng(data.end_point.longitude);
          setEndLandmark(data.end_point.landmark || 'Terminus Interchange');
        }
        if (data.intermediate_waypoints) {
          setWaypoints(data.intermediate_waypoints);
        }
        if (data.geojson_corridor) {
          setRawGeoJSON(JSON.stringify(data.geojson_corridor, null, 2));
        }
      })
      .catch((err) => {
        if (!mounted) return;
        console.warn('Could not fetch existing corridor, defaulting form:', err.message);
        setCorridorName(`Corridor Alignment: ${caseTitle}`);
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [isOpen, caseId, caseTitle]);

  if (!isOpen) return null;

  const handleAddWaypoint = () => {
    // Interpolate midpoint or default
    const midLat = (startLat + endLat) / 2 + (Math.random() - 0.5) * 0.01;
    const midLng = (startLng + endLng) / 2 + (Math.random() - 0.5) * 0.01;
    setWaypoints((prev) => [
      ...prev,
      { latitude: Number(midLat.toFixed(6)), longitude: Number(midLng.toFixed(6)), name: `Waypoint #${prev.length + 1}` },
    ]);
  };

  const handleRemoveWaypoint = (idx: number) => {
    setWaypoints((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      let geojsonToSave: any = undefined;

      if (activeMode === 'geojson' && rawGeoJSON.trim()) {
        try {
          geojsonToSave = JSON.parse(rawGeoJSON);
        } catch (jErr: any) {
          throw new Error(`Invalid GeoJSON syntax: ${jErr.message}`);
        }
      }

      const payload: Partial<ProjectCorridorDetails> = {
        corridor_name: corridorName.trim() || `Corridor Alignment: ${caseTitle}`,
        corridor_type: corridorType,
        total_length_km: Number(totalLengthKm) || 25,
        right_of_way_width_meters: Number(rowWidthMeters) || 60,
        sponsoring_agency: sponsoringAgency.trim(),
        start_point: {
          latitude: Number(startLat),
          longitude: Number(startLng),
          landmark: startLandmark,
        },
        end_point: {
          latitude: Number(endLat),
          longitude: Number(endLng),
          landmark: endLandmark,
        },
        intermediate_waypoints: waypoints,
        geojson_corridor: geojsonToSave,
      };

      const res = await updateCaseCorridor(caseId, payload);
      setSuccessMsg(res.message || 'Project corridor details updated and projected to GIS map successfully!');
      onCorridorUpdated?.(res.corridor);

      setTimeout(() => {
        onClose();
      }, 900);
    } catch (err: any) {
      setError(err.message || 'Failed to save project corridor details');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* ========================================================================= */}
        {/* PINNED MODAL HEADER */}
        {/* ========================================================================= */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 text-gov-navy border border-blue-200 rounded-lg">
              <Navigation className="h-5 w-5 text-gov-navy" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-gov-slate">
                  Project Corridor &amp; Alignment Configuration
                </h3>
                <Badge variant="navy">GIS LAYER</Badge>
              </div>
              <p className="text-[11px] text-slate-500">
                Demarcate and view sovereign linear alignment &amp; Right-of-Way buffer for: <strong className="text-gov-navy">{caseTitle}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ========================================================================= */}
        {/* SCROLLABLE MODAL BODY */}
        {/* ========================================================================= */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>{error}</div>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-2.5 text-xs text-emerald-700">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <div>{successMsg}</div>
            </div>
          )}

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-lg">
              <span className="text-[10px] text-slate-500 uppercase font-semibold block">Corridor Type</span>
              <strong className="text-xs font-bold text-gov-navy capitalize">{corridorType.replace(/_/g, ' ')}</strong>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <span className="text-[10px] text-slate-500 uppercase font-semibold block">Span Length</span>
              <strong className="text-xs font-bold text-gov-slate">{totalLengthKm} km</strong>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <span className="text-[10px] text-slate-500 uppercase font-semibold block">RoW Buffer Width</span>
              <strong className="text-xs font-bold text-gov-slate">{rowWidthMeters} meters</strong>
            </div>
            <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-lg">
              <span className="text-[10px] text-slate-500 uppercase font-semibold block">Est. Corridor Area</span>
              <strong className="text-xs font-bold text-emerald-800">
                {((totalLengthKm * 1000 * rowWidthMeters) / 10000).toFixed(1)} Ha
              </strong>
            </div>
          </div>

          {/* Mode Switcher */}
          <div className="flex border-b border-slate-200 text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveMode('coordinates')}
              className={`flex items-center gap-1.5 py-2 px-4 border-b-2 font-semibold transition-colors cursor-pointer ${
                activeMode === 'coordinates'
                  ? 'border-gov-navy text-gov-navy'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Globe className="h-3.5 w-3.5" />
              <span>Alignment Geodetic Points &amp; Buffer</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveMode('geojson')}
              className={`flex items-center gap-1.5 py-2 px-4 border-b-2 font-semibold transition-colors cursor-pointer ${
                activeMode === 'geojson'
                  ? 'border-gov-navy text-gov-navy'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <FileCode className="h-3.5 w-3.5" />
              <span>Direct GeoJSON Geometry</span>
            </button>
          </div>

          {/* Mode 1: Interactive Alignment Configuration */}
          {activeMode === 'coordinates' && (
            <div className="space-y-4">
              {/* General Metadata */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Corridor / Alignment Name
                  </label>
                  <input
                    type="text"
                    value={corridorName}
                    onChange={(e) => setCorridorName(e.target.value)}
                    placeholder="e.g. Ring Road Phase-IV Expressway Package"
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-gov-navy"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Infrastructure Corridor Classification
                  </label>
                  <select
                    value={corridorType}
                    onChange={(e) => setCorridorType(e.target.value as any)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:ring-1 focus:ring-gov-navy"
                  >
                    <option value="highway">National / State Highway (NH/SH)</option>
                    <option value="expressway">Access-Controlled Expressway</option>
                    <option value="railway">Railway / Dedicated Freight Corridor (DFC)</option>
                    <option value="metro">Metro Rail / Mass Rapid Transit (MRTS)</option>
                    <option value="pipeline">Gas / Water Transmission Pipeline</option>
                    <option value="transmission_line">High-Voltage Power Transmission Line</option>
                    <option value="industrial">Industrial Infrastructure Corridor</option>
                    <option value="ring_road">Urban Peripheral Ring Road</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Sponsoring Agency / Authority
                  </label>
                  <input
                    type="text"
                    value={sponsoringAgency}
                    onChange={(e) => setSponsoringAgency(e.target.value)}
                    placeholder="e.g. NHAI / Ministry of Road Transport & Highways"
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-gov-navy"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Right of Way (RoW) Width: <strong className="text-gov-navy">{rowWidthMeters}m</strong>
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="20"
                      max="300"
                      step="5"
                      value={rowWidthMeters}
                      onChange={(e) => setRowWidthMeters(Number(e.target.value))}
                      className="flex-1 accent-gov-navy cursor-pointer"
                    />
                    <span className="text-xs font-mono font-bold text-slate-600 w-12 text-right">{rowWidthMeters}m</span>
                  </div>
                </div>
              </div>

              {/* Endpoints */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-gov-slate uppercase tracking-wider">
                  <MapPin className="h-3.5 w-3.5 text-gov-navy" />
                  <span>Geodetic Alignment Anchor Coordinates</span>
                </div>

                {/* Start Point */}
                <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <strong className="text-gov-navy font-semibold">1. Origin Anchor (Start Point)</strong>
                    <span className="text-[10px] text-slate-400 font-mono">WGS84</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Latitude</span>
                      <input
                        type="number"
                        step="0.000001"
                        value={startLat}
                        onChange={(e) => setStartLat(Number(e.target.value))}
                        className="w-full px-2 py-1 border border-slate-200 rounded text-xs font-mono"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Longitude</span>
                      <input
                        type="number"
                        step="0.000001"
                        value={startLng}
                        onChange={(e) => setStartLng(Number(e.target.value))}
                        className="w-full px-2 py-1 border border-slate-200 rounded text-xs font-mono"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Landmark / Chainage</span>
                      <input
                        type="text"
                        value={startLandmark}
                        onChange={(e) => setStartLandmark(e.target.value)}
                        className="w-full px-2 py-1 border border-slate-200 rounded text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* Intermediate Waypoints */}
                {waypoints.map((wp, idx) => (
                  <div key={idx} className="bg-blue-50/40 p-3 rounded-lg border border-blue-100 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <strong className="text-gov-navy font-semibold">Waypoint #{idx + 1}</strong>
                      <button
                        type="button"
                        onClick={() => handleRemoveWaypoint(idx)}
                        className="text-rose-600 hover:text-rose-800 p-1 cursor-pointer"
                        title="Remove waypoint"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Latitude</span>
                        <input
                          type="number"
                          step="0.000001"
                          value={wp.latitude}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setWaypoints((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, latitude: val } : item))
                            );
                          }}
                          className="w-full px-2 py-1 border border-slate-200 rounded text-xs font-mono bg-white"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Longitude</span>
                        <input
                          type="number"
                          step="0.000001"
                          value={wp.longitude}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setWaypoints((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, longitude: val } : item))
                            );
                          }}
                          className="w-full px-2 py-1 border border-slate-200 rounded text-xs font-mono bg-white"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Waypoint Name</span>
                        <input
                          type="text"
                          value={wp.name || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setWaypoints((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, name: val } : item))
                            );
                          }}
                          className="w-full px-2 py-1 border border-slate-200 rounded text-xs bg-white"
                        />
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={handleAddWaypoint}
                  className="w-full py-1.5 border border-dashed border-blue-300 hover:border-blue-500 rounded-lg text-xs font-semibold text-gov-navy bg-white hover:bg-blue-50 flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Intermediate Alignment Waypoint</span>
                </button>

                {/* Terminus Anchor */}
                <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <strong className="text-gov-navy font-semibold">2. Terminus Anchor (End Point)</strong>
                    <span className="text-[10px] text-slate-400 font-mono">WGS84</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Latitude</span>
                      <input
                        type="number"
                        step="0.000001"
                        value={endLat}
                        onChange={(e) => setEndLat(Number(e.target.value))}
                        className="w-full px-2 py-1 border border-slate-200 rounded text-xs font-mono"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Longitude</span>
                      <input
                        type="number"
                        step="0.000001"
                        value={endLng}
                        onChange={(e) => setEndLng(Number(e.target.value))}
                        className="w-full px-2 py-1 border border-slate-200 rounded text-xs font-mono"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Landmark / Chainage</span>
                      <input
                        type="text"
                        value={endLandmark}
                        onChange={(e) => setEndLandmark(e.target.value)}
                        className="w-full px-2 py-1 border border-slate-200 rounded text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Mode 2: Direct GeoJSON Paste / Upload */}
          {activeMode === 'geojson' && (
            <div className="space-y-3 text-xs">
              <p className="text-slate-600 text-[11px]">
                Paste compliant GeoJSON Polygon, MultiPolygon, or LineString. The geometry will be projected as the primary acquisition corridor boundary.
              </p>
              <textarea
                rows={10}
                value={rawGeoJSON}
                onChange={(e) => setRawGeoJSON(e.target.value)}
                placeholder='{ "type": "Polygon", "coordinates": [[[73.85, 18.52], [73.86, 18.53], [73.87, 18.52], [73.85, 18.52]]] }'
                className="w-full p-3 font-mono text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-gov-navy"
              />
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* PINNED MODAL FOOTER */}
        {/* ========================================================================= */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/80">
          <div className="text-[11px] text-slate-500">
            Changes immediately refresh and project the corridor on the GIS map layer.
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              isLoading={isSaving}
              leftIcon={<CheckCircle2 className="h-4 w-4" />}
            >
              Save &amp; Render Project Corridor in GIS
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
