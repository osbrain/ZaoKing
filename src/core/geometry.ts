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

function pointOnPolygonEdge(point: Vec2, polygon: readonly Vec2[], epsilon = 1) {
  for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lengthSquared = dx * dx + dy * dy;
    if (!lengthSquared) continue;
    const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared));
    if (Math.hypot(point[0] - (a[0] + t * dx), point[1] - (a[1] + t * dy)) <= epsilon) return true;
  }
  return false;
}

export function pointInPolyInclusive(point: Vec2, polygon: readonly Vec2[]) {
  return pointInPoly(point, [...polygon]) || pointOnPolygonEdge(point, polygon);
}

function pointStrictlyInConvexPolygon(point: Vec2, polygon: readonly Vec2[]) {
  let positive = false;
  let negative = false;
  for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    const side = (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]);
    if (Math.abs(side) <= 1) return false;
    if (side > 0) positive = true;
    else negative = true;
    if (positive && negative) return false;
  }
  return true;
}

function segmentsProperlyCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2) {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  return ((abC > 1 && abD < -1) || (abC < -1 && abD > 1))
    && ((cdA > 1 && cdB < -1) || (cdA < -1 && cdB > 1));
}

function rectangleInsidePolygon(rectangle: readonly Vec2[], polygon: readonly Vec2[]) {
  if (!rectangle.every((corner) => pointInPolyInclusive(corner, polygon))) return false;
  for (let index = 0; index < polygon.length; index++) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    if (pointStrictlyInConvexPolygon(start, rectangle)) return false;
    for (let edge = 0; edge < rectangle.length; edge++) {
      if (segmentsProperlyCross(start, end, rectangle[edge], rectangle[(edge + 1) % rectangle.length])) return false;
    }
  }
  return true;
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

export function orientedRectCorners(inst: ComponentInstance, assets: readonly Asset[] = []): Vec2[] {
  const { w, d } = instanceRef(inst, assetById(inst.assetId, assets));
  const angle = (inst.t.rot * Math.PI) / 180;
  const widthAxis: Vec2 = [Math.cos(angle), Math.sin(angle)];
  const depthAxis: Vec2 = [-Math.sin(angle), Math.cos(angle)];
  const point = (wSign: number, dSign: number): Vec2 => [
    inst.t.x + widthAxis[0] * wSign * w / 2 + depthAxis[0] * dSign * d / 2,
    inst.t.y + widthAxis[1] * wSign * w / 2 + depthAxis[1] * dSign * d / 2,
  ];
  return [point(-1, -1), point(1, -1), point(1, 1), point(-1, 1)];
}

function projectionRange(points: readonly Vec2[], axis: Vec2): [number, number] {
  const projections = points.map(([x, y]) => x * axis[0] + y * axis[1]);
  return [Math.min(...projections), Math.max(...projections)];
}

export function orientedRectanglesOverlap(a: readonly Vec2[], b: readonly Vec2[], epsilon = 1): boolean {
  for (const polygon of [a, b]) {
    for (let index = 0; index < polygon.length; index++) {
      const start = polygon[index];
      const end = polygon[(index + 1) % polygon.length];
      const dx = end[0] - start[0];
      const dy = end[1] - start[1];
      const length = Math.hypot(dx, dy);
      if (length <= epsilon) continue;
      const axis: Vec2 = [-dy / length, dx / length];
      const [aMin, aMax] = projectionRange(a, axis);
      const [bMin, bMax] = projectionRange(b, axis);
      if (aMax <= bMin + epsilon || bMax <= aMin + epsilon) return false;
    }
  }
  return true;
}

function allowsIntentionalFootprintOverlap(a: Asset | undefined, b: Asset | undefined) {
  if (a?.type === 'rug' || b?.type === 'rug') return true;

  const aIsSurface = a?.type === 'counter' || a?.type === 'island';
  const bIsSurface = b?.type === 'counter' || b?.type === 'island';
  const fixture = aIsSurface ? b : bIsSurface ? a : undefined;
  return Boolean((aIsSurface || bIsSurface) && fixture && ['stove', 'ksink'].includes(fixture.type));
}

export interface PlacementIssue {
  code: 'no-room' | 'outside-room' | 'overlap';
  message: string;
  relatedInstanceId?: string;
}

export interface PlacementValidation {
  valid: boolean;
  room?: Room;
  issues: PlacementIssue[];
}

export function validateComponentPlacement(
  level: Level,
  instance: ComponentInstance,
  assets: readonly Asset[] = [],
  options: { roomId?: string; checkCollisions?: boolean } = {},
): PlacementValidation {
  const issues: PlacementIssue[] = [];
  const corners = orientedRectCorners(instance, assets);
  const center: Vec2 = [instance.t.x, instance.t.y];
  const room = options.roomId
    ? level.rooms.find((candidate) => candidate.id === options.roomId)
    : level.rooms.find((candidate) => pointInPolyInclusive(center, candidate.poly));

  if (level.rooms.length && !room) {
    issues.push({ code: 'no-room', message: '家具越界：中心不在任何已绘制房间内' });
  } else if (room && !rectangleInsidePolygon(corners, room.poly)) {
    issues.push({ code: 'outside-room', message: `家具越界：超出「${room.name}」边界` });
  }

  if (options.checkCollisions !== false) {
    const asset = assetById(instance.assetId, assets);
    const bounds = polyBBox(corners);
    const overlap = level.instances.find((other) => {
      const otherAsset = assetById(other.assetId, assets);
      if (other.id === instance.id || allowsIntentionalFootprintOverlap(asset, otherAsset)) return false;
      const otherCorners = orientedRectCorners(other, assets);
      const otherBounds = polyBBox(otherCorners);
      if (bounds.x1 <= otherBounds.x0 + 1 || otherBounds.x1 <= bounds.x0 + 1
        || bounds.y1 <= otherBounds.y0 + 1 || otherBounds.y1 <= bounds.y0 + 1) return false;
      return orientedRectanglesOverlap(corners, otherCorners);
    });
    if (overlap) {
      issues.push({ code: 'overlap', message: '家具与其他组件重叠', relatedInstanceId: overlap.id });
    }
  }

  return { valid: issues.length === 0, room, issues };
}

export interface LayoutCheck {
  code: PlacementIssue['code'];
  message: string;
  instanceId: string;
  relatedInstanceId?: string;
}

export function analyzeLevelLayout(level: Level, assets: readonly Asset[] = []): LayoutCheck[] {
  const checks: LayoutCheck[] = [];
  for (const instance of level.instances) {
    const validation = validateComponentPlacement(level, instance, assets, { checkCollisions: false });
    for (const issue of validation.issues) {
      checks.push({ code: issue.code, message: issue.message, instanceId: instance.id, relatedInstanceId: issue.relatedInstanceId });
    }
  }

  const shapes = level.instances
    .filter((instance) => assetById(instance.assetId, assets)?.type !== 'rug')
    .map((instance) => {
      const corners = orientedRectCorners(instance, assets);
      return { instance, corners, bounds: polyBBox(corners) };
    })
    .sort((a, b) => a.bounds.x0 - b.bounds.x0);
  for (let index = 0; index < shapes.length; index++) {
    const current = shapes[index];
    for (let next = index + 1; next < shapes.length && shapes[next].bounds.x0 < current.bounds.x1 - 1; next++) {
      const candidate = shapes[next];
      if (candidate.bounds.y0 >= current.bounds.y1 - 1 || current.bounds.y0 >= candidate.bounds.y1 - 1) continue;
      if (allowsIntentionalFootprintOverlap(assetById(current.instance.assetId, assets), assetById(candidate.instance.assetId, assets))) continue;
      if (!orientedRectanglesOverlap(current.corners, candidate.corners)) continue;
      checks.push({ code: 'overlap', message: '家具与其他组件重叠', instanceId: current.instance.id, relatedInstanceId: candidate.instance.id });
    }
  }
  return checks;
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
      const candidate: ComponentInstance = { id: '__placement_candidate__', assetId: asset.id, t: { ...cand, rot } };
      if (!validateComponentPlacement(level, candidate, opts.assets, { roomId: room.id }).valid) continue;
      if (clearance > 0 && level.instances.some((other) => {
        if (assetById(other.assetId, opts.assets)?.type === 'rug') return false;
        const box = instAABB(other, opts.assets);
        return aabbOverlap({ x: cand.x, y: cand.y, hw, hh }, { x: other.t.x, y: other.t.y, hw: box.hw, hh: box.hh }, clearance);
      })) continue;
      return { ...cand, rot };
    }
  }

  // 兜底：房间内以一定步长扫描空位
  const bb = polyBBox(room.poly);
  for (let y = bb.y0 + 300; y <= bb.y1 - 300; y += 300) {
    for (let x = bb.x0 + 300; x <= bb.x1 - 300; x += 300) {
      if (!pointInPoly([x, y], room.poly)) continue;
      const me = { x, y, hw: w / 2, hh: d / 2 };
      const candidate: ComponentInstance = { id: '__placement_candidate__', assetId: asset.id, t: { x, y, rot: 0 } };
      if (!validateComponentPlacement(level, candidate, opts.assets, { roomId: room.id }).valid) continue;
      if (clearance > 0 && level.instances.some((other) => {
        if (assetById(other.assetId, opts.assets)?.type === 'rug') return false;
        const box = instAABB(other, opts.assets);
        return aabbOverlap(me, { x: other.t.x, y: other.t.y, hw: box.hw, hh: box.hh }, clearance);
      })) continue;
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
