import { describe, expect, it } from 'vitest';
import { buildWallSolids } from '@/core/wallGeometry';
import { buildBlankDocument } from '@/core/seed';

describe('renovation wall geometry', () => {
  it('preserves construction state on 3D solids and removes demolished-wall openings', () => {
    const level = buildBlankDocument().levels[0];
    level.walls = [
      { id: 'new', x0: 0, y0: 0, x1: 4000, y1: 200, kind: 'partition', height: 2800, renovation: 'new' },
      { id: 'demo', x0: 0, y0: 1000, x1: 4000, y1: 1200, kind: 'partition', height: 2800, renovation: 'demolished' },
    ];
    level.openings = [{ id: 'door', kind: 'door', rect: [1200, 1000, 2100, 1200], height: 2100, sill: 0 }];

    const solids = buildWallSolids(level);

    expect(solids.some((solid) => solid.renovation === 'new')).toBe(true);
    expect(solids.some((solid) => solid.renovation === 'demolished' && solid.x0 === 0 && solid.x1 === 4000)).toBe(true);
  });
});
