import { describe, expect, it } from 'vitest';
import { buildBlankDocument } from '@/core/seed';
import { openingOnDemolishedWall, openingsForRenovatedLevel } from '@/core/renovation';

describe('opening renovation associations', () => {
  it.each([true, false])('handles split wall segments for a horizontal=%s doorway', (horizontal) => {
    const level = buildBlankDocument().levels[0];
    level.openings = [{ id: 'door', kind: 'door', rect: horizontal ? [1000, 0, 1900, 200] : [0, 1000, 200, 1900], height: 2100, sill: 0 }];
    level.walls = [
      { id: 'before', x0: 0, y0: 0, x1: horizontal ? 1000 : 200, y1: horizontal ? 200 : 1000, kind: 'partition', height: 2800, renovation: 'demolished' },
      { id: 'after', x0: horizontal ? 1900 : 0, y0: horizontal ? 0 : 1900, x1: horizontal ? 4000 : 200, y1: horizontal ? 200 : 4000, kind: 'partition', height: 2800, renovation: 'demolished' },
    ];

    expect(openingsForRenovatedLevel(level)).toEqual([]);
    level.walls[1].renovation = undefined;
    expect(openingsForRenovatedLevel(level)).toEqual(level.openings);
  });

  it('keeps an unassociated opening and ignores perpendicular crossing walls', () => {
    const level = buildBlankDocument().levels[0];
    const door = { id: 'door', kind: 'door' as const, rect: [1000, 0, 1900, 200] as [number, number, number, number], height: 2100, sill: 0 };
    expect(openingOnDemolishedWall(door, level)).toBe(false);
    level.walls = [{ id: 'crossing', x0: 1400, y0: -1000, x1: 1600, y1: 1000, kind: 'partition', height: 2800, renovation: 'demolished' }];
    expect(openingOnDemolishedWall(door, level)).toBe(false);
  });
});
