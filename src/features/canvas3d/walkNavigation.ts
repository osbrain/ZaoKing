import { assetById } from '@/core/assets';
import { pointInPolyInclusive, polyArea } from '@/core/geometry';
import { instanceRef, type Asset, type Level, type Opening, type Vec2 } from '@/core/types';

export const WALKER_RADIUS_MM = 180;

export interface WalkSpawn {
  point: Vec2;
  facing: Vec2;
}

function openingBounds(opening: Opening) {
  const [x0, y0, x1, y1] = opening.rect;
  return { x0, y0, x1, y1 };
}

function openingContainsWalker(opening: Opening, point: Vec2, radius: number) {
  const bounds = openingBounds(opening);
  const width = bounds.x1 - bounds.x0;
  const height = bounds.y1 - bounds.y0;
  const [x, y] = point;
  if (width >= height) {
    return Math.abs(x - (bounds.x0 + bounds.x1) / 2) <= width / 2 - radius
      && Math.abs(y - (bounds.y0 + bounds.y1) / 2) <= height / 2 + radius;
  }
  return Math.abs(y - (bounds.y0 + bounds.y1) / 2) <= height / 2 - radius
    && Math.abs(x - (bounds.x0 + bounds.x1) / 2) <= width / 2 + radius;
}

function openingOverlapsWall(opening: Opening, wall: Level['walls'][number]) {
  const bounds = openingBounds(opening);
  return bounds.x0 < wall.x1 && bounds.x1 > wall.x0 && bounds.y0 < wall.y1 && bounds.y1 > wall.y0;
}

function pointNearRect(point: Vec2, rect: { x0: number; y0: number; x1: number; y1: number }, radius: number) {
  const x = Math.max(rect.x0, Math.min(point[0], rect.x1));
  const y = Math.max(rect.y0, Math.min(point[1], rect.y1));
  return Math.hypot(point[0] - x, point[1] - y) < radius;
}

function pointInsideRoomUnion(point: Vec2, level: Level) {
  return level.rooms.some((room) => pointInPolyInclusive(point, room.poly));
}

function playerFitsInRooms(point: Vec2, level: Level, radius: number) {
  if (!level.rooms.length) return true;
  const samples: Vec2[] = [point];
  for (let index = 0; index < 8; index++) {
    const angle = index * Math.PI / 4;
    samples.push([
      point[0] + Math.cos(angle) * radius,
      point[1] + Math.sin(angle) * radius,
    ]);
  }
  return samples.every((sample) => pointInsideRoomUnion(sample, level));
}

function pointHitsFurniture(point: Vec2, level: Level, assets: readonly Asset[], radius: number) {
  return level.instances.some((instance) => {
    const asset = assetById(instance.assetId, assets);
    if (asset?.type === 'rug') return false;
    const { w, d } = instanceRef(instance, asset);
    const angle = instance.t.rot * Math.PI / 180;
    const dx = point[0] - instance.t.x;
    const dy = point[1] - instance.t.y;
    const localX = dx * Math.cos(angle) + dy * Math.sin(angle);
    const localY = -dx * Math.sin(angle) + dy * Math.cos(angle);
    const outsideX = Math.max(0, Math.abs(localX) - w / 2);
    const outsideY = Math.max(0, Math.abs(localY) - d / 2);
    return Math.hypot(outsideX, outsideY) < radius;
  });
}

function pointHitsClosedOpening(point: Vec2, level: Level, openDoors: Readonly<Record<string, boolean>>, radius: number) {
  return level.openings.some((opening) => {
    if (opening.kind === 'window' || openDoors[opening.id] !== false) return false;
    const { x0, y0, x1, y1 } = openingBounds(opening);
    return pointNearRect(point, { x0, y0, x1, y1 }, radius);
  });
}

function pointHitsWall(point: Vec2, level: Level, openDoors: Readonly<Record<string, boolean>>, radius: number) {
  return level.walls.some((wall) => {
    if (!pointNearRect(point, wall, radius)) return false;
    const passableOpening = level.openings.some((opening) => {
      if (!openingOverlapsWall(opening, wall)) return false;
      const isOpen = opening.kind === 'sliding' || openDoors[opening.id] !== false;
      return isOpen && openingContainsWalker(opening, point, radius);
    });
    return !passableOpening;
  });
}

export function canWalkTo(
  level: Level,
  point: Vec2,
  assets: readonly Asset[] = [],
  openDoors: Readonly<Record<string, boolean>> = {},
  radius = WALKER_RADIUS_MM,
) {
  return playerFitsInRooms(point, level, radius)
    && !pointHitsWall(point, level, openDoors, radius)
    && !pointHitsClosedOpening(point, level, openDoors, radius)
    && !pointHitsFurniture(point, level, assets, radius);
}

function polygonCentroid(poly: readonly Vec2[]): Vec2 {
  let twiceArea = 0;
  let x = 0;
  let y = 0;
  for (let index = 0; index < poly.length; index++) {
    const current = poly[index];
    const next = poly[(index + 1) % poly.length];
    const cross = current[0] * next[1] - next[0] * current[1];
    twiceArea += cross;
    x += (current[0] + next[0]) * cross;
    y += (current[1] + next[1]) * cross;
  }
  if (Math.abs(twiceArea) < 1e-6) return [0, 0];
  return [x / (3 * twiceArea), y / (3 * twiceArea)];
}

function roomAnchor(room: Level['rooms'][number]): Vec2 {
  if (room.labelAt && pointInPolyInclusive(room.labelAt, room.poly)) return room.labelAt;
  const centroid = polygonCentroid(room.poly);
  if (pointInPolyInclusive(centroid, room.poly)) return centroid;
  const average: Vec2 = [
    room.poly.reduce((sum, point) => sum + point[0], 0) / room.poly.length,
    room.poly.reduce((sum, point) => sum + point[1], 0) / room.poly.length,
  ];
  return pointInPolyInclusive(average, room.poly) ? average : room.poly[0];
}

function searchRoomForSpawn(level: Level, room: Level['rooms'][number], assets: readonly Asset[], openDoors: Readonly<Record<string, boolean>>) {
  const xs = room.poly.map(([x]) => x);
  const ys = room.poly.map(([, y]) => y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const step = Math.max(250, Math.ceil(Math.max(x1 - x0, y1 - y0) / 32 / 50) * 50);
  const anchor = roomAnchor(room);
  let best: Vec2 | null = null;
  let bestDistance = Infinity;
  for (let x = x0 + WALKER_RADIUS_MM; x <= x1 - WALKER_RADIUS_MM; x += step) {
    for (let y = y0 + WALKER_RADIUS_MM; y <= y1 - WALKER_RADIUS_MM; y += step) {
      const point: Vec2 = [x, y];
      const distance = Math.hypot(x - anchor[0], y - anchor[1]);
      if (distance >= bestDistance || !canWalkTo(level, point, assets, openDoors)) continue;
      best = point;
      bestDistance = distance;
    }
  }
  return best;
}

export function findWalkSpawn(
  level: Level,
  assets: readonly Asset[] = [],
  openDoors: Readonly<Record<string, boolean>> = {},
): WalkSpawn | null {
  const rooms = [...level.rooms].sort((a, b) => polyArea(b.poly) - polyArea(a.poly));
  const destination = rooms[0] ? roomAnchor(rooms[0]) : null;
  const entries = level.openings.filter((opening) => opening.kind === 'entry');
  const entryCandidates = entries.flatMap((opening) => {
    const [x0, y0, x1, y1] = opening.rect;
    const center: Vec2 = [(x0 + x1) / 2, (y0 + y1) / 2];
    const directions: Vec2[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    return directions.flatMap((direction) => [650, 900, 1200].map((distance) => ({
      point: [center[0] + direction[0] * distance, center[1] + direction[1] * distance] as Vec2,
      direction,
    })));
  }).filter(({ point }) => canWalkTo(level, point, assets, openDoors));

  if (entryCandidates.length) {
    const candidate = entryCandidates.sort((a, b) => {
      if (!destination) return 0;
      return Math.hypot(a.point[0] - destination[0], a.point[1] - destination[1])
        - Math.hypot(b.point[0] - destination[0], b.point[1] - destination[1]);
    })[0];
    return { point: candidate.point, facing: destination
      ? [destination[0] - candidate.point[0], destination[1] - candidate.point[1]]
      : candidate.direction };
  }

  for (const room of rooms) {
    const anchor = roomAnchor(room);
    const point = canWalkTo(level, anchor, assets, openDoors)
      ? anchor
      : searchRoomForSpawn(level, room, assets, openDoors);
    if (point) {
      const facing: Vec2 = destination
        ? [destination[0] - point[0], destination[1] - point[1]]
        : [0, 1];
      return { point, facing: Math.hypot(...facing) > 1 ? facing : [0, 1] };
    }
  }
  return null;
}

export function nearestWalkDoor(level: Level, point: Vec2, maxDistance = 1400) {
  let nearest: { opening: Opening; distance: number } | null = null;
  for (const opening of level.openings) {
    if (opening.kind !== 'door' && opening.kind !== 'entry' && opening.kind !== 'sliding') continue;
    const [x0, y0, x1, y1] = opening.rect;
    const center: Vec2 = [(x0 + x1) / 2, (y0 + y1) / 2];
    const distance = Math.hypot(center[0] - point[0], center[1] - point[1]);
    if (distance <= maxDistance && (!nearest || distance < nearest.distance)) nearest = { opening, distance };
  }
  return nearest?.opening ?? null;
}
