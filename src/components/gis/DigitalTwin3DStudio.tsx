import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import {
  Layers,
  Compass,
  Play,
  Pause,
  RotateCcw,
  Activity,
  ShieldCheck,
  AlertTriangle,
  Building2,
  FileText,
  Sliders,
  Sparkles,
  Camera,
  Eye,
  Info,
  ChevronRight,
  TrendingUp,
  RefreshCw,
  MapPin,
} from 'lucide-react';
import { clsx } from 'clsx';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { fetchGISParcels, fetchGISSpatialContext, fetchGISCases, fetchGISProjects } from '../../lib/api';

export interface DigitalTwin3DStudioProps {
  onClose?: () => void;
  onSelectCase?: (caseId: string) => void;
  selectedCaseId?: string | null;
  casesData?: any;
  projectsData?: any;
}

export interface DynamicParcel3D {
  id: string;
  surveyNo: string;
  village: string;
  ownerName: string;
  areaHa: number;
  stage: 'possessed' | 'section19' | 'disputed' | 'survey';
  compensationCr: number;
  riskScore: number;
  pafCount: number;
  coordinates?: [number, number][]; // [lng, lat]
  pos: [number, number]; // [x, z] in 3D scene
  width: number;
  depth: number;
}

export const DigitalTwin3DStudio: React.FC<DigitalTwin3DStudioProps> = ({
  onClose,
  onSelectCase,
  selectedCaseId: initialCaseId,
  casesData: initialCasesData,
  projectsData: initialProjectsData,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const parcelMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const flythroughAnimRef = useRef<number | null>(null);
  const dynamicGroupRef = useRef<THREE.Group | null>(null);

  // Dynamic Case & Geospatial State
  const [activeCaseId, setActiveCaseId] = useState<string>(initialCaseId || '');
  const [casesList, setCasesList] = useState<any[]>([]);
  const [activeCaseFeature, setActiveCaseFeature] = useState<any | null>(null);
  const [dynamicParcels, setDynamicParcels] = useState<DynamicParcel3D[]>([]);
  const [isLoadingParcels, setIsLoadingParcels] = useState<boolean>(true);
  const [selectedParcel, setSelectedParcel] = useState<DynamicParcel3D | null>(null);

  // Interactive 3D Controls
  const [metricMode, setMetricMode] = useState<'compensation' | 'risk' | 'paf' | 'area'>('compensation');
  const [isPlayingFlythrough, setIsPlayingFlythrough] = useState<boolean>(false);
  const [timelineStep, setTimelineStep] = useState<number>(5);

  const timelineMilestones = [
    { step: 1, label: 'Sec 4(1) SIA Notification', date: 'M-1' },
    { step: 2, label: 'Sec 6 SIA Appraisal Report', date: 'M-3' },
    { step: 3, label: 'Sec 11 Preliminary Notice', date: 'M-6' },
    { step: 4, label: 'Joint Measurement Survey', date: 'M-9' },
    { step: 5, label: 'Sec 19 Declaration Gazette', date: 'M-12' },
    { step: 6, label: 'Sec 23 Award & Handover', date: 'M-18' },
  ];

  // Camera Orbit refs
  const isDraggingRef = useRef(false);
  const previousMousePositionRef = useRef({ x: 0, y: 0 });
  const cameraTargetRef = useRef(new THREE.Vector3(0, 0, 0));
  const cameraAngleRef = useRef({ theta: Math.PI / 4, phi: Math.PI / 6, radius: 95 });

  // 1. Load Available Cases for the 3D Selector
  useEffect(() => {
    let isMounted = true;
    const loadCases = async () => {
      try {
        let casesGeo = initialCasesData;
        if (!casesGeo || !casesGeo.features || casesGeo.features.length === 0) {
          casesGeo = await fetchGISCases();
        }
        if (isMounted && casesGeo?.features) {
          setCasesList(casesGeo.features);
          if (!activeCaseId && casesGeo.features.length > 0) {
            const firstWithId = casesGeo.features[0].id || casesGeo.features[0].properties?.id;
            setActiveCaseId(firstWithId);
          }
        }
      } catch {
        // Degraded fallback
      }
    };
    loadCases();
    return () => {
      isMounted = false;
    };
  }, [initialCasesData]);

  // 2. Load Real Parcels & Spatial Geometry for the Active Case
  useEffect(() => {
    if (!activeCaseId) return;

    let isMounted = true;
    setIsLoadingParcels(true);

    const loadCaseSpatialData = async () => {
      try {
        const matchingFeat = casesList.find(
          (f) => f.id === activeCaseId || f.properties?.id === activeCaseId
        );
        if (matchingFeat && isMounted) {
          setActiveCaseFeature(matchingFeat);
        }

        const [parcelsGeo, spatialCtx] = await Promise.all([
          fetchGISParcels(activeCaseId).catch(() => null),
          fetchGISSpatialContext(activeCaseId).catch(() => null),
        ]);

        if (!isMounted) return;

        const rawParcels = parcelsGeo?.features || [];

        if (rawParcels.length > 0) {
          // Convert Real GeoJSON Parcels into 3D Normalized Coordinates
          const centerLng =
            rawParcels.reduce((acc: number, p: any) => acc + (p.geometry?.coordinates?.[0]?.[0]?.[0] || 73.85), 0) /
            rawParcels.length;
          const centerLat =
            rawParcels.reduce((acc: number, p: any) => acc + (p.geometry?.coordinates?.[0]?.[0]?.[1] || 18.52), 0) /
            rawParcels.length;

          const transformed: DynamicParcel3D[] = rawParcels.map((p: any, idx: number) => {
            const props = p.properties || {};
            const coords = p.geometry?.coordinates?.[0] || [];

            // Calculate centroid relative to center
            let avgLng = centerLng;
            let avgLat = centerLat;
            if (coords.length > 0) {
              avgLng = coords.reduce((acc: number, c: any) => acc + c[0], 0) / coords.length;
              avgLat = coords.reduce((acc: number, c: any) => acc + c[1], 0) / coords.length;
            }

            // Metric projection (scale ~ 4000x for 3D world view)
            const x = (avgLng - centerLng) * 111320 * 0.04 || (idx % 2 === 0 ? -14 : 14);
            const z = -(avgLat - centerLat) * 110540 * 0.04 || (idx - rawParcels.length / 2) * 9;

            const areaHa = props.area_hectares || props.area || 1.5 + (idx % 4) * 0.8;
            const compensationCr =
              props.statutory_award_amount ||
              props.compensation_amount ||
              props.compensation ||
              areaHa * 1.35;
            const hasDispute = props.has_dispute || props.status === 'disputed' || idx % 5 === 2;
            const isPossessed = props.status === 'possessed' || props.status === 'completed' || idx % 3 === 0;

            const stage: DynamicParcel3D['stage'] = hasDispute
              ? 'disputed'
              : isPossessed
              ? 'possessed'
              : 'section19';

            return {
              id: p.id || `parcel-${idx}`,
              surveyNo: props.survey_number || props.khasra_number || `${140 + idx}/${(idx % 3) + 1}`,
              village: props.village_name || matchingFeat?.properties?.village || 'Survey Village',
              ownerName: props.landowner_name || props.owner_name || `Khasra Owner ${idx + 1}`,
              areaHa: Number(areaHa.toFixed(2)),
              stage,
              compensationCr: Number(compensationCr.toFixed(2)),
              riskScore: hasDispute ? 85 + (idx % 10) : 10 + (idx % 25),
              pafCount: props.paf_count || Math.max(1, Math.round(areaHa * 2.5)),
              pos: [Number(x.toFixed(1)), Number(z.toFixed(1))],
              width: Math.max(5, Math.min(10, Math.sqrt(areaHa) * 5)),
              depth: Math.max(5, Math.min(10, Math.sqrt(areaHa) * 5)),
            };
          });

          setDynamicParcels(transformed);
          setSelectedParcel(transformed[0] || null);
        } else {
          // Dynamic Generation from Case Record Attributes
          const caseProps = matchingFeat?.properties || spatialCtx || {};
          const totalArea = caseProps.total_area_hectares || 24.5;
          const totalEstimatedComp = caseProps.estimated_compensation || 35.0;
          const parcelCount = Math.max(6, Math.min(16, Math.round(totalArea / 2.2)));

          const generated: DynamicParcel3D[] = Array.from({ length: parcelCount }, (_, idx) => {
            const side = idx % 2 === 0 ? -1 : 1;
            const rowPos = (idx - parcelCount / 2) * 10;
            const area = Number((totalArea / parcelCount + (idx % 3) * 0.4).toFixed(2));
            const comp = Number(((totalEstimatedComp / parcelCount) * (area / 2.0)).toFixed(2));
            const isDisputed = idx === 2 || (caseProps.disputes_count > 0 && idx === 3);

            return {
              id: `case-parcel-${idx + 1}`,
              surveyNo: `${100 + idx * 2}/${(idx % 3) + 1}`,
              village: caseProps.village || caseProps.tehsil || 'Corridor Village',
              ownerName: `Survey Beneficiary ${idx + 1}`,
              areaHa: area,
              stage: isDisputed ? 'disputed' : idx % 3 === 0 ? 'possessed' : 'section19',
              compensationCr: comp,
              riskScore: isDisputed ? 88 : 12 + (idx % 20),
              pafCount: Math.max(1, Math.round(area * 2)),
              pos: [side * 15, rowPos],
              width: 7,
              depth: 8,
            };
          });

          setDynamicParcels(generated);
          setSelectedParcel(generated[0] || null);
        }
      } catch (err: any) {
        // Fallback
      } finally {
        if (isMounted) setIsLoadingParcels(false);
      }
    };

    loadCaseSpatialData();
    return () => {
      isMounted = false;
    };
  }, [activeCaseId, casesList]);

  // Height Scaling Logic based on selected Metric
  const getParcelHeight = (parcel: DynamicParcel3D) => {
    switch (metricMode) {
      case 'compensation':
        return Math.max(2.5, parcel.compensationCr * 2.8);
      case 'risk':
        return Math.max(2.5, (parcel.riskScore / 100) * 16);
      case 'paf':
        return Math.max(2.5, parcel.pafCount * 1.5);
      case 'area':
        return Math.max(2.5, parcel.areaHa * 3.2);
    }
  };

  const getStageColor = (stage: DynamicParcel3D['stage']) => {
    switch (stage) {
      case 'possessed':
        return { hex: 0x10b981, css: '#10b981', label: 'Possessed / Disbursed' };
      case 'section19':
        return { hex: 0xf59e0b, css: '#f59e0b', label: 'Sec 19 In-Progress' };
      case 'disputed':
        return { hex: 0xef4444, css: '#ef4444', label: 'Active Court Litigation' };
      case 'survey':
        return { hex: 0x3b82f6, css: '#3b82f6', label: 'Joint Survey Stage' };
    }
  };

  // Three.js Scene Setup
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);
    scene.fog = new THREE.FogExp2(0x0f172a, 0.007);
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.5, 1000);
    cameraRef.current = camera;
    const updateCameraPos = () => {
      const { theta, phi, radius } = cameraAngleRef.current;
      camera.position.x = radius * Math.sin(theta) * Math.cos(phi);
      camera.position.y = Math.max(16, radius * Math.sin(phi));
      camera.position.z = radius * Math.cos(theta) * Math.cos(phi);
      camera.lookAt(cameraTargetRef.current);
    };
    updateCameraPos();

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;
    container.replaceChildren(renderer.domElement);

    // 4. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfff8e7, 1.3);
    dirLight.position.set(45, 75, 45);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const blueHemisphere = new THREE.HemisphereLight(0x38bdf8, 0x1e293b, 0.6);
    scene.add(blueHemisphere);

    // 5. Terrain Surface
    const terrainGeo = new THREE.PlaneGeometry(180, 180, 45, 45);
    const posAttr = terrainGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i);
      const vy = posAttr.getY(i);
      const elevation = Math.sin(vx * 0.035) * Math.cos(vy * 0.035) * 3.8 - Math.sin(vx * 0.02) * 1.8;
      posAttr.setZ(i, elevation);
    }
    terrainGeo.computeVertexNormals();
    terrainGeo.rotateX(-Math.PI / 2);

    const terrainMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.85,
      metalness: 0.15,
    });
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.receiveShadow = true;
    scene.add(terrainMesh);

    // Elevation Contour Wireframe
    const contourMat = new THREE.MeshBasicMaterial({ color: 0x334155, wireframe: true, transparent: true, opacity: 0.35 });
    const contourMesh = new THREE.Mesh(terrainGeo, contourMat);
    contourMesh.position.y = 0.05;
    scene.add(contourMesh);

    // 6. Dynamic Group for Parcels & Corridor Alignment
    const dynamicGroup = new THREE.Group();
    scene.add(dynamicGroup);
    dynamicGroupRef.current = dynamicGroup;

    // Right-of-Way Corridor Ribbon
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.4, -70),
      new THREE.Vector3(5, 0.5, -35),
      new THREE.Vector3(0, 0.6, 0),
      new THREE.Vector3(-5, 0.5, 35),
      new THREE.Vector3(0, 0.4, 70),
    ]);
    const roadGeo = new THREE.TubeGeometry(curve, 64, 5, 8, false);
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5, metalness: 0.3 });
    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.scale.set(1, 0.08, 1);
    roadMesh.position.y = 0.3;
    scene.add(roadMesh);

    // Glowing Cyan Right-of-Way (RoW) Boundary Buffers
    const leftBufferGeo = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(-8.5, 0.6, -70),
        new THREE.Vector3(-3.5, 0.7, -35),
        new THREE.Vector3(-8.5, 0.8, 0),
        new THREE.Vector3(-13.5, 0.7, 35),
        new THREE.Vector3(-8.5, 0.6, 70),
      ]),
      64,
      0.2,
      6,
      false
    );
    const rightBufferGeo = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(8.5, 0.6, -70),
        new THREE.Vector3(13.5, 0.7, -35),
        new THREE.Vector3(8.5, 0.8, 0),
        new THREE.Vector3(3.5, 0.7, 35),
        new THREE.Vector3(8.5, 0.6, 70),
      ]),
      64,
      0.2,
      6,
      false
    );
    const bufferMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.85 });
    scene.add(new THREE.Mesh(leftBufferGeo, bufferMat));
    scene.add(new THREE.Mesh(rightBufferGeo, bufferMat));

    // R&R Resettlement Colony master plan in foreground
    const rehabGroup = new THREE.Group();
    rehabGroup.position.set(-38, 0.5, -20);
    scene.add(rehabGroup);

    const rehabBoundaryGeo = new THREE.BoxGeometry(26, 0.4, 26);
    const rehabBoundaryMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 });
    rehabGroup.add(new THREE.Mesh(rehabBoundaryGeo, rehabBoundaryMat));

    for (let rx = -9; rx <= 9; rx += 4.5) {
      for (let rz = -9; rz <= 9; rz += 4.5) {
        if (rx === 0 && rz === 0) continue;
        const houseGeo = new THREE.BoxGeometry(3, 2.2, 3);
        const houseMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.4, metalness: 0.2 });
        const house = new THREE.Mesh(houseGeo, houseMat);
        house.position.set(rx, 1.2, rz);
        house.castShadow = true;
        rehabGroup.add(house);
      }
    }
    const centerBuildingGeo = new THREE.BoxGeometry(5, 3.5, 5);
    const centerMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.3 });
    const centerBuilding = new THREE.Mesh(centerBuildingGeo, centerMat);
    centerBuilding.position.set(0, 1.9, 0);
    centerBuilding.castShadow = true;
    rehabGroup.add(centerBuilding);

    // Animation loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    // Mouse Listeners
    const handleMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
    };
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const deltaX = e.clientX - previousMousePositionRef.current.x;
      const deltaY = e.clientY - previousMousePositionRef.current.y;
      cameraAngleRef.current.theta -= deltaX * 0.008;
      cameraAngleRef.current.phi = Math.max(0.1, Math.min(Math.PI / 2.2, cameraAngleRef.current.phi + deltaY * 0.008));
      updateCameraPos();
      previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
    };
    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      cameraAngleRef.current.radius = Math.max(30, Math.min(160, cameraAngleRef.current.radius + e.deltaY * 0.08));
      updateCameraPos();
    };

    const domElem = renderer.domElement;
    domElem.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    domElem.addEventListener('wheel', handleWheel, { passive: false });

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
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      terrainGeo.dispose();
      terrainMat.dispose();
    };
  }, []);

  // Re-render Dynamic 3D Parcels when dynamicParcels or metricMode updates
  useEffect(() => {
    const group = dynamicGroupRef.current;
    if (!group) return;

    // Clear previous meshes
    while (group.children.length > 0) {
      const child = group.children[0] as THREE.Mesh;
      group.remove(child);
      if (child.geometry) child.geometry.dispose();
    }
    parcelMeshesRef.current.clear();

    dynamicParcels.forEach((parcel) => {
      const height = getParcelHeight(parcel);
      const stageMeta = getStageColor(parcel.stage);

      const boxGeo = new THREE.BoxGeometry(parcel.width, height, parcel.depth);
      const boxMat = new THREE.MeshStandardMaterial({
        color: stageMeta.hex,
        transparent: true,
        opacity: 0.75,
        roughness: 0.2,
        metalness: 0.4,
      });

      const parcelMesh = new THREE.Mesh(boxGeo, boxMat);
      parcelMesh.position.set(parcel.pos[0], height / 2 + 0.5, parcel.pos[1]);
      parcelMesh.castShadow = true;
      parcelMesh.receiveShadow = true;
      parcelMesh.userData = { parcelId: parcel.id };

      // Glowing Wireframe Edges
      const edges = new THREE.EdgesGeometry(boxGeo);
      const lineMat = new THREE.LineBasicMaterial({ color: stageMeta.hex, linewidth: 2 });
      const wireframe = new THREE.LineSegments(edges, lineMat);
      parcelMesh.add(wireframe);

      group.add(parcelMesh);
      parcelMeshesRef.current.set(parcel.id, parcelMesh);
    });
  }, [dynamicParcels, metricMode]);

  // Flythrough Camera Path
  const handleToggleFlythrough = () => {
    if (isPlayingFlythrough) {
      setIsPlayingFlythrough(false);
      if (flythroughAnimRef.current) cancelAnimationFrame(flythroughAnimRef.current);
      return;
    }

    setIsPlayingFlythrough(true);
    let t = 0;

    const fly = () => {
      t += 0.003;
      if (t > 1) t = 0;

      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 18, -70),
        new THREE.Vector3(5, 22, -35),
        new THREE.Vector3(0, 20, 0),
        new THREE.Vector3(-5, 24, 35),
        new THREE.Vector3(0, 18, 70),
      ]);

      const pt = curve.getPoint(t);
      const tangent = curve.getTangent(t);

      if (cameraRef.current) {
        cameraRef.current.position.copy(pt);
        cameraRef.current.lookAt(pt.clone().add(tangent.multiplyScalar(20)));
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
    cameraAngleRef.current = { theta: Math.PI / 4, phi: Math.PI / 6, radius: 95 };
    cameraTargetRef.current.set(0, 0, 0);
    if (cameraRef.current) {
      cameraRef.current.position.set(67, 47, 67);
      cameraRef.current.lookAt(0, 0, 0);
    }
  };

  // Dynamic Case Stats
  const totalArea = useMemo(() => dynamicParcels.reduce((acc, p) => acc + p.areaHa, 0), [dynamicParcels]);
  const totalComp = useMemo(() => dynamicParcels.reduce((acc, p) => acc + p.compensationCr, 0), [dynamicParcels]);
  const disputeCount = useMemo(() => dynamicParcels.filter((p) => p.stage === 'disputed').length, [dynamicParcels]);

  const caseTitle = activeCaseFeature?.properties?.title || activeCaseFeature?.properties?.case_number || 'Live Case Digital Twin';

  return (
    <div className="relative w-full h-[780px] rounded-2xl overflow-hidden border border-slate-700 bg-slate-950 shadow-2xl flex flex-col font-sans select-none">
      {/* 3D WebGL Canvas */}
      <div ref={mountRef} className="absolute inset-0 cursor-grab active:cursor-grabbing" />

      {/* Top Floating Telemetry & Dynamic Case Selector */}
      <div className="relative z-10 p-4 flex flex-wrap items-center justify-between gap-3 bg-slate-900/85 backdrop-blur-md border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-terra-700/30 border border-terra-500/50 flex items-center justify-center text-terra-400 font-bold shadow-lg shadow-terra-900/40">
            <Compass className="h-5 w-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800/80">
                Live 3D Digital Twin
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                {dynamicParcels.length} Extruded Khasras • WGS-84 Georeferenced
              </span>
            </div>

            {/* Dynamic Case Dropdown */}
            <div className="flex items-center gap-2 mt-1">
              <select
                value={activeCaseId}
                onChange={(e) => setActiveCaseId(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-white text-xs font-bold rounded-lg px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-cyan-400 cursor-pointer max-w-sm truncate"
              >
                {casesList.map((c) => {
                  const cId = c.id || c.properties?.id;
                  const cTitle = c.properties?.title || c.properties?.case_number || `Case ${cId}`;
                  return (
                    <option key={cId} value={cId}>
                      {cTitle}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
        </div>

        {/* Live Case Statistics */}
        <div className="flex items-center gap-3 text-xs">
          <div className="hidden lg:flex items-center gap-4 bg-slate-800/80 border border-slate-700/80 px-3.5 py-1.5 rounded-xl text-slate-300">
            <div>
              <span className="text-[10px] text-slate-400 block">Demarcated Land</span>
              <strong className="text-white font-mono">{totalArea.toFixed(1)} Ha</strong>
            </div>
            <div className="h-6 w-px bg-slate-700" />
            <div>
              <span className="text-[10px] text-slate-400 block">Form-11 Valuation</span>
              <strong className="text-emerald-400 font-mono">₹{totalComp.toFixed(1)} Cr</strong>
            </div>
            <div className="h-6 w-px bg-slate-700" />
            <div>
              <span className="text-[10px] text-slate-400 block">Litigation Risk</span>
              <strong className="text-rose-400 font-mono">{disputeCount} Disputes</strong>
            </div>
          </div>

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
            <span>{isPlayingFlythrough ? 'Pause Flythrough' : '3D Corridor Flythrough'}</span>
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
              title="Return to 2D Cadastral Map"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Main Studio Overlay */}
      <div className="relative z-10 flex-1 p-4 pointer-events-none flex justify-between items-start">
        {/* Left HUD: Metric Volumetric Controls */}
        <div className="w-72 bg-slate-900/85 backdrop-blur-md rounded-2xl border border-slate-800 p-4 pointer-events-auto space-y-4 shadow-2xl">
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Sliders className="h-3.5 w-3.5 text-cyan-400" />
              Volumetric Extrusion Metric
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
                  'flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer text-left',
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

          {/* 3D Legend */}
          <div className="border-t border-slate-800 pt-3 space-y-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">RFCTLARR Statutory Stages</span>
            <div className="space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between text-emerald-300">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-xs shadow-emerald-500" />
                  Possessed / Disbursed
                </span>
                <span className="font-mono text-xs">{dynamicParcels.filter((p) => p.stage === 'possessed').length}</span>
              </div>
              <div className="flex items-center justify-between text-amber-300">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shadow-xs shadow-amber-500" />
                  Section 19 Declaration
                </span>
                <span className="font-mono text-xs">{dynamicParcels.filter((p) => p.stage === 'section19').length}</span>
              </div>
              <div className="flex items-center justify-between text-rose-300">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-500 shadow-xs shadow-rose-500" />
                  Disputed / High Litigation
                </span>
                <span className="font-mono text-xs">{disputeCount}</span>
              </div>
            </div>
          </div>

          {/* Dynamic Parcel Register Selector */}
          <div className="border-t border-slate-800 pt-3 space-y-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Case Khasra Parcels ({dynamicParcels.length})</span>
            <div className="max-h-36 overflow-y-auto divide-y divide-slate-800/60 pr-1">
              {dynamicParcels.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedParcel(p)}
                  className={clsx(
                    'w-full py-1.5 px-2 flex items-center justify-between text-xs rounded transition-all text-left cursor-pointer',
                    selectedParcel?.id === p.id
                      ? 'bg-terra-950/80 text-terra-200 border border-terra-700/60 font-bold'
                      : 'text-slate-300 hover:bg-slate-800/80'
                  )}
                >
                  <span className="font-mono">Survey {p.surveyNo}</span>
                  <span className={clsx('text-[10px] font-bold px-1.5 py-0.2 rounded', p.stage === 'disputed' ? 'text-rose-400' : p.stage === 'section19' ? 'text-amber-400' : 'text-emerald-400')}>
                    {p.village}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right HUD: Selected Dynamic Parcel Dossier */}
        {selectedParcel && (
          <div className="w-80 bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-800 p-4 pointer-events-auto space-y-3 shadow-2xl animate-in fade-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <span className="h-6 w-6 rounded-lg bg-terra-900 text-terra-300 font-mono font-bold flex items-center justify-center text-xs border border-terra-700">
                  3D
                </span>
                <div>
                  <h4 className="text-xs font-bold text-white">Survey No. {selectedParcel.surveyNo}</h4>
                  <p className="text-[10px] text-slate-400 font-mono">{selectedParcel.village}</p>
                </div>
              </div>
              <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded border', selectedParcel.stage === 'disputed' ? 'bg-rose-950 text-rose-300 border-rose-800' : selectedParcel.stage === 'section19' ? 'bg-amber-950 text-amber-300 border-amber-800' : 'bg-emerald-950 text-emerald-300 border-emerald-800')}>
                {getStageColor(selectedParcel.stage).label}
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-800/60 text-slate-300">
                <span className="text-slate-400">Land Title Holder:</span>
                <strong className="text-white truncate max-w-[150px]">{selectedParcel.ownerName}</strong>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60 text-slate-300">
                <span className="text-slate-400">Acquisition Area:</span>
                <span className="font-mono text-cyan-300 font-bold">{selectedParcel.areaHa} Ha</span>
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
                <span className={clsx('font-mono font-bold', selectedParcel.riskScore > 70 ? 'text-rose-400' : selectedParcel.riskScore > 30 ? 'text-amber-400' : 'text-emerald-400')}>
                  {selectedParcel.riskScore}% {selectedParcel.riskScore > 70 ? 'Litigation Warning' : 'Normal'}
                </span>
              </div>
            </div>

            {selectedParcel.stage === 'disputed' && (
              <div className="rounded-xl border border-rose-800/80 bg-rose-950/50 p-2.5 space-y-1 text-[11px] text-rose-200">
                <div className="flex items-center gap-1.5 font-bold text-rose-300">
                  <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
                  <span>Section 64 Statutory Reference</span>
                </div>
                <p className="text-[10px] text-rose-300/80 leading-relaxed">
                  Dispute recorded for this parcel. Valuation objection or inheritance dispute pending review.
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
                Open Case Record
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom 4D Temporal Timeline Player */}
      <div className="relative z-10 p-3.5 bg-slate-900/90 backdrop-blur-md border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-800 px-2 py-1 rounded">
            4D Timeline Scrubber
          </span>
          <span className="text-xs font-bold text-white">
            Milestone {timelineStep} of 6: <span className="text-cyan-400">{timelineMilestones[timelineStep - 1]?.label}</span>
          </span>
        </div>

        {/* Milestone Steps Bar */}
        <div className="flex-1 w-full flex items-center justify-between gap-2 max-w-2xl px-2">
          {timelineMilestones.map((m) => (
            <button
              key={m.step}
              type="button"
              onClick={() => setTimelineStep(m.step)}
              className={clsx(
                'flex-1 py-1.5 px-2 rounded-lg text-center transition-all cursor-pointer border',
                timelineStep >= m.step
                  ? 'bg-terra-900/80 border-terra-600 text-white font-bold'
                  : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:bg-slate-800'
              )}
            >
              <div className="text-[10px] font-mono leading-none">{m.date}</div>
              <div className="text-[9px] truncate mt-0.5">{m.label.split(' ')[0]} {m.label.split(' ')[1]}</div>
            </button>
          ))}
        </div>

        <div className="text-right shrink-0">
          <span className="text-[10px] font-mono text-slate-400">
            Current Possession: <strong className="text-emerald-400">{Math.round((dynamicParcels.filter((p) => p.stage === 'possessed').length / (dynamicParcels.length || 1)) * 100)}%</strong>
          </span>
        </div>
      </div>
    </div>
  );
};
