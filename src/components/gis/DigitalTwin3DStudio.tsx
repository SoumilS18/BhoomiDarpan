import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import {
  Layers,
  Compass,
  Play,
  Pause,
  RotateCcw,
  Maximize2,
  Minimize2,
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
} from 'lucide-react';
import { clsx } from 'clsx';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';

export interface DigitalTwin3DStudioProps {
  onClose?: () => void;
  onSelectCase?: (caseId: string) => void;
  initialCorridorName?: string;
}

interface CadastralParcel3D {
  id: string;
  surveyNo: string;
  village: string;
  ownerName: string;
  areaHa: number;
  stage: 'possessed' | 'section19' | 'disputed' | 'survey';
  compensationCr: number;
  riskScore: number;
  pafCount: number;
  pos: [number, number]; // x, z in 3D scene
  width: number;
  depth: number;
}

const MOCK_PARCELS_3D: CadastralParcel3D[] = [
  { id: 'P-101', surveyNo: '142/1A', village: 'Wagholi', ownerName: 'Ramesh Patil', areaHa: 1.84, stage: 'possessed', compensationCr: 2.45, riskScore: 12, pafCount: 4, pos: [-18, -40], width: 6, depth: 8 },
  { id: 'P-102', surveyNo: '142/1B', village: 'Wagholi', ownerName: 'Suresh Deshmukh', areaHa: 2.10, stage: 'possessed', compensationCr: 2.80, riskScore: 15, pafCount: 3, pos: [14, -36], width: 7, depth: 7 },
  { id: 'P-103', surveyNo: '143/2', village: 'Wagholi', ownerName: 'Kavita Jadhav', areaHa: 3.45, stage: 'section19', compensationCr: 4.60, riskScore: 48, pafCount: 8, pos: [-16, -24], width: 8, depth: 9 },
  { id: 'P-104', surveyNo: '144/3A', village: 'Manjri Khurd', ownerName: 'Balasaheb Shinde', areaHa: 1.20, stage: 'disputed', compensationCr: 1.95, riskScore: 88, pafCount: 5, pos: [15, -20], width: 6, depth: 6 },
  { id: 'P-105', surveyNo: '144/3B', village: 'Manjri Khurd', ownerName: 'Pandurang Kadam', areaHa: 2.90, stage: 'possessed', compensationCr: 3.88, riskScore: 10, pafCount: 6, pos: [-15, -8], width: 7, depth: 8 },
  { id: 'P-106', surveyNo: '145/1', village: 'Manjri Khurd', ownerName: 'Asha Gaikwad', areaHa: 4.15, stage: 'section19', compensationCr: 5.50, riskScore: 52, pafCount: 11, pos: [16, -4], width: 9, depth: 9 },
  { id: 'P-107', surveyNo: '146/2', village: 'Hadapsar North', ownerName: 'Ganesh More', areaHa: 1.65, stage: 'disputed', compensationCr: 3.10, riskScore: 92, pafCount: 7, pos: [-14, 8], width: 6, depth: 7 },
  { id: 'P-108', surveyNo: '147/4', village: 'Hadapsar North', ownerName: 'Sunita Thorat', areaHa: 2.75, stage: 'possessed', compensationCr: 3.65, riskScore: 18, pafCount: 4, pos: [15, 12], width: 8, depth: 8 },
  { id: 'P-109', surveyNo: '148/1A', village: 'Fursungi', ownerName: 'Deepak Jagtap', areaHa: 3.80, stage: 'section19', compensationCr: 5.10, riskScore: 42, pafCount: 9, pos: [-16, 24], width: 8, depth: 10 },
  { id: 'P-110', surveyNo: '148/1B', village: 'Fursungi', ownerName: 'Maruti Chavan', areaHa: 2.30, stage: 'possessed', compensationCr: 3.05, riskScore: 14, pafCount: 5, pos: [14, 28], width: 7, depth: 7 },
  { id: 'P-111', surveyNo: '149/3', village: 'Fursungi', ownerName: 'Vijay Kadam', areaHa: 1.95, stage: 'disputed', compensationCr: 2.60, riskScore: 84, pafCount: 6, pos: [-14, 40], width: 6, depth: 8 },
  { id: 'P-112', surveyNo: '150/2', village: 'Uruli Devachi', ownerName: 'Santosh Pawar', areaHa: 3.10, stage: 'possessed', compensationCr: 4.15, riskScore: 22, pafCount: 7, pos: [16, 44], width: 8, depth: 9 },
];

export const DigitalTwin3DStudio: React.FC<DigitalTwin3DStudioProps> = ({
  onClose,
  onSelectCase,
  initialCorridorName = 'Pune Outer Ring Road - Western Alignment (NH-48 Corridor)',
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const parcelMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const flythroughAnimRef = useRef<number | null>(null);

  // Studio Interactive State
  const [metricMode, setMetricMode] = useState<'compensation' | 'risk' | 'paf' | 'area'>('compensation');
  const [selectedParcel, setSelectedParcel] = useState<CadastralParcel3D | null>(MOCK_PARCELS_3D[3]);
  const [isPlayingFlythrough, setIsPlayingFlythrough] = useState<boolean>(false);
  const [timelineStep, setTimelineStep] = useState<number>(4); // 1 to 6
  const [isResettlementVisible, setIsResettlementVisible] = useState<boolean>(true);
  const [isBufferRibbonVisible, setIsBufferRibbonVisible] = useState<boolean>(true);
  const [isTerrainContoursVisible, setIsTerrainContoursVisible] = useState<boolean>(true);
  const [cameraView, setCameraView] = useState<'perspective' | 'top' | 'cross_section'>('perspective');

  const timelineMilestones = [
    { step: 1, label: 'Sec 4(1) SIA Notification', date: 'Jan 2025' },
    { step: 2, label: 'Sec 6 SIA Appraisal Report', date: 'Apr 2025' },
    { step: 3, label: 'Sec 11 Preliminary Notice', date: 'Jul 2025' },
    { step: 4, label: 'Joint Measurement Survey (JMS)', date: 'Nov 2025' },
    { step: 5, label: 'Sec 19 Declaration Publication', date: 'Mar 2026' },
    { step: 6, label: 'Sec 23 Form-11 Award Handover', date: 'Aug 2026' },
  ];

  // Camera Orbit & Interaction variables
  const isDraggingRef = useRef(false);
  const previousMousePositionRef = useRef({ x: 0, y: 0 });
  const cameraTargetRef = useRef(new THREE.Vector3(0, 0, 0));
  const cameraAngleRef = useRef({ theta: Math.PI / 4, phi: Math.PI / 6, radius: 95 });

  // Calculate Height Scale based on Metric Mode
  const getParcelHeight = (parcel: CadastralParcel3D) => {
    switch (metricMode) {
      case 'compensation':
        return Math.max(2, parcel.compensationCr * 2.8);
      case 'risk':
        return Math.max(2, (parcel.riskScore / 100) * 16);
      case 'paf':
        return Math.max(2, parcel.pafCount * 1.5);
      case 'area':
        return Math.max(2, parcel.areaHa * 3.2);
    }
  };

  const getStageColor = (stage: CadastralParcel3D['stage']) => {
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

  // Initialize Three.js Scene
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a); // Deep Slate War Room
    scene.fog = new THREE.FogExp2(0x0f172a, 0.008);
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.5, 1000);
    cameraRef.current = camera;
    const updateCameraPos = () => {
      const { theta, phi, radius } = cameraAngleRef.current;
      camera.position.x = radius * Math.sin(theta) * Math.cos(phi);
      camera.position.y = Math.max(15, radius * Math.sin(phi));
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
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfff8e7, 1.2);
    dirLight.position.set(40, 70, 40);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    const blueHemisphere = new THREE.HemisphereLight(0x38bdf8, 0x1e293b, 0.5);
    scene.add(blueHemisphere);

    // 5. Terrain Grid Surface with Subtle Elevation Wave
    const terrainGeo = new THREE.PlaneGeometry(160, 160, 40, 40);
    const posAttr = terrainGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i);
      const vy = posAttr.getY(i);
      const elevation = Math.sin(vx * 0.04) * Math.cos(vy * 0.04) * 3.5 - Math.sin(vx * 0.02) * 2.0;
      posAttr.setZ(i, elevation);
    }
    terrainGeo.computeVertexNormals();
    terrainGeo.rotateX(-Math.PI / 2);

    const terrainMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.85,
      metalness: 0.15,
      wireframe: false,
    });
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.receiveShadow = true;
    scene.add(terrainMesh);

    // Elevation Contour Wireframe Overlay
    const contourMat = new THREE.MeshBasicMaterial({
      color: 0x334155,
      wireframe: true,
      transparent: true,
      opacity: 0.4,
    });
    const contourMesh = new THREE.Mesh(terrainGeo, contourMat);
    contourMesh.position.y = 0.05;
    scene.add(contourMesh);

    // 6. Right-of-Way (RoW) Central Highway Alignment Ribbon
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.4, -60),
      new THREE.Vector3(4, 0.5, -30),
      new THREE.Vector3(0, 0.6, 0),
      new THREE.Vector3(-4, 0.5, 30),
      new THREE.Vector3(0, 0.4, 60),
    ]);
    const roadGeo = new THREE.TubeGeometry(curve, 64, 4.5, 8, false);
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.5,
      metalness: 0.3,
    });
    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.scale.set(1, 0.08, 1);
    roadMesh.position.y = 0.3;
    scene.add(roadMesh);

    // Glowing Cyan Right-of-Way (RoW) Buffer Boundaries
    const leftBufferGeo = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(-8, 0.6, -60),
        new THREE.Vector3(-4, 0.7, -30),
        new THREE.Vector3(-8, 0.8, 0),
        new THREE.Vector3(-12, 0.7, 30),
        new THREE.Vector3(-8, 0.6, 60),
      ]),
      64,
      0.2,
      6,
      false
    );
    const rightBufferGeo = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(8, 0.6, -60),
        new THREE.Vector3(12, 0.7, -30),
        new THREE.Vector3(8, 0.8, 0),
        new THREE.Vector3(4, 0.7, 30),
        new THREE.Vector3(8, 0.6, 60),
      ]),
      64,
      0.2,
      6,
      false
    );
    const bufferMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.85 });
    const leftBuffer = new THREE.Mesh(leftBufferGeo, bufferMat);
    const rightBuffer = new THREE.Mesh(rightBufferGeo, bufferMat);
    scene.add(leftBuffer);
    scene.add(rightBuffer);

    // 7. 3D Extruded Cadastral Parcels
    const parcelGroup = new THREE.Group();
    scene.add(parcelGroup);

    MOCK_PARCELS_3D.forEach((parcel) => {
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

      // Add Glowing Edge Wireframe
      const edges = new THREE.EdgesGeometry(boxGeo);
      const lineMat = new THREE.LineBasicMaterial({ color: stageMeta.hex, linewidth: 2 });
      const wireframe = new THREE.LineSegments(edges, lineMat);
      parcelMesh.add(wireframe);

      parcelGroup.add(parcelMesh);
      parcelMeshesRef.current.set(parcel.id, parcelMesh);
    });

    // 8. 3D Resettlement & Rehabilitation (R&R) Colony Layout (Foreground)
    const rehabGroup = new THREE.Group();
    rehabGroup.position.set(-35, 0.5, -15);
    scene.add(rehabGroup);

    // Colony Perimeter Boundary
    const rehabBoundaryGeo = new THREE.BoxGeometry(26, 0.4, 26);
    const rehabBoundaryMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 });
    const rehabBase = new THREE.Mesh(rehabBoundaryGeo, rehabBoundaryMat);
    rehabGroup.add(rehabBase);

    // Modular Housing Blocks (Second Schedule standard 50 sq.m units)
    for (let rx = -9; rx <= 9; rx += 4.5) {
      for (let rz = -9; rz <= 9; rz += 4.5) {
        if (rx === 0 && rz === 0) continue; // Center open space
        const houseGeo = new THREE.BoxGeometry(3, 2.2, 3);
        const houseMat = new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          roughness: 0.4,
          metalness: 0.2,
        });
        const house = new THREE.Mesh(houseGeo, houseMat);
        house.position.set(rx, 1.2, rz);
        house.castShadow = true;
        rehabGroup.add(house);
      }
    }

    // Community Center / School in center of colony
    const centerBuildingGeo = new THREE.BoxGeometry(5, 3.5, 5);
    const centerMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.3 });
    const centerBuilding = new THREE.Mesh(centerBuildingGeo, centerMat);
    centerBuilding.position.set(0, 1.9, 0);
    centerBuilding.castShadow = true;
    rehabGroup.add(centerBuilding);

    // 9. Animation & Render Loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      // Gentle beacon pulse on selected parcel
      if (selectedParcel) {
        const mesh = parcelMeshesRef.current.get(selectedParcel.id);
        if (mesh) {
          const time = Date.now() * 0.003;
          mesh.rotation.y = Math.sin(time) * 0.02;
        }
      }

      renderer.render(scene, camera);
    };
    animate();

    // 10. Mouse & Interaction Handlers
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

    // Handle Window Resizing
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

  // Update Extruded Parcel Heights when Metric Mode changes
  useEffect(() => {
    MOCK_PARCELS_3D.forEach((parcel) => {
      const mesh = parcelMeshesRef.current.get(parcel.id);
      if (!mesh) return;

      const targetHeight = getParcelHeight(parcel);
      mesh.scale.set(1, targetHeight / (mesh.geometry as THREE.BoxGeometry).parameters.height, 1);
      mesh.position.y = targetHeight / 2 + 0.5;
    });
  }, [metricMode]);

  // Cinematic Flythrough Controller
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
        new THREE.Vector3(0, 18, -60),
        new THREE.Vector3(4, 22, -30),
        new THREE.Vector3(0, 20, 0),
        new THREE.Vector3(-4, 24, 30),
        new THREE.Vector3(0, 18, 60),
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

  // Stats calculation
  const totalArea = useMemo(() => MOCK_PARCELS_3D.reduce((acc, p) => acc + p.areaHa, 0), []);
  const totalComp = useMemo(() => MOCK_PARCELS_3D.reduce((acc, p) => acc + p.compensationCr, 0), []);
  const disputeCount = useMemo(() => MOCK_PARCELS_3D.filter((p) => p.stage === 'disputed').length, []);

  return (
    <div className="relative w-full h-[780px] rounded-2xl overflow-hidden border border-slate-700 bg-slate-950 shadow-2xl flex flex-col font-sans select-none">
      {/* 3D WebGL Canvas Viewport */}
      <div ref={mountRef} className="absolute inset-0 cursor-grab active:cursor-grabbing" />

      {/* Top Floating Telemetry & Mode Header */}
      <div className="relative z-10 p-4 flex flex-wrap items-center justify-between gap-3 bg-slate-900/80 backdrop-blur-md border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-terra-700/30 border border-terra-500/50 flex items-center justify-center text-terra-400 font-bold shadow-lg shadow-terra-900/40">
            <Compass className="h-5 w-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800/80">
                3D Digital Twin Active
              </span>
              <span className="text-[10px] font-mono text-slate-400">EPSG:4326 • 60 FPS WebGL</span>
            </div>
            <h2 className="text-sm sm:text-base font-bold text-white tracking-tight flex items-center gap-2 mt-0.5">
              {initialCorridorName}
            </h2>
          </div>
        </div>

        {/* Live Corridor Stats Pills */}
        <div className="flex items-center gap-3 text-xs">
          <div className="hidden lg:flex items-center gap-4 bg-slate-800/80 border border-slate-700/80 px-3.5 py-1.5 rounded-xl text-slate-300">
            <div>
              <span className="text-[10px] text-slate-400 block">Total Corridor Land</span>
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
              <strong className="text-rose-400 font-mono">{disputeCount} Khasras</strong>
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

      {/* Main Studio Overlay Grid */}
      <div className="relative z-10 flex-1 p-4 pointer-events-none flex justify-between items-start">
        {/* Left HUD: Metric Volumetric Controls & Layer Selectors */}
        <div className="w-72 bg-slate-900/85 backdrop-blur-md rounded-2xl border border-slate-800 p-4 pointer-events-auto space-y-4 shadow-2xl">
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Sliders className="h-3.5 w-3.5 text-cyan-400" />
              Volumetric 3D Extrusion
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Scale prism height by live administrative metric</p>
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
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">RFCTLARR 3D Stages</span>
            <div className="space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between text-emerald-300">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-xs shadow-emerald-500" />
                  Possessed & Disbursed
                </span>
                <span className="font-mono text-xs">5 Parcels</span>
              </div>
              <div className="flex items-center justify-between text-amber-300">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shadow-xs shadow-amber-500" />
                  Section 19 Declaration
                </span>
                <span className="font-mono text-xs">4 Parcels</span>
              </div>
              <div className="flex items-center justify-between text-rose-300">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-500 shadow-xs shadow-rose-500" />
                  Disputed / High Litigation
                </span>
                <span className="font-mono text-xs">3 Parcels</span>
              </div>
            </div>
          </div>

          {/* Quick Parcel Selector List */}
          <div className="border-t border-slate-800 pt-3 space-y-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Corridor Khasras (Click to Inspect)</span>
            <div className="max-h-36 overflow-y-auto divide-y divide-slate-800/60 pr-1">
              {MOCK_PARCELS_3D.map((p) => (
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

        {/* Right HUD: Selected 3D Parcel Inspector Dossier */}
        {selectedParcel && (
          <div className="w-80 bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-800 p-4 pointer-events-auto space-y-3 shadow-2xl animate-in fade-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <span className="h-6 w-6 rounded-lg bg-terra-900 text-terra-300 font-mono font-bold flex items-center justify-center text-xs border border-terra-700">
                  3D
                </span>
                <div>
                  <h4 className="text-xs font-bold text-white">Survey No. {selectedParcel.surveyNo}</h4>
                  <p className="text-[10px] text-slate-400 font-mono">{selectedParcel.village} • LGD: 554321</p>
                </div>
              </div>
              <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded border', selectedParcel.stage === 'disputed' ? 'bg-rose-950 text-rose-300 border-rose-800' : selectedParcel.stage === 'section19' ? 'bg-amber-950 text-amber-300 border-amber-800' : 'bg-emerald-950 text-emerald-300 border-emerald-800')}>
                {getStageColor(selectedParcel.stage).label}
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-800/60 text-slate-300">
                <span className="text-slate-400">Land Title Holder:</span>
                <strong className="text-white">{selectedParcel.ownerName}</strong>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60 text-slate-300">
                <span className="text-slate-400">Acquisition Area:</span>
                <span className="font-mono text-cyan-300 font-bold">{selectedParcel.areaHa} Hectares</span>
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
                  {selectedParcel.riskScore}% {selectedParcel.riskScore > 70 ? 'Critical Alert' : 'Normal'}
                </span>
              </div>
            </div>

            {selectedParcel.stage === 'disputed' && (
              <div className="rounded-xl border border-rose-800/80 bg-rose-950/50 p-2.5 space-y-1 text-[11px] text-rose-200">
                <div className="flex items-center gap-1.5 font-bold text-rose-300">
                  <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
                  <span>Section 64 Land Authority Dispute</span>
                </div>
                <p className="text-[10px] text-rose-300/80 leading-relaxed">
                  Title dispute pending before Pune District Land Acquisition, Rehabilitation & Resettlement Authority.
                </p>
              </div>
            )}

            <div className="pt-2 flex gap-2">
              <Button
                variant="primary"
                size="sm"
                className="w-full text-xs"
                onClick={() => onSelectCase && onSelectCase('MH-PUN-2026-0089')}
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
            Current Possession: <strong className="text-emerald-400">68.4%</strong>
          </span>
        </div>
      </div>
    </div>
  );
};
