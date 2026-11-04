import { describe, expect, it } from 'vitest';
import { buildBlankDocument } from '@/core/seed';
import { resolveAssetByQuery } from '@/core/assets';
import { canWalkTo, findWalkSpawn, nearestWalkDoor } from '@/features/canvas3d/walkNavigation';

describe('3D walk navigation', () => {
  it('spawns inside the apartment near its entry and faces the main room', () => {
    const level = buildBlankDocument().levels[0];
    level.rooms.push({
      id: 'living', name: '客厅', poly: [[200, 0], [5000, 0], [5000, 4000], [200, 4000]],
      labelAt: [3200, 2200], floorMaterialId: 'wood',
    });
    level.walls.push(
      { id: 'entry-top', x0: 0, y0: 0, x1: 200, y1: 600, kind: 'exterior', height: 2800 },
      { id: 'entry-bottom', x0: 0, y0: 1500, x1: 200, y1: 3000, kind: 'exterior', height: 2800 },
    );
    level.openings.push({ id: 'entry', kind: 'entry', rect: [0, 600, 200, 1500], height: 2100, sill: 0 });

    const spawn = findWalkSpawn(level);

    expect(spawn).not.toBeNull();
    expect(spawn!.point[0]).toBeGreaterThan(200);
    expect(spawn!.facing[0]).toBeGreaterThan(0);
    expect(canWalkTo(level, spawn!.point)).toBe(true);
  });

  it('keeps the player inside rooms and out of walls and furniture', () => {
    const level = buildBlankDocument().levels[0];
    const sofa = resolveAssetByQuery('三人沙发')!;
    level.rooms.push({ id: 'living', name: '客厅', poly: [[0, 0], [5000, 0], [5000, 5000], [0, 5000]], floorMaterialId: 'wood' });
    level.walls.push({ id: 'wall', x0: 2400, y0: 500, x1: 2600, y1: 4500, kind: 'partition', height: 2800 });
    level.instances.push({ id: 'sofa', assetId: sofa.id, t: { x: 1200, y: 1500, rot: 0 } });

    expect(canWalkTo(level, [1000, 3500], [sofa])).toBe(true);
    expect(canWalkTo(level, [2500, 2500], [sofa])).toBe(false);
    expect(canWalkTo(level, [1200, 1500], [sofa])).toBe(false);
    expect(canWalkTo(level, [5200, 2500], [sofa])).toBe(false);
  });

  it('allows walking through an open door and blocks the same doorway when closed', () => {
    const level = buildBlankDocument().levels[0];
    level.rooms.push(
      { id: 'left', name: '左侧房间', poly: [[0, 0], [2500, 0], [2500, 3000], [0, 3000]], floorMaterialId: 'wood' },
      { id: 'right', name: '右侧房间', poly: [[2500, 0], [5000, 0], [5000, 3000], [2500, 3000]], floorMaterialId: 'wood' },
    );
    level.walls.push(
      { id: 'top-wall', x0: 2400, y0: 0, x1: 2600, y1: 1000, kind: 'partition', height: 2800 },
      { id: 'bottom-wall', x0: 2400, y0: 1900, x1: 2600, y1: 3000, kind: 'partition', height: 2800 },
    );
    level.openings.push({ id: 'room-door', kind: 'door', rect: [2400, 1000, 2600, 1900], height: 2100, sill: 0 });

    expect(canWalkTo(level, [2500, 1450], [], { 'room-door': true })).toBe(true);
    expect(canWalkTo(level, [2500, 1450], [], { 'room-door': false })).toBe(false);
    expect(nearestWalkDoor(level, [2600, 1450])?.id).toBe('room-door');
    expect(nearestWalkDoor(level, [4800, 1450])).toBeNull();
  });
});
