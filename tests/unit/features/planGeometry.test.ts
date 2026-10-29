import { describe, expect, it } from 'vitest';
import { buildBlankDocument } from '@/core/seed';
import { axisLock, openingOnWall, snapPoint, wallRectFromSegment } from '@/features/canvas2d/planGeometry';

describe('2D floor-plan geometry', () => {
  it('locks wall drafts to the dominant axis', () => {
    expect(axisLock([100, 200], [900, 450])).toEqual([900, 200]);
    expect(axisLock([100, 200], [350, 900])).toEqual([100, 900]);
  });

  it('snaps to nearby wall corners and otherwise uses the drawing grid', () => {
    const level = buildBlankDocument().levels[0];
    level.walls = [{ id: 'wall-1', x0: 0, y0: 0, x1: 3000, y1: 200, kind: 'partition', height: 2800 }];

    expect(snapPoint(level, [50, 50])).toEqual([0, 0]);
    expect(snapPoint(level, [1460, 1530])).toEqual([1500, 1500]);
  });

  it('builds axis-aligned wall rectangles with the requested thickness', () => {
    expect(wallRectFromSegment([0, 100], [3000, 300], 200)).toEqual({ x0: 0, y0: 100, x1: 3000, y1: 300 });
    expect(wallRectFromSegment([100, 0], [300, 3000], 200)).toEqual({ x0: 100, y0: 0, x1: 300, y1: 3000 });
  });

  it('keeps door openings within the wall and rejects walls that are too short', () => {
    const wall = { id: 'wall-1', x0: 0, y0: 0, x1: 3000, y1: 200, kind: 'partition' as const, height: 2800 };

    expect(openingOnWall(wall, [0, 100], 'door')).toMatchObject({
      kind: 'door', rect: [100, 0, 1000, 200], hinge: [100, 0], span: 900,
    });
    expect(openingOnWall({ ...wall, x1: 1000 }, [500, 100], 'door')).toBeNull();
  });
});
