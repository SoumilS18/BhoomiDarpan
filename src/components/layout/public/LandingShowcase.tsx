import React, { useState, useRef, useEffect } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Sparkles,
  Layers,
  MapPin,
  Compass,
  RotateCw,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  Activity,
  Globe2,
  LandPlot,
  X,
} from 'lucide-react';
import * as THREE from 'three';
import { DigitalTwin3DStudio } from '../../gis/DigitalTwin3DStudio';

interface LandingShowcaseProps {
  onOpenDemoLogin?: () => void;
}

export const LandingShowcase: React.FC<LandingShowcaseProps> = () => {
  const [activeTab, setActiveTab] = useState<'video' | '3d' | 'corridors'>('video');
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [showFull3DModal, setShowFull3DModal] = useState<boolean>(false);
  const [selectedCorridorIdx, setSelectedCorridorIdx] = useState<number>(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasMountRef = useRef<HTMLDivElement | null>(null);

  // Toggle Video Playback
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  // Toggle Video Mute
  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(videoRef.current.muted);
  };

  // Request Fullscreen for Video
  const handleFullscreen = () => {
    if (!videoRef.current) return;
    if (videoRef.current.requestFullscreen) {
      videoRef.current.requestFullscreen();
    }
  };

  // Real Project Corridors Data (from live database verified realignment)
  const CORRIDORS = [
    {
      code: 'PRJ-METRO-P2',
      name: 'Metropolitan Urban Rail Transit (Line 3 & 4 Link)',
      district: 'Agra',
      state: 'Uttar Pradesh',
      type: 'Metro Rail',
      rowWidth: '550m RoW',
      containment: '100% Contained (3/3 Packages)',
      budget: '₹16,800 Cr',
      area: '82.4 Ha',
      color: 'from-amber-500 to-orange-600',
    },
    {
      code: 'PRJ-NH48-EXP',
      name: 'NH-48 Golden Quadrilateral Expansion & Multi-Lane Bypass',
      district: 'Ahilyanagar',
      state: 'Maharashtra',
      type: 'National Highway',
      rowWidth: '600m RoW',
      containment: '100% Contained (3/3 Packages)',
      budget: '₹18,500 Cr',
      area: '104.2 Ha',
      color: 'from-blue-500 to-indigo-600',
    },
    {
      code: 'PRJ-AIRPORT-CARGO',
      name: 'International Air Cargo & Transshipment Logistics Terminal',
      district: 'Ahmedabad',
      state: 'Gujarat',
      type: 'Aviation Logistics',
      rowWidth: '550m RoW',
      containment: '100% Contained (3/3 Packages)',
      budget: '₹22,000 Cr',
      area: '118.5 Ha',
      color: 'from-emerald-500 to-teal-600',
    },
    {
      code: 'PRJ-PORT-LINK',
      name: 'Deep-Water Coastal Port Multi-Modal Road & Rail Connectivity',
      district: 'Bagalkote',
      state: 'Karnataka',
      type: 'Port & Rail',
      rowWidth: '550m RoW',
      containment: '100% Contained (3/3 Packages)',
      budget: '₹13,900 Cr',
      area: '91.8 Ha',
      color: 'from-cyan-500 to-blue-600',
    },
    {
      code: 'PRJ-RRTS-NCR',
      name: 'Regional Rapid Transit System (RRTS Inter-City Corridor)',
      district: 'Ambala',
      state: 'Haryana',
      type: 'Rapid Rail',
      rowWidth: '550m RoW',
      containment: '100% Contained (3/3 Packages)',
      budget: '₹31,000 Cr',
      area: '126.0 Ha',
      color: 'from-purple-500 to-indigo-600',
    },
    {
      code: 'SMC-123',
      name: 'Smart City Heritage Ring & Mass Rapid Transit Arterial',
      district: 'Varanasi',
      state: 'Uttar Pradesh',
      type: 'Urban Arterial',
      rowWidth: '450m RoW',
      containment: '100% Contained (2/2 Packages)',
      budget: '₹8,400 Cr',
      area: '48.6 Ha',
      color: 'from-rose-500 to-pink-600',
    },
  ];

  // -------------------------------------------------------------------------
  // High-performance Three.js Interactive 3D Cadastral Digital Twin Hero
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (activeTab !== '3d' || !canvasMountRef.current) return;

    let animationFrameId: number;
    const container = canvasMountRef.current;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 450;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0f1d);
    scene.fog = new THREE.FogExp2(0x0a0f1d, 0.015);

    // Camera setup
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(45, 32, 50);
    camera.lookAt(0, 0, 0);

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfffaed, 1.4);
    sunLight.position.set(60, 80, 40);
    sunLight.castShadow = true;
    scene.add(sunLight);

    const blueRimLight = new THREE.DirectionalLight(0x38bdf8, 0.8);
    blueRimLight.position.set(-50, 40, -40);
    scene.add(blueRimLight);

    // Topographic Base Grid
    const gridHelper = new THREE.GridHelper(100, 30, 0x1e3a8a, 0x1e293b);
    gridHelper.position.y = -0.1;
    scene.add(gridHelper);

    // Main 3D Corridor & Parcels Group
    const worldGroup = new THREE.Group();
    scene.add(worldGroup);

    // Right-of-Way (RoW) Corridor Ribbon (550m scaled model)
    const corridorCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-45, 0.2, -25),
      new THREE.Vector3(-20, 0.2, -10),
      new THREE.Vector3(0, 0.2, 0),
      new THREE.Vector3(20, 0.2, 12),
      new THREE.Vector3(45, 0.2, 28),
    ]);

    // Corridor Highway Surface
    const corridorGeo = new THREE.TubeGeometry(corridorCurve, 64, 4.5, 8, false);
    const corridorMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.4,
      metalness: 0.2,
    });
    const corridorMesh = new THREE.Mesh(corridorGeo, corridorMat);
    corridorMesh.scale.set(1, 0.08, 1);
    worldGroup.add(corridorMesh);

    // Corridor Right-of-Way Buffer Outline (Outer Envelope)
    const rowBufferGeo = new THREE.TubeGeometry(corridorCurve, 64, 7.5, 4, false);
    const rowBufferMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.25,
    });
    const rowBufferMesh = new THREE.Mesh(rowBufferGeo, rowBufferMat);
    rowBufferMesh.scale.set(1, 0.02, 1);
    worldGroup.add(rowBufferMesh);

    // Corridor Centerline Glowing Marker Line
    const points = corridorCurve.getPoints(100);
    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xf59e0b, linewidth: 2 });
    const centerLine = new THREE.Line(lineGeo, lineMat);
    centerLine.position.y = 0.35;
    worldGroup.add(centerLine);

    // Cadastral Parcels Extrusions along the Corridor
    const parcelColors = [
      0x10b981, // Possessed (Emerald)
      0x3b82f6, // Awarded (Blue)
      0xf59e0b, // Surveyed (Amber)
      0x8b5cf6, // Notified (Purple)
      0x10b981, // Possessed
      0x3b82f6, // Awarded
    ];

    const parcelPositions = [
      { x: -32, z: -18, w: 9, d: 7, h: 2.4, color: 0x10b981, survey: 'Survey 142/A' },
      { x: -18, z: -8, w: 10, d: 8, h: 3.2, color: 0x3b82f6, survey: 'Survey 143/B' },
      { x: -3, z: 0, w: 11, d: 8.5, h: 4.1, color: 0xf59e0b, survey: 'Survey 144/C' },
      { x: 12, z: 8, w: 9.5, d: 7.5, h: 2.8, color: 0x10b981, survey: 'Survey 145/D' },
      { x: 28, z: 18, w: 10, d: 8, h: 3.5, color: 0x8b5cf6, survey: 'Survey 146/E' },
    ];

    parcelPositions.forEach((p) => {
      // Extruded parcel block
      const boxGeo = new THREE.BoxGeometry(p.w, p.h, p.d);
      const boxMat = new THREE.MeshStandardMaterial({
        color: p.color,
        roughness: 0.3,
        metalness: 0.2,
        transparent: true,
        opacity: 0.85,
      });
      const box = new THREE.Mesh(boxGeo, boxMat);
      box.position.set(p.x, p.h / 2, p.z);
      box.castShadow = true;
      box.receiveShadow = true;
      worldGroup.add(box);

      // Edge outline
      const edges = new THREE.EdgesGeometry(boxGeo);
      const edgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
      const edgeLine = new THREE.LineSegments(edges, edgeMat);
      edgeLine.position.copy(box.position);
      worldGroup.add(edgeLine);

      // Survey Pin / Beacon
      const pinGeo = new THREE.CylinderGeometry(0.15, 0.15, 3.5, 8);
      const pinMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const pin = new THREE.Mesh(pinGeo, pinMat);
      pin.position.set(p.x, p.h + 1.75, p.z);
      worldGroup.add(pin);

      const beaconGeo = new THREE.SphereGeometry(0.5, 12, 12);
      const beaconMat = new THREE.MeshBasicMaterial({ color: p.color });
      const beacon = new THREE.Mesh(beaconGeo, beaconMat);
      beacon.position.set(p.x, p.h + 3.5, p.z);
      worldGroup.add(beacon);
    });

    // Dynamic animated pulse along corridor
    const pulseGeo = new THREE.SphereGeometry(0.8, 16, 16);
    const pulseMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const pulseMesh = new THREE.Mesh(pulseGeo, pulseMat);
    worldGroup.add(pulseMesh);

    // Mouse Drag Rotation logic
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;
    let angleY = 0.3;
    let angleX = 0.45;

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaX = e.clientX - prevMouseX;
      const deltaY = e.clientY - prevMouseY;
      angleY += deltaX * 0.008;
      angleX = Math.max(0.15, Math.min(1.2, angleX + deltaY * 0.008));
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    // Resize handler
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Animation Loop
    let clock = new THREE.Clock();
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const time = clock.getElapsedTime();

      // Smooth auto-orbit when not dragging
      if (!isDragging) {
        angleY += 0.003;
      }

      const radius = 68;
      camera.position.x = radius * Math.cos(angleY) * Math.cos(angleX);
      camera.position.z = radius * Math.sin(angleY) * Math.cos(angleX);
      camera.position.y = radius * Math.sin(angleX);
      camera.lookAt(0, 2, 0);

      // Move pulse along corridor
      const t = (time * 0.25) % 1;
      const pulsePos = corridorCurve.getPointAt(t);
      pulseMesh.position.copy(pulsePos);
      pulseMesh.position.y += 0.8;

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      renderer.dispose();
    };
  }, [activeTab]);

  return (
    <div className="relative w-full">
      {/* Ambient background glow */}
      <div
        className="pointer-events-none absolute -inset-2 rounded-2xl opacity-30 blur-xl"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(37, 99, 235, 0.45) 0%, rgba(245, 158, 11, 0.2) 50%, transparent 80%)',
        }}
        aria-hidden="true"
      />

      {/* Main Showcase Studio Window Container */}
      <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-slate-950/90 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.7)] backdrop-blur-xl">
        {/* Top Control & Navigation Ribbon */}
        <div className="flex flex-wrap items-center justify-between border-b border-white/10 bg-slate-900/80 px-3.5 py-2.5 sm:px-4">
          {/* Brand & Live Status */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5" aria-hidden="true">
              <div className="h-2.5 w-2.5 rounded-full bg-rose-500/80 shadow-xs" />
              <div className="h-2.5 w-2.5 rounded-full bg-amber-500/80 shadow-xs" />
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/80 shadow-xs" />
            </div>

            <div className="h-3.5 w-px bg-white/20 mx-0.5 hidden sm:block" />

            <div className="flex items-center gap-1.5">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-200">
                Digital Twin Studio
              </span>
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-slate-950/70 p-0.5">
            <button
              onClick={() => setActiveTab('video')}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] sm:text-xs font-semibold transition-all ${
                activeTab === 'video'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Play className="h-3 w-3" />
              <span>Flyover Reel</span>
            </button>

            <button
              onClick={() => setActiveTab('3d')}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] sm:text-xs font-semibold transition-all ${
                activeTab === '3d'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Globe2 className="h-3 w-3" />
              <span>3D Cadastre</span>
            </button>

            <button
              onClick={() => setActiveTab('corridors')}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] sm:text-xs font-semibold transition-all ${
                activeTab === 'corridors'
                  ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="h-3 w-3" />
              <span>Corridors</span>
            </button>
          </div>
        </div>

        {/* Content Pane: Tab 1 — Flyover Video */}
        {activeTab === 'video' && (
          <div className="group relative aspect-video w-full overflow-hidden bg-black">
            <video
              ref={videoRef}
              src="/BhoomiDarpan.mp4"
              autoPlay
              loop
              muted={isMuted}
              playsInline
              className="h-full w-full object-cover"
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />

            {/* Cinematic Gradient Overlays */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-slate-950/40" />

            {/* Bottom Controls Bar */}
            <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/15 bg-slate-900/80 px-4 py-2.5 backdrop-blur-md transition-opacity duration-300">
              <div className="flex items-center gap-3">
                {/* Play/Pause Button */}
                <button
                  onClick={togglePlay}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none"
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
                </button>

                {/* Mute/Unmute Button */}
                <button
                  onClick={toggleMute}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    isMuted
                      ? 'bg-amber-400/20 text-amber-300 hover:bg-amber-400/30'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                  title={isMuted ? 'Unmute Sound' : 'Mute Sound'}
                >
                  {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  <span>{isMuted ? 'Unmute Video' : 'Audio Live'}</span>
                </button>

                <div className="hidden sm:block text-xs text-slate-300 font-mono">
                  BhoomiDarpan Sovereign Reel · 1080p Full HD
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveTab('3d')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20"
                >
                  <Globe2 className="h-3.5 w-3.5" />
                  <span>Try 3D Model</span>
                </button>

                <button
                  onClick={handleFullscreen}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-slate-300 transition-colors hover:bg-white/20 hover:text-white"
                  title="Expand to Fullscreen"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Content Pane: Tab 2 — Interactive 3D Digital Twin */}
        {activeTab === '3d' && (
          <div className="relative aspect-video w-full overflow-hidden bg-slate-950">
            {/* 3D Canvas Mount Point */}
            <div ref={canvasMountRef} className="h-full w-full cursor-grab active:cursor-grabbing" />

            {/* 3D Overlay Telemetry HUD */}
            <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-1.5 text-xs">
              <div className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-slate-900/80 px-3 py-1 text-slate-200 backdrop-blur-md shadow-sm">
                <Compass className="h-3.5 w-3.5 text-blue-400" />
                <span>Drag Mouse to Orbit 360° · Scroll to Zoom</span>
              </div>

              <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-950/70 px-3 py-1 text-emerald-300 backdrop-blur-md">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span>Right-of-Way Buffer: 550m RoW Encapsulation</span>
              </div>
            </div>

            {/* Stage Legend Overlay */}
            <div className="pointer-events-none absolute bottom-4 left-4 hidden sm:flex items-center gap-3 rounded-lg border border-white/10 bg-slate-900/80 px-3 py-1.5 text-[11px] text-slate-300 backdrop-blur-md">
              <span className="font-semibold text-white">Parcels:</span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Possessed (Sec 38)
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> Awarded (Sec 30)
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Surveyed (Sec 19)
              </span>
            </div>

            {/* Launch Full 3D Studio Button */}
            <div className="absolute bottom-4 right-4 flex items-center gap-2">
              <button
                onClick={() => setShowFull3DModal(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-lg transition-all hover:scale-105 hover:from-blue-500 hover:to-indigo-500 focus:outline-none"
              >
                <Sparkles className="h-4 w-4" />
                <span>Launch Full 3D Cadastral Studio</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Content Pane: Tab 3 — Verified Project Corridors */}
        {activeTab === 'corridors' && (
          <div className="relative aspect-video w-full overflow-y-auto bg-slate-950 p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">Verified National Infrastructure Corridors</h3>
                <p className="text-xs text-slate-400">
                  Every corridor is configured with a 550m–600m RoW buffer enclosing 100% of statutory acquisition cases.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300 border border-emerald-500/30">
                  12/12 Corridors Validated
                </span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {CORRIDORS.map((c, i) => (
                <div
                  key={c.code}
                  onClick={() => setSelectedCorridorIdx(i)}
                  className={`group relative flex cursor-pointer flex-col justify-between rounded-xl border p-4 transition-all ${
                    selectedCorridorIdx === i
                      ? 'border-blue-500 bg-slate-900 ring-1 ring-blue-500 shadow-md'
                      : 'border-white/10 bg-slate-900/50 hover:border-white/20 hover:bg-slate-900'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-mono font-semibold text-amber-300">
                        {c.code}
                      </span>
                      <span className="text-[11px] font-medium text-slate-400">
                        {c.type}
                      </span>
                    </div>

                    <h4 className="mt-2 text-sm font-semibold text-white group-hover:text-blue-300 transition-colors">
                      {c.name}
                    </h4>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                      <MapPin className="h-3.5 w-3.5 text-rose-400" />
                      {c.district}, {c.state}
                    </p>
                  </div>

                  <div className="mt-4 border-t border-white/10 pt-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Buffer Width:</span>
                      <span className="font-semibold text-slate-200">{c.rowWidth}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs">
                      <span className="text-slate-400">Status:</span>
                      <span className="font-semibold text-emerald-400">{c.containment}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer Feature Ticker */}
        <div className="grid grid-cols-2 divide-x divide-white/10 border-t border-white/10 bg-slate-900/90 text-xs sm:grid-cols-4">
          <div className="flex items-center gap-2.5 p-3 sm:px-4">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <div>
              <p className="font-semibold text-white">100% Contained</p>
              <p className="text-[11px] text-slate-400">All cases inside 550m RoW</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 p-3 sm:px-4">
            <Globe2 className="h-4 w-4 shrink-0 text-blue-400" />
            <div>
              <p className="font-semibold text-white">LGD Authority</p>
              <p className="text-[11px] text-slate-400">Zero-hardcoded boundaries</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 p-3 sm:px-4">
            <ShieldCheck className="h-4 w-4 shrink-0 text-purple-400" />
            <div>
              <p className="font-semibold text-white">RFCTLARR 2013</p>
              <p className="text-[11px] text-slate-400">Statutory lifecycle stages</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 p-3 sm:px-4">
            <Activity className="h-4 w-4 shrink-0 text-amber-400" />
            <div>
              <p className="font-semibold text-white">Predictive AI</p>
              <p className="text-[11px] text-slate-400">Explainable risk & delay</p>
            </div>
          </div>
        </div>
      </div>

      {/* Full 3D Cadastral Studio Modal */}
      {showFull3DModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-2 sm:p-6 backdrop-blur-md">
          <div className="relative flex h-full max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-white/20 bg-slate-900 shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 bg-slate-950 px-4 py-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">
                  BhoomiDarpan 3D Cadastral Digital Twin Studio
                </h3>
                <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-semibold text-blue-300">
                  Full Interactive Mode
                </span>
              </div>

              <button
                onClick={() => setShowFull3DModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-slate-400 transition-colors hover:bg-white/20 hover:text-white"
                title="Close Studio"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Studio Body */}
            <div className="relative flex-1 overflow-hidden">
              <DigitalTwin3DStudio onClose={() => setShowFull3DModal(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
