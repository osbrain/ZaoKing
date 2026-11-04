import { describe, expect, it } from 'vitest';
import { applyCmds } from '@/core/commands';
import { buildBlankDocument } from '@/core/seed';
import { materialById } from '@/core/assets';

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

  it('sets and clears a placed component price without mutating the source document', () => {
    const document = buildBlankDocument();
    document.levels[0].instances = [{ id: 'sofa-1', assetId: 'sofa', t: { x: 0, y: 0, rot: 0 } }];

    const priced = applyCmds(document, [{ type: 'setInstancePrice', id: 'sofa-1', unitPrice: 2988.5 }]);
    const cleared = applyCmds(priced, [{ type: 'setInstancePrice', id: 'sofa-1', unitPrice: undefined }]);

    expect(priced.levels[0].instances[0].unitPrice).toBe(2988.5);
    expect(document.levels[0].instances[0].unitPrice).toBeUndefined();
    expect(cleared.levels[0].instances[0].unitPrice).toBeUndefined();
  });

  it('rejects invalid furniture prices at the command boundary', () => {
    const document = buildBlankDocument();
    document.levels[0].instances = [{ id: 'sofa-1', assetId: 'sofa', t: { x: 0, y: 0, rot: 0 } }];

    for (const unitPrice of [-1, Number.NaN, Number.POSITIVE_INFINITY, 100_000_001]) {
      expect(() => applyCmds(document, [{ type: 'setInstancePrice', id: 'sofa-1', unitPrice }])).toThrow(/家具单价/);
    }
    expect(() => applyCmds(document, [{ type: 'setInstancePrice', id: 'sofa-1', unitPrice: 100_000_000 }])).not.toThrow();
  });

  it('stores a project material price override in a snapshot', () => {
    const document = buildBlankDocument();
    const updated = applyCmds(document, [{ type: 'setMaterialPrice', materialId: 'tile800', price: 235.75 }]);

    expect(materialById('tile800', updated.materialSnapshots).price).toBe(235.75);
    expect(materialById('tile800').price).toBe(220);
    expect(document.materialSnapshots).toBeUndefined();
  });

  it('rejects material prices above the editable limit', () => {
    const document = buildBlankDocument();
    expect(() => applyCmds(document, [{ type: 'setMaterialPrice', materialId: 'tile800', price: 1_000_001 }])).toThrow(/材质单价/);
    expect(() => applyCmds(document, [{ type: 'setMaterialPrice', materialId: 'tile800', price: 1_000_000 }])).not.toThrow();
  });
});
