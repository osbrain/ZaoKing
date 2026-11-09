import type { Level, WallRenovationStatus } from './types';
import { openingsForRenovatedLevel, wallsForOpening } from './renovation';

/** Axis-aligned solids in plan coordinates (mm), with vertical bounds. */
export interface WallSolid {
  x0: number; y0: number; x1: number; y1: number; bottom: number; top: number; color?: string; renovation?: WallRenovationStatus;
}

function subtract(a: WallSolid, b: WallSolid): WallSolid[] {
  const x0 = Math.max(a.x0, b.x0), x1 = Math.min(a.x1, b.x1);
  const y0 = Math.max(a.y0, b.y0), y1 = Math.min(a.y1, b.y1);
  const bottom = Math.max(a.bottom, b.bottom), top = Math.min(a.top, b.top);
  if (x1 <= x0 || y1 <= y0 || top <= bottom) return [a];
  return [
    { ...a, x1: x0 }, { ...a, x0: x1 },
    { ...a, x0, x1, y1: y0 }, { ...a, x0, x1, y0: y1 },
    { ...a, x0, y0, x1, y1, bottom: a.bottom, top: bottom },
    { ...a, x0, y0, x1, y1, bottom: top, top: a.top },
  ].filter(s => s.x1 > s.x0 && s.y1 > s.y0 && s.top > s.bottom);
}

/** Works for both intact drawn walls and the prototype's already split walls. */
export function buildWallSolids(level: Level, cutHeight = Infinity): WallSolid[] {
  const activeOpenings = openingsForRenovatedLevel(level);
  const cuts = activeOpenings.map(o => ({
    x0: o.rect[0], y0: o.rect[1], x1: o.rect[2], y1: o.rect[3],
    bottom: Math.max(0, o.sill), top: Math.max(0, o.sill) + Math.max(0, o.height),
  }));
  const walls = level.walls.map(w => ({ ...w, bottom: 0, top: w.height }));
  // Seed openings occupy gaps between wall segments. Fill only their missing
  // wall volume; never duplicate a drawn wall or extend a low wall to 2800 mm.
  const infills = activeOpenings.flatMap(o => {
    const [x0, y0, x1, y1] = o.rect;
    const adjacent = wallsForOpening(o, level).filter(w => w.renovation !== 'demolished');
    const top = adjacent.length ? Math.max(...adjacent.map(w => w.height)) : 2800;
    const status = adjacent.find((wall) => wall.renovation)?.renovation;
    const color = adjacent.find((wall) => wall.color)?.color;
    return walls.reduce((parts, wall) => parts.flatMap(p => subtract(p, wall)),
      [{ x0, y0, x1, y1, bottom: 0, top, color, renovation: status }] as WallSolid[]);
  });
  return [...walls, ...infills].flatMap(wall =>
    cuts.reduce((parts, cut) => parts.flatMap(p => subtract(p, cut)), [wall] as WallSolid[])
  ).map(s => ({ ...s, top: Math.min(s.top, cutHeight) }))
    .filter(s => s.top > s.bottom && s.x1 > s.x0 && s.y1 > s.y0);
}
