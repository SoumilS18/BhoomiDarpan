import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import {
  Compass,
  Play,
  Pause,
  RotateCcw,
  Sliders,
  TrendingUp,
  AlertTriangle,
  Building2,
  Layers,
  MapPin,
  ExternalLink,
  Info,
  CheckCircle2,
  Sparkles,
  Maximize2,
  Navigation,
  LandPlot,
  X,
  Globe2,
  Eye,
  Crosshair,
  Maximize,
} from 'lucide-react';
import { clsx } from 'clsx';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { fetchCases, fetchCaseById, fetchGISSpatialContext } from '../../lib/api';
import { AcquisitionCase, Parcel } from '../../../shared/types';

export interface DigitalTwin3DStudioProps {
  onClose?: () => void;
  onSelectCase?: (caseId: string) => void;
  selectedCaseId?: string | null;
  initialCase?: AcquisitionCase | null;
  casesData?: any;
  projectsData?: any;
}

export interface DynamicParcel3D {
  id: string;
  surveyNo: string;
  khataNo?: string;
  village: string;
  district: string;
  state: string;
  ownerName: string;
  landType: string;
  areaAcres: number;
  areaHa: number;
  stage: 'possessed' | 'awarded' | 'surveyed' | 'notified' | 'identified' | 'disputed';
  compensationCr: number;
  riskScore: number;
  pafCount: number;
  pos: [number, number]; // [x, z] in local 3D world meters
  width: number;
  depth: number;
  polygonPoints?: [number, number][];
}

export interface SurroundingRegion3D {
  id: string;
  caseNumber: string;
  title: string;
  village: string;
  district: string;
  state: string;
  totalAreaHa: number;
  estimatedCompCr: number;
  distanceKm: number;
  bearing: string;
  pos: [number, number]; // [x, z] in 3D
  polygonPoints?: [number, number][];
  status: string;
}

const ADMINISTRATIVE_COORDINATE_ANCHORS: Record<string, [number, number]> = {
  // Uttar Pradesh
  'varanasi': [25.3176, 82.9739],
  'ahiran': [25.3330, 82.9703],
  'lucknow': [26.8467, 80.9462],
  'kanpur': [26.4499, 80.3319],
  'agra': [27.1767, 78.0081],
  'noida': [28.5355, 77.3910],
  'uttar pradesh': [26.8467, 80.9462],

  // Maharashtra
  'pune': [18.5204, 73.8567],
  'mumbai': [19.0760, 72.8777],
  'nagpur': [21.1458, 79.0882],
  'nashik': [19.9975, 73.7898],
  'aurangabad': [19.8762, 75.3433],
  'maharashtra': [19.7515, 75.7139],

  // Gujarat
  'ahmedabad': [23.0225, 72.5714],
  'surat': [21.1702, 72.8311],
  'vadodara': [22.3072, 73.1812],
  'gandhinagar': [23.2156, 72.6369],
  'gujarat': [22.2587, 71.1924],

  // Karnataka
  'bengaluru': [12.9716, 77.5946],
  'bangalore': [12.9716, 77.5946],
  'mysuru': [12.2958, 76.6394],
  'karnataka': [15.3173, 75.7139],

  // Delhi & NCR
  'delhi': [28.6139, 77.2090],
  'new delhi': [28.6139, 77.2090],

  // Tamil Nadu
  'chennai': [13.0827, 80.2707],
  'coimbatore': [11.0168, 76.9558],
  'tamil nadu': [11.1271, 78.6569],

  // Rajasthan
  'jaipur': [26.9124, 75.7873],
  'jodhpur': [26.2389, 73.0243],
  'rajasthan': [27.0238, 74.2179],

  // West Bengal & Bihar
  'kolkata': [22.5726, 88.3639],
  'patna': [25.5941, 85.1376],
  'bihar': [25.0961, 85.3131],

  // Madhya Pradesh
  'bhopal': [23.2599, 77.4126],
  'indore': [22.7196, 75.8577],
  'madhya pradesh': [22.9734, 78.6569],
};

function calculateHaversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

function getCompassBearing(lat1: number, lon1: number, lat2: number, lon2: number): string {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLon);
  let brng = (Math.atan2(y, x) * 180) / Math.PI;
  brng = (brng + 360) % 360;
  const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return points[Math.round(brng / 45) % 8];
}

function getStageMeta(stage: string): { label: string; hex: number; tailwind: string } {
  switch (stage?.toLowerCase()) {
    case 'possessed':
    case 'completed':
      return { label: 'Possessed / Disbursed', hex: 0x10b981, tailwind: 'text-emerald-400' };
    case 'awarded':
      return { label: 'Sec 23 Award Declared', hex: 0x06b6d4, tailwind: 'text-cyan-400' };
    case 'surveyed':
    case 'notified':
    case 'section19':
      return { label: 'Sec 19 Declaration', hex: 0xf59e0b, tailwind: 'text-amber-400' };
    case 'disputed':
      return { label: 'Disputed / Litigated', hex: 0xef4444, tailwind: 'text-rose-400' };
    case 'identified':
    default:
      return { label: 'Joint Survey Demarcated', hex: 0x3b82f6, tailwind: 'text-blue-400' };
  }
}

export const DigitalTwin3DStudio: React.FC<DigitalTwin3DStudioProps> = ({
  onClose,
  onSelectCase,
  selectedCaseId: initialCaseId,
  initialCase,
  casesData,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const dynamicGroupRef = useRef<THREE.Group | null>(null);
  const boundaryGroupRef = useRef<THREE.Group | null>(null);
  const surroundingGroupRef = useRef<THREE.Group | null>(null);
  const parcelMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const surroundingMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const flythroughAnimRef = useRef<number | null>(null);

  // Dynamic Case & State
  const [activeCaseId, setActiveCaseId] = useState<string>(
    initialCaseId || initialCase?.id || ''
  );
  const [allCases, setAllCases] = useState<AcquisitionCase[]>([]);
  const [activeCase, setActiveCase] = useState<AcquisitionCase | null>(initialCase || null);
  const [dynamicParcels, setDynamicParcels] = useState<DynamicParcel3D[]>([]);
  const [selectedParcel, setSelectedParcel] = useState<DynamicParcel3D | null>(null);
  const [selectedSurrounding, setSelectedSurrounding] = useState<SurroundingRegion3D | null>(null);
  const [surroundingRegions, setSurroundingRegions] = useState<SurroundingRegion3D[]>([]);
  const [isLoadingCase, setIsLoadingCase] = useState<boolean>(true);

  // Layer Toggles
  const [showSurroundingRegions, setShowSurroundingRegions] = useState<boolean>(true);
  const [showBufferEnvelope, setShowBufferEnvelope] = useState<boolean>(true);
  const [showCadastralGrid, setShowCadastralGrid] = useState<boolean>(true);

  // Extrusion & Camera Controls
  const [metricMode, setMetricMode] = useState<'compensation' | 'risk' | 'paf' | 'area'>('compensation');
  const [isPlayingFlythrough, setIsPlayingFlythrough] = useState<boolean>(false);

  // Geodetic Coordinates
  const [geodeticDatum, setGeodeticDatum] = useState<{
    lat: number;
    lng: number;
    source: 'boundary_polygon' | 'spatial_context' | 'administrative_anchor';
  }>({
    lat: 25.3330,
    lng: 82.9703,
    source: 'administrative_anchor',
  });

  // Camera Orbit
  const isDraggingRef = useRef(false);
  const previousMousePositionRef = useRef({ x: 0, y: 0 });
  const cameraTargetRef = useRef(new THREE.Vector3(0, 0, 0));
  const cameraAngleRef = useRef({ theta: Math.PI / 4, phi: Math.PI / 6, radius: 105 });

  // 1. Fetch available cases for the selector & surrounding regions
  useEffect(() => {
    let isMounted = true;
    const loadCasesList = async () => {
      try {
        const res = await fetchCases();
        if (isMounted && res.cases && res.cases.length > 0) {
          setAllCases(res.cases);
          if (!activeCaseId) {
            setActiveCaseId(res.cases[0].id);
          }
        }
      } catch (err) {
        console.warn('Failed to load cases list for 3D studio', err);
      }
    };
    loadCasesList();
    return () => {
      isMounted = false;
    };
  }, []);

  // Update activeCaseId when selectedCaseId prop changes externally
  useEffect(() => {
    if (initialCaseId && initialCaseId !== activeCaseId) {
      setActiveCaseId(initialCaseId);
    }
  }, [initialCaseId]);

  // 2. Fetch full authentic case record & parcels whenever activeCaseId changes
  useEffect(() => {
    if (!activeCaseId) return;

    let isMounted = true;
    setIsLoadingCase(true);

    const loadActiveCase = async () => {
      try {
        const [caseRes, spatialCtx] = await Promise.all([
          fetchCaseById(activeCaseId),
          fetchGISSpatialContext(activeCaseId).catch(() => null),
        ]);

        if (!isMounted) return;

        const currentCase = caseRes.case;
        setActiveCase(currentCase);

        // Derive Geodetic Centroid from Case Boundary
        let centerLat = 25.3330;
        let centerLng = 82.9703;
        let coordSource: 'boundary_polygon' | 'spatial_context' | 'administrative_anchor' = 'administrative_anchor';

        const boundaryCoords: [number, number][] = [];
        if (currentCase.geojson_boundary?.coordinates) {
          const raw = currentCase.geojson_boundary.type === 'MultiPolygon'
            ? currentCase.geojson_boundary.coordinates[0]?.[0]
            : currentCase.geojson_boundary.coordinates[0];

          if (Array.isArray(raw) && raw.length > 0) {
            raw.forEach((pt: any) => {
              if (Array.isArray(pt) && pt.length >= 2) {
                boundaryCoords.push([Number(pt[0]), Number(pt[1])]);
              }
            });
          }
        }

        if (boundaryCoords.length > 0) {
          centerLng = boundaryCoords.reduce((sum, c) => sum + c[0], 0) / boundaryCoords.length;
          centerLat = boundaryCoords.reduce((sum, c) => sum + c[1], 0) / boundaryCoords.length;
          coordSource = 'boundary_polygon';
        } else if (spatialCtx?.centroid && Array.isArray(spatialCtx.centroid)) {
          centerLat = spatialCtx.centroid[0];
          centerLng = spatialCtx.centroid[1];
          coordSource = 'spatial_context';
        } else {
          const villageKey = (currentCase.village || '').trim().toLowerCase();
          const districtKey = (currentCase.district || '').trim().toLowerCase();
          const stateKey = (currentCase.state || '').trim().toLowerCase();

          const anchor =
            ADMINISTRATIVE_COORDINATE_ANCHORS[villageKey] ||
            ADMINISTRATIVE_COORDINATE_ANCHORS[districtKey] ||
            ADMINISTRATIVE_COORDINATE_ANCHORS[stateKey] ||
            [25.3176, 82.9739];

          centerLat = anchor[0];
          centerLng = anchor[1];
          coordSource = 'administrative_anchor';
        }

        setGeodeticDatum({ lat: centerLat, lng: centerLng, source: coordSource });

        // Geodetic Projection Scale
        const latRad = (centerLat * Math.PI) / 180;
        const metersPerDegLng = 111320 * Math.cos(latRad);
        const metersPerDegLat = 110540;

        const to3DX = (lng: number) => (lng - centerLng) * metersPerDegLng * 0.05;
        const to3DZ = (lat: number) => -(lat - centerLat) * metersPerDegLat * 0.05;

        // Transform Real Parcels from caseItem.parcels
        const rawParcels: Parcel[] = currentCase.parcels || [];

        if (rawParcels.length > 0) {
          const transformed: DynamicParcel3D[] = rawParcels.map((p, idx) => {
            const areaAcres = Number(p.area_acres) > 0 ? Number(p.area_acres) : 1.25;
            const areaHa = Number((areaAcres * 0.404686).toFixed(2));
            const compensationCr = p.compensation_amount
              ? Number((p.compensation_amount / 10000000).toFixed(2))
              : Number((areaAcres * 0.35).toFixed(2));

            const isDisputed = p.acquisition_status === 'disputed';
            const owner = Array.isArray(p.landowner_names) && p.landowner_names.length > 0
              ? p.landowner_names.join(', ')
              : 'Registered Landholder';

            let x = 0;
            let z = 0;
            let width = Math.max(5, Math.min(14, Math.sqrt(areaAcres) * 5.5));
            let depth = Math.max(5, Math.min(14, Math.sqrt(areaAcres) * 5.5));

            if (p.geojson_geometry?.coordinates) {
              const coords = p.geojson_geometry.coordinates[0] || [];
              if (coords.length > 0) {
                const pLng = coords.reduce((sum: number, c: any) => sum + c[0], 0) / coords.length;
                const pLat = coords.reduce((sum: number, c: any) => sum + c[1], 0) / coords.length;
                x = to3DX(pLng);
                z = to3DZ(pLat);
              }
            } else {
              const cols = Math.ceil(Math.sqrt(rawParcels.length));
              const row = Math.floor(idx / cols);
              const col = idx % cols;
              x = (col - (cols - 1) / 2) * 14;
              z = (row - (Math.ceil(rawParcels.length / cols) - 1) / 2) * 14;
            }

            return {
              id: p.id,
              surveyNo: p.survey_number || `${idx + 1}`,
              khataNo: p.khata_number || undefined,
              village: currentCase.village,
              district: currentCase.district,
              state: currentCase.state,
              ownerName: owner,
              landType: p.land_type || 'Agricultural',
              areaAcres: Number(areaAcres.toFixed(2)),
              areaHa,
              stage: (p.acquisition_status as any) || 'identified',
              compensationCr,
              riskScore: isDisputed ? 90 : 15 + (idx % 20),
              pafCount: Math.max(1, Math.round(areaAcres * 2)),
              pos: [Number(x.toFixed(1)), Number(z.toFixed(1))],
              width: Number(width.toFixed(1)),
              depth: Number(depth.toFixed(1)),
            };
          });

          setDynamicParcels(transformed);
          setSelectedParcel(transformed[0] || null);
        } else {
          setDynamicParcels([]);
          setSelectedParcel(null);
        }

        // Calculate Surrounding Regions (Nearby Cases in Portfolio/Jurisdiction)
        const others = allCases.filter((c) => c.id !== currentCase.id);
        const computedSurroundings: SurroundingRegion3D[] = [];

        others.forEach((other, oIdx) => {
          let otherLng = centerLng;
          let otherLat = centerLat;
          let polygonPoints: [number, number][] | undefined = undefined;

          if (other.geojson_boundary?.coordinates) {
            const rawO = other.geojson_boundary.type === 'MultiPolygon'
              ? other.geojson_boundary.coordinates[0]?.[0]
              : other.geojson_boundary.coordinates[0];

            if (Array.isArray(rawO) && rawO.length > 0) {
              const coords: [number, number][] = rawO.map((pt: any) => [Number(pt[0]), Number(pt[1])]);
              otherLng = coords.reduce((sum, c) => sum + c[0], 0) / coords.length;
              otherLat = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;

              polygonPoints = coords.map((pt) => [to3DX(pt[0]), to3DZ(pt[1])]);
            }
          } else {
            // Anchor to administrative or relative corridor offset
            const angle = (oIdx * (Math.PI / 3)) + Math.PI / 4;
            const distMeters = 400 + (oIdx * 250);
            const offX = Math.cos(angle) * distMeters;
            const offZ = Math.sin(angle) * distMeters;
            otherLng = centerLng + (offX / metersPerDegLng);
            otherLat = centerLat - (offZ / metersPerDegLat);
          }

          const distKm = calculateHaversineKm(centerLat, centerLng, otherLat, otherLng);
          const bearing = getCompassBearing(centerLat, centerLng, otherLat, otherLng);
          const x = to3DX(otherLng);
          const z = to3DZ(otherLat);

          computedSurroundings.push({
            id: other.id,
            caseNumber: other.case_number,
            title: other.title,
            village: other.village,
            district: other.district,
            state: other.state,
            totalAreaHa: Number(other.total_area_hectares || 12),
            estimatedCompCr: Number(((other.estimated_compensation || 120000000) / 10000000).toFixed(2)),
            distanceKm: distKm,
            bearing,
            pos: [Number(x.toFixed(1)), Number(z.toFixed(1))],
            polygonPoints,
            status: other.status || 'active',
          });
        });

        // Also add Adjacent Revenue Village Cadastral Sectors if only 1 or 0 cases nearby
        if (computedSurroundings.length < 3) {
          const villageName = currentCase.village || 'Revenue';
          const defaultSectors = [
            { name: `${villageName} North Sector`, dist: 0.65, bearing: 'N', x: 0, z: -45, area: 18.5 },
            { name: `${villageName} East Agricultural Belt`, dist: 0.85, bearing: 'E', x: 50, z: 0, area: 24.0 },
            { name: `${villageName} South Buffer Sector`, dist: 0.70, bearing: 'S', x: 0, z: 45, area: 15.2 },
          ];

          defaultSectors.forEach((sec, sIdx) => {
            computedSurroundings.push({
              id: `sector-cadastre-${sIdx + 1}`,
              caseNumber: `REV-SEC-${sIdx + 101}`,
              title: sec.name,
              village: currentCase.village,
              district: currentCase.district,
              state: currentCase.state,
              totalAreaHa: sec.area,
              estimatedCompCr: Number((sec.area * 0.85).toFixed(2)),
              distanceKm: sec.dist,
              bearing: sec.bearing,
              pos: [sec.x, sec.z],
              status: 'cadastral_sector',
            });
          });
        }

        setSurroundingRegions(computedSurroundings);
      } catch (err) {
        console.error('Failed to load spatial case details', err);
      } finally {
        if (isMounted) setIsLoadingCase(false);
      }
    };

    loadActiveCase();
    return () => {
      isMounted = false;
    };
  }, [activeCaseId, allCases]);

  // Parcel Height Calculation
  const getParcelHeight = useCallback(
    (parcel: DynamicParcel3D): number => {
      switch (metricMode) {
        case 'compensation':
          return Math.max(3, Math.min(26, parcel.compensationCr * 5 + 3));
        case 'risk':
          return Math.max(3, Math.min(26, (parcel.riskScore / 100) * 24 + 2));
        case 'paf':
          return Math.max(3, Math.min(26, parcel.pafCount * 2.2 + 3));
        case 'area':
          return Math.max(3, Math.min(26, parcel.areaHa * 3.5 + 3));
        default:
          return 6;
      }
    },
    [metricMode]
  );

  // 3. Initialize Three.js WebGL Scene
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060b13);
    scene.fog = new THREE.FogExp2(0x060b13, 0.005);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1200);
    cameraRef.current = camera;

    const updateCameraPos = () => {
      const { theta, phi, radius } = cameraAngleRef.current;
      camera.position.x = radius * Math.sin(phi) * Math.sin(theta);
      camera.position.y = radius * Math.cos(phi);
      camera.position.z = radius * Math.sin(phi) * Math.cos(theta);
      camera.lookAt(cameraTargetRef.current);
    };
    updateCameraPos();

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;
    container.replaceChildren(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfff5ea, 1.4);
    sunLight.position.set(60, 90, 50);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    scene.add(sunLight);

    const skyHemisphere = new THREE.HemisphereLight(0x38bdf8, 0x0f172a, 0.65);
    scene.add(skyHemisphere);

    // Extended Ground Plane spanning surrounding landscape
    const groundGeo = new THREE.PlaneGeometry(320, 320, 50, 50);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x0b1120,
      roughness: 0.92,
      metalness: 0.08,
    });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = -0.05;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    // Outer Regional Terrain Wireframe
    const outerGrid = new THREE.GridHelper(300, 60, 0x0284c7, 0x1e293b);
    outerGrid.position.y = 0.01;
    scene.add(outerGrid);

    // True North Compass Ring Indicator on Ground
    const compassGroup = new THREE.Group();
    compassGroup.position.set(0, 0.05, 0);
    scene.add(compassGroup);

    const ringGeo = new THREE.RingGeometry(85, 86, 64);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x0369a1, side: THREE.DoubleSide, transparent: true, opacity: 0.4 });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    compassGroup.add(ringMesh);

    // True North Arrow (-Z in Three.js)
    const northArrowGeo = new THREE.ConeGeometry(2.5, 7, 4);
    const northArrowMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const northArrow = new THREE.Mesh(northArrowGeo, northArrowMat);
    northArrow.position.set(0, 0.3, -90);
    northArrow.rotation.x = Math.PI / 2;
    compassGroup.add(northArrow);

    // Scene Groups
    const dynamicGroup = new THREE.Group();
    scene.add(dynamicGroup);
    dynamicGroupRef.current = dynamicGroup;

    const boundaryGroup = new THREE.Group();
    scene.add(boundaryGroup);
    boundaryGroupRef.current = boundaryGroup;

    const surroundingGroup = new THREE.Group();
    scene.add(surroundingGroup);
    surroundingGroupRef.current = surroundingGroup;

    // Animation Loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    // Mouse Controls (Orbit, Pan, Zoom)
    const handleMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const deltaX = e.clientX - previousMousePositionRef.current.x;
      const deltaY = e.clientY - previousMousePositionRef.current.y;
      cameraAngleRef.current.theta -= deltaX * 0.007;
      cameraAngleRef.current.phi = Math.max(0.1, Math.min(Math.PI / 2.15, cameraAngleRef.current.phi + deltaY * 0.007));
      updateCameraPos();
      previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      cameraAngleRef.current.radius = Math.max(25, Math.min(220, cameraAngleRef.current.radius + e.deltaY * 0.08));
      updateCameraPos();
    };

    // Interactive Raycasting (Clicking 3D Parcels or Surrounding Cases)
    const raycaster = new THREE.Raycaster();
    const mouseVector = new THREE.Vector2();

    const handleCanvasClick = (e: MouseEvent) => {
      if (!container || !cameraRef.current) return;
      const rect = container.getBoundingClientRect();
      mouseVector.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseVector.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouseVector, cameraRef.current);

      // Check Active Case Parcels First
      const parcelMeshes = Array.from(parcelMeshesRef.current.values());
      const parcelIntersects = raycaster.intersectObjects(parcelMeshes, false);

      if (parcelIntersects.length > 0) {
        const hitMesh = parcelIntersects[0].object as THREE.Mesh;
        const parcelId = hitMesh.userData.parcelId;
        const matched = dynamicParcels.find((p) => p.id === parcelId);
        if (matched) {
          setSelectedParcel(matched);
          setSelectedSurrounding(null);
          return;
        }
      }

      // Check Surrounding Regions
      const surroundingMeshes = Array.from(surroundingMeshesRef.current.values());
      const surroundingIntersects = raycaster.intersectObjects(surroundingMeshes, false);

      if (surroundingIntersects.length > 0) {
        const hitMesh = surroundingIntersects[0].object as THREE.Mesh;
        const regionId = hitMesh.userData.regionId;
        const matched = surroundingRegions.find((r) => r.id === regionId);
        if (matched) {
          setSelectedSurrounding(matched);
          setSelectedParcel(null);
        }
      }
    };

    const domElem = renderer.domElement;
    domElem.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    domElem.addEventListener('wheel', handleWheel, { passive: false });
    domElem.addEventListener('click', handleCanvasClick);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      domElem.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      domElem.removeEventListener('wheel', handleWheel);
      domElem.removeEventListener('click', handleCanvasClick);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      groundGeo.dispose();
      groundMat.dispose();
    };
  }, []);

  // 4. Render Active Case Boundary & Parcels
  useEffect(() => {
    const pGroup = dynamicGroupRef.current;
    const bGroup = boundaryGroupRef.current;
    if (!pGroup || !bGroup) return;

    while (pGroup.children.length > 0) {
      const child = pGroup.children[0] as THREE.Mesh;
      pGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
    }
    while (bGroup.children.length > 0) {
      const child = bGroup.children[0] as THREE.Mesh;
      bGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
    }
    parcelMeshesRef.current.clear();

    if (!activeCase) return;

    const latRad = (geodeticDatum.lat * Math.PI) / 180;
    const metersPerDegLng = 111320 * Math.cos(latRad);
    const metersPerDegLat = 110540;
    const to3DX = (lng: number) => (lng - geodeticDatum.lng) * metersPerDegLng * 0.05;
    const to3DZ = (lat: number) => -(lat - geodeticDatum.lat) * metersPerDegLat * 0.05;

    // A. Render Authentic Case Boundary
    if (activeCase.geojson_boundary?.coordinates) {
      const raw = activeCase.geojson_boundary.type === 'MultiPolygon'
        ? activeCase.geojson_boundary.coordinates[0]?.[0]
        : activeCase.geojson_boundary.coordinates[0];

      if (Array.isArray(raw) && raw.length > 2) {
        const points3D: THREE.Vector3[] = raw.map((pt: any) => {
          return new THREE.Vector3(to3DX(Number(pt[0])), 0.2, to3DZ(Number(pt[1])));
        });

        const lineGeo = new THREE.BufferGeometry().setFromPoints(points3D);
        const lineMat = new THREE.LineBasicMaterial({ color: 0xf59e0b, linewidth: 2.5 });
        const boundaryLine = new THREE.LineLoop(lineGeo, lineMat);
        bGroup.add(boundaryLine);

        points3D.forEach((pt) => {
          const pillarGeo = new THREE.CylinderGeometry(0.5, 0.5, 2.5, 8);
          const pillarMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.6, roughness: 0.3 });
          const pillar = new THREE.Mesh(pillarGeo, pillarMat);
          pillar.position.set(pt.x, 1.25, pt.z);
          pillar.castShadow = true;
          bGroup.add(pillar);
        });
      }
    }

    // B. Render Real 3D Parcels
    if (dynamicParcels.length > 0) {
      dynamicParcels.forEach((parcel) => {
        const height = getParcelHeight(parcel);
        const meta = getStageMeta(parcel.stage);

        const boxGeo = new THREE.BoxGeometry(parcel.width, height, parcel.depth);
        const isSelected = selectedParcel?.id === parcel.id;

        const boxMat = new THREE.MeshStandardMaterial({
          color: meta.hex,
          transparent: true,
          opacity: isSelected ? 0.95 : 0.78,
          roughness: 0.25,
          metalness: 0.35,
          emissive: isSelected ? meta.hex : 0x000000,
          emissiveIntensity: isSelected ? 0.35 : 0,
        });

        const parcelMesh = new THREE.Mesh(boxGeo, boxMat);
        parcelMesh.position.set(parcel.pos[0], height / 2 + 0.1, parcel.pos[1]);
        parcelMesh.castShadow = true;
        parcelMesh.receiveShadow = true;
        parcelMesh.userData = { parcelId: parcel.id };

        const edges = new THREE.EdgesGeometry(boxGeo);
        const lineMat = new THREE.LineBasicMaterial({
          color: isSelected ? 0xffffff : meta.hex,
          linewidth: isSelected ? 3 : 1,
        });
        const wireframe = new THREE.LineSegments(edges, lineMat);
        parcelMesh.add(wireframe);

        pGroup.add(parcelMesh);
        parcelMeshesRef.current.set(parcel.id, parcelMesh);
      });
    } else {
      const area = activeCase.total_area_hectares || 10;
      const volHeight = Math.max(4, Math.min(18, (area / 10) * 4));

      const volGeo = new THREE.BoxGeometry(38, volHeight, 38);
      const volMat = new THREE.MeshStandardMaterial({
        color: 0x0284c7,
        transparent: true,
        opacity: 0.45,
        roughness: 0.4,
        metalness: 0.2,
      });
      const volMesh = new THREE.Mesh(volGeo, volMat);
      volMesh.position.set(0, volHeight / 2 + 0.1, 0);
      volMesh.castShadow = true;

      const edges = new THREE.EdgesGeometry(volGeo);
      const edgeMat = new THREE.LineBasicMaterial({ color: 0x38bdf8 });
      volMesh.add(new THREE.LineSegments(edges, edgeMat));

      pGroup.add(volMesh);
    }
  }, [activeCase, dynamicParcels, metricMode, selectedParcel, geodeticDatum, getParcelHeight]);

  // 5. Render Surrounding Regions & Statutory Buffer Perimeter
  useEffect(() => {
    const sGroup = surroundingGroupRef.current;
    if (!sGroup) return;

    while (sGroup.children.length > 0) {
      const child = sGroup.children[0] as THREE.Mesh;
      sGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
    }
    surroundingMeshesRef.current.clear();

    if (!showSurroundingRegions) return;

    // A. Statutory 500m Buffer Zone Perimeter
    if (showBufferEnvelope) {
      const bufferRadius = 38;
      const bufferGeo = new THREE.RingGeometry(bufferRadius - 0.4, bufferRadius, 64);
      const bufferMat = new THREE.MeshBasicMaterial({
        color: 0x06b6d4,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.5,
      });
      const bufferRing = new THREE.Mesh(bufferGeo, bufferMat);
      bufferRing.rotation.x = -Math.PI / 2;
      bufferRing.position.y = 0.08;
      sGroup.add(bufferRing);

      // Radial clearance markers (N, S, E, W)
      [
        { x: 0, z: -bufferRadius, label: '500m North Clearance' },
        { x: bufferRadius, z: 0, label: '500m East Clearance' },
        { x: 0, z: bufferRadius, label: '500m South Clearance' },
        { x: -bufferRadius, z: 0, label: '500m West Clearance' },
      ].forEach((mark) => {
        const pinGeo = new THREE.CylinderGeometry(0.3, 0.3, 3, 6);
        const pinMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });
        const pin = new THREE.Mesh(pinGeo, pinMat);
        pin.position.set(mark.x, 1.5, mark.z);
        sGroup.add(pin);
      });
    }

    // B. Render Surrounding Cases / Cadastral Regions in 3D
    surroundingRegions.forEach((region) => {
      const isSelected = selectedSurrounding?.id === region.id;
      const height = Math.max(3, Math.min(12, (region.totalAreaHa / 5) * 2.5));

      // 1. Boundary Polygon or Procedural Cadastral Block
      let regionMesh: THREE.Mesh;

      if (region.polygonPoints && region.polygonPoints.length > 2) {
        // Real Polygon from other case
        const shape = new THREE.Shape();
        region.polygonPoints.forEach((pt, i) => {
          if (i === 0) shape.moveTo(pt[0], -pt[1]);
          else shape.lineTo(pt[0], -pt[1]);
        });
        shape.closePath();

        const extrudeSettings = {
          steps: 1,
          depth: height,
          bevelEnabled: false,
        };
        const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        geom.rotateX(Math.PI / 2);

        const mat = new THREE.MeshStandardMaterial({
          color: isSelected ? 0xa855f7 : 0x6366f1,
          transparent: true,
          opacity: isSelected ? 0.85 : 0.45,
          roughness: 0.3,
          metalness: 0.2,
          emissive: isSelected ? 0x9333ea : 0x000000,
          emissiveIntensity: isSelected ? 0.4 : 0,
        });

        regionMesh = new THREE.Mesh(geom, mat);
        regionMesh.position.y = height + 0.1;
      } else {
        // Extruded Block
        const size = Math.max(16, Math.min(32, Math.sqrt(region.totalAreaHa) * 6));
        const boxGeo = new THREE.BoxGeometry(size, height, size);
        const mat = new THREE.MeshStandardMaterial({
          color: isSelected ? 0xa855f7 : 0x4f46e5,
          transparent: true,
          opacity: isSelected ? 0.8 : 0.4,
          roughness: 0.4,
          metalness: 0.2,
          emissive: isSelected ? 0x9333ea : 0x000000,
          emissiveIntensity: isSelected ? 0.35 : 0,
        });

        regionMesh = new THREE.Mesh(boxGeo, mat);
        regionMesh.position.set(region.pos[0], height / 2 + 0.1, region.pos[1]);
      }

      regionMesh.castShadow = true;
      regionMesh.receiveShadow = true;
      regionMesh.userData = { regionId: region.id, isSurrounding: true };

      // Perimeter wireframe
      const edges = new THREE.EdgesGeometry(regionMesh.geometry);
      const lineMat = new THREE.LineBasicMaterial({
        color: isSelected ? 0xffffff : 0x818cf8,
        linewidth: isSelected ? 2.5 : 1,
      });
      const wireframe = new THREE.LineSegments(edges, lineMat);
      regionMesh.add(wireframe);

      sGroup.add(regionMesh);
      surroundingMeshesRef.current.set(region.id, regionMesh);

      // 2. Vertical 3D Beacon Pole & Floating Landmark Orb
      const poleGeo = new THREE.CylinderGeometry(0.3, 0.3, height + 10, 8);
      const poleMat = new THREE.MeshBasicMaterial({ color: isSelected ? 0xd8b4fe : 0x818cf8, transparent: true, opacity: 0.75 });
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(region.pos[0], (height + 10) / 2, region.pos[1]);
      sGroup.add(pole);

      const orbGeo = new THREE.SphereGeometry(1.4, 16, 16);
      const orbMat = new THREE.MeshStandardMaterial({
        color: isSelected ? 0xf43f5e : 0xa5b4fc,
        emissive: isSelected ? 0xe11d48 : 0x6366f1,
        emissiveIntensity: 0.9,
      });
      const orb = new THREE.Mesh(orbGeo, orbMat);
      orb.position.set(region.pos[0], height + 10, region.pos[1]);
      sGroup.add(orb);
    });
  }, [surroundingRegions, showSurroundingRegions, showBufferEnvelope, selectedSurrounding]);

  // Camera Controls
  const handleToggleFlythrough = () => {
    if (isPlayingFlythrough) {
      setIsPlayingFlythrough(false);
      if (flythroughAnimRef.current) cancelAnimationFrame(flythroughAnimRef.current);
      return;
    }

    setIsPlayingFlythrough(true);
    let angle = cameraAngleRef.current.theta;

    const fly = () => {
      angle += 0.005;
      cameraAngleRef.current.theta = angle;
      const { phi, radius } = cameraAngleRef.current;
      if (cameraRef.current) {
        cameraRef.current.position.x = radius * Math.sin(phi) * Math.sin(angle);
        cameraRef.current.position.y = radius * Math.cos(phi);
        cameraRef.current.position.z = radius * Math.sin(phi) * Math.cos(angle);
        cameraRef.current.lookAt(cameraTargetRef.current);
      }
      flythroughAnimRef.current = requestAnimationFrame(fly);
    };

    fly();
  };

  const handleResetCamera = () => {
    if (isPlayingFlythrough) {
      setIsPlayingFlythrough(false);
      if (flythroughAnimRef.current) cancelAnimationFrame(flythroughAnimRef.current);
    }
    cameraAngleRef.current = { theta: Math.PI / 4, phi: Math.PI / 6, radius: 105 };
    cameraTargetRef.current.set(0, 0, 0);
    if (cameraRef.current) {
      cameraRef.current.position.set(74, 52, 74);
      cameraRef.current.lookAt(0, 0, 0);
    }
  };

  const totalAreaHa = activeCase?.total_area_hectares || dynamicParcels.reduce((sum, p) => sum + p.areaHa, 0);
  const totalCompCr = activeCase?.estimated_compensation
    ? (activeCase.estimated_compensation / 10000000).toFixed(2)
    : dynamicParcels.reduce((sum, p) => sum + p.compensationCr, 0).toFixed(2);
  const disputesCount = dynamicParcels.filter((p) => p.stage === 'disputed').length;

  return (
    <div className="relative w-full h-[840px] rounded-2xl overflow-hidden border border-slate-700 bg-slate-950 shadow-2xl flex flex-col font-sans select-none">
      {/* 3D WebGL Canvas */}
      <div ref={mountRef} className="absolute inset-0 cursor-grab active:cursor-grabbing" />

      {/* Top Floating Institutional Dossier & Dynamic Case Switcher */}
      <div className="relative z-10 p-4 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Case Identity & Selector */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-terra-700/30 border border-terra-500/50 flex items-center justify-center text-terra-400 font-bold shadow-lg shadow-terra-900/40">
              <Compass className="h-5 w-5 text-terra-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800/80">
                  3D Digital Twin Studio
                </span>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">
                  {dynamicParcels.length} Active Khasras
                </span>
                <span className="text-[10px] font-mono text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800/60">
                  {surroundingRegions.length} Surrounding Regions
                </span>
              </div>

              {/* Dynamic Case Dropdown */}
              <div className="flex items-center gap-2 mt-1">
                <select
                  value={activeCaseId}
                  onChange={(e) => setActiveCaseId(e.target.value)}
                  className="bg-slate-800 hover:bg-slate-750 border border-slate-700 text-white text-xs font-bold rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-cyan-400 cursor-pointer max-w-md truncate"
                >
                  {allCases.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.case_number} • {c.title} ({c.village}, {c.district}, {c.state})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Quick Controls */}
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={handleToggleFlythrough}
              className={clsx(
                'inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-all cursor-pointer shadow-lg',
                isPlayingFlythrough
                  ? 'bg-amber-600 border-amber-400 text-white animate-pulse'
                  : 'bg-terra-700 hover:bg-terra-800 border-terra-600 text-white'
              )}
            >
              {isPlayingFlythrough ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              <span>{isPlayingFlythrough ? 'Pause Orbit' : '3D Regional Orbit'}</span>
            </button>

            <button
              type="button"
              onClick={handleResetCamera}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5 text-slate-400" />
              <span>Reset View</span>
            </button>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors cursor-pointer"
                title="Return to 2D Map"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Authoritative Geographic Location Breadcrumb & Telemetry */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-1 border-t border-slate-800/80">
          <div className="flex items-center gap-2 text-slate-300">
            <MapPin className="h-3.5 w-3.5 text-rose-400 shrink-0" />
            <span className="font-semibold text-white">
              {activeCase ? `${activeCase.state} > ${activeCase.district} > ${activeCase.tehsil || 'Sadar'} > ${activeCase.village}` : 'Loading territorial scope...'}
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-slate-400 font-mono text-[11px]">
              🌐 {geodeticDatum.lat.toFixed(4)}° N, {geodeticDatum.lng.toFixed(4)}° E (WGS-84 Datum)
            </span>
          </div>

          <div className="flex items-center gap-4 text-slate-300 text-xs">
            <div>
              <span className="text-[10px] text-slate-400">Total Land: </span>
              <strong className="text-white font-mono">{Number(totalAreaHa).toFixed(1)} Ha</strong>
            </div>
            <div className="h-3.5 w-px bg-slate-700" />
            <div>
              <span className="text-[10px] text-slate-400">Statutory Valuation: </span>
              <strong className="text-emerald-400 font-mono">₹{totalCompCr} Cr</strong>
            </div>
            <div className="h-3.5 w-px bg-slate-700" />
            <div>
              <span className="text-[10px] text-slate-400">Litigation Risk: </span>
              <strong className="text-rose-400 font-mono">{disputesCount} Disputes</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Main Studio Overlay: Left HUD & Right Dossier */}
      <div className="relative z-10 flex-1 p-4 pointer-events-none flex justify-between items-start gap-4">
        {/* Left HUD: Volumetric Metric Switcher & Surrounding Regions */}
        <div className="w-76 bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-800 p-4 pointer-events-auto space-y-3.5 shadow-2xl">
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Sliders className="h-3.5 w-3.5 text-cyan-400" />
              Volumetric Metric
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Scale 3D heights by live case metadata</p>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {[
              { key: 'compensation', label: 'Payout (₹ Cr)', icon: TrendingUp },
              { key: 'risk', label: 'Litigation Risk', icon: AlertTriangle },
              { key: 'paf', label: 'PAF Count', icon: Building2 },
              { key: 'area', label: 'Area (Hectares)', icon: Layers },
            ].map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMetricMode(m.key as any)}
                className={clsx(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer text-left',
                  metricMode === m.key
                    ? 'bg-cyan-950 border-cyan-500 text-cyan-200 shadow-md shadow-cyan-950'
                    : 'bg-slate-800/80 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:text-white'
                )}
              >
                <m.icon className="h-3 w-3 shrink-0 text-cyan-400" />
                <span className="truncate">{m.label}</span>
              </button>
            ))}
          </div>

          {/* Regional Spatial Context Toggles */}
          <div className="border-t border-slate-800 pt-3 space-y-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Surrounding Geography</span>
              <Globe2 className="h-3.5 w-3.5 text-indigo-400" />
            </span>

            <div className="space-y-1.5 text-xs">
              <label className="flex items-center gap-2 text-slate-300 cursor-pointer hover:text-white">
                <input
                  type="checkbox"
                  checked={showSurroundingRegions}
                  onChange={(e) => setShowSurroundingRegions(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-0 cursor-pointer"
                />
                <span>Adjacent Cases & Parcels ({surroundingRegions.length})</span>
              </label>

              <label className="flex items-center gap-2 text-slate-300 cursor-pointer hover:text-white">
                <input
                  type="checkbox"
                  checked={showBufferEnvelope}
                  onChange={(e) => setShowBufferEnvelope(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-800 text-cyan-600 focus:ring-0 cursor-pointer"
                />
                <span>500m Statutory Buffer Zone</span>
              </label>
            </div>
          </div>

          {/* Surrounding Regions List */}
          {showSurroundingRegions && surroundingRegions.length > 0 && (
            <div className="border-t border-slate-800 pt-2.5 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">
                  Nearby Regions ({surroundingRegions.length})
                </span>
                <span className="text-[9px] text-slate-500">Click to Preview</span>
              </div>

              <div className="max-h-28 overflow-y-auto divide-y divide-slate-800/60 pr-1 space-y-1">
                {surroundingRegions.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setSelectedSurrounding(r);
                      setSelectedParcel(null);
                    }}
                    className={clsx(
                      'w-full py-1.5 px-2 flex items-center justify-between text-xs rounded transition-all text-left cursor-pointer',
                      selectedSurrounding?.id === r.id
                        ? 'bg-indigo-950/90 text-indigo-200 border border-indigo-700/80 font-bold'
                        : 'text-slate-300 hover:bg-slate-800/80'
                    )}
                  >
                    <div className="truncate max-w-[130px]">
                      <div className="truncate font-semibold">{r.title}</div>
                      <div className="text-[9px] text-slate-400 font-mono">{r.caseNumber}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-mono text-cyan-300 font-bold block">
                        {r.distanceKm} km
                      </span>
                      <span className="text-[9px] text-slate-500 uppercase">{r.bearing}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Active Case Khasra Parcels List */}
          <div className="border-t border-slate-800 pt-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Case Khasras ({dynamicParcels.length})
              </span>
              <span className="text-[9px] text-slate-500">Click to Inspect</span>
            </div>

            {dynamicParcels.length > 0 ? (
              <div className="max-h-32 overflow-y-auto divide-y divide-slate-800/60 pr-1">
                {dynamicParcels.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedParcel(p);
                      setSelectedSurrounding(null);
                    }}
                    className={clsx(
                      'w-full py-1.5 px-2 flex items-center justify-between text-xs rounded transition-all text-left cursor-pointer',
                      selectedParcel?.id === p.id
                        ? 'bg-terra-950/80 text-terra-200 border border-terra-700/60 font-bold'
                        : 'text-slate-300 hover:bg-slate-800/80'
                    )}
                  >
                    <span className="font-mono">Survey {p.surveyNo}</span>
                    <span
                      className={clsx(
                        'text-[10px] font-bold px-1.5 py-0.2 rounded',
                        p.stage === 'disputed'
                          ? 'text-rose-400'
                          : p.stage === 'possessed'
                          ? 'text-emerald-400'
                          : 'text-amber-400'
                      )}
                    >
                      {p.village}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-2.5 bg-slate-800/50 rounded-lg border border-slate-700/60 text-center space-y-1">
                <LandPlot className="h-4 w-4 text-slate-400 mx-auto" />
                <p className="text-[11px] text-slate-300 font-medium">0 Parcels Demarcated</p>
                <p className="text-[10px] text-slate-400 leading-tight">
                  Demarcate survey parcels in Case Workspace to extrude Khasras.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right HUD: Selected Dynamic Parcel Dossier OR Surrounding Region Dossier */}
        {selectedParcel ? (
          <div className="w-80 bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-800 p-4 pointer-events-auto space-y-3 shadow-2xl animate-in fade-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <span className="h-6 w-6 rounded-lg bg-terra-900 text-terra-300 font-mono font-bold flex items-center justify-center text-xs border border-terra-700">
                  3D
                </span>
                <div>
                  <h4 className="text-xs font-bold text-white">Survey No. {selectedParcel.surveyNo}</h4>
                  <p className="text-[10px] text-slate-400 font-mono">
                    {selectedParcel.village}, {selectedParcel.district}
                  </p>
                </div>
              </div>
              <span
                className={clsx(
                  'text-[10px] font-bold px-2 py-0.5 rounded border',
                  selectedParcel.stage === 'disputed'
                    ? 'bg-rose-950 text-rose-300 border-rose-800'
                    : selectedParcel.stage === 'possessed'
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                    : 'bg-amber-950 text-amber-300 border-amber-800'
                )}
              >
                {getStageMeta(selectedParcel.stage).label}
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-800/60 text-slate-300">
                <span className="text-slate-400">Land Title Holder:</span>
                <strong className="text-white truncate max-w-[150px]">{selectedParcel.ownerName}</strong>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60 text-slate-300">
                <span className="text-slate-400">Land Classification:</span>
                <span className="text-cyan-300 font-medium">{selectedParcel.landType}</span>
              </div>
              {selectedParcel.khataNo && (
                <div className="flex justify-between py-1 border-b border-slate-800/60 text-slate-300">
                  <span className="text-slate-400">Registered Khata:</span>
                  <span className="font-mono text-white">{selectedParcel.khataNo}</span>
                </div>
              )}
              <div className="flex justify-between py-1 border-b border-slate-800/60 text-slate-300">
                <span className="text-slate-400">Acquisition Area:</span>
                <span className="font-mono text-cyan-300 font-bold">
                  {selectedParcel.areaAcres} Ac ({selectedParcel.areaHa} Ha)
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60 text-slate-300">
                <span className="text-slate-400">Form-11 Statutory Award:</span>
                <span className="font-mono text-emerald-400 font-bold">₹{selectedParcel.compensationCr} Cr</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60 text-slate-300">
                <span className="text-slate-400">Affected Families (PAF):</span>
                <span className="font-mono text-amber-300 font-bold">{selectedParcel.pafCount} Families</span>
              </div>
              <div className="flex justify-between py-1 text-slate-300">
                <span className="text-slate-400">Litigation Risk Index:</span>
                <span
                  className={clsx(
                    'font-mono font-bold',
                    selectedParcel.riskScore > 70
                      ? 'text-rose-400'
                      : selectedParcel.riskScore > 30
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                  )}
                >
                  {selectedParcel.riskScore}% {selectedParcel.riskScore > 70 ? 'Litigation Warning' : 'Normal'}
                </span>
              </div>
            </div>

            {selectedParcel.stage === 'disputed' && (
              <div className="rounded-xl border border-rose-800/80 bg-rose-950/50 p-2.5 space-y-1 text-[11px] text-rose-200">
                <div className="flex items-center gap-1.5 font-bold text-rose-300">
                  <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
                  <span>Section 64 Statutory Dispute</span>
                </div>
                <p className="text-[10px] text-rose-300/80 leading-relaxed">
                  Valuation objection or inheritance dispute registered for this khasra parcel.
                </p>
              </div>
            )}

            <div className="pt-2">
              <Button
                variant="primary"
                size="sm"
                className="w-full text-xs"
                onClick={() => onSelectCase && onSelectCase(activeCaseId)}
              >
                Inspect Case Record
              </Button>
            </div>
          </div>
        ) : selectedSurrounding ? (
          <div className="w-80 bg-slate-900/90 backdrop-blur-md rounded-2xl border border-indigo-700/80 p-4 pointer-events-auto space-y-3 shadow-2xl animate-in fade-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <span className="h-6 w-6 rounded-lg bg-indigo-900 text-indigo-300 font-mono font-bold flex items-center justify-center text-xs border border-indigo-700">
                  3D
                </span>
                <div>
                  <h4 className="text-xs font-bold text-white truncate max-w-[170px]">
                    {selectedSurrounding.title}
                  </h4>
                  <p className="text-[10px] text-indigo-300 font-mono">{selectedSurrounding.caseNumber}</p>
                </div>
              </div>
              <Badge variant="purple">Surrounding Region</Badge>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-800/60 text-slate-300">
                <span className="text-slate-400">Relative Proximity:</span>
                <span className="font-mono text-cyan-300 font-bold">
                  {selectedSurrounding.distanceKm} km ({selectedSurrounding.bearing})
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60 text-slate-300">
                <span className="text-slate-400">Territorial Unit:</span>
                <strong className="text-white">{selectedSurrounding.village}, {selectedSurrounding.district}</strong>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60 text-slate-300">
                <span className="text-slate-400">Regional Footprint:</span>
                <span className="font-mono text-amber-300 font-bold">{selectedSurrounding.totalAreaHa} Ha</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60 text-slate-300">
                <span className="text-slate-400">Estimated Award:</span>
                <span className="font-mono text-emerald-400 font-bold">₹{selectedSurrounding.estimatedCompCr} Cr</span>
              </div>
              <div className="flex justify-between py-1 text-slate-300">
                <span className="text-slate-400">Statutory Status:</span>
                <span className="text-indigo-400 font-bold uppercase">{selectedSurrounding.status}</span>
              </div>
            </div>

            <div className="pt-2 flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                className="flex-1 text-xs"
                onClick={() => {
                  if (selectedSurrounding.id.startsWith('sector-cadastre')) return;
                  setActiveCaseId(selectedSurrounding.id);
                  setSelectedSurrounding(null);
                }}
              >
                Switch to this Case
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setSelectedSurrounding(null)}
              >
                Close
              </Button>
            </div>
          </div>
        ) : (
          <div className="w-80 bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-800 p-4 pointer-events-auto space-y-3 shadow-2xl animate-in fade-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <span className="h-6 w-6 rounded-lg bg-cyan-900 text-cyan-300 font-mono font-bold flex items-center justify-center text-xs border border-cyan-700">
                  3D
                </span>
                <div>
                  <h4 className="text-xs font-bold text-white truncate max-w-[170px]">
                    {activeCase?.title || 'Case Overview'}
                  </h4>
                  <p className="text-[10px] text-slate-400 font-mono">{activeCase?.case_number}</p>
                </div>
              </div>
              <Badge variant="navy">Statutory Boundary</Badge>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-800/60 text-slate-300">
                <span className="text-slate-400">Administrative Unit:</span>
                <strong className="text-white">{activeCase?.village}, {activeCase?.district}</strong>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60 text-slate-300">
                <span className="text-slate-400">Total Demarcated Land:</span>
                <span className="font-mono text-cyan-300 font-bold">{totalAreaHa} Hectares</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60 text-slate-300">
                <span className="text-slate-400">Estimated Compensation:</span>
                <span className="font-mono text-emerald-400 font-bold">₹{totalCompCr} Crore</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60 text-slate-300">
                <span className="text-slate-400">Surrounding Context:</span>
                <span className="font-mono text-indigo-300 font-bold">{surroundingRegions.length} Regions Visible</span>
              </div>
              <div className="flex justify-between py-1 text-slate-300">
                <span className="text-slate-400">Workflow Status:</span>
                <span className="text-emerald-400 font-bold uppercase">{activeCase?.status || 'Active'}</span>
              </div>
            </div>

            <div className="pt-2">
              <Button
                variant="primary"
                size="sm"
                className="w-full text-xs"
                onClick={() => onSelectCase && onSelectCase(activeCaseId)}
              >
                Open Case Record to Demarcate
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Status Bar */}
      <div className="relative z-10 px-4 py-2 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 flex flex-wrap items-center justify-between text-xs text-slate-400 font-mono gap-2">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Case: {activeCase?.case_number || 'N/A'}</span>
          <span>•</span>
          <span>WGS-84 Datum</span>
          <span>•</span>
          <span className="text-indigo-400">{surroundingRegions.length} Surrounding Entities Mapped</span>
        </div>
        <div>
          <span>Controls: Left-Click + Drag to Orbit • Click Surrounding Regions to Inspect</span>
        </div>
      </div>
    </div>
  );
};
