import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { fetchCaseGIS, CaseGISResponse, resolveBhuvanLayers } from '../../lib/api';
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
} from 'lucide-react';

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

    // Default center: India center or fallback
    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: true,
    }).setView([20.5937, 78.9629], 5);

    const { tileLayer } = createBasemapTileLayer({}, undefined, L);
    tileLayer.addTo(map);

    // Add zoom control to top-right
    L.control.zoom({ position: 'topright' }).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

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
              Import standard GeoJSON geometry or demarcate individual parcels.
            </p>
            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                onClick={onOpenImportBoundary}
                leftIcon={<Upload className="h-4 w-4" />}
              >
                Import Case GeoJSON Corridor
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
                  <p className="text-[10px] text-slate-500 italic mt-1 pt-1 border-t border-red-200">
                    Calculated dynamically via polygon clipping. Non-destructive advisory evidence.
                  </p>
                </div>
              ) : selectedFeatureProps.type === 'related_case_boundary' ? (
                <div className="space-y-1.5 pt-1 text-[11px]">
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
                </div>
              ) : selectedFeatureProps.type === 'boundary' ? (
                <div className="space-y-1.5 pt-1 text-[11px]">
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
    </div>
  );
};
