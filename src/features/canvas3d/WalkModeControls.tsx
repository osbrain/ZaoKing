'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Asset, Level } from '@/core/types';
import { canWalkTo, findWalkSpawn, nearestWalkDoor } from './walkNavigation';

interface WalkModeControlsProps {
  level: Level;
  assets: readonly Asset[];
  openDoors: Readonly<Record<string, boolean>>;
  spawnVersion: number;
  active: boolean;
  onStart: () => void;
  onPause: () => void;
  onLockChange: (locked: boolean) => void;
  onToggleDoor: (doorId: string) => void;
}

const EYE_HEIGHT_M = 1.62;
const WALK_SPEED_MPS = 2.8;
const RUN_SPEED_MPS = 5.2;
const MAX_SUBSTEP_M = 0.12;
const WALK_KEY_CODES = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'ShiftLeft', 'ShiftRight', 'KeyE', 'Escape',
]);

export default function WalkModeControls({
  level,
  assets,
  openDoors,
  spawnVersion,
  active,
  onStart,
  onPause,
  onLockChange,
  onToggleDoor,
}: WalkModeControlsProps) {
  const { camera } = useThree();
  const keys = useRef(new Set<string>());
  const dragging = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const activeRef = useRef(active);
  const toggleDoorRef = useRef(onToggleDoor);
  const pauseRef = useRef(onPause);
  const spawn = useMemo(() => findWalkSpawn(level, assets, openDoors), [
    level, assets, openDoors,
  ]);
  const direction = useMemo(() => new THREE.Vector3(), []);
  const right = useMemo(() => new THREE.Vector3(), []);
  const movement = useMemo(() => new THREE.Vector3(), []);
  const next = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => { toggleDoorRef.current = onToggleDoor; }, [onToggleDoor]);
  useEffect(() => { pauseRef.current = onPause; }, [onPause]);
  useEffect(() => { activeRef.current = active; }, [active]);

  useLayoutEffect(() => {
    if (!spawn) return;
    camera.position.set(spawn.point[0] / 1000, EYE_HEIGHT_M, -spawn.point[1] / 1000);
    camera.rotation.order = 'YXZ';
    camera.lookAt(
      (spawn.point[0] + spawn.facing[0]) / 1000,
      EYE_HEIGHT_M,
      -(spawn.point[1] + spawn.facing[1]) / 1000,
    );
  }, [camera, spawn, spawnVersion]);

  const { gl } = useThree();
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!activeRef.current) return;
    if (!WALK_KEY_CODES.has(event.code)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.code === 'Escape') {
      if (document.pointerLockElement === gl.domElement) document.exitPointerLock();
      else pauseRef.current();
      return;
    }
    if (event.code !== 'KeyE') {
      keys.current.add(event.code);
    }
    if (event.code === 'KeyE' && !event.repeat) {
      const door = nearestWalkDoor(level, [camera.position.x * 1000, -camera.position.z * 1000]);
      if (door) toggleDoorRef.current(door.id);
    }
  }, [camera, gl, level]);
  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    keys.current.delete(event.code);
  }, []);

  useEffect(() => {
    const clearKeys = () => keys.current.clear();
    let wasLocked = false;
    const handleLockChange = () => {
      const locked = document.pointerLockElement === gl.domElement;
      onLockChange(locked);
      if (wasLocked && !locked && activeRef.current) pauseRef.current();
      wasLocked = locked;
      clearKeys();
    };
    const startWalk = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest('.zaoking-walk-start')) return;
      if (!spawn) return;
      onStart();
      try {
        const request = gl.domElement.requestPointerLock();
        if (request instanceof Promise) void request.catch(() => onLockChange(false));
      } catch {
        onLockChange(false);
      }
    };
    document.addEventListener('click', startWalk, true);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', clearKeys);
    document.addEventListener('pointerlockchange', handleLockChange);
    return () => {
      document.removeEventListener('click', startWalk, true);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', clearKeys);
      document.removeEventListener('pointerlockchange', handleLockChange);
      if (document.pointerLockElement === gl.domElement) document.exitPointerLock();
    };
  }, [gl, handleKeyDown, handleKeyUp, onLockChange, onStart, spawn]);

  const handlePointerDown = useCallback((event: PointerEvent) => {
    if (!activeRef.current || document.pointerLockElement || event.button !== 0) return;
    dragging.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    (event.currentTarget as HTMLCanvasElement).setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopImmediatePropagation();
  }, []);
  const rotateCamera = useCallback((dx: number, dy: number) => {
    camera.rotation.order = 'YXZ';
    camera.rotation.y -= dx * 0.0025;
    camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - dy * 0.0025, -Math.PI / 2 + 0.12, Math.PI / 2 - 0.12);
  }, [camera]);
  const handlePointerMove = useCallback((event: PointerEvent) => {
    const current = dragging.current;
    if (!activeRef.current || document.pointerLockElement || !current || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    current.x = event.clientX;
    current.y = event.clientY;
    rotateCamera(dx, dy);
    event.preventDefault();
    event.stopImmediatePropagation();
  }, [rotateCamera]);
  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (!activeRef.current || document.pointerLockElement !== gl.domElement) return;
    rotateCamera(event.movementX, event.movementY);
  }, [gl, rotateCamera]);
  const handlePointerUp = useCallback((event: PointerEvent) => {
    if (dragging.current?.pointerId !== event.pointerId) return;
    dragging.current = null;
    event.stopImmediatePropagation();
  }, []);

  useEffect(() => {
    const canvas = gl.domElement;
    canvas.addEventListener('pointerdown', handlePointerDown, true);
    canvas.addEventListener('pointermove', handlePointerMove, true);
    canvas.addEventListener('pointerup', handlePointerUp, true);
    canvas.addEventListener('pointercancel', handlePointerUp, true);
    document.addEventListener('mousemove', handleMouseMove);
    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown, true);
      canvas.removeEventListener('pointermove', handlePointerMove, true);
      canvas.removeEventListener('pointerup', handlePointerUp, true);
      canvas.removeEventListener('pointercancel', handlePointerUp, true);
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, [gl, handleMouseMove, handlePointerDown, handlePointerMove, handlePointerUp]);

  useFrame((_, frameDelta) => {
    if (!activeRef.current) return;
    const pressed = keys.current;
    const forward = pressed.has('KeyW') || pressed.has('ArrowUp') ? 1 : 0;
    const backward = pressed.has('KeyS') || pressed.has('ArrowDown') ? 1 : 0;
    const left = pressed.has('KeyA') || pressed.has('ArrowLeft') ? 1 : 0;
    const rightward = pressed.has('KeyD') || pressed.has('ArrowRight') ? 1 : 0;
    if (!(forward || backward || left || rightward)) return;

    camera.getWorldDirection(direction).setY(0).normalize();
    right.crossVectors(direction, camera.up).normalize();
    movement.set(0, 0, 0)
      .addScaledVector(direction, forward - backward)
      .addScaledVector(right, rightward - left);
    if (movement.lengthSq() === 0) return;
    movement.normalize().multiplyScalar(
      (pressed.has('ShiftLeft') || pressed.has('ShiftRight') ? RUN_SPEED_MPS : WALK_SPEED_MPS)
      * Math.min(frameDelta, 0.05),
    );

    const steps = Math.max(1, Math.ceil(movement.length() / MAX_SUBSTEP_M));
    const stepX = movement.x / steps;
    const stepZ = movement.z / steps;
    for (let step = 0; step < steps; step++) {
      next.copy(camera.position);
      next.x += stepX;
      if (canWalkTo(level, [next.x * 1000, -next.z * 1000], assets, openDoors)) camera.position.x = next.x;

      next.copy(camera.position);
      next.z += stepZ;
      if (canWalkTo(level, [next.x * 1000, -next.z * 1000], assets, openDoors)) camera.position.z = next.z;
    }
    camera.position.y = EYE_HEIGHT_M;
  });

  return null;
}
