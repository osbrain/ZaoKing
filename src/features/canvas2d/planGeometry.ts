import type { WallPreset } from '@/stores/editorStore';
import { docBBox } from '@/core/geometry';
import { dimensionLayout } from '@/core/symbols2d';
import type { Level, Opening, Vec2, Wall } from '@/core/types';

export const GRID = 100;
export const SNAP_R = 260;
export const MIN_WALL = 300;

export const WALL_PRESETS: Record<WallPreset, { label: string; kind: Wall['kind']; thickness: number; height: number }> = {
  exterior: { label: '外墙 240', kind: 'exterior', thickness: 240, height: 2800 },
  partition: { label: '内墙 200', kind: 'partition', thickness: 200, height: 2800 },
  low: { label: '矮墙 240', kind: 'low', thickness: 240, height: 1100 },
};

const OPENING_PRESETS = {
  door: { width: 900, height: 2100, sill: 0 },
  window: { width: 1500, height: 1500, sill: 900 },
} as const;

export type Rect = [number, number, number, number];

export interface DragState { id: string; x: number; y: number; rot: number; invalid?: boolean }
export interface WallEdit { id: string; dx?: number; dy?: number; rect?: Rect }

export const centerInRect = (r: Rect, wall: { x0: number; y0: number; x1: number; y1: number }) => {
  const cx = (r[0] + r[2]) / 2;
  const cy = (r[1] + r[3]) / 2;
  return cx >= wall.x0 && cx <= wall.x1 && cy >= wall.y0 && cy <= wall.y1;
};

export function snapPoint(level: Level, point: Vec2): Vec2 {
  let best: Vec2 | null = null;
  let bestDistance = SNAP_R;
  for (const wall of level.walls) {
    for (const corner of [[wall.x0, wall.y0], [wall.x1, wall.y0], [wall.x0, wall.y1], [wall.x1, wall.y1]] as Vec2[]) {
      const distance = Math.hypot(corner[0] - point[0], corner[1] - point[1]);
      if (distance < bestDistance) { bestDistance = distance; best = corner; }
    }
  }
  if (best) return best;
  return [Math.round(point[0] / GRID) * GRID, Math.round(point[1] / GRID) * GRID];
}

export function axisLock(start: Vec2, end: Vec2): Vec2 {
  return Math.abs(end[0] - start[0]) >= Math.abs(end[1] - start[1]) ? [end[0], start[1]] : [start[0], end[1]];
}

export function wallRectFromSegment(start: Vec2, end: Vec2, thickness: number): { x0: number; y0: number; x1: number; y1: number } {
  const horizontal = Math.abs(end[0] - start[0]) >= Math.abs(end[1] - start[1]);
  if (horizontal) {
    const x0 = Math.min(start[0], end[0]);
    const x1 = Math.max(start[0], end[0]);
    const cy = (start[1] + end[1]) / 2;
    return { x0, y0: Math.round(cy - thickness / 2), x1, y1: Math.round(cy + thickness / 2) };
  }
  const y0 = Math.min(start[1], end[1]);
  const y1 = Math.max(start[1], end[1]);
  const cx = (start[0] + end[0]) / 2;
  return { x0: Math.round(cx - thickness / 2), y0, x1: Math.round(cx + thickness / 2), y1 };
}

export function normRect(start: Vec2, end: Vec2): { x0: number; y0: number; x1: number; y1: number } {
  return { x0: Math.min(start[0], end[0]), y0: Math.min(start[1], end[1]), x1: Math.max(start[0], end[0]), y1: Math.max(start[1], end[1]) };
}

export function planViewBounds(level: Level) {
  const bounds = docBBox(level);
  const padding = dimensionLayout(level)?.padding ?? 0;
  return {
    x0: bounds.x0 - padding,
    y0: bounds.y0 - padding,
    x1: bounds.x1 + padding,
    y1: bounds.y1 + padding,
  };
}

export function openingOnWall(wall: Wall, point: Vec2, kind: 'door' | 'window'): Opening | null {
  const horizontal = wall.x1 - wall.x0 >= wall.y1 - wall.y0;
  const preset = OPENING_PRESETS[kind];
  if (horizontal) {
    const span = wall.x1 - wall.x0;
    if (span < preset.width + 200) return null;
    const cx = Math.min(Math.max(point[0], wall.x0 + preset.width / 2 + 100), wall.x1 - preset.width / 2 - 100);
    const rect: Rect = [Math.round(cx - preset.width / 2), wall.y0, Math.round(cx + preset.width / 2), wall.y1];
    const opening: Opening = { id: '', kind, rect, height: preset.height, sill: preset.sill };
    if (kind === 'door') {
      opening.hinge = [rect[0], rect[1]];
      opening.closeDir = [0, 1];
      opening.openDir = [-1, 0];
      opening.span = preset.width;
    }
    return opening;
  }
  const span = wall.y1 - wall.y0;
  if (span < preset.width + 200) return null;
  const cy = Math.min(Math.max(point[1], wall.y0 + preset.width / 2 + 100), wall.y1 - preset.width / 2 - 100);
  const rect: Rect = [wall.x0, Math.round(cy - preset.width / 2), wall.x1, Math.round(cy + preset.width / 2)];
  const opening: Opening = { id: '', kind, rect, height: preset.height, sill: preset.sill };
  if (kind === 'door') {
    opening.hinge = [rect[0], rect[1]];
    opening.closeDir = [1, 0];
    opening.openDir = [0, -1];
    opening.span = preset.width;
  }
  return opening;
}
