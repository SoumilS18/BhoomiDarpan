import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import {
  MapPin,
  Layers,
  Compass,
  AlertTriangle,
  FolderKanban,
  Building2,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Info,
  Sliders,
  Maximize2,
  Eye,
  EyeOff,
  ShieldAlert,
  ChevronRight,
  CloudSun,
  X,
  FileCheck,
} from 'lucide-react';
import {
  fetchGISOverview,
  fetchGISCases,
  fetchGISProjects,
  fetchGISParcels,
  fetchGISSpatialContext,
  fetchGISNearby,
  fetchIntegrationPolicy,
  resolveBhuvanLayers,
} from '../lib/api';
import {
  GISOverview,
  CaseSpatialContext,
  SpatialCluster,
  SpatialLayerInfo,
  NearbySpatialEntity,
  IntegrationPolicy,
} from '../../shared/types';
import {
  createBasemapTileLayer,
  isMapTilerKeyValid,
  getMapTilerClientKey,
  BasemapConfig,
} from '../lib/mapProvider';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { PARCEL_STATUS_COLORS, getBoundsFromGeoJSON } from '../../shared/utils/geojson';

interface GISSpatialIntelligencePageProps {
  onSelectCase: (caseId: string) => void;
}

export type TileBaseMap =
  | 'osm'
  | 'maptiler_streets'
  | 'maptiler_satellite'
  | 'maptiler_topo'
  | 'maptiler_outdoor'
  | 'maptiler_dataviz_light'
  | 'maptiler_dataviz_dark'
  | 'positron'
  | 'dark';

export const GISSpatialIntelligencePage: React.FC<GISSpatialIntelligencePageProps> = ({
  onSelectCase,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const casesLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const projectsLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const parcelsLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const clustersLayerGroupRef = useRef<L.LayerGroup | null>(null);

  // Data state
  const [overview, setOverview] = useState<GISOverview | null>(null);
  const [casesData, setCasesData] = useState<any | null>(null);
  const [projectsData, setProjectsData] = useState<any | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [spatialContext, setSpatialContext] = useState<CaseSpatialContext | null>(null);
  const [selectedParcels, setSelectedParcels] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [contextLoading, setContextLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [stateFilter, setStateFilter] = useState<string>('all');
  const [districtFilter, setDistrictFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [mappingFilter, setMappingFilter] = useState<string>('all');

  // Layer Toggles
  const [showCases, setShowCases] = useState(true);
  const [showProjects, setShowProjects] = useState(true);
  const [showParcels, setShowParcels] = useState(true);
  const [showClusters, setShowClusters] = useState(true);
  const [showBhuvanLulc, setShowBhuvanLulc] = useState(false);
  const [showBhuvanDisaster, setShowBhuvanDisaster] = useState(false);
  const [bhuvanResolvedLayers, setBhuvanResolvedLayers] = useState<any[]>([]);
  const [bhuvanUnsupported, setBhuvanUnsupported] = useState<string[]>([]);
  const [bhuvanLoading, setBhuvanLoading] = useState(false);
  const [showBhuvanInfo, setShowBhuvanInfo] = useState(false);
  const bhuvanLayerGroupRef = useRef<L.LayerGroup | null>(null);

  const [baseMap, setBaseMap] = useState<TileBaseMap>(() =>
    isMapTilerKeyValid(getMapTilerClientKey()) ? 'maptiler_streets' : 'osm'
  );
  const [integrationPolicy, setIntegrationPolicy] = useState<IntegrationPolicy | null>(null);
  const [fallbackInfo, setFallbackInfo] = useState<BasemapConfig | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  // Derived filter options from real data
  const availableStates = Array.from(
    new Set(
      (casesData?.features || [])
        .map((f: any) => f.properties.state)
        .filter(Boolean)
    )
  ).sort() as string[];

  const availableDistricts = Array.from(
    new Set(
      (casesData?.features || [])
        .filter((f: any) => stateFilter === 'all' || f.properties.state?.toLowerCase() === stateFilter.toLowerCase())
        .map((f: any) => f.properties.district)
        .filter(Boolean)
    )
  ).sort() as string[];

  // 1. Initial Data Load
  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [ovRes, casesRes, projRes, polRes] = await Promise.all([
        fetchGISOverview(),
        fetchGISCases({
          state: stateFilter !== 'all' ? stateFilter : undefined,
          district: districtFilter !== 'all' ? districtFilter : undefined,
          status: statusFilter !== 'all' ? statusFilter : undefined,
          risk_level: riskFilter !== 'all' ? riskFilter : undefined,
          has_geometry: mappingFilter === 'mapped' ? 'true' : undefined,
        }),
        fetchGISProjects(),
        fetchIntegrationPolicy().catch(() => ({ policy: null as any })),
      ]);

      setOverview(ovRes);
      setCasesData(casesRes);
      setProjectsData(projRes);
      if (polRes?.policy) {
        setIntegrationPolicy(polRes.policy);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load GIS spatial datasets.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [stateFilter, districtFilter, statusFilter, riskFilter, mappingFilter]);

  // 2. Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView([22.5, 78.9], 5);

    // Zoom control on top-right
    L.control.zoom({ position: 'topright' }).addTo(map);

    // Layer groups for independent toggling
    projectsLayerGroupRef.current = L.layerGroup().addTo(map);
    casesLayerGroupRef.current = L.layerGroup().addTo(map);
    parcelsLayerGroupRef.current = L.layerGroup().addTo(map);
    clustersLayerGroupRef.current = L.layerGroup().addTo(map);
    bhuvanLayerGroupRef.current = L.layerGroup().addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // 3. Update Tile Layer on BaseMap Change with MapTiler support & automatic fallback
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    const { tileLayer, config } = createBasemapTileLayer(
      {
        provider: baseMap,
        policy: integrationPolicy || undefined,
      },
      (_reason, fbConfig) => {
        setFallbackInfo(fbConfig);
      },
      L
    );

    setFallbackInfo(config.isFallback ? config : null);

    tileLayer.addTo(map);
    tileLayerRef.current = tileLayer;
  }, [baseMap, integrationPolicy]);

  // 4. Render Layers when Data / Toggles Change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear existing layers
    casesLayerGroupRef.current?.clearLayers();
    projectsLayerGroupRef.current?.clearLayers();
    clustersLayerGroupRef.current?.clearLayers();

    const allBounds = L.latLngBounds([]);

    const getRiskColor = (level?: string) => {
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

    // A. Render Projects Corridors
    if (showProjects && projectsData?.features && projectsLayerGroupRef.current) {
      projectsData.features.forEach((pFeat: any) => {
        try {
          const pLayer = L.geoJSON(pFeat, {
            style: {
              color: '#475569', // slate-600
              weight: 2.5,
              dashArray: '4, 4',
              fillColor: '#64748b',
              fillOpacity: 0.1,
            },
            onEachFeature: (_, layer) => {
              layer.bindTooltip(
                `<strong>Project:</strong> ${pFeat.properties.name} (${pFeat.properties.code})<br/>Agency: ${pFeat.properties.sponsoring_agency}`,
                { sticky: true }
              );
            },
          });
          projectsLayerGroupRef.current?.addLayer(pLayer);
          allBounds.extend(pLayer.getBounds());
        } catch {}
      });
    }

    // B. Render Cases
    if (showCases && casesData?.features && casesLayerGroupRef.current) {
      casesData.features.forEach((cFeat: any) => {
        const props = cFeat.properties;
        const color = getRiskColor(props.risk_level);
        const isSelected = props.case_id === selectedCaseId;

        // Polygon boundary
        if (cFeat.geometry) {
          try {
            const geoLayer = L.geoJSON(cFeat, {
              style: {
                color: isSelected ? '#1d4ed8' : color,
                weight: isSelected ? 3.5 : 2,
                opacity: 0.9,
                fillColor: color,
                fillOpacity: isSelected ? 0.4 : 0.2,
              },
              onEachFeature: (_, layer) => {
                layer.on('click', () => {
                  setSelectedCaseId(props.case_id);
                });
                layer.bindTooltip(
                  `<strong>${props.case_number}</strong>: ${props.title}<br/>Area: ${props.total_area_hectares} Ha | Risk: ${props.risk_level?.toUpperCase()}`,
                  { sticky: true }
                );
              },
            });
            casesLayerGroupRef.current?.addLayer(geoLayer);
            allBounds.extend(geoLayer.getBounds());
          } catch {}
        }

        // Centroid marker
        if (props.centroid && Array.isArray(props.centroid)) {
          const [cLat, cLng] = props.centroid;
          const marker = L.circleMarker([cLat, cLng], {
            radius: props.risk_level === 'critical' ? 9 : 7,
            fillColor: color,
            color: '#ffffff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.95,
          });

          marker.on('click', () => {
            setSelectedCaseId(props.case_id);
          });

          marker.bindTooltip(
            `<strong>${props.case_number}</strong>: ${props.title}`,
            { direction: 'top' }
          );

          casesLayerGroupRef.current?.addLayer(marker);
          allBounds.extend([cLat, cLng]);
        }
      });
    }

    // C. Render Spatial Clusters
    if (showClusters && overview?.clusters && clustersLayerGroupRef.current) {
      overview.clusters.forEach((cluster: SpatialCluster) => {
        const [cLat, cLng] = cluster.center;
        const radiusMeters = cluster.radius_km * 1000;

        const clusterCircle = L.circle([cLat, cLng], {
          radius: radiusMeters,
          color: '#d97706', // amber-600
          weight: 1.5,
          dashArray: '6, 6',
          fillColor: '#f59e0b',
          fillOpacity: 0.12,
        });

        clusterCircle.bindTooltip(
          `<strong>${cluster.cluster_id.toUpperCase()}</strong>: ${cluster.case_count} Concentrated Cases<br/>Combined Area: ${cluster.aggregate_area_hectares} Ha | Radius: ${cluster.radius_km} km`,
          { sticky: true }
        );

        clustersLayerGroupRef.current?.addLayer(clusterCircle);
        allBounds.extend(clusterCircle.getBounds());
      });
    }

    // Fit map bounds if features exist
    if (allBounds.isValid()) {
      map.fitBounds(allBounds, { padding: [40, 40], maxZoom: 14 });
    }
  }, [casesData, projectsData, overview, showCases, showProjects, showClusters, selectedCaseId]);

  // 5. Load Case Spatial Context & Parcels when selectedCaseId changes
  useEffect(() => {
    if (!selectedCaseId) {
      setSpatialContext(null);
      setSelectedParcels(null);
      parcelsLayerGroupRef.current?.clearLayers();
      return;
    }

    const loadContextAndParcels = async () => {
      setContextLoading(true);
      try {
        const [contextRes, parcelsRes] = await Promise.all([
          fetchGISSpatialContext(selectedCaseId),
          fetchGISParcels(selectedCaseId).catch(() => null),
        ]);

        setSpatialContext(contextRes);
        setSelectedParcels(parcelsRes);

        // Render Parcels on map if enabled
        if (showParcels && parcelsRes?.features && parcelsLayerGroupRef.current) {
          parcelsLayerGroupRef.current.clearLayers();

          const pLayer = L.geoJSON(parcelsRes, {
            style: (feat: any) => {
              const status = feat?.properties?.acquisition_status || 'identified';
              const colorConf = PARCEL_STATUS_COLORS[status] || PARCEL_STATUS_COLORS.identified;
              return {
                color: colorConf.stroke,
                fillColor: colorConf.fill,
                weight: 1.5,
                fillOpacity: 0.45,
              };
            },
            onEachFeature: (feat, layer) => {
              const props = feat.properties;
              layer.bindTooltip(
                `<strong>Survey #${props.survey_number}</strong><br/>Khata: ${props.khata_number || 'N/A'}<br/>Area: ${props.area_acres} Acres<br/>Status: ${props.acquisition_status?.toUpperCase()}`,
                { sticky: true }
              );
            },
          });

          parcelsLayerGroupRef.current.addLayer(pLayer);

          if (mapInstanceRef.current && pLayer.getBounds().isValid()) {
            mapInstanceRef.current.fitBounds(pLayer.getBounds(), { padding: [50, 50], maxZoom: 16 });
          }
        }
      } catch (err: any) {
        console.warn('Could not load spatial context:', err.message);
      } finally {
        setContextLoading(false);
      }
    };

    loadContextAndParcels();
  }, [selectedCaseId, showParcels]);

  // 6. Manage Bhuvan Thematic WMS Overlays (Data-Driven Dynamic Jurisdiction Resolution)
  useEffect(() => {
    if (!bhuvanLayerGroupRef.current) return;
    bhuvanLayerGroupRef.current.clearLayers();

    if (!showBhuvanLulc && !showBhuvanDisaster) {
      setBhuvanResolvedLayers([]);
      setBhuvanUnsupported([]);
      return;
    }

    const updateBhuvanLayers = async () => {
      setBhuvanLoading(true);
      try {
        // Resolve active jurisdictions data-driven: no state-specific hardcoding
        let targetStates: string[] = [];
        if (selectedCaseId && casesData?.features) {
          const selectedFeat = casesData.features.find((f: any) => f.properties?.case_id === selectedCaseId);
          if (selectedFeat?.properties?.state) {
            targetStates = [selectedFeat.properties.state];
          }
        } else if (stateFilter !== 'all') {
          targetStates = [stateFilter];
        } else if (availableStates.length > 0) {
          targetStates = availableStates;
        }

        const resolved: any[] = [];
        const unsupported: string[] = [];

        if (showBhuvanLulc) {
          const lulcRes = await resolveBhuvanLayers({
            state_names: targetStates.length > 0 ? targetStates : undefined,
            workspace: 'lulc',
          });
          resolved.push(...lulcRes.resolved_layers);
          unsupported.push(...lulcRes.unsupported_jurisdictions);
        }

        if (showBhuvanDisaster) {
          const disasterRes = await resolveBhuvanLayers({
            state_names: targetStates.length > 0 ? targetStates : undefined,
            workspace: 'disaster',
          });
          resolved.push(...disasterRes.resolved_layers);
          unsupported.push(...disasterRes.unsupported_jurisdictions);
        }

        setBhuvanResolvedLayers(resolved);
        setBhuvanUnsupported(Array.from(new Set(unsupported)));

        // Add WMS layers to Leaflet group with proper attribution and opacity
        for (const item of resolved) {
          if (item.status === 'available' && item.layer?.layer_name) {
            const wmsLayer = L.tileLayer.wms(item.wms_url || 'https://bhuvan-vec2.nrsc.gov.in/bhuvan/wms', {
              layers: item.layer.layer_name,
              format: 'image/png',
              transparent: true,
              opacity: item.layer.default_opacity ?? 0.65,
              attribution: 'ISRO / NRSC Bhuvan',
            } as any);
            bhuvanLayerGroupRef.current?.addLayer(wmsLayer);
          }
        }
      } catch (err: any) {
        console.warn('Could not load Bhuvan WMS overlay:', err.message);
      } finally {
        setBhuvanLoading(false);
      }
    };

    updateBhuvanLayers();
  }, [showBhuvanLulc, showBhuvanDisaster, stateFilter, selectedCaseId, casesData]);

  return (
    <div className="flex flex-col h-[calc(100vh-5.5rem)] space-y-4">
      {/* 1. Header & Quick Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-gov-slate tracking-tight">
              GIS & Spatial Decision Intelligence
            </h1>
            <Badge variant="navy" size="sm">
              Day 6 Architecture
            </Badge>
            {overview?.lgd_status === 'administrative_enrichment_unavailable' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                <AlertTriangle className="h-3 w-3" />
                LGD Enrichment Unavailable
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time geodetic corridor mapping, infrastructure alignment, proximity friction clusters & cadastral verification.
          </p>
        </div>

        {/* Base Map & Quick Toggles */}
        <div className="flex items-center gap-2">
          {/* Base Map Switcher */}
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200 text-xs">
            <button
              onClick={() => setBaseMap('positron')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                baseMap === 'positron' ? 'bg-white text-gov-navy shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Positron
            </button>
            <button
              onClick={() => setBaseMap('dark')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                baseMap === 'dark' ? 'bg-gov-slate text-white shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Dark
            </button>
            <button
              onClick={() => setBaseMap('osm')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                baseMap === 'osm' ? 'bg-white text-emerald-800 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              OSM
            </button>
          </div>

          <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* 2. KPI Metrics Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 shrink-0">
        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Cases</div>
          <div className="text-lg font-bold text-gov-slate mt-0.5">{overview?.total_cases || 0}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">National portfolio</div>
        </div>

        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Mapped Corridors</div>
          <div className="text-lg font-bold text-blue-600 mt-0.5">
            {overview?.mapped_cases || 0}{' '}
            <span className="text-xs font-normal text-slate-500">
              ({overview?.total_cases ? Math.round((overview.mapped_cases / overview.total_cases) * 100) : 0}%)
            </span>
          </div>
          <div className="text-[10px] text-emerald-600 mt-0.5">WGS-84 demarcated</div>
        </div>

        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Awaiting GIS Survey</div>
          <div className="text-lg font-bold text-amber-600 mt-0.5">{overview?.unmapped_cases || 0}</div>
          <div className="text-[10px] text-amber-600 mt-0.5">Coordinates unmapped</div>
        </div>

        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Infrastructure Projects</div>
          <div className="text-lg font-bold text-indigo-600 mt-0.5">
            {overview?.projects_with_geometry || 0} / {overview?.total_projects || 0}
          </div>
          <div className="text-[10px] text-indigo-600 mt-0.5">Corridors mapped</div>
        </div>

        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Proximity Clusters</div>
          <div className="text-lg font-bold text-purple-600 mt-0.5">{overview?.spatial_clusters_count || 0}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Density grouping</div>
        </div>

        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Administrative LGD</div>
          <div className="text-sm font-bold text-gov-slate mt-1.5 flex items-center gap-1.5">
            {overview?.lgd_status === 'operational' ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="text-emerald-700 text-xs">Operational</span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <span className="text-amber-700 text-xs font-semibold">Unavailable</span>
              </>
            )}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">National master</div>
        </div>
      </div>

      {/* 3. Multi-Dimensional Filter Bar & Layer Ribbon */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* Geographic & Workflow Filters */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-slate-600 mr-1">
            <Sliders className="h-3.5 w-3.5 text-blue-600" />
            Filters:
          </div>

          {/* State Filter */}
          <select
            value={stateFilter}
            onChange={(e) => {
              setStateFilter(e.target.value);
              setDistrictFilter('all');
            }}
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-gov-slate focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All States</option>
            {availableStates.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          {/* District Filter */}
          <select
            value={districtFilter}
            onChange={(e) => setDistrictFilter(e.target.value)}
            disabled={availableDistricts.length === 0}
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-gov-slate focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
          >
            <option value="all">All Districts</option>
            {availableDistricts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-gov-slate focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All Case Statuses</option>
            <option value="active">Active</option>
            <option value="delayed">Delayed</option>
            <option value="litigation">Litigation</option>
            <option value="completed">Completed</option>
          </select>

          {/* Risk Level Filter */}
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-gov-slate focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All Risk Bands</option>
            <option value="critical">Critical Risk</option>
            <option value="high">High Risk</option>
            <option value="medium">Medium Risk</option>
            <option value="low">Low Risk</option>
          </select>

          {/* Mapping Status Filter */}
          <select
            value={mappingFilter}
            onChange={(e) => setMappingFilter(e.target.value)}
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-gov-slate focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All Mapping States</option>
            <option value="mapped">Mapped Only</option>
            <option value="unmapped">Awaiting Survey</option>
          </select>

          {(stateFilter !== 'all' ||
            districtFilter !== 'all' ||
            statusFilter !== 'all' ||
            riskFilter !== 'all' ||
            mappingFilter !== 'all') && (
            <button
              onClick={() => {
                setStateFilter('all');
                setDistrictFilter('all');
                setStatusFilter('all');
                setRiskFilter('all');
                setMappingFilter('all');
              }}
              className="text-xs text-blue-600 hover:text-blue-800 underline ml-1"
            >
              Reset
            </button>
          )}
        </div>

        {/* Layer Toggles */}
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <div className="flex items-center gap-1 text-slate-500 mr-1">
            <Layers className="h-3.5 w-3.5" />
            Layers:
          </div>

          <button
            onClick={() => setShowCases(!showCases)}
            className={`px-2 py-1 rounded-md border text-[11px] flex items-center gap-1 transition-all ${
              showCases ? 'bg-blue-50 text-blue-800 border-blue-200 font-semibold' : 'bg-slate-50 text-slate-500 border-slate-200'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-blue-600" />
            Cases
          </button>

          <button
            onClick={() => setShowProjects(!showProjects)}
            className={`px-2 py-1 rounded-md border text-[11px] flex items-center gap-1 transition-all ${
              showProjects ? 'bg-slate-100 text-slate-800 border-slate-300 font-semibold' : 'bg-slate-50 text-slate-400 border-slate-200'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-slate-500" />
            Projects
          </button>

          <button
            onClick={() => setShowClusters(!showClusters)}
            className={`px-2 py-1 rounded-md border text-[11px] flex items-center gap-1 transition-all ${
              showClusters ? 'bg-amber-50 text-amber-800 border-amber-200 font-semibold' : 'bg-slate-50 text-slate-400 border-slate-200'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            Clusters
          </button>

          <button
            onClick={() => setShowParcels(!showParcels)}
            className={`px-2 py-1 rounded-md border text-[11px] flex items-center gap-1 transition-all ${
              showParcels ? 'bg-purple-50 text-purple-800 border-purple-200 font-semibold' : 'bg-slate-50 text-slate-400 border-slate-200'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-purple-600" />
            Parcels
          </button>

          {/* Bhuvan Sovereign Thematic Overlays */}
          <div className="h-4 w-px bg-slate-200 mx-1" />
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowBhuvanLulc(!showBhuvanLulc)}
              className={`px-2 py-1 rounded-md border text-[11px] flex items-center gap-1 transition-all ${
                showBhuvanLulc
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold shadow-xs'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:text-slate-900'
              }`}
              title="Toggle ISRO Bhuvan Land Use / Land Cover (1:50,000 reference cartography)"
            >
              <span className={`h-2 w-2 rounded-full ${showBhuvanLulc ? 'bg-emerald-600' : 'bg-slate-400'}`} />
              Bhuvan LULC
              <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1 py-0.2 rounded font-mono ml-0.5">
                2015–16
              </span>
              {bhuvanLoading && <RefreshCw className="h-2.5 w-2.5 animate-spin ml-0.5 text-emerald-600" />}
            </button>

            <button
              onClick={() => setShowBhuvanDisaster(!showBhuvanDisaster)}
              className={`px-2 py-1 rounded-md border text-[11px] flex items-center gap-1 transition-all ${
                showBhuvanDisaster
                  ? 'bg-orange-50 text-orange-800 border-orange-300 font-semibold shadow-xs'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:text-slate-900'
              }`}
              title="Toggle ISRO Bhuvan Disaster Hazard Susceptibility"
            >
              <span className={`h-2 w-2 rounded-full ${showBhuvanDisaster ? 'bg-orange-600' : 'bg-slate-400'}`} />
              Bhuvan Hazard
              <span className="text-[9px] bg-orange-100 text-orange-800 px-1 py-0.2 rounded font-mono ml-0.5">
                2023
              </span>
            </button>

            {/* Bhuvan Disclaimer / Info Popover */}
            <div className="relative">
              <button
                onClick={() => setShowBhuvanInfo(!showBhuvanInfo)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100 transition-colors"
                title="Bhuvan Geospatial Information & Statutory Disclaimer"
              >
                <Info className="h-3.5 w-3.5" />
              </button>

              {showBhuvanInfo && (
                <div className="absolute right-0 top-7 w-80 bg-white border border-slate-200 rounded-xl shadow-lg p-3 z-50 text-xs text-slate-700 animate-in fade-in">
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                    <span className="font-bold text-gov-slate flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      ISRO / NRSC Bhuvan Overlays
                    </span>
                    <button
                      onClick={() => setShowBhuvanInfo(false)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-2 space-y-1.5 text-[11px]">
                    <p>
                      <strong>Provider:</strong> National Remote Sensing Centre (NRSC), ISRO.
                    </p>
                    <p>
                      <strong>Coverage:</strong> State-scoped 1:50,000 multi-spectral thematic cartography.
                    </p>
                    <div className="bg-amber-50 border border-amber-200 rounded p-2 text-amber-800 text-[10px] leading-relaxed">
                      <strong>Statutory Disclaimer:</strong> Bhuvan layers provide thematic and reference spatial context. They do <em>not</em> constitute cadastral ground truth, legal boundaries, or land records for compensation determination.
                    </div>
                    {bhuvanUnsupported.length > 0 && (
                      <div className="bg-slate-50 border border-slate-200 rounded p-1.5 text-slate-600 text-[10px]">
                        <strong>Unavailable in:</strong> {bhuvanUnsupported.join(', ')}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Basemap Style Selector */}
          <div className="h-4 w-px bg-slate-200 mx-1" />
          <div className="flex items-center gap-1.5">
            <select
              value={baseMap}
              onChange={(e) => setBaseMap(e.target.value as TileBaseMap)}
              className="border border-slate-200 rounded-md px-2 py-1 bg-slate-50 text-slate-700 text-[11px] font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              title="Select Basemap Cartography"
            >
              <option value="osm">OpenStreetMap Standard</option>
              <option value="maptiler_streets">MapTiler Streets v2</option>
              <option value="maptiler_satellite">MapTiler Satellite</option>
              <option value="maptiler_topo">MapTiler Topo v2</option>
              <option value="maptiler_outdoor">MapTiler Outdoor v2</option>
              <option value="maptiler_dataviz_light">MapTiler Dataviz Light</option>
              <option value="maptiler_dataviz_dark">MapTiler Dataviz Dark</option>
            </select>
            {fallbackInfo?.isFallback && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200"
                title={fallbackInfo.fallbackReason || 'OpenStreetMap fallback active'}
              >
                <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0" />
                OSM Fallback
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 4. Map Viewport & Context Inspector Drawer */}
      <div className="flex-1 flex gap-4 min-h-0 relative">
        {/* Leaflet Map Workspace */}
        <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden relative">
          <div ref={mapContainerRef} className="w-full h-full z-0" />

          {/* Map Legend (Bottom-Left) */}
          <div className="absolute bottom-4 left-4 z-[400] bg-white/95 backdrop-blur-sm p-3 rounded-lg border border-slate-200 shadow-md text-xs space-y-2 pointer-events-auto max-w-xs">
            <div className="font-bold text-gov-slate flex items-center justify-between text-[11px] uppercase tracking-wider">
              <span>Risk Color Scheme</span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-600">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-600" />
                <span>Critical Risk</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                <span>High Risk</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
                <span>Medium Risk</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
                <span>Low Risk</span>
              </div>
            </div>
            <div className="pt-1.5 border-t border-slate-200 text-[10px] text-slate-500">
              Click any corridor or marker to inspect statutory spatial context.
            </div>
          </div>
        </div>

        {/* Right: Spatial Context Inspector Drawer */}
        <div className="w-96 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden shrink-0">
          {selectedCaseId ? (
            // Feature Detail View
            <div className="flex flex-col h-full overflow-y-auto p-4 space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between pb-3 border-b border-slate-200">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      {spatialContext?.case_number || 'Loading...'}
                    </span>
                    {spatialContext?.geometry_status === 'mapped' ? (
                      <Badge variant="emerald" size="sm">
                        Mapped
                      </Badge>
                    ) : spatialContext?.geometry_status === 'partially_mapped' ? (
                      <Badge variant="amber" size="sm">
                        Partially Mapped
                      </Badge>
                    ) : (
                      <Badge variant="slate" size="sm">
                        Unmapped
                      </Badge>
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-gov-slate mt-1.5 leading-snug">
                    {spatialContext?.title || 'Case Spatial Context'}
                  </h3>
                  {spatialContext?.project_name && (
                    <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                      <Building2 className="h-3 w-3 text-slate-400" />
                      <span>{spatialContext.project_name}</span>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setSelectedCaseId(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Administrative Hierarchy Block */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs space-y-2">
                <div className="font-bold text-slate-700 uppercase tracking-wider text-[10px] flex items-center justify-between">
                  <span>Administrative Hierarchy</span>
                  {spatialContext?.administrative_hierarchy.lgd_status === 'mapped' ? (
                    <span className="text-emerald-700 font-bold">LGD Verified</span>
                  ) : (
                    <span className="text-amber-700 font-bold">Enrichment Unavailable</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-slate-600">
                  <div>
                    <span className="text-slate-400 block text-[10px]">State:</span>
                    <span className="font-semibold text-slate-800">{spatialContext?.state || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">District:</span>
                    <span className="font-semibold text-slate-800">{spatialContext?.district || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Tehsil / Taluk:</span>
                    <span className="font-semibold text-slate-800">{spatialContext?.tehsil || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Revenue Village:</span>
                    <span className="font-semibold text-slate-800">{spatialContext?.village || 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Spatial Geometry & Cadastral Metrics */}
              <div className="bg-blue-50/60 p-3 rounded-lg border border-blue-200 text-xs space-y-2">
                <div className="font-bold text-blue-900 uppercase tracking-wider text-[10px] flex items-center justify-between">
                  <span>Spatial Metrics & Geometry</span>
                  <span className="font-bold text-blue-700">
                    Quality: {spatialContext?.geometry_quality_score ?? 0}/100
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-slate-700">
                  <div>
                    <span className="text-slate-500 block text-[10px]">Demarcated Area:</span>
                    <span className="font-bold text-slate-900">
                      {spatialContext?.total_area_hectares} Hectares
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Geometry Type:</span>
                    <span className="font-bold text-slate-900">{spatialContext?.geometry_type || 'Polygon'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Total Cadastral Parcels:</span>
                    <span className="font-bold text-slate-900">{spatialContext?.parcels_summary.total} plots</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Parcels with GIS:</span>
                    <span className="font-bold text-emerald-700">
                      {spatialContext?.parcels_summary.mapped} plots
                    </span>
                  </div>
                </div>

                {spatialContext?.parcels_summary.disputed ? (
                  <div className="bg-red-50 p-2 rounded border border-red-200 text-red-800 text-[11px] flex items-center gap-1.5 mt-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-red-600 shrink-0" />
                    <span>
                      <strong>{spatialContext.parcels_summary.disputed} Disputed Parcels</strong> under active title litigation.
                    </span>
                  </div>
                ) : null}
              </div>

              {/* Nearby Infrastructure Proximity Block */}
              <div className="text-xs space-y-2">
                <div className="font-bold text-slate-700 uppercase tracking-wider text-[10px] flex items-center justify-between">
                  <span>Nearby Infrastructure ({spatialContext?.nearby_cases.length || 0})</span>
                  <span className="text-slate-400 font-normal text-[10px]">Within 25km radius</span>
                </div>

                {spatialContext?.nearby_cases && spatialContext.nearby_cases.length > 0 ? (
                  <div className="space-y-1.5">
                    {spatialContext.nearby_cases.map((nb) => (
                      <div
                        key={nb.id}
                        onClick={() => setSelectedCaseId(nb.id)}
                        className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer flex items-center justify-between transition-all"
                      >
                        <div>
                          <div className="font-semibold text-gov-slate flex items-center gap-1.5">
                            <span>{nb.case_number}</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                              {nb.status}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 truncate max-w-[200px]">{nb.title}</div>
                        </div>
                        <div className="text-right">
                          <span className="font-mono text-xs font-bold text-blue-700">
                            {nb.distance_km} km
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-slate-400 text-xs italic py-2 text-center bg-slate-50 rounded-lg border">
                    No neighboring acquisition cases detected within statutory search radius.
                  </div>
                )}
              </div>

              {/* Statutory Data Provenance */}
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-[11px] text-slate-500 space-y-1 mt-auto">
                <div className="font-bold text-slate-700 text-[10px] uppercase">Data Provenance</div>
                <div>Source: <span className="font-mono text-slate-800">{spatialContext?.provenance.source_id}</span></div>
                <div>Type: <span className="font-semibold text-slate-800">{spatialContext?.provenance.provenance_type}</span></div>
                <div>Recorded: <span className="text-slate-600">{spatialContext?.provenance.retrieved_at ? new Date(spatialContext.provenance.retrieved_at).toLocaleDateString() : 'N/A'}</span></div>
              </div>

              {/* Action Button */}
              <Button
                variant="primary"
                size="sm"
                className="w-full mt-2"
                onClick={() => onSelectCase(selectedCaseId)}
              >
                <FileCheck className="h-4 w-4 mr-1.5" />
                Open Statutory Case File
              </Button>
            </div>
          ) : (
            // Default Spatial Summary View
            <div className="flex flex-col h-full p-4 overflow-y-auto space-y-4">
              <div>
                <h3 className="text-sm font-bold text-gov-slate">Spatial Portfolio Summary</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select an acquisition corridor or marker on the map to inspect its spatial and cadastral details.
                </p>
              </div>

              {/* Spatial Clusters List */}
              <div className="space-y-2">
                <div className="font-bold text-slate-700 uppercase tracking-wider text-[10px] flex items-center justify-between">
                  <span>Detected Friction Clusters ({overview?.clusters.length || 0})</span>
                  <span className="text-slate-400 font-normal text-[10px]">15km radius</span>
                </div>

                {overview?.clusters && overview.clusters.length > 0 ? (
                  <div className="space-y-2">
                    {overview.clusters.map((cl) => (
                      <div
                        key={cl.cluster_id}
                        className="p-3 rounded-lg border border-amber-200 bg-amber-50/50 space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-amber-900 text-xs uppercase">
                            {cl.cluster_id}
                          </span>
                          <span className="font-mono text-xs font-bold text-amber-800">
                            {cl.case_count} Cases
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600">
                          Radius: <strong>{cl.radius_km} km</strong> | Aggregate Area:{' '}
                          <strong>{cl.aggregate_area_hectares} Ha</strong>
                        </div>
                        <div className="text-[10px] text-amber-800 italic bg-amber-100/50 p-1.5 rounded">
                          {cl.sample_size_note}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-slate-400 text-xs italic py-4 text-center bg-slate-50 rounded-lg border">
                    No spatial density clusters detected under current filter criteria.
                  </div>
                )}
              </div>

              {/* Layer Health Manifest */}
              <div className="space-y-2">
                <div className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">
                  Spatial Layer Manifest
                </div>
                <div className="space-y-1.5 text-xs">
                  {overview?.layer_manifest.map((lyr) => (
                    <div
                      key={lyr.id}
                      className="p-2 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between"
                    >
                      <div>
                        <div className="font-semibold text-slate-800 text-xs">{lyr.name}</div>
                        <div className="text-[10px] text-slate-500">{lyr.description}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-mono font-bold text-gov-navy text-xs">
                          {lyr.feature_count}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
