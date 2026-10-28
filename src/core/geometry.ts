/* ============================================================
 * scene-core · 几何计算与摆放求解器
 * AI 与人工放置共用同一套确定性求解逻辑。
 * ============================================================ */

import type { Asset, ComponentInstance, Level, Room, Vec2 } from './types';
import { instanceRef } from './types';
import { assetById } from './assets';

export const polyArea = (poly: Vec2[]): number =>
  Math.abs(
    poly.reduce((a, p, i) => {
      const q = poly[(i + 1) % poly.length];
      return a + p[0] * q[1] - q[0] * p[1];
    }, 0),
  ) / 2 / 1e6; // m²

function cross(a: Vec2, b: Vec2, c: Vec2) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(a: Vec2, b: Vec2, p: Vec2, areaEpsilon: number, coordEpsilon: number) {
  return Math.abs(cross(a, b, p)) <= areaEpsilon &&
    p[0] >= Math.min(a[0], b[0]) - coordEpsilon && p[0] <= Math.max(a[0], b[0]) + coordEpsilon &&
    p[1] >= Math.min(a[1], b[1]) - coordEpsilon && p[1] <= Math.max(a[1], b[1]) + coordEpsilon;
}

function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2) {
  const areaEpsilon = 1e-7;
  const coordEpsilon = 1e-7;
  const abC = cross(a, b, c), abD = cross(a, b, d);
  const cdA = cross(c, d, a), cdB = cross(c, d, b);
  const crosses = (x: number, y: number) =>
    (x > areaEpsilon && y < -areaEpsilon) || (x < -areaEpsilon && y > areaEpsilon);
  return (crosses(abC, abD) && crosses(cdA, cdB)) ||
    onSegment(a, b, c, areaEpsilon, coordEpsilon) || onSegment(a, b, d, areaEpsilon, coordEpsilon) ||
    onSegment(c, d, a, areaEpsilon, coordEpsilon) || onSegment(c, d, b, areaEpsilon, coordEpsilon);
}

/** A valid simple polygon has area and no non-adjacent edges that touch or cross. */
export function isSimplePolygon(poly: readonly Vec2[]) {
  if (poly.length < 3 || new Set(poly.map(([x, y]) => `${x},${y}`)).size < 3) return false;
  let twiceArea = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if (a[0] === b[0] && a[1] === b[1]) return false;
    twiceArea += a[0] * b[1] - b[0] * a[1];
  }
  if (!Number.isFinite(twiceArea) || Math.abs(twiceArea) < 1e-7) return false;

  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    for (let j = i + 1; j < poly.length; j++) {
      if (j === i || j === (i + 1) % poly.length || (j + 1) % poly.length === i) continue;
      if (segmentsIntersect(a, b, poly[j], poly[(j + 1) % poly.length])) return false;
    }
  }
  return true;
}

export const polyBBox = (poly: Vec2[]) => {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
};

export function pointInPoly(pt: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export const roomOfPoint = (level: Level, p: Vec2): Room | undefined =>
  level.rooms.find((r) => pointInPoly(p, r.poly));

/** 旋转后的轴对齐包围盒半宽 */
export function instAABB(inst: ComponentInstance, assets: readonly Asset[] = []): { hw: number; hh: number } {
  const { w, d } = instanceRef(inst, assetById(inst.assetId, assets));
  const a = (inst.t.rot * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  return { hw: (w / 2) * c + (d / 2) * s, hh: (w / 2) * s + (d / 2) * c };
}

export function aabbOverlap(
  a: { x: number; y: number; hw: number; hh: number },
  b: { x: number; y: number; hw: number; hh: number },
  margin = 0,
): boolean {
  return (
    Math.abs(a.x - b.x) < a.hw + b.hw + margin &&
    Math.abs(a.y - b.y) < a.hh + b.hh + margin
  );
}

/* ---------- 房间边缘（视作墙） ---------- */

export interface RoomEdge {
  a: Vec2;
  b: Vec2;
  len: number;
  /** 指向房间内侧的单位法向量 */
  nx: number;
  ny: number;
}

export function roomEdges(room: Room): RoomEdge[] {
  const cx = room.poly.reduce((s, p) => s + p[0], 0) / room.poly.length;
  const cy = room.poly.reduce((s, p) => s + p[1], 0) / room.poly.length;
  const edges: RoomEdge[] = [];
  for (let i = 0; i < room.poly.length; i++) {
    const a = room.poly[i];
    const b = room.poly[(i + 1) % room.poly.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1) continue;
    let nx = -dy / len;
    let ny = dx / len;
    // 法向量指向质心一侧（即房间内侧）
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    if ((cx - mx) * nx + (cy - my) * ny < 0) { nx = -nx; ny = -ny; }
    edges.push({ a, b, len, nx, ny });
  }
  return edges;
}

/* ---------- 摆放求解器 ---------- */

export interface Placement {
  x: number;
  y: number;
  rot: number;
}

export interface SolveOptions {
  /** 当前项目的声明式组件目录。 */
  assets?: readonly Asset[];
  /** 离其他家具的最小净距 mm */
  clearance?: number;
  /** 贴墙间隙 mm */
  wallGap?: number;
  /** 采样步长 mm */
  step?: number;
}

/**
 * 在房间内为 w×d 的物体求一个摆放位：
 * 1) 沿房间边缘（长边优先）滑动采样，贴墙、朝向房间内；
 * 2) 全部冲突时，取房间内不与现有家具碰撞的空区中心；
 * 3) 仍失败返回 null。
 */
export function solvePlacement(
  level: Level,
  room: Room,
  asset: Asset,
  opts: SolveOptions = {},
): Placement | null {
  const { clearance = 100, wallGap = 50, step = 100 } = opts;
  const { w, d } = asset;
  const obstacles = level.instances
    .map((inst) => {
      const { hw, hh } = instAABB(inst, opts.assets);
      return { x: inst.t.x, y: inst.t.y, hw, hh };
    });

  const edges = roomEdges(room).sort((e1, e2) => e2.len - e1.len);
  for (const e of edges) {
    const horizontal = Math.abs(e.b[0] - e.a[0]) >= Math.abs(e.b[1] - e.a[1]);
    const rot = horizontal ? (e.ny < 0 ? 0 : 180) : e.nx < 0 ? 90 : 270;
    // 贴墙时以深度方向压向墙，求旋转后的 AABB
    const a = (rot * Math.PI) / 180;
    const hw = (w / 2) * Math.abs(Math.cos(a)) + (d / 2) * Math.abs(Math.sin(a));
    const hh = (w / 2) * Math.abs(Math.sin(a)) + (d / 2) * Math.abs(Math.cos(a));
    const gap = Math.min(wallGap, d / 2);
    const startT = Math.max(hw, 0);
    const endT = Math.max(e.len - hw, startT);
    for (let t = startT; t <= endT; t += step) {
      const px = e.a[0] + ((e.b[0] - e.a[0]) * t) / e.len + e.nx * (gap + hw);
      const py = e.a[1] + ((e.b[1] - e.a[1]) * t) / e.len + e.ny * (gap + hh);
      const cand = { x: Math.round(px), y: Math.round(py) };
      if (!pointInPoly([cand.x, cand.y], room.poly)) continue;
      const me = { x: cand.x, y: cand.y, hw, hh };
      if (obstacles.some((o) => aabbOverlap(me, o, clearance))) continue;
      return { ...cand, rot };
    }
  }

  // 兜底：房间内以一定步长扫描空位
  const bb = polyBBox(room.poly);
  for (let y = bb.y0 + 300; y <= bb.y1 - 300; y += 300) {
    for (let x = bb.x0 + 300; x <= bb.x1 - 300; x += 300) {
      if (!pointInPoly([x, y], room.poly)) continue;
      const me = { x, y, hw: w / 2, hh: d / 2 };
      if (obstacles.some((o) => aabbOverlap(me, o, clearance))) continue;
      return { x: Math.round(x), y: Math.round(y), rot: 0 };
    }
  }
  return null;
}

/** 文档整体包围盒（用于视图适配）；空文档返回默认 10m×8m 视区 */
export function docBBox(level: Level) {
  const boxes = [
    ...level.walls.map((w) => ({ x0: w.x0, y0: w.y0, x1: w.x1, y1: w.y1 })),
    ...level.rooms.map((r) => polyBBox(r.poly)),
  ];
  if (!boxes.length) return { x0: 0, y0: 0, x1: 10000, y1: 8000 };
  return {
    x0: Math.min(...boxes.map((b) => b.x0)),
    y0: Math.min(...boxes.map((b) => b.y0)),
    x1: Math.max(...boxes.map((b) => b.x1)),
    y1: Math.max(...boxes.map((b) => b.y1)),
  };
}
