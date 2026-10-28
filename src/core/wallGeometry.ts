import type { Level } from './types';

/** Axis-aligned solids in plan coordinates (mm), with vertical bounds. */
export interface WallSolid {
  x0: number; y0: number; x1: number; y1: number; bottom: number; top: number;
}

function subtract(a: WallSolid, b: WallSolid): WallSolid[] {
  const x0 = Math.max(a.x0, b.x0), x1 = Math.min(a.x1, b.x1);
  const y0 = Math.max(a.y0, b.y0), y1 = Math.min(a.y1, b.y1);
  const bottom = Math.max(a.bottom, b.bottom), top = Math.min(a.top, b.top);
  if (x1 <= x0 || y1 <= y0 || top <= bottom) return [a];
  return [
    { ...a, x1: x0 }, { ...a, x0: x1 },
    { ...a, x0, x1, y1: y0 }, { ...a, x0, x1, y0: y1 },
    { x0, y0, x1, y1, bottom: a.bottom, top: bottom },
    { x0, y0, x1, y1, bottom: top, top: a.top },
  ].filter(s => s.x1 > s.x0 && s.y1 > s.y0 && s.top > s.bottom);
}

/** Works for both intact drawn walls and the prototype's already split walls. */
export function buildWallSolids(level: Level, cutHeight = Infinity): WallSolid[] {
  const cuts = level.openings.map(o => ({
    x0: o.rect[0], y0: o.rect[1], x1: o.rect[2], y1: o.rect[3],
    bottom: Math.max(0, o.sill), top: Math.max(0, o.sill) + Math.max(0, o.height),
  }));
  const walls = level.walls.map(w => ({ ...w, bottom: 0, top: w.height }));
  // Seed openings occupy gaps between wall segments. Fill only their missing
  // wall volume; never duplicate a drawn wall or extend a low wall to 2800 mm.
  const infills = level.openings.flatMap(o => {
    const [x0, y0, x1, y1] = o.rect;
    const horizontal = x1 - x0 >= y1 - y0;
    const adjacent = level.walls.filter(w => horizontal
      ? Math.min(y1, w.y1) > Math.max(y0, w.y0) && (Math.abs(w.x1 - x0) < 2 || Math.abs(w.x0 - x1) < 2 || (w.x0 <= x0 && w.x1 >= x1))
      : Math.min(x1, w.x1) > Math.max(x0, w.x0) && (Math.abs(w.y1 - y0) < 2 || Math.abs(w.y0 - y1) < 2 || (w.y0 <= y0 && w.y1 >= y1)));
    const top = adjacent.length ? Math.max(...adjacent.map(w => w.height)) : 2800;
    return walls.reduce((parts, wall) => parts.flatMap(p => subtract(p, wall)),
      [{ x0, y0, x1, y1, bottom: 0, top }] as WallSolid[]);
  });
  return [...walls, ...infills].flatMap(wall =>
    cuts.reduce((parts, cut) => parts.flatMap(p => subtract(p, cut)), [wall] as WallSolid[])
  ).map(s => ({ ...s, top: Math.min(s.top, cutHeight) }))
    .filter(s => s.top > s.bottom && s.x1 > s.x0 && s.y1 > s.y0);
}
