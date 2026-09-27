import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { PortfolioGeoItem } from '../../../shared/types';
import { createBasemapTileLayer } from '../../lib/mapProvider';
import { Badge } from '../common/Badge';
import { Layers, MapPin, Maximize2, ArrowRight, AlertTriangle, CheckCircle2, Info } from 'lucide-react';

interface PortfolioMapViewProps {
  geographicCases: PortfolioGeoItem[];
  onSelectCase: (caseId: string) => void;
}

export const PortfolioMapView: React.FC<PortfolioMapViewProps> = ({
  geographicCases,
  onSelectCase,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  const [selectedCase, setSelectedCase] = useState<PortfolioGeoItem | null>(null);

  const casesWithSpatialData = geographicCases.filter(
    (c) => Boolean(c.centroid) || Boolean(c.geojson_boundary)
  );

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    // Hardware-accelerated Canvas Map
    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true,
      wheelDebounceTime: 40,
      wheelPxPerZoomLevel: 100,
      fadeAnimation: true,
      markerZoomAnimation: true,
    }).setView([22.5, 82.0], 5);

    const { tileLayer } = createBasemapTileLayer({}, undefined, L);
    tileLayer.addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    layerGroupRef.current = layerGroup;
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  // Update Markers & Polygons when geographicCases change
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    const bounds = L.latLngBounds([]);

    const getRiskColor = (level: string) => {
      switch (level) {
        case 'critical':
          return '#dc2626'; // red-600
        case 'high':
          return '#d97706'; // amber-600
        case 'medium':
          return '#2563eb'; // blue-600
        default:
          return '#059669'; // emerald-600
      }
    };

    casesWithSpatialData.forEach((c) => {
      const color = getRiskColor(c.risk_level);

      // 1. Render Polygon Boundary if available
      if (c.geojson_boundary) {
        try {
          const geoLayer = L.geoJSON(c.geojson_boundary, {
            style: {
              color,
              weight: 2,
              opacity: 0.85,
              fillColor: color,
              fillOpacity: 0.2,
            },
            onEachFeature: (_, layer) => {
              layer.on('click', () => setSelectedCase(c));
            },
          });
          layerGroup.addLayer(geoLayer);
          bounds.extend(geoLayer.getBounds());
        } catch {
          // Ignore invalid geometry
        }
      }

      // 2. Render Centroid Marker
      if (c.centroid && Array.isArray(c.centroid)) {
        const [lat, lng] = c.centroid;
        const marker = L.circleMarker([lat, lng], {
          radius: c.risk_level === 'critical' ? 10 : 8,
          fillColor: color,
          color: '#ffffff',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.9,
        });

        marker.on('click', () => {
          setSelectedCase(c);
        });

        // Popup
        marker.bindPopup(`
          <div style="font-family: inherit; font-size: 11px; line-height: 1.4; min-width: 180px;">
            <div style="font-family: monospace; font-weight: bold; color: #1e3a8a;">${c.case_number}</div>
            <strong style="font-size: 12px; display: block; margin: 2px 0;">${c.title}</strong>
            <div style="color: #64748b;">${c.village}, ${c.district}, ${c.state}</div>
            <div style="margin-top: 6px; display: flex; gap: 4px;">
              <span style="background: ${color}20; color: ${color}; font-weight: bold; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">
                ${c.risk_level} Risk
              </span>
              ${c.net_delay_days > 0 ? `<span style="background: #fef2f2; color: #dc2626; font-weight: bold; padding: 2px 6px; border-radius: 4px;">+${c.net_delay_days}d delay</span>` : ''}
            </div>
          </div>
        `);

        layerGroup.addLayer(marker);
        bounds.extend([lat, lng]);
      }
    });

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    } else {
      map.setView([22.5, 82.0], 5);
    }
  }, [geographicCases]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs space-y-0">
      {/* Top Banner */}
      <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-gov-navy/5 text-gov-navy rounded-lg border border-gov-navy/10">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-bold text-gov-slate text-sm">Geographic Operations Cadastre View</h3>
            <p className="text-[11px] text-slate-500">
              Interactive spatial monitoring displaying georeferenced statutory corridors and parcel centroids.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="font-mono text-[11px] bg-slate-100 text-gov-slate px-2 py-0.5 rounded border border-slate-200">
            <strong>{casesWithSpatialData.length}</strong> of {geographicCases.length} mapped
          </span>
          <button
            type="button"
            onClick={() => {
              if (mapInstanceRef.current) {
                mapInstanceRef.current.setView([22.5, 82.0], 5);
              }
            }}
            className="p-1.5 text-slate-500 hover:text-gov-slate hover:bg-slate-100 rounded border border-slate-200"
            title="Reset Pan & Zoom"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Main Map + Inspector Layout */}
      <div className="relative h-[480px] w-full flex">
        {/* Leaflet DOM container */}
        <div ref={mapContainerRef} className="h-full w-full z-0" />

        {/* Floating Legend */}
        <div className="absolute bottom-4 left-4 z-10 bg-white/95 backdrop-blur-xs p-3 rounded-lg border border-slate-200 shadow-md text-[10px] space-y-2">
          <span className="font-bold text-gov-slate block uppercase tracking-wider">Risk Symbology</span>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-600 shrink-0" />
              <span>Critical Risk</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shrink-0" />
              <span>High Risk</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-600 shrink-0" />
              <span>Moderate</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-600 shrink-0" />
              <span>On Schedule</span>
            </div>
          </div>
        </div>

        {/* Selected Case Inspector Side Drawer */}
        {selectedCase && (
          <div className="absolute top-4 right-4 z-10 w-80 bg-white/95 backdrop-blur-xs p-4 rounded-xl border border-slate-300 shadow-lg text-xs space-y-3">
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
              <div>
                <span className="font-mono text-[10px] font-bold text-gov-navy bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                  {selectedCase.case_number}
                </span>
                <h4 className="font-bold text-gov-slate text-sm mt-1">{selectedCase.title}</h4>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCase(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1 text-[11px] text-slate-600">
              {selectedCase.project_name && (
                <div>
                  <span className="text-slate-400">Project:</span> <strong>{selectedCase.project_name}</strong>
                </div>
              )}
              <div>
                <span className="text-slate-400">Location:</span> {selectedCase.village}, {selectedCase.district}, {selectedCase.state}
              </div>
              <div>
                <span className="text-slate-400">Milestone:</span> <strong className="text-gov-slate">{selectedCase.current_stage_title}</strong>
              </div>
              <div>
                <span className="text-slate-400">Area:</span> {selectedCase.total_area_hectares} Ha
              </div>
              {selectedCase.net_delay_days > 0 ? (
                <div className="text-red-700 font-semibold flex items-center gap-1 mt-1">
                  <AlertTriangle className="h-3 w-3 text-red-500" />
                  <span>+{selectedCase.net_delay_days} Days SLA Delay</span>
                </div>
              ) : (
                <div className="text-emerald-700 font-semibold flex items-center gap-1 mt-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  <span>Milestone tracking on schedule</span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => onSelectCase(selectedCase.case_id)}
              className="w-full py-2 px-3 bg-gov-navy hover:bg-gov-navy-light text-white font-semibold rounded-lg shadow-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>Inspect Case Intelligence</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Empty Overlay if no cases with spatial data */}
        {casesWithSpatialData.length === 0 && (
          <div className="absolute inset-0 z-1 bg-slate-50/90 flex flex-col items-center justify-center p-6 text-center text-xs">
            <MapPin className="h-10 w-10 text-slate-300 mb-2" />
            <h4 className="font-bold text-gov-slate text-sm">No Spatial Data for Current Filter</h4>
            <p className="text-slate-500 max-w-sm mt-1 text-[11px]">
              None of the filtered cases currently have uploaded GeoJSON corridor boundaries or georeferenced parcel coordinates. Import boundaries in the Case Detail workspace to render GIS polygons.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
