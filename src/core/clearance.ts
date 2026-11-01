import type { ComponentInstance, Opening, Room, Vec2 } from './types';

export interface ClearanceShape {
  instance: ComponentInstance;
  type?: string;
  shape?: string;
  widthMm: number;
  depthMm: number;
  parameters?: { drawers?: number };
  footprint: readonly Vec2[];
}

export interface UsageClearanceCheck {
  instanceId: string;
  relatedInstanceId: string;
  actualMm: number;
  requiredMm: number;
  message: string;
}

export interface AisleClearanceCheck {
  openingId: string;
  roomName: string;
  actualMm: number;
  requiredMm: number;
  message: string;
}

export interface FrontAccessCheck {
  instanceId: string;
  relatedInstanceId: string;
  actualMm: number;
  requiredMm: number;
  message: string;
}

export interface SlidingDoorPocketCheck {
  openingId: string;
  instanceId: string;
  side: '左端' | '右端' | '上端' | '下端';
  travelMm: number;
  message: string;
}

const MIN_PASSAGE_MM = 800;
const DOOR_APPROACH_DEPTH_MM = 1000;
const DOOR_APPROACH_SAMPLE_MM = 50;
export const SLIDING_LEAF_TRAVEL_RATIO = 0.55;
const SLIDING_TRACK_PADDING_MM = 50;

const USAGE_CLEARANCE_RULES = [
  { first: ['sofa', 'cornersofa'], second: ['coffeetable'], requiredMm: 300, label: '沙发与茶几' },
  { first: ['bed', 'bunkbed'], second: ['wardrobe'], requiredMm: 600, label: '床与衣柜' },
] as const;

const FRONT_ACCESS_RULES: Record<string, { requiredMm: number; label: string }> = {
  wardrobe: { requiredMm: 600, label: '衣柜开门空间' },
  cabinet: { requiredMm: 600, label: '柜体操作空间' },
  vanity: { requiredMm: 600, label: '浴室柜操作空间' },
  fridge: { requiredMm: 900, label: '冰箱开门空间' },
  fridgeSingle: { requiredMm: 900, label: '冰箱开门空间' },
  fridge4: { requiredMm: 900, label: '冰箱开门空间' },
  dishwasher: { requiredMm: 600, label: '洗碗机开门空间' },
  ovencol: { requiredMm: 600, label: '蒸烤箱开门空间' },
  washer: { requiredMm: 600, label: '洗衣机操作空间' },
  dryer: { requiredMm: 600, label: '烘干机操作空间' },
  dresser: { requiredMm: 450, label: '抽屉拉出空间' },
  nightstand: { requiredMm: 450, label: '床头柜抽屉拉出空间' },
};

function pointInRoom(point: Vec2, polygon: readonly Vec2[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if ((yi > point[1]) !== (yj > point[1])
      && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

type Interval = [number, number];

function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = intervals.filter(([start, end]) => end > start).map(([start, end]) => [start, end] as Interval)
    .sort((a, b) => a[0] - b[0]);
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && interval[0] <= previous[1]) previous[1] = Math.max(previous[1], interval[1]);
    else merged.push([...interval]);
  }
  return merged;
}

function polygonLineIntervals(polygon: readonly Vec2[], tangent: Vec2, normal: Vec2, coordinate: number): Interval[] {
  const intersections: number[] = [];
  for (let index = 0; index < polygon.length; index++) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    const startNormal = start[0] * normal[0] + start[1] * normal[1];
    const endNormal = end[0] * normal[0] + end[1] * normal[1];
    const startTangent = start[0] * tangent[0] + start[1] * tangent[1];
    const endTangent = end[0] * tangent[0] + end[1] * tangent[1];
    if (Math.abs(startNormal - endNormal) < 1e-6) {
      if (Math.abs(coordinate - startNormal) < 1e-6) intersections.push(startTangent, endTangent);
      continue;
    }
    const t = (coordinate - startNormal) / (endNormal - startNormal);
    if (t >= -1e-6 && t <= 1 + 1e-6) intersections.push(startTangent + (endTangent - startTangent) * t);
  }
  const unique = intersections.sort((a, b) => a - b).filter((value, index, values) =>
    index === 0 || Math.abs(value - values[index - 1]) > 1e-6);
  const intervals: Interval[] = [];
  for (let index = 0; index + 1 < unique.length; index += 2) intervals.push([unique[index], unique[index + 1]]);
  return intervals;
}

function subtractIntervals(source: readonly Interval[], blocked: readonly Interval[]): Interval[] {
  let remaining = [...source];
  for (const [blockedStart, blockedEnd] of mergeIntervals(blocked)) {
    remaining = remaining.flatMap(([start, end]) => {
      if (blockedEnd <= start || blockedStart >= end) return [[start, end] as Interval];
      const parts: Interval[] = [];
      if (blockedStart > start) parts.push([start, Math.min(blockedStart, end)]);
      if (blockedEnd < end) parts.push([Math.max(blockedEnd, start), end]);
      return parts;
    });
  }
  return remaining;
}

function openingSides(opening: Opening, rooms: readonly Room[]) {
  const [x0, y0, x1, y1] = opening.rect;
  const widthX = Math.abs(x1 - x0);
  const widthY = Math.abs(y1 - y0);
  const tangent: Vec2 = widthX >= widthY ? [1, 0] : [0, 1];
  const normal: Vec2 = widthX >= widthY ? [0, 1] : [1, 0];
  const center: Vec2 = [(x0 + x1) / 2, (y0 + y1) / 2];
  const openingWidth = Math.max(1, Math.max(widthX, widthY));
  const wallThickness = Math.min(widthX, widthY);
  const sides = [-1, 1].flatMap((direction) => {
    const probe: Vec2 = [
      center[0] + normal[0] * direction * (wallThickness / 2 + 20),
      center[1] + normal[1] * direction * (wallThickness / 2 + 20),
    ];
    const room = rooms.find((candidate) => pointInRoom(probe, candidate.poly));
    return room ? [{ room, center, tangent, normal, direction, openingWidth, wallThickness }] : [];
  });
  return sides;
}

function minimumApproachWidth(
  side: ReturnType<typeof openingSides>[number],
  obstacles: readonly ClearanceShape[],
) {
  const laneWidth = Math.max(side.openingWidth, MIN_PASSAGE_MM);
  const tangentCenter = side.center[0] * side.tangent[0] + side.center[1] * side.tangent[1];
  const lane: Interval = [tangentCenter - laneWidth / 2, tangentCenter + laneWidth / 2];
  const wallFace = side.center[0] * side.normal[0] + side.center[1] * side.normal[1]
    + side.direction * side.wallThickness / 2;
  let minimum = side.openingWidth;

  for (let depth = DOOR_APPROACH_SAMPLE_MM; depth <= DOOR_APPROACH_DEPTH_MM; depth += DOOR_APPROACH_SAMPLE_MM) {
    const coordinate = wallFace + side.direction * depth;
    const roomIntervals = mergeIntervals(polygonLineIntervals(side.room.poly, side.tangent, side.normal, coordinate)
      .map(([start, end]) => [Math.max(start, lane[0]), Math.min(end, lane[1])] as Interval));
    if (!roomIntervals.length) return 0;
    const blocked = obstacles.flatMap((obstacle) => polygonLineIntervals(obstacle.footprint, side.tangent, side.normal, coordinate)
      .map(([start, end]) => [Math.max(start, lane[0]), Math.min(end, lane[1])] as Interval));
    const free = subtractIntervals(roomIntervals, blocked);
    const widestFreeSegment = Math.max(0, ...free.map(([start, end]) => end - start));
    minimum = Math.min(minimum, widestFreeSegment);
  }
  return Math.round(minimum);
}

/** Estimates the narrowest 1 m approach strip inside a room for each recognized opening. */
export function analyzeDoorApproaches(
  openings: readonly Opening[],
  rooms: readonly Room[],
  obstacles: readonly ClearanceShape[],
): AisleClearanceCheck[] {
  const checks: AisleClearanceCheck[] = [];
  for (const opening of openings) {
    if (opening.kind === 'window') continue;
    const sides = openingSides(opening, rooms);
    for (const side of sides) {
      const actualMm = minimumApproachWidth(side, obstacles);
      if (actualMm >= MIN_PASSAGE_MM) continue;
      checks.push({
        openingId: opening.id,
        roomName: side.room.name,
        actualMm,
        requiredMm: MIN_PASSAGE_MM,
        message: `「${side.room.name}」门前 1 米通行带最窄约 ${actualMm} mm，低于 ${MIN_PASSAGE_MM} mm 参考值；请确认家具位置和实际通行需求`,
      });
    }
  }
  return checks;
}

/** Checks wall pockets only when the plan explicitly identifies a single-sided pocket door. */
export function analyzeSlidingDoorPockets(
  openings: readonly Opening[],
  obstacles: readonly ClearanceShape[],
): SlidingDoorPocketCheck[] {
  const checks: SlidingDoorPocketCheck[] = [];
  for (const opening of openings) {
    if (opening.kind !== 'sliding' || !opening.slideMode || opening.slideMode === 'bypass') continue;
    const [x0, y0, x1, y1] = opening.rect;
    const widthX = x1 - x0;
    const widthY = y1 - y0;
    const horizontalTrack = widthX >= widthY;
    const span = horizontalTrack ? widthX : widthY;
    const travelMm = Math.round(span * SLIDING_LEAF_TRAVEL_RATIO);
    const pocketDepth = SLIDING_TRACK_PADDING_MM;
    const pockets: Array<{ side: SlidingDoorPocketCheck['side']; polygon: Vec2[] }> = horizontalTrack
      ? [
        { side: '左端', polygon: [[x0 - travelMm, y0 - pocketDepth], [x0, y0 - pocketDepth], [x0, y1 + pocketDepth], [x0 - travelMm, y1 + pocketDepth]] },
        { side: '右端', polygon: [[x1, y0 - pocketDepth], [x1 + travelMm, y0 - pocketDepth], [x1 + travelMm, y1 + pocketDepth], [x1, y1 + pocketDepth]] },
      ]
      : [
        { side: '上端', polygon: [[x0 - pocketDepth, y0 - travelMm], [x1 + pocketDepth, y0 - travelMm], [x1 + pocketDepth, y0], [x0 - pocketDepth, y0]] },
        { side: '下端', polygon: [[x0 - pocketDepth, y1], [x1 + pocketDepth, y1], [x1 + pocketDepth, y1 + travelMm], [x0 - pocketDepth, y1 + travelMm]] },
      ];

    const selectedPocketIndex = opening.slideMode === 'pocket-start' ? 0 : 1;
    for (const [index, pocket] of pockets.entries()) {
      if (index !== selectedPocketIndex) continue;
      const obstacle = obstacles.find((shape) => polygonsOverlap(pocket.polygon, shape.footprint));
      if (!obstacle) continue;
      checks.push({
        openingId: opening.id,
        instanceId: obstacle.instance.id,
        side: pocket.side,
        travelMm,
        message: `${pocket.side}推拉门扇运行/收纳区约 ${travelMm} mm，与家具占用范围重叠；请核对现场轨道与门扇方向`,
      });
    }
  }
  return checks;
}

function project(points: readonly Vec2[], axis: Vec2): [number, number] {
  const values = points.map(([x, y]) => x * axis[0] + y * axis[1]);
  return [Math.min(...values), Math.max(...values)];
}

function polygonsOverlap(first: readonly Vec2[], second: readonly Vec2[]) {
  for (const polygon of [first, second]) {
    for (let index = 0; index < polygon.length; index++) {
      const start = polygon[index];
      const end = polygon[(index + 1) % polygon.length];
      const dx = end[0] - start[0];
      const dy = end[1] - start[1];
      const length = Math.hypot(dx, dy);
      if (length < 1e-6) continue;
      const axis: Vec2 = [-dy / length, dx / length];
      const [firstMin, firstMax] = project(first, axis);
      const [secondMin, secondMax] = project(second, axis);
      if (firstMax <= secondMin + 1 || secondMax <= firstMin + 1) return false;
    }
  }
  return true;
}

function frontAccessRule(shape: ClearanceShape) {
  const key = shape.shape ?? shape.type ?? '';
  const knownRule = FRONT_ACCESS_RULES[key];
  if (knownRule) return knownRule;
  if ((shape.parameters?.drawers ?? 0) > 0) return { requiredMm: 450, label: '抽屉拉出空间' };
  return undefined;
}

function frontAccessDistance(target: ClearanceShape, obstacle: ClearanceShape, requiredMm: number) {
  const angle = target.instance.t.rot * Math.PI / 180;
  const tangent: Vec2 = [Math.cos(angle), Math.sin(angle)];
  const normal: Vec2 = [-Math.sin(angle), Math.cos(angle)];
  const targetTangent = target.instance.t.x * tangent[0] + target.instance.t.y * tangent[1];
  const obstacleTangent = project(obstacle.footprint, tangent);
  const targetSide: Interval = [targetTangent - target.widthMm / 2, targetTangent + target.widthMm / 2];
  if (Math.min(targetSide[1], obstacleTangent[1]) - Math.max(targetSide[0], obstacleTangent[0]) <= 1) return null;

  const front = target.instance.t.x * normal[0] + target.instance.t.y * normal[1] + target.depthMm / 2;
  const obstacleDepth = project(obstacle.footprint, normal);
  const gap = obstacleDepth[0] - front;
  if (gap <= 1 || gap >= requiredMm || obstacleDepth[1] <= front) return null;
  return Math.round(gap);
}

/** Checks known front-opening components against nearby furniture in the same room. */
export function analyzeFrontAccess(shapes: readonly ClearanceShape[], rooms: readonly Room[]): FrontAccessCheck[] {
  if (!rooms.length) return [];
  const checks: FrontAccessCheck[] = [];
  for (const target of shapes) {
    const rule = frontAccessRule(target);
    if (!rule) continue;
    const nearest = shapes
      .filter((obstacle) => obstacle.instance.id !== target.instance.id && sharedRoom(target, obstacle, rooms))
      .map((obstacle) => ({ obstacle, gap: frontAccessDistance(target, obstacle, rule.requiredMm) }))
      .filter((item): item is { obstacle: ClearanceShape; gap: number } => item.gap !== null)
      .sort((a, b) => a.gap - b.gap)[0];
    if (!nearest) continue;
    checks.push({
      instanceId: target.instance.id,
      relatedInstanceId: nearest.obstacle.instance.id,
      actualMm: nearest.gap,
      requiredMm: rule.requiredMm,
      message: `${rule.label}前净距约 ${nearest.gap} mm，低于 ${rule.requiredMm} mm 参考值；请确认开门、抽屉或操作空间`,
    });
  }
  return checks;
}

function pointSegmentDistance(point: Vec2, start: Vec2, end: Vec2) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared));
  return Math.hypot(point[0] - (start[0] + t * dx), point[1] - (start[1] + t * dy));
}

function polygonDistance(first: readonly Vec2[], second: readonly Vec2[]) {
  if (polygonsOverlap(first, second)) return 0;
  let minimum = Infinity;
  for (const point of first) {
    for (let index = 0; index < second.length; index++) {
      minimum = Math.min(minimum, pointSegmentDistance(point, second[index], second[(index + 1) % second.length]));
    }
  }
  for (const point of second) {
    for (let index = 0; index < first.length; index++) {
      minimum = Math.min(minimum, pointSegmentDistance(point, first[index], first[(index + 1) % first.length]));
    }
  }
  return minimum;
}

function sharedRoom(first: ClearanceShape, second: ClearanceShape, rooms: readonly Room[]) {
  const firstCenter = first.instance.t;
  const secondCenter = second.instance.t;
  return rooms.find((room) => pointInRoom([firstCenter.x, firstCenter.y], room.poly)
    && pointInRoom([secondCenter.x, secondCenter.y], room.poly));
}

function ruleFor(first: ClearanceShape, second: ClearanceShape) {
  return USAGE_CLEARANCE_RULES.find((rule) =>
    (rule.first as readonly string[]).includes(first.type ?? '')
      && (rule.second as readonly string[]).includes(second.type ?? '')
      || (rule.first as readonly string[]).includes(second.type ?? '')
      && (rule.second as readonly string[]).includes(first.type ?? ''));
}

/** Returns reference checks only for known, commonly used furniture pairs in one room. */
export function analyzeUsageClearances(
  shapes: readonly ClearanceShape[],
  rooms: readonly Room[],
): UsageClearanceCheck[] {
  if (!rooms.length) return [];
  const checks: UsageClearanceCheck[] = [];
  for (let firstIndex = 0; firstIndex < shapes.length; firstIndex++) {
    const first = shapes[firstIndex];
    for (let secondIndex = firstIndex + 1; secondIndex < shapes.length; secondIndex++) {
      const second = shapes[secondIndex];
      const rule = ruleFor(first, second);
      if (!rule || !sharedRoom(first, second, rooms)) continue;
      const actualMm = Math.round(polygonDistance(first.footprint, second.footprint));
      if (actualMm === 0) continue;
      if (actualMm >= rule.requiredMm) continue;
      checks.push({
        instanceId: first.instance.id,
        relatedInstanceId: second.instance.id,
        actualMm,
        requiredMm: rule.requiredMm,
        message: `${rule.label}净距约 ${actualMm} mm，低于 ${rule.requiredMm} mm 参考值；请确认实际使用是否受限`,
      });
    }
  }
  return checks;
}
