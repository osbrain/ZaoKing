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

  it('updates the sliding-door mode through the shared opening command', () => {
    const document = buildBlankDocument();
    document.levels[0].openings = [{ id: 'slider', kind: 'sliding', rect: [100, 100, 1200, 300], height: 2400, sill: 0 }];
    const updated = applyCmds(document, [{ type: 'setOpening', id: 'slider', slideMode: 'pocket-end' }]);

    expect(updated.levels[0].openings[0].slideMode).toBe('pocket-end');
    expect(document.levels[0].openings[0].slideMode).toBeUndefined();
  });

  it('keeps open cabinet bays within the updated partition count', () => {
    const document = buildBlankDocument();
    document.levels[0].instances = [{
      id: 'cabinet-1', assetId: 'cabinet', t: { x: 0, y: 0, rot: 0 },
      parameters: { compartments: 4, openCompartments: 3 },
    }];
    const updated = applyCmds(document, [{
      type: 'setParameters', id: 'cabinet-1', parameters: { compartments: 2 },
    }]);
    expect(updated.levels[0].instances[0].parameters).toEqual({ compartments: 2, openCompartments: 2 });
  });

  it('clamps inherited open cabinet bays when an instance overrides its partition count', () => {
    const document = buildBlankDocument();
    document.assets = [{
      id: 'custom:cabinet', type: 'custom', name: '定制地柜', category: '餐厨',
      w: 1800, d: 600, h: 900, color: '#a47a52', tags: [],
      geometry: { shape: 'cabinet', parameters: { compartments: 3, openCompartments: 2 } },
    }];
    document.levels[0].instances = [{
      id: 'cabinet-1', assetId: 'custom:cabinet', t: { x: 0, y: 0, rot: 0 },
    }];
    const updated = applyCmds(document, [{
      type: 'setParameters', id: 'cabinet-1', parameters: { compartments: 1 },
    }]);

    expect(updated.levels[0].instances[0].parameters).toEqual({ compartments: 1, openCompartments: 1 });
  });
});
