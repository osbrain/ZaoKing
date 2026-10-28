'use client';

import { useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { createModelFactory, disposeModelGeometry } from '@/features/canvas3d/modelFactory';
import type { CustomAsset } from '@/core/types';

export default function ComponentPreview({ asset }: { asset: CustomAsset }) {
  const factory = useMemo(() => createModelFactory(null), []);
  const object = useMemo(() => factory.buildFurniture({
    id: asset.id, type: asset.type, w: asset.w, d: asset.d, h: asset.h, color: asset.color,
    cx: 0, cy: 0, rot: 0, ...asset.geometry,
  }) as THREE.Group, [factory, asset]);
  const fit = 1.65 / (Math.max(asset.w, asset.d, asset.h) / 1000);
  useEffect(() => () => disposeModelGeometry(object), [object]);
  useEffect(() => () => factory.dispose(), [factory]);

  return <div className="h-36 overflow-hidden rounded-md bg-[#eef1ef]" aria-label="可旋转的 3D 组件预览">
    <Canvas dpr={[1, 1.5]} camera={{ position: [2.5, 2.1, 2.8], fov: 38, near: .01, far: 30 }}>
      <color attach="background" args={['#eef1ef']} />
      <ambientLight intensity={1.6} />
      <directionalLight position={[3, 5, 4]} intensity={2.5} />
      <group scale={fit}>
        <primitive object={object} scale={[1, 1, -1]} dispose={null} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.002 / fit, 0]}>
          <planeGeometry args={[Math.max(asset.w, asset.d) / 1000 * 1.7, Math.max(asset.w, asset.d) / 1000 * 1.7]} />
          <meshStandardMaterial color="#dfe5e1" roughness={1} />
        </mesh>
      </group>
      <OrbitControls makeDefault enablePan={false} enableDamping dampingFactor={.12} target={[0, fit * asset.h / 2000, 0]} minDistance={1.1} maxDistance={5} />
    </Canvas>
  </div>;
}
