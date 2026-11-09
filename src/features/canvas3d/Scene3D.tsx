'use client';

/* Detailed prototype models with live document geometry and editor selection.
 * Plan x maps to x, plan y to -z; all rendered distances use metres. */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { useSceneStore } from '@/stores/sceneStore';
import { useEditorStore } from '@/stores/editorStore';
import { assetById, materialById } from '@/core/assets';
import { instanceGeometry, instanceRef, type Asset, type ComponentInstance, type Level, type Material, type Opening, type Room } from '@/core/types';
import { docBBox } from '@/core/geometry';
import { buildWallSolids } from '@/core/wallGeometry';
import { createModelFactory, disposeModelGeometry } from './modelFactory';
import { documentAssets, documentMaterials } from '@/core/sceneResources';
import OrientationCompass from '@/features/editor/OrientationCompass';
import WalkModeControls from './WalkModeControls';
import { findWalkSpawn } from './walkNavigation';
import { openingsForRenovatedLevel } from '@/core/renovation';

type ModelFactory = ReturnType<typeof createModelFactory>;

function Solid({ rect, bottom, top, color, renovation, cap = true }: {
  rect: number[]; bottom: number; top: number; color?: string; renovation?: 'new' | 'demolished'; cap?: boolean;
}) {
  const [x0, y0, x1, y1] = rect;
  if (top <= bottom || x1 <= x0 || y1 <= y0) return null;
  if (renovation === 'demolished') return (
    <mesh position={[(x0 + x1) / 2000, (bottom + top) / 2000, -(y0 + y1) / 2000]}>
      <boxGeometry args={[(x1 - x0) / 1000, (top - bottom) / 1000, (y1 - y0) / 1000]} />
      <meshBasicMaterial color="#c43e38" wireframe transparent opacity={0.52} depthWrite={false} />
    </mesh>
  );
  return (
    <mesh position={[(x0 + x1) / 2000, (bottom + top) / 2000, -(y0 + y1) / 2000]} castShadow receiveShadow>
      <boxGeometry args={[(x1 - x0) / 1000, (top - bottom) / 1000, (y1 - y0) / 1000]} />
      {Array.from({ length: 6 }, (_, i) => (
        <meshStandardMaterial key={i} attach={'material-' + i}
          color={color ?? (renovation === 'new' ? (cap && i === 2 ? '#275a42' : '#d9eadf') : cap && i === 2 ? '#34312d' : '#e4e0d8')}
          roughness={cap && i === 2 ? 0.9 : 0.92} />
      ))}
    </mesh>
  );
}

function WindowFrame({ opening, cutHeight }: { opening: Opening; cutHeight: number }) {
  const [x0, y0, x1, y1] = opening.rect;
  const horizontal = x1 - x0 >= y1 - y0;
  const length = (horizontal ? x1 - x0 : y1 - y0) / 1000;
  const sill = opening.sill / 1000;
  const head = Math.min(opening.sill + opening.height, cutHeight) / 1000;
  const height = head - sill;
  if (height <= 0 || length <= 0) return null;
  const divisions = Math.max(1, Math.round(length / 0.9));
  return (
    <group position={[(x0 + x1) / 2000, 0, -(y0 + y1) / 2000]} rotation={[0, horizontal ? 0 : Math.PI / 2, 0]}>
      <mesh position={[0, sill + height / 2, 0]} receiveShadow>
        <boxGeometry args={[length, height, 0.012]} />
        <meshPhysicalMaterial color="#cfe6ef" roughness={0.05} metalness={0.1} transparent opacity={0.24} depthWrite={false} side={THREE.DoubleSide} envMapIntensity={0.55} />
      </mesh>
      {Array.from({ length: divisions + 1 }, (_, i) => (
        <mesh key={i} position={[-length / 2 + i * length / divisions, sill + height / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.035, height, 0.055]} />
          <meshStandardMaterial color="#5d6166" metalness={0.45} roughness={0.38} />
        </mesh>
      ))}
      {[sill + 0.018, head - 0.018].map(y => (
        <mesh key={y} position={[0, y, 0]} castShadow receiveShadow>
          <boxGeometry args={[length, 0.036, 0.055]} />
          <meshStandardMaterial color="#5d6166" metalness={0.45} roughness={0.38} />
        </mesh>
      ))}
    </group>
  );
}

function DoorLeaf({ opening, cutHeight, open, onToggle }: {
  opening: Opening;
  cutHeight: number;
  open: boolean;
  onToggle: () => void;
}) {
  const hinge = opening.hinge;
  if (!hinge || !opening.openDir || !opening.closeDir) return null;
  const height = Math.min(opening.height, cutHeight) / 1000;
  const length = (opening.span ?? Math.max(opening.rect[2] - opening.rect[0], opening.rect[3] - opening.rect[1])) / 1000;
  if (height <= 0 || length <= 0) return null;
  const direction = open ? opening.openDir : opening.closeDir;
  const angle = Math.atan2(direction[1], direction[0]);
  return (
    <group position={[hinge[0] / 1000, 0, -hinge[1] / 1000]} rotation={[0, angle, 0]}
      onClick={event => { event.stopPropagation(); onToggle(); }}>
      <mesh position={[length / 2, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[length, height, 0.04]} />
        <meshStandardMaterial color={opening.kind === 'entry' ? '#6b4f3a' : '#c7ab87'} roughness={0.58} />
      </mesh>
      <mesh position={[Math.max(0.02, length - 0.07), Math.min(1, height - 0.05), 0.035]} castShadow>
        <sphereGeometry args={[0.024, 12, 8]} />
        <meshStandardMaterial color="#b9b3a8" metalness={0.85} roughness={0.25} />
      </mesh>
    </group>
  );
}

function Architecture({ level, cutHeight, openDoors, onToggleDoor }: {
  level: Level;
  cutHeight: number;
  openDoors: Readonly<Record<string, boolean>>;
  onToggleDoor: (doorId: string) => void;
}) {
  const solids = useMemo(() => buildWallSolids(level, cutHeight), [level.walls, level.openings, cutHeight]);
  const openings = openingsForRenovatedLevel(level);
  return (
    <group>
      {solids.map((s, i) => <Solid key={i} rect={[s.x0, s.y0, s.x1, s.y1]} bottom={s.bottom} top={s.top} color={s.color} renovation={s.renovation} />)}
      {openings.map(o => o.kind === 'window' || o.kind === 'sliding'
        ? <WindowFrame key={o.id} opening={o} cutHeight={cutHeight} />
        : <DoorLeaf key={o.id} opening={o} cutHeight={cutHeight} open={openDoors[o.id] ?? true}
            onToggle={() => onToggleDoor(o.id)} />)}
    </group>
  );
}

function RoomFloor({ room, models, cutHeight, materials }: { room: Room; models: ModelFactory; cutHeight: number; materials: readonly Material[] }) {
  const select = useEditorStore(s => s.select);
  const selected = useEditorStore(s => s.selection?.kind === 'room' && s.selection.id === room.id);
  const geometry = useMemo(() => {
    const shape = new THREE.Shape(room.poly.map(([x, y]) => new THREE.Vector2(x / 1000, y / 1000)));
    const result = new THREE.ShapeGeometry(shape);
    result.rotateX(-Math.PI / 2);
    return result;
  }, [room.poly]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const definition = materialById(room.floorMaterialId, materials);
  const material = models.floorMat(room.floorMaterialId, definition, room.flooring) as THREE.MeshStandardMaterial;
  const bay = room.counted === false;
  const ceiling = useMemo(() => {
    const shape = new THREE.Shape([...room.poly].reverse().map(([x, y]) => new THREE.Vector2(x / 1000, -y / 1000)));
    const result = new THREE.ShapeGeometry(shape);
    result.rotateX(Math.PI / 2);
    return result;
  }, [room.poly]);
  useEffect(() => () => ceiling.dispose(), [ceiling]);
  return (
    <group>
      <mesh geometry={geometry} material={material} position={[0, bay ? 0.45 : 0.012, 0]} receiveShadow dispose={null}
        onClick={event => { event.stopPropagation(); select({ kind: 'room', id: room.id }); }} />
      {selected && <mesh geometry={geometry} position={[0, bay ? 0.452 : 0.014, 0]} dispose={null}>
        <meshBasicMaterial color="#b5653a" transparent opacity={0.15} depthWrite={false} />
      </mesh>}
      <mesh geometry={ceiling} position={[0, 2.8, 0]} visible={cutHeight >= 2800} dispose={null}>
        <meshStandardMaterial color="#fbfaf7" roughness={1} side={THREE.FrontSide} />
      </mesh>
    </group>
  );
}

function Furniture({ inst, models, asset }: { inst: ComponentInstance; models: ModelFactory; asset?: Asset }) {
  const select = useEditorStore(s => s.select);
  const selected = useEditorStore(s => s.selection?.kind === 'furn' && s.selection.id === inst.id);
  const ref = instanceRef(inst, asset);
  const geometry = useMemo(() => instanceGeometry(inst, asset), [asset?.geometry, inst.parameters]);
  const object = useMemo(() => {
    const model = models.buildFurniture({
      id: inst.id, type: ref.type, w: Math.max(10, ref.w), d: Math.max(10, ref.d), h: ref.h,
      shape: geometry?.shape, finish: geometry?.finish,
      parameters: geometry?.parameters,
      color: ref.color, cx: 6000, cy: 5300, rot: 0,
    }) as THREE.Group;
    // Source models place themselves relative to the static prototype's origin.
    model.position.set(0, 0, 0);
    return model;
  }, [models, inst.id, ref.type, ref.w, ref.d, ref.h, ref.color, geometry]);
  useEffect(() => () => disposeModelGeometry(object), [object]);
  return (
    <group position={[inst.t.x / 1000, 0.015, -inst.t.y / 1000]} rotation={[0, inst.t.rot * Math.PI / 180, 0]}
      onClick={event => { event.stopPropagation(); select({ kind: 'furn', id: inst.id }); }}>
      {/* The reference models use +plan-y for z; mirror their local coordinates. */}
      <primitive object={object} scale={[1, 1, -1]} dispose={null} />
      {selected && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <planeGeometry args={[ref.w / 1000 + 0.08, ref.d / 1000 + 0.08]} />
        <meshBasicMaterial color="#b5653a" transparent opacity={0.3} depthWrite={false} />
      </mesh>}
    </group>
  );
}

function RoomLabels({ level }: { level: Level }) {
  return <group>{level.rooms.filter(r => r.labelAt).map(r => (
    <Html key={r.id} position={[r.labelAt![0] / 1000, 0.08, -r.labelAt![1] / 1000]} center
      style={{ pointerEvents: 'none' }} zIndexRange={[10, 0]}>
      <div className="whitespace-nowrap rounded-full border border-white/80 bg-white/80 px-2 py-0.5 text-[10px] text-stone-600 shadow-sm backdrop-blur-sm">{r.name}</div>
    </Html>
  ))}</group>;
}

function fitView(camera: THREE.Camera, controls: unknown, level: Level, kind: 'iso' | 'top', aspect: number) {
  const bb = docBBox(level);
  const cx = (bb.x0 + bb.x1) / 2000, cz = -(bb.y0 + bb.y1) / 2000;
  const width = (bb.x1 - bb.x0) / 1000, depth = (bb.y1 - bb.y0) / 1000;
  const target = new THREE.Vector3(cx, 0.2, cz);
  const direction = kind === 'top' ? new THREE.Vector3(0, 1, 0.0001) : new THREE.Vector3(0.32, 0.9, -0.58).normalize();
  const perspective = camera as THREE.PerspectiveCamera;
  const tangent = Math.tan(THREE.MathUtils.degToRad(perspective.fov || 45) / 2);
  const right = new THREE.Vector3().crossVectors(direction, camera.up).normalize();
  const up = new THREE.Vector3().crossVectors(right, direction).normalize();
  let distance = 4;
  // Fit every building corner against both frustum dimensions, including height.
  for (const x of [-width / 2, width / 2]) for (const z of [-depth / 2, depth / 2]) for (const y of [0, 2.8]) {
    const point = new THREE.Vector3(x, y, z);
    distance = Math.max(distance, point.dot(direction) + Math.max(Math.abs(point.dot(up)) / tangent, Math.abs(point.dot(right)) / (tangent * Math.max(aspect, 0.2))) * 1.12);
  }
  camera.position.copy(target).addScaledVector(direction, distance);
  camera.lookAt(target);
  const orbit = controls as { target: THREE.Vector3; update: () => void } | null;
  if (orbit) { orbit.target.copy(target); orbit.update(); }
}

function Rig({ level }: { level: Level }) {
  const { camera, controls, size } = useThree();
  const preset = useEditorStore(s => s.preset3d);
  const initial = useRef(false);
  const userMoved = useRef(false);
  const aspectRef = useRef(0);
  useEffect(() => {
    const orbit = controls as { addEventListener?: (event: string, fn: () => void) => void; removeEventListener?: (event: string, fn: () => void) => void } | null;
    const markMoved = () => { userMoved.current = true; };
    orbit?.addEventListener?.('start', markMoved);
    return () => orbit?.removeEventListener?.('start', markMoved);
  }, [controls]);
  useEffect(() => {
    if (!controls || size.width < 100 || size.height < 100) return;
    const aspect = size.width / size.height;
    if (!initial.current) {
      initial.current = true;
      fitView(camera, controls, level, 'iso', aspect);
    } else if (!userMoved.current && Math.abs(aspect / aspectRef.current - 1) > 0.15) {
      fitView(camera, controls, level, preset.kind, aspect);
    }
    aspectRef.current = aspect;
  }, [camera, controls, level, size.width, size.height, preset.kind]);
  useEffect(() => {
    if (preset.n && controls) fitView(camera, controls, level, preset.kind, size.width / size.height);
  // Only explicit view commands reset an orbit, never a furniture edit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, controls]);
  return null;
}

function NorthBearing({ arrowRef }: { arrowRef: RefObject<SVGGElement> }) {
  const { camera } = useThree();
  const north = useMemo(() => new THREE.Vector3(0, 0, 1), []);
  const northInCameraSpace = useMemo(() => new THREE.Vector3(), []);
  const inverseCameraRotation = useMemo(() => new THREE.Quaternion(), []);
  useFrame(() => {
    const arrow = arrowRef.current;
    if (!arrow) return;
    northInCameraSpace.copy(north).applyQuaternion(inverseCameraRotation.copy(camera.quaternion).invert());
    const angle = Math.atan2(northInCameraSpace.x, -northInCameraSpace.y) * 180 / Math.PI;
    arrow.setAttribute('transform', `rotate(${angle} 20 20)`);
    arrow.setAttribute('opacity', Math.hypot(northInCameraSpace.x, northInCameraSpace.y) < 0.08 ? '0.35' : '1');
  });
  return null;
}

function Lighting({ level, hour }: { level: Level; hour: number }) {
  const { gl } = useThree();
  const sun = useRef<THREE.DirectionalLight>(null);
  const bb = docBBox(level);
  const center = useMemo(() => new THREE.Vector3((bb.x0 + bb.x1) / 2000, 0, -(bb.y0 + bb.y1) / 2000), [bb.x0, bb.x1, bb.y0, bb.y1]);
  const target = useMemo(() => new THREE.Object3D(), []);
  useLayoutEffect(() => { target.position.copy(center); target.updateMatrixWorld(); if (sun.current) sun.current.target = target; }, [target, center]);
  const t = (hour - 6) / 12, azimuth = Math.PI * (0.15 + t * 0.7), elevation = Math.sin(Math.PI * t) * 1.05 + 0.15;
  const warm = 1 - Math.sin(Math.PI * t);
  const sunColor = useMemo(() => new THREE.Color().setHSL(0.09, 0.5 + warm * 0.4, 0.92 - warm * 0.12), [warm]);
  const shadowSize = Math.min(4096, gl.capabilities.maxTextureSize);
  const radius = Math.max(11, (bb.x1 - bb.x0) / 2000 + 2, (bb.y1 - bb.y0) / 2000 + 2);
  return <>
    <primitive object={target} />
    <hemisphereLight args={['#fff8ee', '#938b7f', 0.55]} />
    <directionalLight ref={sun} color={sunColor} intensity={0.65 + Math.sin(Math.PI * t) * 0.95}
      position={[center.x + Math.cos(azimuth) * 18, Math.sin(elevation) * 20 + 3, center.z - Math.sin(azimuth) * 10 + 8]}
      castShadow shadow-mapSize={[shadowSize, shadowSize]} shadow-camera-left={-radius} shadow-camera-right={radius}
      shadow-camera-top={radius} shadow-camera-bottom={-radius} shadow-camera-near={0.1} shadow-camera-far={80}
      shadow-bias={-0.0004} shadow-normalBias={0.02} />
  </>;
}

function DetailedScene({ level, assets, materials, cutHeight, showRoomNames, showFurniture, hour, showGrid, arrowRef,
  walkMode, openDoors, spawnVersion, onWalkLockChange, onToggleDoor,
  walkStarted, onWalkStart, onWalkPause,
}: {
  level: Level;
  assets?: readonly Asset[];
  materials: readonly Material[];
  cutHeight: number;
  showRoomNames: boolean;
  showFurniture: boolean;
  hour: number;
  showGrid: boolean;
  arrowRef: RefObject<SVGGElement>;
  walkMode: boolean;
  openDoors: Readonly<Record<string, boolean>>;
  spawnVersion: number;
  walkStarted: boolean;
  onWalkStart: () => void;
  onWalkPause: () => void;
  onWalkLockChange: (locked: boolean) => void;
  onToggleDoor: (doorId: string) => void;
}) {
  const { gl, scene } = useThree();
  const [models, setModels] = useState<ModelFactory | null>(null);
  useEffect(() => {
    let disposed = false;
    const models: { current: ModelFactory | null } = { current: null };
    const env: { current: THREE.WebGLRenderTarget | null } = { current: null };
    const apply = (texture: THREE.Texture) => {
      if (disposed) return;
      scene.environment = texture;
      scene.environmentIntensity = 0.35;
      models.current?.dispose();
      models.current = createModelFactory(texture, Math.min(8, gl.capabilities.getMaxAnisotropy()));
      setModels(models.current);
    };
    // RoomEnvironment 先行保证首帧有环境光，Poly Haven HDRI（CC0）加载完成后整场替换
    const generator = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const fallback = generator.fromScene(room, 0.04);
    generator.dispose(); room.dispose();
    env.current = fallback;
    apply(fallback.texture);
    new RGBELoader().load('/textures/env/studio_small_03_1k.hdr', hdr => {
      const gen = new THREE.PMREMGenerator(gl);
      const rt = gen.fromEquirectangular(hdr);
      gen.dispose(); hdr.dispose();
      if (disposed) { rt.dispose(); return; }
      fallback.dispose();
      env.current = rt;
      apply(rt.texture);
    });
    return () => {
      disposed = true;
      scene.environment = null;
      models.current?.dispose();
      env.current?.dispose();
    };
  }, [gl, scene]);
  const bb = docBBox(level);
  return <>
    <color attach="background" args={['#f7f4ee']} />
    <Lighting level={level} hour={hour} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(bb.x0 + bb.x1) / 2000, -0.025, -(bb.y0 + bb.y1) / 2000]} receiveShadow>
      <planeGeometry args={[160, 160]} />
      <meshStandardMaterial color="#e4e0d7" roughness={1} />
    </mesh>
    {showGrid && (() => {
      const span = Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0) / 1000;
      const gridSize = Math.max(10, Math.ceil(span / 2) * 2);
      return <gridHelper args={[gridSize, gridSize * 2, '#bdb7ad', '#dedad2']}
        position={[(bb.x0 + bb.x1) / 2000, 0.002, -(bb.y0 + bb.y1) / 2000]} />;
    })()}
    {models && <>
      {level.rooms.map(room => <RoomFloor key={room.id} room={room} models={models} cutHeight={cutHeight} materials={materials} />)}
      {showFurniture && level.instances.map(inst => <Furniture key={inst.id} inst={inst} models={models} asset={assetById(inst.assetId, assets)} />)}
    </>}
    <Architecture level={level} cutHeight={cutHeight} openDoors={openDoors} onToggleDoor={onToggleDoor} />
    {showRoomNames && <RoomLabels level={level} />}
    {walkMode
      ? <WalkModeControls level={level} assets={assets ?? []} openDoors={openDoors} spawnVersion={spawnVersion}
          active={walkStarted} onStart={onWalkStart} onPause={onWalkPause}
          onLockChange={onWalkLockChange} onToggleDoor={onToggleDoor} />
      : <OrbitControls makeDefault enableDamping dampingFactor={0.08} maxPolarAngle={Math.PI * 0.495} minDistance={1.2} maxDistance={120} />}
    <NorthBearing arrowRef={arrowRef} />
    <Rig level={level} />
  </>;
}

export default function Scene3D() {
  const doc = useSceneStore(s => s.previewDoc ?? s.doc);
  const assets = useMemo(() => doc ? documentAssets(doc) : [], [doc?.assets, doc?.assetSnapshots]);
  const materials = useMemo(() => doc ? documentMaterials(doc) : [], [doc?.materialSnapshots]);
  const select = useEditorStore(s => s.select);
  const setPreset3d = useEditorStore(s => s.setPreset3d);
  const showGrid = useEditorStore(s => s.showGrid);
  const showOrientation = useEditorStore(s => s.showOrientation);
  const showRoomNames = useEditorStore(s => s.showRoomNames);
  const showFurniture = useEditorStore(s => s.showFurniture);
  const toggleGrid = useEditorStore(s => s.toggleGrid);
  const toggleOrientation = useEditorStore(s => s.toggleOrientation);
  const northArrowRef = useRef<SVGGElement>(null);
  const [cutHeight, setCutHeight] = useState(2800);
  const [hour, setHour] = useState(10);
  const [walkMode, setWalkMode] = useState(false);
  const [walkStarted, setWalkStarted] = useState(false);
  const [walkLocked, setWalkLocked] = useState(false);
  const [walkSpawnVersion, setWalkSpawnVersion] = useState(0);
  const [openDoors, setOpenDoors] = useState<Record<string, boolean>>({});
  const level = doc?.levels[0];
  const walkSpawn = useMemo(() => level ? findWalkSpawn(level, assets, openDoors) : null, [level, assets, openDoors]);
  const startWalk = useCallback(() => setWalkStarted(true), []);
  const pauseWalk = useCallback(() => {
    setWalkStarted(false);
    setWalkLocked(false);
  }, []);
  const toggleDoor = useCallback((doorId: string) => {
    setOpenDoors(state => ({ ...state, [doorId]: !(state[doorId] ?? true) }));
  }, []);
  const toggleWalkMode = useCallback(() => {
    if (walkMode) {
      setWalkMode(false);
      setWalkStarted(false);
      setWalkLocked(false);
      return;
    }
    setWalkSpawnVersion(version => version + 1);
    setWalkMode(true);
  }, [walkMode]);
  if (!level) return <div className="flex h-full items-center justify-center text-sm text-zinc-400">文档加载中…</div>;
  const button = 'rounded-md px-2.5 py-1.5 text-xs hover:bg-stone-100';
  return (
    <div data-editor-export="scene3d" className="relative h-full w-full bg-[#f7f4ee]">
      <Canvas shadows={{ type: THREE.PCFSoftShadowMap }} dpr={[1, 2]}
        gl={{ antialias: true, preserveDrawingBuffer: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.82 }}
        camera={{ fov: 45, near: 0.05, far: 300, position: [14, 18, 8] }}
        onPointerMissed={() => select(null)} className="touch-none">
        <DetailedScene assets={assets} materials={materials} level={level} cutHeight={cutHeight} showRoomNames={showRoomNames} showFurniture={showFurniture}
          hour={hour} showGrid={showGrid} arrowRef={northArrowRef} walkMode={walkMode} openDoors={openDoors}
          spawnVersion={walkSpawnVersion} walkStarted={walkStarted} onWalkStart={startWalk} onWalkPause={pauseWalk}
          onWalkLockChange={setWalkLocked} onToggleDoor={toggleDoor} />
      </Canvas>
      {walkStarted && <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2">
        <span className="absolute left-1/2 top-0 h-4 w-px -translate-x-1/2 bg-white shadow-[0_0_2px_1px_rgba(0,0,0,0.75)]" />
        <span className="absolute left-0 top-1/2 h-px w-4 -translate-y-1/2 bg-white shadow-[0_0_2px_1px_rgba(0,0,0,0.75)]" />
        <span className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-stone-900/50" />
      </div>}
      <div className="absolute right-3 top-3 flex max-w-[calc(100%-24px)] flex-wrap items-center gap-1 rounded-xl border border-stone-200 bg-white/95 p-1 shadow-sm backdrop-blur-sm">
        {showOrientation && <OrientationCompass arrowRef={northArrowRef} />}
        <button className={button} onClick={() => setPreset3d('iso')}>鸟瞰</button>
        <button className={button} onClick={() => setPreset3d('top')}>俯视</button>
        <button type="button" aria-pressed={walkMode} className={button + (walkMode ? ' bg-stone-800 text-white hover:bg-stone-700' : '')}
          onClick={toggleWalkMode}>{walkMode ? '退出漫游' : '漫游'}</button>
        <span className="mx-1 h-4 w-px bg-stone-200" />
        <button type="button" aria-pressed={showGrid} className={button + (showGrid ? ' bg-stone-800 text-white hover:bg-stone-700' : '')} onClick={toggleGrid}>方格</button>
        <button type="button" aria-pressed={showOrientation} className={button + (showOrientation ? ' bg-stone-800 text-white hover:bg-stone-700' : '')} onClick={toggleOrientation}>北向</button>
        <button type="button" aria-pressed={showRoomNames} className={button + (showRoomNames ? ' bg-stone-800 text-white hover:bg-stone-700' : '')} onClick={() => useEditorStore.getState().toggleRoomNames()}>房间名</button>
        <button type="button" aria-pressed={showFurniture} className={button + (showFurniture ? ' bg-stone-800 text-white hover:bg-stone-700' : '')} onClick={() => useEditorStore.getState().toggleFurniture()}>家具</button>
        <span className="mx-1 h-4 w-px bg-stone-200" />
        {[[2800, '全高'], [1200, '半墙'], [300, '低墙']].map(([height, title]) => (
          <button key={height} className={button + (cutHeight === height ? ' bg-stone-800 text-white hover:bg-stone-700' : '')}
            onClick={() => setCutHeight(Number(height))}>{title}</button>
        ))}
        <label className="mx-2 flex items-center gap-2 text-[11px] text-stone-500">日照
          <input aria-label="日照时间" type="range" min="7" max="18" step="0.25" value={hour}
            onChange={event => setHour(Number(event.target.value))} className="w-20 accent-stone-600" />
          <span className="w-9 tabular-nums">{String(Math.floor(hour)).padStart(2, '0')}:{String(Math.round(hour % 1 * 60)).padStart(2, '0')}</span>
        </label>
      </div>
      <p className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-white/75 px-2 py-1 text-[11px] text-stone-500">
        {walkStarted
          ? `WASD 移动 · ${walkLocked ? '鼠标转向' : '按住鼠标拖动转向'} · Shift 快走 · E 开关附近房门 · Esc 暂停`
          : '拖动旋转 · 滚轮缩放 · 点击家具或房间选中 · 点击门开关'}
      </p>
      {walkMode && !walkStarted && <div className="absolute inset-0 z-10 flex items-center justify-center bg-stone-950/35 p-4">
        <div className="w-full max-w-sm rounded-lg border border-stone-200 bg-white px-6 py-5 text-center shadow-xl">
          <h2 className="text-sm font-semibold text-stone-800">漫游模式</h2>
          <p className="mt-2 text-xs leading-6 text-stone-600">
            {walkSpawn ? '点击开始，从入户区域进入户型。' : '当前户型没有可进入的房间，请先绘制房间区域。'}
          </p>
          <p className="text-xs leading-6 text-stone-600">W A S D 移动 · 鼠标转向 · Shift 快走</p>
          <p className="text-xs leading-6 text-stone-600">E 开关附近房门 · Esc 暂停</p>
          <div className="mt-4 flex justify-center gap-2">
            <button type="button" disabled={!walkSpawn}
              className="zaoking-walk-start rounded-md bg-stone-800 px-4 py-2 text-xs font-medium text-white hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-45">
              开始漫游
            </button>
            <button type="button" className="rounded-md border border-stone-300 px-4 py-2 text-xs text-stone-700 hover:bg-stone-50"
              onClick={toggleWalkMode}>退出</button>
          </div>
        </div>
      </div>}
      {walkMode && walkStarted && <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-stone-900/75 px-3 py-1 text-[11px] text-white">
        {walkLocked ? '漫游中 · 按 Esc 暂停' : '漫游中 · 按住鼠标拖动转向 · Esc 暂停'}
      </div>}
    </div>
  );
}
