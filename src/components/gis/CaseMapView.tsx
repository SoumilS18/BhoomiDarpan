import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  fetchCaseGIS,
  CaseGISResponse,
  resolveBhuvanLayers,
  resolveSpatialConflict,
  simulateSpatialResolution,
} from '../../lib/api';
import { SpatialResolutionSimulation } from '../../../shared/types';
import { createBasemapTileLayer } from '../../lib/mapProvider';
import { PARCEL_STATUS_COLORS, getBoundsFromGeoJSON } from '../../../shared/utils/geojson';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import {
  Layers,
  Maximize2,
  Upload,
  Plus,
  Info,
  CheckCircle,
  AlertCircle,
  MapPin,
  RefreshCw,
  ShieldAlert,
  Gavel,
  Compass,
  Check,
  X,
  Sparkles,
  FileText,
  SlidersHorizontal,
  ArrowRight,
  IndianRupee,
  Navigation,
} from 'lucide-react';
import { StatutoryAwardModal } from '../cases/StatutoryAwardModal';
import { ProjectCorridorModal } from './ProjectCorridorModal';

interface CaseMapViewProps {
  caseId: string;
  caseTitle: string;
  onOpenImportBoundary: () => void;
  onOpenAddParcel: () => void;
  onSelectParcel?: (parcelId: string) => void;
  selectedParcelId?: string;
  refreshTrigger?: number;
}

export const CaseMapView: React.FC<CaseMapViewProps> = ({
  caseId,
  caseTitle,
  onOpenImportBoundary,
  onOpenAddParcel,
  onSelectParcel,
  selectedParcelId,
  refreshTrigger = 0,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const geojsonLayerRef = useRef<L.GeoJSON | null>(null);

  const [gisData, setGisData] = useState<CaseGISResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFeatureProps, setSelectedFeatureProps] = useState<any | null>(null);
  const [showLegend, setShowLegend] = useState(true);
  const [showBhuvan, setShowBhuvan] = useState(false);
  const [bhuvanLoading, setBhuvanLoading] = useState(false);
  const [bhuvanLayerInfo, setBhuvanLayerInfo] = useState<string | null>(null);
  const bhuvanWmsLayerRef = useRef<L.TileLayer.WMS | null>(null);
  const [baseMap, setBaseMap] = useState<string>('osm');
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  // Resolution modal state
  const [resolutionModalOpen, setResolutionModalOpen] = useState(false);
  const [isAwardModalOpen, setIsAwardModalOpen] = useState(false);
  const [isCorridorModalOpen, setIsCorridorModalOpen] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<'boundary_offset_clearance' | 'joint_award_alignment' | 'phased_acquisition_taking'>('boundary_offset_clearance');
  const [shiftDirection, setShiftDirection] = useState<'Eastward' | 'Westward' | 'Northward' | 'Southward'>('Eastward');
  const [customBufferMeters, setCustomBufferMeters] = useState<string>('');
  const [simulationResult, setSimulationResult] = useState<SpatialResolutionSimulation | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [orderReference, setOrderReference] = useState('SEC11/LAO/2026/04');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [isSubmittingResolution, setIsSubmittingResolution] = useState(false);
  const [resolutionError, setResolutionError] = useState<string | null>(null);
  const [resolutionSuccessMsg, setResolutionSuccessMsg] = useState<string | null>(null);

  // Trigger live simulation
  const runSimulation = async (
    strategy = selectedStrategy,
    direction = shiftDirection,
    buffer = customBufferMeters
  ) => {
    const relatedId =
      selectedFeatureProps?.related_case_id ||
      selectedFeatureProps?.target_case_id ||
      'case-adjacent';

    try {
      setIsSimulating(true);
      const res = await simulateSpatialResolution(caseId, {
        related_case_id: relatedId,
        strategy_type: strategy,
        shift_direction: direction,
        buffer_meters: buffer ? Number(buffer) : undefined,
      });
      setSimulationResult(res);
      if (res.shift_direction && ['Eastward', 'Westward', 'Northward', 'Southward'].includes(res.shift_direction)) {
        setShiftDirection(res.shift_direction as any);
      }
      if (!buffer && res.buffer_meters) {
        setCustomBufferMeters(String(res.buffer_meters));
      }
    } catch (err: any) {
      console.warn('Simulation failed:', err.message);
    } finally {
      setIsSimulating(false);
    }
  };

  useEffect(() => {
    if (resolutionModalOpen) {
      runSimulation(selectedStrategy, shiftDirection, customBufferMeters);
    }
  }, [resolutionModalOpen, selectedStrategy, shiftDirection]);

  // Load GIS data
  const loadGIS = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchCaseGIS(caseId);
      setGisData(data);
      setIsLoading(false);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch GIS spatial data');
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadGIS();
  }, [caseId, refreshTrigger]);

  // Initialize and update Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Destroy existing map if it exists
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    // Default center: India center or fallback (Hardware-accelerated Canvas)
    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true,
      wheelDebounceTime: 40,
      wheelPxPerZoomLevel: 100,
      fadeAnimation: true,
      markerZoomAnimation: true,
    }).setView([20.5937, 78.9629], 5);

    // Add zoom control to top-right
    L.control.zoom({ position: 'topright' }).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      tileLayerRef.current = null;
    };
  }, []);

  // Update Basemap Tile Layer
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      try {
        map.removeLayer(tileLayerRef.current);
      } catch (e) {
        // ignore
      }
    }

    const { tileLayer } = createBasemapTileLayer({ provider: baseMap }, undefined, L);
    tileLayer.addTo(map);
    if (typeof (tileLayer as any).bringToBack === 'function') {
      (tileLayer as any).bringToBack();
    }
    tileLayerRef.current = tileLayer;
  }, [baseMap]);

  // Manage Bhuvan Thematic Overlay on Case Map
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (bhuvanWmsLayerRef.current) {
      map.removeLayer(bhuvanWmsLayerRef.current);
      bhuvanWmsLayerRef.current = null;
    }

    if (!showBhuvan) {
      setBhuvanLayerInfo(null);
      return;
    }

    const loadBhuvanOverlay = async () => {
      setBhuvanLoading(true);
      try {
        const caseState = gisData?.gis_data?.features?.find((f: any) => f?.properties?.state)?.properties?.state;
        const res = await resolveBhuvanLayers({
          state_names: caseState ? [caseState] : undefined,
          workspace: 'lulc',
        });

        const activeItem = res.resolved_layers.find(r => r.status === 'available');
        if (activeItem && activeItem.layer?.layer_name) {
          const wms = L.tileLayer.wms(activeItem.wms_url || 'https://bhuvan-vec2.nrsc.gov.in/bhuvan/wms', {
            layers: activeItem.layer.layer_name,
            format: 'image/png',
            transparent: true,
            opacity: 0.65,
            attribution: 'ISRO / NRSC Bhuvan',
          } as any);

          wms.addTo(map);
          bhuvanWmsLayerRef.current = wms;
          setBhuvanLayerInfo(`${activeItem.layer.title} (Reference: ${activeItem.layer.temporal_reference})`);
        } else {
          setBhuvanLayerInfo('Bhuvan LULC unavailable for this jurisdiction');
        }
      } catch (err: any) {
        console.warn('Failed to load Bhuvan overlay on case map:', err.message);
        setBhuvanLayerInfo('Failed to load Bhuvan overlay');
      } finally {
        setBhuvanLoading(false);
      }
    };

    loadBhuvanOverlay();
  }, [showBhuvan, gisData]);

  // Update GeoJSON Layers when gisData changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !gisData) return;

    // Remove previous geojson layer
    if (geojsonLayerRef.current) {
      map.removeLayer(geojsonLayerRef.current);
      geojsonLayerRef.current = null;
    }

    const features = gisData.gis_data.features;
    if (!features || features.length === 0) {
      // Default view if no features
      map.setView([20.5937, 78.9629], 5);
      return;
    }

    const geoLayer = L.geoJSON(gisData.gis_data as any, {
      style: (feature) => {
        if (!feature) return {};
        const props = feature.properties || {};

        if (props.layer_type === 'relationship_intersection') {
          return {
            color: '#dc2626', // Red
            weight: 3,
            dashArray: '4, 4',
            fillColor: '#ef4444',
            fillOpacity: 0.45,
          };
        }

        if (props.layer_type === 'related_case_boundary') {
          return {
            color: '#d97706', // Amber-600
            weight: 2.5,
            dashArray: '5, 5',
            fillColor: '#f59e0b',
            fillOpacity: 0.1,
          };
        }

        if (props.layer_type === 'case_boundary') {
          return {
            color: '#1e3a8a', // Deep Gov Navy
            weight: 3,
            dashArray: '6, 6',
            fillColor: '#3b82f6',
            fillOpacity: 0.12,
          };
        }

        // Parcel layer
        const status = props.acquisition_status || 'identified';
        const colorConfig = PARCEL_STATUS_COLORS[status] || PARCEL_STATUS_COLORS.identified;
        const isSelected = props.parcel_id === selectedParcelId;

        return {
          color: isSelected ? '#b91c1c' : colorConfig.stroke,
          weight: isSelected ? 3.5 : 2,
          fillColor: isSelected ? '#ef4444' : colorConfig.fill,
          fillOpacity: isSelected ? 0.65 : 0.4,
        };
      },
      onEachFeature: (feature, layer) => {
        const props = feature.properties || {};

        if (props.layer_type === 'relationship_intersection') {
          layer.bindTooltip(
            `<strong>⚠️ Spatial Overlap Zone:</strong> ${props.intersection_area_hectares} Ha (${props.overlap_pct}%)<br/>Intersecting Case: ${props.related_case_number}`,
            { sticky: true }
          );
          layer.on('click', () => {
            setSelectedFeatureProps({
              type: 'relationship_intersection',
              ...props,
            });
          });
        } else if (props.layer_type === 'related_case_boundary') {
          layer.bindTooltip(
            `<strong>Adjacent/Overlapping Case:</strong> ${props.related_case_number}<br/>Project: ${props.related_project_name}`,
            { sticky: true }
          );
          layer.on('click', () => {
            setSelectedFeatureProps({
              type: 'related_case_boundary',
              ...props,
            });
          });
        } else if (props.layer_type === 'case_boundary') {
          layer.bindTooltip(
            `<strong>Corridor Boundary:</strong> ${props.case_number || caseTitle}<br/>Area: ${props.total_area_hectares} Ha`,
            { sticky: true }
          );
          layer.on('click', () => {
            setSelectedFeatureProps({
              type: 'boundary',
              title: props.title || caseTitle,
              case_number: props.case_number,
              area: `${props.total_area_hectares} Hectares`,
            });
          });
        } else {
          // Parcel Feature
          const popupContent = `
            <div style="font-family: Inter, sans-serif; font-size: 12px; line-height: 1.4; color: #1e293b;">
              <div style="font-weight: 700; color: #1e3a8a; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 6px;">
                Survey No: ${props.survey_number}
              </div>
              <div><strong>Khata:</strong> ${props.khata_number || 'N/A'}</div>
              <div><strong>Landowners:</strong> ${(props.landowner_names || []).join(', ') || 'Not recorded'}</div>
              <div><strong>Type:</strong> ${props.land_type || 'Not recorded'}</div>
              <div><strong>Area:</strong> ${props.area_acres} Acres</div>
              <div><strong>Status:</strong> <span style="text-transform: capitalize; font-weight: 600; color: ${props.color};">${props.acquisition_status}</span></div>
            </div>
          `;
          layer.bindPopup(popupContent);

          layer.on('click', () => {
            setSelectedFeatureProps({
              type: 'parcel',
              ...props,
            });
            if (onSelectParcel && props.parcel_id) {
              onSelectParcel(props.parcel_id);
            }
          });
        }
      },
    }).addTo(map);

    geojsonLayerRef.current = geoLayer;

    // Auto-fit map bounds
    try {
      const bounds = geoLayer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
      } else {
        const customBounds = getBoundsFromGeoJSON(gisData.gis_data);
        if (customBounds) {
          map.fitBounds(customBounds as any, { padding: [40, 40] });
        }
      }
    } catch (e) {
      console.warn('Could not auto-fit bounds:', e);
    }
  }, [gisData, selectedParcelId]);

  const handleFitBounds = () => {
    const map = mapInstanceRef.current;
    const layer = geojsonLayerRef.current;
    if (map && layer) {
      try {
        const bounds = layer.getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [40, 40] });
        }
      } catch (err) {
        console.warn('Error fitting bounds:', err);
      }
    }
  };

  const hasAnyGeometry = gisData?.has_geometry || false;

  return (
    <div className="relative rounded-xl border border-slate-200 overflow-hidden bg-slate-900 shadow-sm flex flex-col md:flex-row h-[620px]">
      {/* Map Canvas */}
      <div className="flex-1 relative h-full">
        <div ref={mapContainerRef} className="w-full h-full z-0 bg-slate-100" />

        {/* Bhuvan Disclaimer Badge */}
        {showBhuvan && (
          <div className="absolute bottom-3 left-3 z-10 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-lg px-2.5 py-1 text-[10px] text-slate-600 shadow-sm flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span>{bhuvanLayerInfo || 'Bhuvan LULC Reference Overlay'}</span>
            <span className="text-slate-300">•</span>
            <span className="text-slate-400">Not cadastral ground truth</span>
          </div>
        )}

        {/* Floating Top Controls */}
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadGIS}
            className="bg-white/95 backdrop-blur-sm shadow-sm hover:bg-white text-slate-700"
            leftIcon={<RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />}
          >
            Refresh GIS
          </Button>

          {/* Basemap Selection */}
          <div className="flex items-center rounded-lg border border-slate-200 bg-white/95 p-0.5 text-xs shadow-sm backdrop-blur-sm">
            <button
              type="button"
              onClick={() => setBaseMap('osm')}
              className={`rounded px-2 py-1 font-medium text-xs transition-colors ${
                baseMap === 'osm' ? 'bg-gov-navy text-white font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              OSM
            </button>
            <button
              type="button"
              onClick={() => setBaseMap('positron')}
              className={`rounded px-2 py-1 font-medium text-xs transition-colors ${
                baseMap === 'positron' ? 'bg-gov-navy text-white font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Positron
            </button>
            <button
              type="button"
              onClick={() => setBaseMap('dark')}
              className={`rounded px-2 py-1 font-medium text-xs transition-colors ${
                baseMap === 'dark' ? 'bg-gov-navy text-white font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Dark
            </button>
            <button
              type="button"
              onClick={() => setBaseMap('satellite')}
              className={`rounded px-2 py-1 font-medium text-xs transition-colors ${
                baseMap === 'satellite' ? 'bg-emerald-700 text-white font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Satellite
            </button>
            <button
              type="button"
              onClick={() => setBaseMap('topo')}
              className={`rounded px-2 py-1 font-medium text-xs transition-colors ${
                baseMap === 'topo' ? 'bg-gov-navy text-white font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Topo
            </button>
          </div>

          {hasAnyGeometry && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleFitBounds}
              className="bg-white/95 backdrop-blur-sm shadow-sm hover:bg-white text-slate-700"
              leftIcon={<Maximize2 className="h-3.5 w-3.5" />}
            >
              Fit to Corridor
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowLegend(!showLegend)}
            className="bg-white/95 backdrop-blur-sm shadow-sm hover:bg-white text-slate-700"
            leftIcon={<Layers className="h-3.5 w-3.5" />}
          >
            {showLegend ? 'Hide Legend' : 'Show Legend'}
          </Button>

          {/* Bhuvan LULC Toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowBhuvan(!showBhuvan)}
            className={`backdrop-blur-sm shadow-sm transition-all font-medium ${
              showBhuvan
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                : 'bg-white/95 text-slate-700 hover:bg-white'
            }`}
            leftIcon={<RefreshCw className={`h-3.5 w-3.5 ${bhuvanLoading ? 'animate-spin text-emerald-600' : ''}`} />}
          >
            Bhuvan LULC (2015–16)
          </Button>
        </div>

        {/* Floating Action Buttons (Top Right) */}
        <div className="absolute top-3 right-14 z-10 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsCorridorModalOpen(true)}
            className="bg-white/95 backdrop-blur-sm shadow-sm hover:bg-white text-gov-navy font-semibold"
            leftIcon={<Navigation className="h-3.5 w-3.5 text-blue-600" />}
          >
            Project Corridor Details
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenImportBoundary}
            className="bg-white/95 backdrop-blur-sm shadow-sm hover:bg-white text-gov-navy font-semibold"
            leftIcon={<Upload className="h-3.5 w-3.5" />}
          >
            Import GeoJSON
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onOpenAddParcel}
            className="shadow-sm font-semibold"
            leftIcon={<Plus className="h-3.5 w-3.5" />}
          >
            Demarcate Parcel
          </Button>
        </div>

        {/* Empty State Overlay */}
        {!isLoading && !hasAnyGeometry && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center z-10">
            <div className="h-12 w-12 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center text-gov-navy mb-3">
              <MapPin className="h-6 w-6" />
            </div>
            <h4 className="text-base font-bold text-gov-slate">No Spatial Geometry Demarcated</h4>
            <p className="text-xs text-slate-500 max-w-md mt-1 mb-4">
              This case currently has no digital corridor boundary or georeferenced cadastral parcels.
              Configure project corridor alignment parameters, import standard GeoJSON geometry, or demarcate individual parcels.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button
                variant="primary"
                onClick={() => setIsCorridorModalOpen(true)}
                leftIcon={<Navigation className="h-4 w-4" />}
              >
                Configure Project Corridor Details
              </Button>
              <Button
                variant="outline"
                onClick={onOpenImportBoundary}
                leftIcon={<Upload className="h-4 w-4" />}
              >
                Import Case GeoJSON
              </Button>
              <Button
                variant="outline"
                onClick={onOpenAddParcel}
                leftIcon={<Plus className="h-4 w-4" />}
              >
                Add Cadastral Parcel
              </Button>
            </div>
          </div>
        )}

        {/* Map Legend Overlay */}
        {showLegend && hasAnyGeometry && (
          <div className="absolute bottom-4 left-4 z-10 bg-white/95 backdrop-blur-sm rounded-lg p-3 border border-slate-200 shadow-md text-xs space-y-2 max-w-xs">
            <div className="font-bold text-gov-slate text-[11px] uppercase tracking-wider flex items-center justify-between border-b pb-1">
              <span>Cadastral Spatial Layers</span>
              <span className="text-[10px] text-slate-400 font-normal">WGS84</span>
            </div>
            <div className="space-y-1.5 text-[11px]">
              <div className="flex items-center gap-2">
                <span className="h-3 w-5 border-2 border-dashed border-[#1e3a8a] bg-blue-200/40 rounded-xs inline-block" />
                <span className="font-medium text-gov-slate">Acquisition Corridor Boundary</span>
              </div>
              {Object.entries(PARCEL_STATUS_COLORS).map(([statusKey, cfg]) => (
                <div key={statusKey} className="flex items-center gap-2">
                  <span
                    className="h-3 w-5 border rounded-xs inline-block"
                    style={{ borderColor: cfg.stroke, backgroundColor: cfg.fill, opacity: 0.8 }}
                  />
                  <span className="capitalize text-slate-600">{cfg.label}</span>
                </div>
              ))}
              <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                <span className="h-3 w-5 border-2 border-dashed border-[#d97706] bg-amber-200/40 rounded-xs inline-block" />
                <span className="font-medium text-amber-900">Adjacent / Candidate Corridor</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-3 w-5 border-2 border-dashed border-[#dc2626] bg-red-400/50 rounded-xs inline-block" />
                <span className="font-bold text-red-900">Calculated Overlap Zone</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Side Intelligence Panel */}
      <div className="w-full md:w-80 bg-white border-t md:border-t-0 md:border-l border-slate-200 p-4 flex flex-col justify-between overflow-y-auto z-10">
        <div className="space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h4 className="text-xs font-bold text-gov-slate uppercase tracking-wider">
              Spatial Intelligence
            </h4>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Live GIS status for case: <strong className="text-gov-navy">{caseTitle}</strong>
            </p>
          </div>

          {/* Vitals Summary */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              <span className="text-[10px] text-slate-500 block">Total Parcels</span>
              <strong className="text-gov-slate text-sm font-bold">
                {gisData?.total_parcels || 0}
              </strong>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              <span className="text-[10px] text-slate-500 block">Georeferenced</span>
              <strong className="text-gov-navy text-sm font-bold">
                {gisData?.parcels_with_geometry || 0}
              </strong>
            </div>
          </div>

          {/* Selected Feature Inspector */}
          {selectedFeatureProps ? (
            <div className={`rounded-lg p-3 border text-xs space-y-2 ${
              selectedFeatureProps.type === 'relationship_intersection'
                ? 'bg-red-50/70 border-red-200'
                : selectedFeatureProps.type === 'related_case_boundary'
                ? 'bg-amber-50/70 border-amber-200'
                : 'bg-blue-50/60 border-blue-200'
            }`}>
              <div className="flex items-center justify-between">
                <span className="font-bold text-gov-navy uppercase text-[10px] tracking-wider">
                  {selectedFeatureProps.type === 'relationship_intersection'
                    ? '⚠️ Spatial Overlap Zone'
                    : selectedFeatureProps.type === 'related_case_boundary'
                    ? 'Adjacent Corridor'
                    : selectedFeatureProps.type === 'boundary'
                    ? 'Corridor Inspection'
                    : 'Parcel Inspection'}
                </span>
                {selectedFeatureProps.acquisition_status && (
                  <Badge variant="navy">
                    {selectedFeatureProps.acquisition_status.toUpperCase()}
                  </Badge>
                )}
                {selectedFeatureProps.type === 'relationship_intersection' && (
                  <Badge variant="red">
                    COLLISION DETECTED
                  </Badge>
                )}
              </div>

              {selectedFeatureProps.type === 'relationship_intersection' ? (
                <div className="space-y-1.5 pt-1 text-[11px]">
                  <div>
                    <span className="text-red-700 font-semibold">Intersection Area:</span>
                    <strong className="block text-red-950 font-mono text-xs">
                      {selectedFeatureProps.intersection_area_hectares} Hectares ({selectedFeatureProps.overlap_pct}%)
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-600">Intersecting Case:</span>
                    <strong className="block font-mono text-gov-navy">
                      {selectedFeatureProps.related_case_number}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-600">Sponsoring Project:</span>
                    <strong className="block text-gov-slate">
                      {selectedFeatureProps.related_project_name}
                    </strong>
                  </div>
                  {selectedFeatureProps.shared_survey_numbers?.length > 0 && (
                    <div>
                      <span className="text-slate-600">Shared Survey Numbers:</span>
                      <strong className="block font-mono text-red-700">
                        {selectedFeatureProps.shared_survey_numbers.join(', ')}
                      </strong>
                    </div>
                  )}

                  {selectedFeatureProps.alternative_solutions?.length > 0 && (
                    <div className="pt-2 border-t border-red-200/60 space-y-1.5">
                      <span className="text-[10px] font-bold text-gov-navy uppercase tracking-wider block">
                        Recommended Alternative Spacing:
                      </span>
                      {selectedFeatureProps.alternative_solutions.map((sol: any, sIdx: number) => (
                        <div key={sIdx} className="bg-white p-2 rounded border border-red-100 text-[10px] space-y-0.5">
                          <div className="flex items-center justify-between font-semibold text-slate-800">
                            <span>{sol.strategy_name}</span>
                            {sol.recommended_buffer_meters && (
                              <span className="text-blue-700 font-mono bg-blue-50 px-1 rounded">
                                +{sol.recommended_buffer_meters}m {sol.clearance_direction || ''}
                              </span>
                            )}
                          </div>
                          <p className="text-slate-600 text-[9px]">{sol.justification}</p>
                          <div className="text-[9px] text-emerald-700 font-medium">
                            Retains {sol.retained_area_hectares} Ha ({sol.retained_area_percentage}%)
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Direct Resolve Action */}
                  <div className="pt-2 border-t border-red-200">
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        setResolutionError(null);
                        setResolutionModalOpen(true);
                      }}
                      className="w-full justify-center text-xs font-semibold bg-red-600 hover:bg-red-700 text-white shadow-xs flex items-center gap-1.5"
                    >
                      <ShieldAlert className="h-3.5 w-3.5" />
                      <span>Resolve Spatial Conflict</span>
                    </Button>
                  </div>
                </div>
              ) : selectedFeatureProps.type === 'related_case_boundary' ? (
                <div className="space-y-2 pt-1 text-[11px]">
                  <div>
                    <span className="text-slate-500">Related Case Reference:</span>
                    <strong className="block font-mono text-gov-navy">
                      {selectedFeatureProps.related_case_number}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Sponsoring Project:</span>
                    <strong className="block text-gov-slate">
                      {selectedFeatureProps.related_project_name}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Relationship Type:</span>
                    <strong className="block text-amber-900 capitalize">
                      {(selectedFeatureProps.relationship_type || '').replace(/_/g, ' ')}
                    </strong>
                  </div>
                  <div className="pt-2 border-t border-amber-200">
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        setResolutionError(null);
                        setResolutionModalOpen(true);
                      }}
                      className="w-full justify-center text-xs font-semibold bg-red-600 hover:bg-red-700 text-white shadow-xs flex items-center gap-1.5"
                    >
                      <ShieldAlert className="h-3.5 w-3.5" />
                      <span>Resolve Corridor Collision</span>
                    </Button>
                  </div>
                </div>
              ) : selectedFeatureProps.type === 'boundary' ? (
                <div className="space-y-2 pt-1 text-[11px]">
                  <div>
                    <span className="text-slate-500">Corridor Title:</span>
                    <strong className="block text-gov-slate">{selectedFeatureProps.title}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Case Reference:</span>
                    <strong className="block font-mono text-gov-navy">{selectedFeatureProps.case_number}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Acquisition Area:</span>
                    <strong className="block text-gov-slate">{selectedFeatureProps.area}</strong>
                  </div>
                  <div className="pt-2 border-t border-blue-200">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setIsCorridorModalOpen(true)}
                      className="w-full justify-center text-xs font-semibold shadow-xs flex items-center gap-1.5"
                    >
                      <Navigation className="h-3.5 w-3.5" />
                      <span>Project Corridor Details</span>
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5 pt-1 text-[11px]">
                  <div>
                    <span className="text-slate-500">Survey Number:</span>
                    <strong className="block font-mono text-gov-navy font-bold">
                      {selectedFeatureProps.survey_number}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Khata / Record:</span>
                    <strong className="block font-mono text-gov-slate">
                      {selectedFeatureProps.khata_number || 'N/A'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Landowners:</span>
                    <strong className="block text-gov-slate">
                      {(selectedFeatureProps.landowner_names || []).join(', ') || 'N/A'}
                    </strong>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <span className="text-slate-500">Classification:</span>
                      <strong className="block text-gov-slate">{selectedFeatureProps.land_type}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500">Area:</span>
                      <strong className="block text-gov-slate">{selectedFeatureProps.area_acres} Acres</strong>
                    </div>
                  </div>
                  {selectedFeatureProps.compensation_amount && (
                    <div>
                      <span className="text-slate-500">Compensation:</span>
                      <strong className="block text-gov-slate">
                        ₹{Number(selectedFeatureProps.compensation_amount).toLocaleString('en-IN')}
                      </strong>
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-100">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsAwardModalOpen(true)}
                      className="w-full justify-center text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border-emerald-200 flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      <IndianRupee className="h-3.5 w-3.5 text-emerald-700" />
                      <span>Statutory Award Statement (Form-11)</span>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-slate-50 p-3 rounded-lg border border-dashed border-slate-300 text-center text-xs text-slate-500">
              <Info className="h-4 w-4 mx-auto mb-1 text-slate-400" />
              Click any parcel, corridor boundary, or overlap collision zone on the map to inspect evidence.
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenImportBoundary}
            className="w-full justify-center text-xs"
            leftIcon={<Upload className="h-3.5 w-3.5" />}
          >
            Update Case Boundary
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onOpenAddParcel}
            className="w-full justify-center text-xs"
            leftIcon={<Plus className="h-3.5 w-3.5" />}
          >
            Add New Cadastral Parcel
          </Button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ========================================================================= */}
      {/* INTERACTIVE SPATIAL RESOLUTION MODAL */}
      {/* ========================================================================= */}
      {resolutionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-3 sm:p-5 overflow-hidden animate-in fade-in duration-150">
          <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200/90 flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Pinned Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white/95 backdrop-blur-sm shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-gradient-to-br from-red-500/10 to-amber-500/10 border border-red-200/60 rounded-xl text-red-600 shadow-2xs">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                    <span>Resolve Spatial &amp; Cadastral Conflict</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700 border border-red-200">
                      Active Conflict
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    RFCTLARR Act statutory realignment, joint inquiry, and schedule synchronization
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setResolutionModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 p-2 rounded-full transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Scrollable Modal Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 custom-scrollbar">
              {/* Conflict Relationship Banner */}
              <div className="bg-gradient-to-r from-slate-50 via-slate-50 to-red-50/30 p-4 rounded-xl border border-slate-200/80 shadow-2xs space-y-2.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <span>Corridor Intersection Context</span>
                  {selectedFeatureProps?.intersection_area_hectares && (
                    <span className="text-red-700 font-bold font-mono">
                      Overlap: {selectedFeatureProps.intersection_area_hectares} Ha ({selectedFeatureProps.overlap_pct}%)
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-lg border border-slate-200 shadow-2xs font-mono">
                    <span className="text-slate-400 text-[10px] font-sans font-semibold uppercase">Source:</span>
                    <strong className="text-gov-navy font-bold">{caseTitle}</strong>
                  </div>

                  <div className="p-1 rounded-full bg-red-100 text-red-600">
                    <ArrowRight className="h-3.5 w-3.5" />
                  </div>

                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50/80 rounded-lg border border-red-200 shadow-2xs font-mono">
                    <span className="text-red-400 text-[10px] font-sans font-semibold uppercase">Colliding:</span>
                    <strong className="text-red-800 font-bold">
                      {selectedFeatureProps?.related_case_number || 'Adjacent Corridor'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Strategy Selection */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gov-slate uppercase tracking-wider">
                    Select Statutory Resolution Strategy
                  </label>
                  <span className="text-[11px] text-slate-400">Choose authorized protocol</span>
                </div>

                <div className="space-y-2.5">
                  <label
                    onClick={() => setSelectedStrategy('boundary_offset_clearance')}
                    className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all duration-150 ${
                      selectedStrategy === 'boundary_offset_clearance'
                        ? 'bg-blue-50/60 border-gov-navy shadow-sm ring-1 ring-gov-navy'
                        : 'bg-white border-slate-200 hover:bg-slate-50/80 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="strategy"
                      checked={selectedStrategy === 'boundary_offset_clearance'}
                      onChange={() => setSelectedStrategy('boundary_offset_clearance')}
                      className="mt-1 text-gov-navy"
                    />
                    <div className="text-xs space-y-1 flex-1">
                      <div className="flex items-center justify-between">
                        <strong className="text-slate-900 font-bold text-[13px]">
                          1. Corridor Clearance Offset (Physical Realignment)
                        </strong>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                          Recommended • Sec 11(1)
                        </span>
                      </div>
                      <p className="text-slate-500 text-[11px] leading-relaxed">
                        Physically realign the acquisition corridor coordinates to achieve complete zero overlap. Automatically recalculates GIS boundary geometries.
                      </p>
                    </div>
                  </label>

                  <label
                    onClick={() => setSelectedStrategy('joint_award_alignment')}
                    className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all duration-150 ${
                      selectedStrategy === 'joint_award_alignment'
                        ? 'bg-blue-50/60 border-gov-navy shadow-sm ring-1 ring-gov-navy'
                        : 'bg-white border-slate-200 hover:bg-slate-50/80 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="strategy"
                      checked={selectedStrategy === 'joint_award_alignment'}
                      onChange={() => setSelectedStrategy('joint_award_alignment')}
                      className="mt-1 text-gov-navy"
                    />
                    <div className="text-xs space-y-1 flex-1">
                      <div className="flex items-center justify-between">
                        <strong className="text-slate-900 font-bold text-[13px]">
                          2. Joint Valuation &amp; Consolidated Award Schedule
                        </strong>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                          Sec 23 / 30
                        </span>
                      </div>
                      <p className="text-slate-500 text-[11px] leading-relaxed">
                        Conduct single joint inquiry under Section 23 with unified apportionment under Section 30 to prevent duplicate landowner disbursements.
                      </p>
                    </div>
                  </label>

                  <label
                    onClick={() => setSelectedStrategy('phased_acquisition_taking')}
                    className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all duration-150 ${
                      selectedStrategy === 'phased_acquisition_taking'
                        ? 'bg-blue-50/60 border-gov-navy shadow-sm ring-1 ring-gov-navy'
                        : 'bg-white border-slate-200 hover:bg-slate-50/80 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="strategy"
                      checked={selectedStrategy === 'phased_acquisition_taking'}
                      onChange={() => setSelectedStrategy('phased_acquisition_taking')}
                      className="mt-1 text-gov-navy"
                    />
                    <div className="text-xs space-y-1 flex-1">
                      <div className="flex items-center justify-between">
                        <strong className="text-slate-900 font-bold text-[13px]">
                          3. Phased Right-of-Way &amp; Possession Protocol
                        </strong>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                          Sec 38
                        </span>
                      </div>
                      <p className="text-slate-500 text-[11px] leading-relaxed">
                        Synchronize execution timelines: Primary linear corridor takes possession first, followed by secondary scheme taking.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Corridor Realignment Parameters (When strategy 1 is chosen) */}
              {selectedStrategy === 'boundary_offset_clearance' && (
                <div className="bg-gradient-to-b from-slate-50 to-slate-100/70 p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <SlidersHorizontal className="h-4 w-4 text-gov-navy" />
                      <span className="text-xs font-bold text-gov-slate uppercase tracking-wider">
                        Corridor Realignment Parameters
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomBufferMeters('');
                        runSimulation('boundary_offset_clearance', shiftDirection, '');
                      }}
                      className="text-[11px] font-semibold text-gov-navy hover:text-gov-blue hover:underline flex items-center gap-1.5 cursor-pointer bg-white px-2.5 py-1 rounded-md border border-slate-200 shadow-2xs"
                    >
                      <Sparkles className="h-3 w-3 text-amber-500" />
                      <span>Auto-Calculate Clearance</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                        Clearance Direction
                      </label>
                      <select
                        value={shiftDirection}
                        onChange={(e) => {
                          const dir = e.target.value as any;
                          setShiftDirection(dir);
                          runSimulation(selectedStrategy, dir, customBufferMeters);
                        }}
                        className="w-full text-xs font-medium bg-white border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-gov-navy/20 focus:border-gov-navy shadow-2xs"
                      >
                        <option value="Eastward">Eastward (+X Longitude)</option>
                        <option value="Westward">Westward (-X Longitude)</option>
                        <option value="Northward">Northward (+Y Latitude)</option>
                        <option value="Southward">Southward (-Y Latitude)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                        Shift Distance (Meters)
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min="5"
                          max="5000"
                          step="5"
                          value={customBufferMeters}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCustomBufferMeters(val);
                            runSimulation(selectedStrategy, shiftDirection, val);
                          }}
                          placeholder="Auto (Zero Overlap)"
                          className="w-full text-xs font-mono bg-white border border-slate-300 rounded-lg pl-3 pr-8 py-2 focus:ring-2 focus:ring-gov-navy/20 focus:border-gov-navy shadow-2xs"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-mono">
                          m
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Live Simulation & Feasibility Preview Card */}
              <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-4 rounded-xl border border-slate-800 shadow-xl ring-1 ring-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Compass className="h-4 w-4 text-emerald-400 animate-pulse" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                      Real-Time Feasibility &amp; Simulation Check
                    </span>
                  </div>
                  {isSimulating ? (
                    <span className="flex items-center gap-1.5 text-[11px] text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      <span>Evaluating...</span>
                    </span>
                  ) : simulationResult?.conflict_eliminated ? (
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5 shadow-xs">
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                      <span>100% Conflict Eliminated</span>
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1.5 shadow-xs">
                      <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
                      <span>Partial Clearance</span>
                    </span>
                  )}
                </div>

                {simulationResult && (
                  <div className="space-y-2.5 text-xs">
                    <div className="grid grid-cols-3 gap-2.5 bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 text-center">
                      <div className="p-1">
                        <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-0.5">
                          Initial Overlap
                        </span>
                        <strong className="text-red-400 font-mono text-sm">
                          {simulationResult.initial_overlap_hectares} Ha
                        </strong>
                      </div>
                      <div className="p-1 border-x border-slate-800">
                        <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-0.5">
                          Projected Overlap
                        </span>
                        <strong
                          className={`font-mono text-sm ${
                            simulationResult.projected_overlap_hectares === 0
                              ? 'text-emerald-400'
                              : 'text-amber-400'
                          }`}
                        >
                          {simulationResult.projected_overlap_hectares.toFixed(2)} Ha
                        </strong>
                      </div>
                      <div className="p-1">
                        <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-0.5">
                          Retained Footprint
                        </span>
                        <strong className="text-emerald-400 font-mono text-sm">
                          {simulationResult.retained_area_percentage}%
                        </strong>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-300 leading-relaxed bg-slate-900/60 p-2.5 rounded-lg border-l-2 border-emerald-500 border-slate-800/80">
                      {simulationResult.justification_summary}
                    </div>
                  </div>
                )}
              </div>

              {/* Form Inputs */}
              <div className="space-y-3.5">
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                    Statutory Order / Gazetted Corrigendum Reference <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={orderReference}
                      onChange={(e) => setOrderReference(e.target.value)}
                      placeholder="e.g. SEC11/LAO/2026/04"
                      className="w-full text-xs font-mono px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-gov-navy/20 focus:border-gov-navy shadow-2xs"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                    Officer Notes &amp; Statutory Justification (Optional)
                  </label>
                  <textarea
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    rows={2}
                    placeholder="Reasoning approved by Competent Authority / LAO..."
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-gov-navy/20 focus:border-gov-navy shadow-2xs resize-none"
                  />
                </div>
              </div>

              {resolutionError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                  <span>{resolutionError}</span>
                </div>
              )}
            </div>

            {/* Pinned Modal Footer */}
            <div className="px-6 py-4 bg-slate-50/95 backdrop-blur-sm border-t border-slate-200/90 flex items-center justify-between gap-3 shrink-0">
              <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 font-mono">
                {selectedStrategy === 'boundary_offset_clearance' && simulationResult?.buffer_meters ? (
                  <span>
                    Shift: <strong className="text-gov-navy">{simulationResult.buffer_meters}m {shiftDirection}</strong>
                  </span>
                ) : (
                  <span>Statutory Protocol Action</span>
                )}
              </div>

              <div className="flex items-center gap-2.5 ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setResolutionModalOpen(false)}
                  disabled={isSubmittingResolution}
                  className="text-xs px-4"
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={isSubmittingResolution || !orderReference.trim()}
                  onClick={async () => {
                    try {
                      setIsSubmittingResolution(true);
                      setResolutionError(null);

                      const relatedId =
                        selectedFeatureProps?.related_case_id ||
                        selectedFeatureProps?.target_case_id ||
                        'case-adjacent';

                      const res = await resolveSpatialConflict(caseId, {
                        related_case_id: relatedId,
                        strategy_type: selectedStrategy,
                        statutory_order_reference: orderReference.trim(),
                        notes: resolutionNotes.trim() || undefined,
                        buffer_meters: customBufferMeters ? Number(customBufferMeters) : undefined,
                        shift_direction: shiftDirection,
                      });

                      setResolutionModalOpen(false);
                      setResolutionSuccessMsg(res.message);
                      setSelectedFeatureProps(null);

                      // Reload live GIS layers to instantly reflect new boundary
                      await loadGIS();
                    } catch (err: any) {
                      setResolutionError(err.message || 'Failed to resolve conflict.');
                    } finally {
                      setIsSubmittingResolution(false);
                    }
                  }}
                  className="bg-gov-navy hover:bg-gov-blue text-white font-semibold text-xs px-4 shadow-sm"
                >
                  {isSubmittingResolution ? (
                    <span className="flex items-center gap-1.5">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Executing...</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <Check className="h-3.5 w-3.5" />
                      <span>Execute &amp; Apply Resolution</span>
                    </span>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success Notification Banner */}
      {resolutionSuccessMsg && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 bg-emerald-900/90 backdrop-blur-md text-white px-4 py-2.5 rounded-lg shadow-xl border border-emerald-500/40 flex items-center gap-2.5 text-xs animate-in slide-in-from-top duration-200">
          <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{resolutionSuccessMsg}</span>
          <button
            type="button"
            onClick={() => setResolutionSuccessMsg(null)}
            className="text-white/70 hover:text-white ml-2 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Statutory Award & Form-11 Decree Modal */}
      {selectedFeatureProps?.survey_number && (
        <StatutoryAwardModal
          isOpen={isAwardModalOpen}
          onClose={() => setIsAwardModalOpen(false)}
          caseId={caseId}
          parcel={{
            id: selectedFeatureProps.parcel_id || 'p1',
            case_id: caseId,
            survey_number: selectedFeatureProps.survey_number,
            khata_number: selectedFeatureProps.khata_number,
            landowner_names: selectedFeatureProps.landowner_names || [],
            land_type: selectedFeatureProps.land_type || 'agricultural',
            area_acres: selectedFeatureProps.area_acres || 1,
            compensation_amount: selectedFeatureProps.compensation_amount || 0,
            acquisition_status: 'valued',
            created_at: '',
          }}
          onAwardUpdated={async (updatedAward) => {
            selectedFeatureProps.compensation_amount = updatedAward.total_statutory_award;
            await loadGIS();
          }}
        />
      )}

      {/* Project Corridor Alignment Configuration & Inspection Modal */}
      <ProjectCorridorModal
        isOpen={isCorridorModalOpen}
        onClose={() => setIsCorridorModalOpen(false)}
        caseId={caseId}
        caseTitle={caseTitle}
        onCorridorUpdated={async () => {
          await loadGIS();
        }}
      />
    </div>
  );
};
