import { describe, expect, it } from 'vitest';
import { applyCmds } from '@/core/commands';
import { buildBlankDocument } from '@/core/seed';

describe('level-scoped commands', () => {
  it('preserves the current single-level command API', () => {
    const document = buildBlankDocument();
    const updated = applyCmds(document, [{
      type: 'addWall', wall: { id: 'wall-1', x0: 0, y0: 0, x1: 1000, y1: 200, kind: 'partition', height: 2800 },
    }]);
    expect(updated.levels[0].walls).toHaveLength(1);
  });

  it('requires an explicit target when a document has multiple levels', () => {
    const document = buildBlankDocument();
    document.levels.push({ id: 'lv2', name: '二层', elevation: 3000, walls: [], rooms: [], openings: [], instances: [] });
    expect(() => applyCmds(document, [{
      type: 'addWall', wall: { id: 'wall-1', x0: 0, y0: 0, x1: 1000, y1: 200, kind: 'partition', height: 2800 },
    }])).toThrow(/multiple levels/);
  });

  it('only changes the targeted level', () => {
    const document = buildBlankDocument();
    document.levels.push({ id: 'lv2', name: '二层', elevation: 3000, walls: [], rooms: [], openings: [], instances: [] });
    const updated = applyCmds(document, [{
      levelId: 'lv2',
      type: 'addWall', wall: { id: 'wall-2', x0: 0, y0: 0, x1: 1000, y1: 200, kind: 'partition', height: 2800 },
    }]);
    expect(updated.levels[0].walls).toHaveLength(0);
    expect(updated.levels[1].walls).toHaveLength(1);
  });
});
