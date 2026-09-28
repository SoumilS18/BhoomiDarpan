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
  Info,
  Sliders,
  Eye,
  EyeOff,
  X,
  FileCheck,
  Navigation,
} from 'lucide-react';
import { clsx } from 'clsx';
import { GeographySourceNote } from '../components/common/GeographySourceNote';
import { ProjectCorridorModal } from '../components/gis/ProjectCorridorModal';
import { DigitalTwin3DStudio } from '../components/gis/DigitalTwin3DStudio';
import {
  fetchGISOverview,
  fetchGISCases,
  fetchGISProjects,
  fetchGISParcels,
  fetchGISSpatialContext,
  fetchGISNearby,
  fetchIntegrationPolicy,
  resolveBhuvanLayers,
  fetchStates,
  fetchDistricts,
  fetchSubDistricts,
  fetchVillages,
  forwardGeocode,
  getGeographySource,
  subscribeGeographySource,
  GeographySource,
} from '../lib/api';
import {
  GISOverview,
  CaseSpatialContext,
  SpatialCluster,
  IntegrationPolicy,
  AdministrativeUnit,
} from '../../shared/types';
import {
  createBasemapTileLayer,
  isMapTilerKeyValid,
  getMapTilerClientKey,
  BasemapConfig,
} from '../lib/mapProvider';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { PageHeader, PageEyebrow } from '../components/common/PageHeader';
import { SectionHeading } from '../components/common/SectionHeading';
import { StatCard } from '../components/common/StatCard';
import { PARCEL_STATUS_COLORS } from '../../shared/utils/geojson';

interface GISSpatialIntelligencePageProps {
  onSelectCase: (caseId: string) => void;
}

export type TileBaseMap =
  | 'osm'
  | 'satellite'
  | 'dark'
  | 'light'
  | 'positron'
  | 'topo'
  | 'streets'
  | 'voyager'
  | 'maptiler_streets'
  | 'maptiler_satellite'
  | 'maptiler_topo'
  | 'maptiler_outdoor'
  | 'maptiler_dataviz_light'
  | 'maptiler_dataviz_dark';

/**
 * Accessible layer toggle list item: icon + label + subtle visibility
 * indicator. Remains a native keyboard-operable button with aria-pressed.
 */
const LayerToggleRow: React.FC<{
  icon: React.ReactNode;
  label: React.ReactNode;
  checked: boolean;
  onToggle: () => void;
  title?: string;
  dotClassName: string;
  trailing?: React.ReactNode;
}> = ({ icon, label, checked, onToggle, title, dotClassName, trailing }) => (
  <button
    type="button"
    onClick={onToggle}
    aria-pressed={checked}
    title={title}
    className={clsx(
      'flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors',
      checked
        ? 'border-blue-200 bg-gov-blue-soft font-semibold text-gov-slate'
        : 'border-transparent text-slate-500 hover:bg-slate-50 hover:text-gov-slate'
    )}
  >
    <span className={clsx('h-2 w-2 shrink-0 rounded-full', dotClassName)} />
    <span className="shrink-0 text-slate-400">{icon}</span>
    <span className="truncate">{label}</span>
    {trailing}
    <span
      aria-hidden="true"
      className={clsx(
        'ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors',
        checked
          ? 'border-blue-200 bg-white text-gov-navy'
          : 'border-slate-200 bg-slate-50 text-slate-300'
      )}
    >
      {checked ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
    </span>
  </button>
);

export const GISSpatialIntelligencePage: React.FC<GISSpatialIntelligencePageProps> = ({
  onSelectCase,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const casesLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const projectsLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const parcelsLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const clustersLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const caseLayersMapRef = useRef<Map<string, { layer?: any; marker?: any; defaultColor: string; defaultWeight: number; bounds?: L.LatLngBounds }>>(new Map());

  // Data state
  const [overview, setOverview] = useState<GISOverview | null>(null);
  const [casesData, setCasesData] = useState<any | null>(null);
  const [projectsData, setProjectsData] = useState<any | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [spatialContext, setSpatialContext] = useState<CaseSpatialContext | null>(null);
  const [selectedParcels, setSelectedParcels] = useState<any | null>(null);
  const [isCorridorModalOpen, setIsCorridorModalOpen] = useState(false);
  const [spatialMode, setSpatialMode] = useState<'2d' | '3d'>('2d');
  const [isLoading, setIsLoading] = useState(true);
  const [contextLoading, setContextLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [stateFilter, setStateFilter] = useState<string>('all');
  const [districtFilter, setDistrictFilter] = useState<string>('all');
  const [subDistrictFilter, setSubDistrictFilter] = useState<string>('all');
  const [villageFilter, setVillageFilter] = useState<string>('all');
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

  // Authoritative LGD administrative units (cascading), merged with feature-derived
  // values so filters reflect real geography even before cases are loaded.
  const [adminStates, setAdminStates] = useState<AdministrativeUnit[]>([]);
  const [adminDistricts, setAdminDistricts] = useState<AdministrativeUnit[]>([]);
  const [adminSubDistricts, setAdminSubDistricts] = useState<AdministrativeUnit[]>([]);
  const [adminVillages, setAdminVillages] = useState<AdministrativeUnit[]>([]);
  const [geoSource, setGeoSource] = useState<GeographySource>(getGeographySource());

  useEffect(() => subscribeGeographySource(setGeoSource), []);

  useEffect(() => {
    let mounted = true;
    fetchStates()
      .then((res) => {
        if (mounted) setAdminStates(res.states || []);
      })
      .catch(() => {
        if (mounted) setAdminStates([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (stateFilter === 'all') {
      setAdminDistricts([]);
      setAdminSubDistricts([]);
      setAdminVillages([]);
      return;
    }
    const matchingState = adminStates.find(
      (s) => s.name.toLowerCase() === stateFilter.toLowerCase() || s.code === stateFilter
    );
    const codeToFetch = matchingState?.code || stateFilter;
    let mounted = true;
    fetchDistricts(codeToFetch)
      .then((res) => {
        if (mounted) setAdminDistricts(res.districts || []);
      })
      .catch(() => {
        if (mounted) setAdminDistricts([]);
      });
    return () => {
      mounted = false;
    };
  }, [stateFilter, adminStates]);

  useEffect(() => {
    if (districtFilter === 'all') {
      setAdminSubDistricts([]);
      setAdminVillages([]);
      return;
    }
    const matchingDist = adminDistricts.find(
      (d) => d.name.toLowerCase() === districtFilter.toLowerCase() || d.code === districtFilter
    );
    const codeToFetch = matchingDist?.code || districtFilter;
    let mounted = true;
    fetchSubDistricts(codeToFetch)
      .then((res) => {
        if (mounted) setAdminSubDistricts(res.subdistricts || []);
      })
      .catch(() => {
        if (mounted) setAdminSubDistricts([]);
      });
    return () => {
      mounted = false;
    };
  }, [districtFilter, adminDistricts]);

  useEffect(() => {
    if (subDistrictFilter === 'all') {
      setAdminVillages([]);
      return;
    }
    const matchingSub = adminSubDistricts.find(
      (sd) => sd.name.toLowerCase() === subDistrictFilter.toLowerCase() || sd.code === subDistrictFilter
    );
    const codeToFetch = matchingSub?.code || subDistrictFilter;
    let mounted = true;
    fetchVillages(codeToFetch, { limit: 200 })
      .then((res) => {
        if (mounted) setAdminVillages(res.villages || []);
      })
      .catch(() => {
        if (mounted) setAdminVillages([]);
      });
    return () => {
      mounted = false;
    };
  }, [subDistrictFilter, adminSubDistricts]);

  // Derived filter options: union of real case-feature geography and the
  // authoritative LGD hierarchy (so options never depend on hardcoded lists).
  const featureStates = Array.from(
    new Set(
      (casesData?.features || [])
        .map((f: any) => f.properties.state)
        .filter(Boolean)
    )
  ) as string[];

  const availableStates = Array.from(
    new Set([...featureStates, ...adminStates.map((s) => s.name)])
  ).sort();

  const availableDistricts = Array.from(
    new Set([
      ...((casesData?.features || [])
        .filter((f: any) => stateFilter === 'all' || f.properties.state?.toLowerCase() === stateFilter.toLowerCase())
        .map((f: any) => f.properties.district)
        .filter(Boolean) as string[]),
      ...adminDistricts.map((d) => d.name),
    ])
  ).sort();

  const availableSubDistricts = Array.from(
    new Set([
      ...((casesData?.features || [])
        .filter((f: any) => {
          const matchState = stateFilter === 'all' || f.properties.state?.toLowerCase() === stateFilter.toLowerCase();
          const matchDist = districtFilter === 'all' || f.properties.district?.toLowerCase() === districtFilter.toLowerCase();
          return matchState && matchDist;
        })
        .map((f: any) => f.properties.tehsil)
        .filter(Boolean) as string[]),
      ...adminSubDistricts.map((sd) => sd.name),
    ])
  ).sort();

  const availableVillages = Array.from(
    new Set([
      ...((casesData?.features || [])
        .filter((f: any) => {
          const matchState = stateFilter === 'all' || f.properties.state?.toLowerCase() === stateFilter.toLowerCase();
          const matchDist = districtFilter === 'all' || f.properties.district?.toLowerCase() === districtFilter.toLowerCase();
          const matchSub = subDistrictFilter === 'all' || f.properties.tehsil?.toLowerCase() === subDistrictFilter.toLowerCase();
          return matchState && matchDist && matchSub;
        })
        .map((f: any) => f.properties.village)
        .filter(Boolean) as string[]),
      ...adminVillages.map((v) => v.name),
    ])
  ).sort();

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
          subdistrict: subDistrictFilter !== 'all' ? subDistrictFilter : undefined,
          village: villageFilter !== 'all' ? villageFilter : undefined,
          status: statusFilter !== 'all' ? statusFilter : undefined,
          risk_level: riskFilter !== 'all' ? riskFilter : undefined,
          has_geometry:
            mappingFilter === 'mapped' ? 'true' : mappingFilter === 'unmapped' ? 'false' : undefined,
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
  }, [stateFilter, districtFilter, subDistrictFilter, villageFilter, statusFilter, riskFilter, mappingFilter]);

  // 2. Initialize Leaflet Map (Hardware-Accelerated Canvas & High-FPS Smooth Zoom)
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
      wheelDebounceTime: 40,
      wheelPxPerZoomLevel: 100,
      fadeAnimation: true,
      markerZoomAnimation: true,
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

  // 4. Render Layers when Data / Toggles Change (Optimized O(N) single-pass)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear existing layers and case lookup
    casesLayerGroupRef.current?.clearLayers();
    projectsLayerGroupRef.current?.clearLayers();
    clustersLayerGroupRef.current?.clearLayers();
    caseLayersMapRef.current.clear();

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
        let geoLayer: any = null;
        let centroidMarker: any = null;
        let bounds: L.LatLngBounds | undefined = undefined;

        // Polygon boundary
        if (cFeat.geometry) {
          try {
            geoLayer = L.geoJSON(cFeat, {
              style: {
                color,
                weight: 2,
                opacity: 0.9,
                fillColor: color,
                fillOpacity: 0.22,
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
            bounds = geoLayer.getBounds();
            if (bounds) allBounds.extend(bounds);
          } catch {}
        }

        // Centroid marker
        if (props.centroid && Array.isArray(props.centroid)) {
          const [cLat, cLng] = props.centroid;
          centroidMarker = L.circleMarker([cLat, cLng], {
            radius: props.risk_level === 'critical' ? 9 : 7,
            fillColor: color,
            color: '#ffffff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.95,
          });

          centroidMarker.on('click', () => {
            setSelectedCaseId(props.case_id);
          });

          centroidMarker.bindTooltip(
            `<strong>${props.case_number}</strong>: ${props.title}`,
            { direction: 'top' }
          );

          casesLayerGroupRef.current?.addLayer(centroidMarker);
          allBounds.extend([cLat, cLng]);
        }

        if (props.case_id) {
          caseLayersMapRef.current.set(props.case_id, {
            layer: geoLayer,
            marker: centroidMarker,
            defaultColor: color,
            defaultWeight: 2,
            bounds,
          });
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

    // Fit map bounds if features exist on dataset load/toggle change
    if (allBounds.isValid()) {
      map.fitBounds(allBounds, { padding: [40, 40], maxZoom: 14 });
    }
  }, [casesData, projectsData, overview, showCases, showProjects, showClusters]);

  // 4b. Fast In-Place Selection & Smooth Fly-To (Zero Layer Rebuild)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    caseLayersMapRef.current.forEach((item, cId) => {
      const isSelected = cId === selectedCaseId;
      if (item.layer) {
        item.layer.eachLayer((subLayer: any) => {
          if (typeof subLayer.setStyle === 'function') {
            subLayer.setStyle({
              color: isSelected ? '#8B3A2A' : item.defaultColor,
              weight: isSelected ? 3.5 : item.defaultWeight,
              fillOpacity: isSelected ? 0.45 : 0.22,
            });
            if (isSelected) {
              subLayer.bringToFront?.();
            }
          }
        });
      }
      if (item.marker && typeof item.marker.setStyle === 'function') {
        item.marker.setStyle({
          radius: isSelected ? 11 : 7,
          weight: isSelected ? 3 : 2,
          color: isSelected ? '#8B3A2A' : '#ffffff',
        });
        if (isSelected) {
          item.marker.bringToFront?.();
        }
      }
    });

    if (selectedCaseId && caseLayersMapRef.current.has(selectedCaseId)) {
      const item = caseLayersMapRef.current.get(selectedCaseId);
      if (item?.bounds && item.bounds.isValid()) {
        map.flyToBounds(item.bounds, { padding: [60, 60], maxZoom: 14, duration: 0.5 });
      }
    }
  }, [selectedCaseId]);

  // 4b. Location-Aware Spatial Map Navigation on Geography Filter Change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || selectedCaseId) return;

    // Check if any specific geographic filter is active
    if (stateFilter === 'all' && districtFilter === 'all' && subDistrictFilter === 'all' && villageFilter === 'all') {
      return;
    }

    const queryParts: string[] = [];
    let unitType: 'state' | 'district' | 'sub_district' | 'village' = 'state';

    if (villageFilter && villageFilter !== 'all') {
      queryParts.push(villageFilter);
      unitType = 'village';
    }
    if (subDistrictFilter && subDistrictFilter !== 'all') {
      queryParts.push(subDistrictFilter);
      if (!villageFilter || villageFilter === 'all') unitType = 'sub_district';
    }
    if (districtFilter && districtFilter !== 'all') {
      queryParts.push(districtFilter);
      if ((!villageFilter || villageFilter === 'all') && (!subDistrictFilter || subDistrictFilter === 'all')) {
        unitType = 'district';
      }
    }
    if (stateFilter && stateFilter !== 'all') {
      queryParts.push(stateFilter);
    }

    if (queryParts.length === 0) return;

    const query = [...queryParts, 'India'].join(', ');
    const zoomLevelMap = { state: 6, district: 9, sub_district: 11, village: 14 };

    forwardGeocode(query, 1)
      .then((res) => {
        if (!mapInstanceRef.current) return;
        if (res.results && res.results.length > 0) {
          const item = res.results[0];
          if (item.boundingbox && item.boundingbox.length === 4) {
            const [south, north, west, east] = item.boundingbox;
            const bounds = L.latLngBounds([south, west], [north, east]);
            if (bounds.isValid()) {
              mapInstanceRef.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
              return;
            }
          }
          if (item.latitude && item.longitude) {
            mapInstanceRef.current.setView([item.latitude, item.longitude], zoomLevelMap[unitType]);
          }
        }
      })
      .catch(() => {});
  }, [stateFilter, districtFilter, subDistrictFilter, villageFilter, selectedCaseId]);

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
    <div className="space-y-6">
      {/* 1. Page Header & Quick Controls */}
      <PageHeader
        eyebrow={
          <>
            <PageEyebrow>
              <Compass className="h-3 w-3" />
              Spatial Intelligence
            </PageEyebrow>
            {overview?.lgd_status === 'administrative_enrichment_unavailable' && (
              <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                <AlertTriangle className="h-3 w-3" />
                LGD Enrichment Unavailable
              </span>
            )}
          </>
        }
        title="GIS & Spatial Decision Intelligence"
        subtitle="Real-time geodetic corridor mapping, infrastructure alignment, proximity friction clusters & cadastral verification."
        actions={
          <div className="flex items-center gap-3">
            {/* 2D / 3D Spatial Intelligence Switcher */}
            <div className="flex bg-sand-200/80 p-1 rounded-xl border border-sand-300 shadow-2xs">
              <button
                type="button"
                onClick={() => setSpatialMode('2d')}
                className={clsx(
                  'px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer',
                  spatialMode === '2d'
                    ? 'bg-white text-mocha-900 shadow-xs border border-sand-300'
                    : 'text-mocha-600 hover:text-mocha-900'
                )}
              >
                <Layers className="h-3.5 w-3.5 text-terra-700" />
                <span>2D Cadastral Map</span>
              </button>
              <button
                type="button"
                onClick={() => setSpatialMode('3d')}
                className={clsx(
                  'px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer',
                  spatialMode === '3d'
                    ? 'bg-slate-900 text-cyan-300 shadow-xs border border-slate-700'
                    : 'text-mocha-600 hover:text-mocha-900'
                )}
              >
                <Compass className="h-3.5 w-3.5 text-cyan-400 animate-pulse" />
                <span>3D Digital Twin</span>
              </button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              disabled={isLoading}
              leftIcon={<RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />}
            >
              Refresh
            </Button>
          </div>
        }
      />

      {/* Data load error (non-blocking) */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 2. Spatial KPI Metrics */}
      <section>
        <SectionHeading title="Spatial Portfolio Metrics" hint="Real-time statutory telemetry" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <StatCard
            label="Total Cases"
            value={overview?.total_cases || 0}
            hint="National portfolio"
            icon={<FolderKanban className="h-4 w-4" />}
            tone="navy"
          />
          <StatCard
            label="Mapped Corridors"
            value={
              <>
                {overview?.mapped_cases || 0}{' '}
                <span className="text-sm font-normal text-slate-400">
                  (
                  {overview?.total_cases
                    ? Math.round((overview.mapped_cases / overview.total_cases) * 100)
                    : 0}
                  %)
                </span>
              </>
            }
            hint="WGS-84 demarcated"
            icon={<MapPin className="h-4 w-4" />}
            tone="emerald"
          />
          <StatCard
            label="Awaiting GIS Survey"
            value={overview?.unmapped_cases || 0}
            hint="Coordinates unmapped"
            icon={<AlertTriangle className="h-4 w-4" />}
            tone="amber"
          />
          <StatCard
            label="Infrastructure Projects"
            value={`${overview?.projects_with_geometry || 0} / ${overview?.total_projects || 0}`}
            hint="Corridors mapped"
            icon={<Building2 className="h-4 w-4" />}
            tone="slate"
          />
          <StatCard
            label="Proximity Clusters"
            value={overview?.spatial_clusters_count || 0}
            hint="Density grouping"
            icon={<Compass className="h-4 w-4" />}
            tone="orange"
          />
          <StatCard
            label="Administrative LGD"
            value={
              geoSource === 'authoritative' && overview?.lgd_status === 'operational'
                ? 'Operational'
                : 'Unavailable'
            }
            hint={
              geoSource === 'authoritative'
                ? 'National master'
                : 'Authoritative LGD source not ingested'
            }
            icon={
              geoSource === 'authoritative' && overview?.lgd_status === 'operational' ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )
            }
            tone={
              geoSource === 'authoritative' && overview?.lgd_status === 'operational'
                ? 'emerald'
                : 'amber'
            }
          />
        </div>
      </section>

      {/* 3D Digital Twin Studio Viewport */}
      {spatialMode === '3d' ? (
        <section className="animate-in fade-in zoom-in-98 duration-200">
          <DigitalTwin3DStudio
            onSelectCase={onSelectCase}
            onClose={() => setSpatialMode('2d')}
          />
        </section>
      ) : (
        <>
          {/* 3. Multi-Dimensional Filter Bar */}
          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-gov">
            {/* Geographic & Workflow Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="mr-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <Sliders className="h-3.5 w-3.5 text-gov-navy" />
                Geographic Scope
              </div>

          <GeographySourceNote variant="badge" />

          {/* State Filter */}
          <select
            value={stateFilter}
            onChange={(e) => {
              setStateFilter(e.target.value);
              setDistrictFilter('all');
              setSubDistrictFilter('all');
              setVillageFilter('all');
            }}
            className="input input-xs w-auto"
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
            onChange={(e) => {
              setDistrictFilter(e.target.value);
              setSubDistrictFilter('all');
              setVillageFilter('all');
            }}
            disabled={stateFilter !== 'all' && availableDistricts.length === 0}
            className="input input-xs w-auto disabled:cursor-not-allowed"
          >
            <option value="all">All Districts</option>
            {availableDistricts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          {/* Sub-District / Tehsil Filter */}
          <select
            value={subDistrictFilter}
            onChange={(e) => {
              setSubDistrictFilter(e.target.value);
              setVillageFilter('all');
            }}
            disabled={availableSubDistricts.length === 0}
            className="input input-xs w-auto disabled:cursor-not-allowed"
          >
            <option value="all">All Tehsils</option>
            {availableSubDistricts.map((sd) => (
              <option key={sd} value={sd}>
                {sd}
              </option>
            ))}
          </select>

          {/* Village Filter */}
          <select
            value={villageFilter}
            onChange={(e) => setVillageFilter(e.target.value)}
            disabled={availableVillages.length === 0}
            className="input input-xs w-auto disabled:cursor-not-allowed"
          >
            <option value="all">All Villages</option>
            {availableVillages.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <span className="mr-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Workflow
          </span>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input input-xs w-auto"
          >
            <option value="all">All Case Statuses</option>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="under_review">Under Review</option>
            <option value="delayed">Delayed</option>
            <option value="litigation">Litigation</option>
            <option value="completed">Completed</option>
          </select>

          {/* Risk Level Filter */}
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className="input input-xs w-auto"
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
            className="input input-xs w-auto"
          >
            <option value="all">All Mapping States</option>
            <option value="mapped">Mapped Only</option>
            <option value="unmapped">Awaiting Survey</option>
          </select>

          {(stateFilter !== 'all' ||
            districtFilter !== 'all' ||
            subDistrictFilter !== 'all' ||
            villageFilter !== 'all' ||
            statusFilter !== 'all' ||
            riskFilter !== 'all' ||
            mappingFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setStateFilter('all');
                setDistrictFilter('all');
                setSubDistrictFilter('all');
                setVillageFilter('all');
                setStatusFilter('all');
                setRiskFilter('all');
                setMappingFilter('all');
              }}
              className="ml-auto text-xs font-semibold text-gov-navy underline-offset-2 hover:underline"
            >
              Reset Filters
            </button>
          )}
        </div>
      </section>

      {/* 4. Map Viewport, Layers Panel & Context Inspector */}
      <section>
        <div className="flex flex-col gap-4 lg:flex-row">
          {/* Leaflet Map Workspace */}
          <div className="relative min-h-[560px] flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-gov">
            <div ref={mapContainerRef} className="z-0 h-full w-full" />

            {/* Non-blocking data refresh indicator */}
            {isLoading && (
              <div className="absolute left-1/2 top-3 z-[450] flex -translate-x-1/2 items-center gap-2 rounded-lg border border-slate-200 bg-white/95 px-3 py-1.5 text-[11px] font-medium text-slate-600 shadow-gov-md">
                <RefreshCw className="h-3 w-3 animate-spin text-gov-navy" />
                Refreshing spatial datasets...
              </div>
            )}

            {/* Map Legend (Bottom-Left) */}
            <div className="pointer-events-auto absolute bottom-4 left-4 z-[400] max-w-xs space-y-2 rounded-xl border border-slate-200 bg-white/95 p-3 text-xs shadow-gov-md">
              <div className="text-[11px] font-bold uppercase tracking-wider text-gov-slate">
                Risk Color Scheme
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
              <div className="border-t border-slate-100 pt-1.5 text-[10px] text-slate-500">
                Click any corridor or marker to inspect statutory spatial context.
              </div>
            </div>
          </div>

          {/* Layers Panel & Spatial Context Inspector */}
          <div className="flex w-full shrink-0 flex-col gap-4 lg:w-[22rem]">
            {/* Map Layers Panel */}
            <div className="relative rounded-xl border border-slate-200 bg-white shadow-gov">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Map Layers
                </h2>
                <div className="flex items-center gap-1">
                  <Layers className="h-3.5 w-3.5 text-slate-400" />
                  {/* Bhuvan Disclaimer / Info Popover */}
                  <button
                    type="button"
                    onClick={() => setShowBhuvanInfo(!showBhuvanInfo)}
                    aria-label="Bhuvan Geospatial Information & Statutory Disclaimer"
                    aria-pressed={showBhuvanInfo}
                    className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                    title="Bhuvan Geospatial Information & Statutory Disclaimer"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </div>

                {showBhuvanInfo && (
                  <div className="absolute right-3 top-11 z-50 w-80 animate-in fade-in rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-gov-lg">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                      <span className="flex items-center gap-1.5 font-bold text-gov-slate">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        ISRO / NRSC Bhuvan Overlays
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowBhuvanInfo(false)}
                        aria-label="Close Bhuvan disclaimer"
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
                      <div className="rounded border border-amber-200 bg-amber-50 p-2 text-[10px] leading-relaxed text-amber-800">
                        <strong>Statutory Disclaimer:</strong> Bhuvan layers provide thematic and reference
                        spatial context. They do <em>not</em> constitute cadastral ground truth, legal
                        boundaries, or land records for compensation determination.
                      </div>
                      {bhuvanUnsupported.length > 0 && (
                        <div className="rounded border border-slate-200 bg-slate-50 p-1.5 text-[10px] text-slate-600">
                          <strong>Unavailable in:</strong> {bhuvanUnsupported.join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Layer Toggle List */}
              <div className="space-y-0.5 p-2">
                <LayerToggleRow
                  icon={<FolderKanban className="h-3.5 w-3.5" />}
                  label="Acquisition Cases"
                  checked={showCases}
                  onToggle={() => setShowCases(!showCases)}
                  dotClassName="bg-blue-600"
                />
                <LayerToggleRow
                  icon={<Building2 className="h-3.5 w-3.5" />}
                  label="Project Corridors"
                  checked={showProjects}
                  onToggle={() => setShowProjects(!showProjects)}
                  dotClassName="bg-slate-500"
                />
                <LayerToggleRow
                  icon={<Compass className="h-3.5 w-3.5" />}
                  label="Proximity Clusters"
                  checked={showClusters}
                  onToggle={() => setShowClusters(!showClusters)}
                  dotClassName="bg-amber-500"
                />
                <LayerToggleRow
                  icon={<MapPin className="h-3.5 w-3.5" />}
                  label="Cadastral Parcels"
                  checked={showParcels}
                  onToggle={() => setShowParcels(!showParcels)}
                  dotClassName="bg-purple-600"
                />

                <div className="mx-2 my-1.5 border-t border-slate-100" />

                {/* Bhuvan Sovereign Thematic Overlays */}
                <LayerToggleRow
                  icon={<Layers className="h-3.5 w-3.5" />}
                  label={
                    <span className="flex items-center gap-1">
                      Bhuvan LULC
                      <span className="rounded bg-emerald-100 px-1 py-0.5 font-mono text-[9px] font-semibold text-emerald-800">
                        2015–16
                      </span>
                    </span>
                  }
                  checked={showBhuvanLulc}
                  onToggle={() => setShowBhuvanLulc(!showBhuvanLulc)}
                  title="Toggle ISRO Bhuvan Land Use / Land Cover (1:50,000 reference cartography)"
                  dotClassName="bg-emerald-600"
                  trailing={
                    bhuvanLoading ? (
                      <RefreshCw className="h-3 w-3 shrink-0 animate-spin text-emerald-600" />
                    ) : undefined
                  }
                />
                <LayerToggleRow
                  icon={<AlertTriangle className="h-3.5 w-3.5" />}
                  label={
                    <span className="flex items-center gap-1">
                      Bhuvan Hazard
                      <span className="rounded bg-orange-100 px-1 py-0.5 font-mono text-[9px] font-semibold text-orange-800">
                        2023
                      </span>
                    </span>
                  }
                  checked={showBhuvanDisaster}
                  onToggle={() => setShowBhuvanDisaster(!showBhuvanDisaster)}
                  title="Toggle ISRO Bhuvan Disaster Hazard Susceptibility"
                  dotClassName="bg-orange-600"
                />
              </div>

              {/* Basemap Style Selector */}
              <div className="space-y-2 border-t border-slate-100 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Basemap Cartography
                  </span>
                  {fallbackInfo?.isFallback && (
                    <span
                      className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
                      title={fallbackInfo.fallbackReason || 'OpenStreetMap fallback active'}
                    >
                      <AlertTriangle className="h-3 w-3 shrink-0 text-amber-600" />
                      OSM Fallback
                    </span>
                  )}
                </div>

                {/* Quick Base Map Presets */}
                <div className="grid grid-cols-4 gap-1 rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setBaseMap('osm')}
                    className={`rounded-md px-1.5 py-1 font-medium text-center transition-all ${
                      baseMap === 'osm'
                        ? 'bg-white font-bold text-gov-navy shadow-gov'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    OSM
                  </button>
                  <button
                    type="button"
                    onClick={() => setBaseMap('satellite')}
                    className={`rounded-md px-1.5 py-1 font-medium text-center transition-all ${
                      baseMap === 'satellite'
                        ? 'bg-emerald-700 font-bold text-white shadow-gov'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Satellite
                  </button>
                  <button
                    type="button"
                    onClick={() => setBaseMap('dark')}
                    className={`rounded-md px-1.5 py-1 font-medium text-center transition-all ${
                      baseMap === 'dark'
                        ? 'bg-gov-slate font-bold text-white shadow-gov'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Dark
                  </button>
                  <button
                    type="button"
                    onClick={() => setBaseMap('light')}
                    className={`rounded-md px-1.5 py-1 font-medium text-center transition-all ${
                      baseMap === 'light' || baseMap === 'positron'
                        ? 'bg-white font-bold text-gov-navy shadow-gov'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Light
                  </button>
                </div>

                <select
                  value={baseMap}
                  onChange={(e) => setBaseMap(e.target.value as TileBaseMap)}
                  className="input input-xs"
                  title="Select Basemap Cartography"
                >
                  <option value="osm">OpenStreetMap Standard (Open / Zero-Key)</option>
                  <option value="satellite">Esri World Imagery (Optical Satellite HD)</option>
                  <option value="dark">Esri Dark Canvas (High-Contrast Night)</option>
                  <option value="light">Esri Light Canvas (Clean Neutral Gray)</option>
                  <option value="topo">Esri Topographic (Contours & Relief)</option>
                  <option value="streets">Esri World Street Map (Highways & Landmarks)</option>
                </select>
              </div>
            </div>

            {/* Spatial Context Inspector */}
            <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-gov">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                <div>
                  <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Spatial Context Inspector
                  </h2>
                  <p className="text-[10px] text-slate-400">
                    {selectedCaseId
                      ? 'Statutory case spatial context'
                      : 'Portfolio summary & friction clusters'}
                  </p>
                </div>
                {contextLoading && (
                  <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin text-gov-navy" />
                )}
                {selectedCaseId && (
                  <button
                    type="button"
                    onClick={() => setSelectedCaseId(null)}
                    aria-label="Close spatial context inspector"
                    className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto p-4">
                {selectedCaseId ? (
                  // Feature Detail View
                  <>
                    {/* Header */}
                    <div className="border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 font-mono text-xs font-bold text-blue-700">
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
                      <h3 className="mt-1.5 text-sm font-bold leading-snug text-gov-slate">
                        {spatialContext?.title || 'Case Spatial Context'}
                      </h3>
                      {spatialContext?.project_name && (
                        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                          <Building2 className="h-3 w-3 text-slate-400" />
                          <span>{spatialContext.project_name}</span>
                        </div>
                      )}
                    </div>

                    {/* Administrative Hierarchy Block */}
                    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
                      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-700">
                        <span>Administrative Hierarchy</span>
                        {spatialContext?.administrative_hierarchy.lgd_status === 'mapped' ? (
                          <span className="font-bold text-emerald-700">LGD Verified</span>
                        ) : (
                          <span className="font-bold text-amber-700">Enrichment Unavailable</span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-slate-600">
                        <div>
                          <span className="block text-[10px] text-slate-400">State:</span>
                          <span className="font-semibold text-slate-800">
                            {spatialContext?.state || 'N/A'}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-slate-400">District:</span>
                          <span className="font-semibold text-slate-800">
                            {spatialContext?.district || 'N/A'}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-slate-400">Tehsil / Taluk:</span>
                          <span className="font-semibold text-slate-800">
                            {spatialContext?.tehsil || 'N/A'}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-slate-400">Revenue Village:</span>
                          <span className="font-semibold text-slate-800">
                            {spatialContext?.village || 'N/A'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Spatial Geometry & Cadastral Metrics */}
                    <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-xs">
                      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-blue-900">
                        <span>Spatial Metrics &amp; Geometry</span>
                        <span className="font-bold text-blue-700">
                          Quality: {spatialContext?.geometry_quality_score ?? 0}/100
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-slate-700">
                        <div>
                          <span className="block text-[10px] text-slate-500">Demarcated Area:</span>
                          <span className="font-bold text-slate-900">
                            {spatialContext?.total_area_hectares} Hectares
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-slate-500">Geometry Type:</span>
                          <span className="font-bold text-slate-900">
                            {spatialContext?.geometry_type || '—'}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-slate-500">Total Cadastral Parcels:</span>
                          <span className="font-bold text-slate-900">
                            {spatialContext?.parcels_summary.total} plots
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-slate-500">Parcels with GIS:</span>
                          <span className="font-bold text-emerald-700">
                            {spatialContext?.parcels_summary.mapped} plots
                          </span>
                        </div>
                      </div>

                      {spatialContext?.parcels_summary.disputed ? (
                        <div className="mt-2 flex items-center gap-1.5 rounded border border-red-200 bg-red-50 p-2 text-[11px] text-red-800">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-600" />
                          <span>
                            <strong>{spatialContext.parcels_summary.disputed} Disputed Parcels</strong>{' '}
                            under active title litigation.
                          </span>
                        </div>
                      ) : null}

                      <div className="pt-2 border-t border-blue-200/60">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => setIsCorridorModalOpen(true)}
                          className="w-full justify-center text-xs font-semibold shadow-xs flex items-center gap-1.5 bg-gov-navy hover:bg-gov-blue text-white"
                        >
                          <Navigation className="h-3.5 w-3.5" />
                          <span>Project Corridor Details</span>
                        </Button>
                      </div>
                    </div>

                    {/* Nearby Infrastructure Proximity Block */}
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-700">
                        <span>Nearby Infrastructure ({spatialContext?.nearby_cases.length || 0})</span>
                        <span className="text-[10px] font-normal text-slate-400">
                          Within 25km radius
                        </span>
                      </div>

                      {spatialContext?.nearby_cases && spatialContext.nearby_cases.length > 0 ? (
                        <div className="space-y-1.5">
                          {spatialContext.nearby_cases.map((nb) => (
                            <button
                              key={nb.id}
                              type="button"
                              onClick={() => setSelectedCaseId(nb.id)}
                              className="flex w-full items-center justify-between rounded-lg border border-slate-200 p-2 text-left transition-colors hover:bg-slate-50"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 font-semibold text-gov-slate">
                                  <span>{nb.case_number}</span>
                                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                                    {nb.status}
                                  </span>
                                </div>
                                <div className="max-w-[200px] truncate text-[10px] text-slate-500">
                                  {nb.title}
                                </div>
                              </div>
                              <div className="shrink-0 text-right">
                                <span className="font-mono text-xs font-bold text-blue-700">
                                  {nb.distance_km} km
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 py-2 text-center text-xs italic text-slate-400">
                          No neighboring acquisition cases detected within statutory search radius.
                        </div>
                      )}
                    </div>

                    {/* Statutory Data Provenance */}
                    <div className="mt-auto space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[11px] text-slate-500">
                      <div className="text-[10px] font-bold uppercase text-slate-700">
                        Data Provenance
                      </div>
                      <div>
                        Source:{' '}
                        <span className="font-mono text-slate-800">
                          {spatialContext?.provenance.source_id}
                        </span>
                      </div>
                      <div>
                        Type:{' '}
                        <span className="font-semibold text-slate-800">
                          {spatialContext?.provenance.provenance_type}
                        </span>
                      </div>
                      <div>
                        Recorded:{' '}
                        <span className="text-slate-600">
                          {spatialContext?.provenance.retrieved_at
                            ? new Date(spatialContext.provenance.retrieved_at).toLocaleDateString()
                            : 'N/A'}
                        </span>
                      </div>
                    </div>

                    {/* Action Button */}
                    <Button
                      variant="primary"
                      size="sm"
                      className="w-full"
                      onClick={() => onSelectCase(selectedCaseId)}
                    >
                      <FileCheck className="mr-1.5 h-4 w-4" />
                      Open Statutory Case File
                    </Button>
                  </>
                ) : (
                  // Default Spatial Summary View
                  <>
                    <div>
                      <h3 className="text-sm font-bold text-gov-slate">Spatial Portfolio Summary</h3>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Select an acquisition corridor or marker on the map to inspect its spatial and
                        cadastral details.
                      </p>
                    </div>

                    {/* Spatial Clusters List */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-700">
                        <span>Detected Friction Clusters ({overview?.clusters.length || 0})</span>
                        <span className="text-[10px] font-normal text-slate-400">15km radius</span>
                      </div>

                      {overview?.clusters && overview.clusters.length > 0 ? (
                        <div className="space-y-2">
                          {overview.clusters.map((cl) => (
                            <div
                              key={cl.cluster_id}
                              className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50/50 p-3"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold uppercase text-amber-900">
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
                              <div className="rounded bg-amber-100/50 p-1.5 text-[10px] italic text-amber-800">
                                {cl.sample_size_note}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 py-4 text-center text-xs italic text-slate-400">
                          No spatial density clusters detected under current filter criteria.
                        </div>
                      )}
                    </div>

                    {/* Layer Health Manifest */}
                    <div className="space-y-2">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-700">
                        Spatial Layer Manifest
                      </div>
                      <div className="space-y-1.5 text-xs">
                        {overview?.layer_manifest.map((lyr) => (
                          <div
                            key={lyr.id}
                            className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-2"
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-slate-800">{lyr.name}</div>
                              <div className="text-[10px] text-slate-500">{lyr.description}</div>
                            </div>
                            <div className="shrink-0 text-right">
                              <span className="font-mono text-xs font-bold text-gov-navy">
                                {lyr.feature_count}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )}

      {/* Project Corridor Alignment Configuration & Inspection Modal */}
      {selectedCaseId && (
        <ProjectCorridorModal
          isOpen={isCorridorModalOpen}
          onClose={() => setIsCorridorModalOpen(false)}
          caseId={selectedCaseId}
          caseTitle={spatialContext?.title || 'Selected Acquisition Case'}
          onCorridorUpdated={async () => {
            if (selectedCaseId) {
              const ctx = await fetchGISSpatialContext(selectedCaseId);
              setSpatialContext(ctx);
            }
          }}
        />
      )}
    </div>
  );
};
