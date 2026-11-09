import { describe, expect, it } from 'vitest';
import { buildBlankDocument, buildSeedDocument } from '@/core/seed';
import { SceneDocumentSchema } from '@/core/sceneSchema';

describe('SceneDocumentSchema', () => {
  it('accepts blank and seeded documents', () => {
    expect(SceneDocumentSchema.safeParse(buildBlankDocument()).success).toBe(true);
    expect(SceneDocumentSchema.safeParse(buildSeedDocument()).success).toBe(true);
  });

  it('validates optional room-specific flooring parameters while accepting legacy rooms', () => {
    const document = buildBlankDocument();
    document.levels[0].rooms.push({
      id: 'living', name: '客厅', poly: [[0, 0], [4000, 0], [4000, 4000], [0, 4000]], floorMaterialId: 'tile800',
      flooring: { tileMm: [600, 300], groutMm: 3, groutColor: '#aaaaaa', layout: 'brick', origin: [100, 200] },
    });
    expect(SceneDocumentSchema.safeParse(document).success).toBe(true);

    document.levels[0].rooms[0].flooring!.tileMm = [25, 25];
    expect(SceneDocumentSchema.safeParse(document).success).toBe(false);
  });

  it('accepts legacy sliding openings and explicit pocket-door modes', () => {
    const document = buildBlankDocument();
    document.levels[0].openings = [{ id: 'slider', kind: 'sliding', rect: [100, 100, 1200, 300], height: 2400, sill: 0 }];
    expect(SceneDocumentSchema.safeParse(document).success).toBe(true);

    document.levels[0].openings[0].slideMode = 'pocket-start';
    expect(SceneDocumentSchema.safeParse(document).success).toBe(true);
  });

  it('rejects sliding-door modes on non-sliding openings', () => {
    const document = buildBlankDocument();
    document.levels[0].openings = [{
      id: 'window-1', kind: 'window', rect: [100, 100, 1200, 300], height: 1500, sill: 900,
      slideMode: 'pocket-start',
    }];

    expect(SceneDocumentSchema.safeParse(document).success).toBe(false);
  });

  it('rejects inverted wall bounds', () => {
    const document = buildBlankDocument();
    document.levels[0].walls.push({
      id: 'wall-1', x0: 1000, y0: 0, x1: 0, y1: 200, kind: 'partition', height: 2800,
    });
    const result = SceneDocumentSchema.safeParse(document);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path).toContain('walls');
  });

  it('rejects self-intersecting room boundaries', () => {
    const document = buildBlankDocument();
    document.levels[0].rooms.push({
      id: 'room-1', name: '房间', poly: [[0, 0], [2000, 2000], [0, 2000], [2000, 0]], floorMaterialId: 'tile800',
    });
    const result = SceneDocumentSchema.safeParse(document);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((issue) => issue.path.includes('poly'))).toBe(true);
  });

  it('rejects duplicate entity IDs within a level', () => {
    const document = buildBlankDocument();
    document.levels[0].walls = [
      { id: 'duplicate', x0: 0, y0: 0, x1: 1000, y1: 200, kind: 'partition', height: 2800 },
    ];
    document.levels[0].rooms = [
      { id: 'duplicate', name: '房间', poly: [[0, 0], [2000, 0], [2000, 2000], [0, 2000]], floorMaterialId: 'tile800' },
    ];
    expect(SceneDocumentSchema.safeParse(document).success).toBe(false);
  });

  it('rejects non-hex component color overrides', () => {
    const document = buildSeedDocument();
    document.levels[0].instances[0].color = 'red';

    const result = SceneDocumentSchema.safeParse(document);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((issue) => issue.path.at(-1) === 'color')).toBe(true);
  });

  it('validates optional furniture unit prices', () => {
    const document = buildSeedDocument();
    document.levels[0].instances[0].unitPrice = 1234.56;
    expect(SceneDocumentSchema.safeParse(document).success).toBe(true);

    document.levels[0].instances[0].unitPrice = -1;
    expect(SceneDocumentSchema.safeParse(document).success).toBe(false);

    document.levels[0].instances[0].unitPrice = 100_000_001;
    expect(SceneDocumentSchema.safeParse(document).success).toBe(false);
  });

  it('rejects material snapshot prices above the editable limit', () => {
    const document = buildBlankDocument();
    document.materialSnapshots = [{
      id: 'tile800', name: '800 地砖', price: 1_000_001, sw: '#cbc3b7',
      render: { pattern: 'tile', tileMm: [800, 800] },
    }];

    expect(SceneDocumentSchema.safeParse(document).success).toBe(false);
  });

  it('rejects cabinet open-bay counts greater than the partition count', () => {
    const document = buildBlankDocument();
    document.assets = [{
      id: 'custom:cabinet', type: 'custom', name: '定制地柜', category: '餐厨',
      w: 1800, d: 600, h: 900, color: '#a47a52', tags: [],
      geometry: { shape: 'cabinet', parameters: { compartments: 3, openCompartments: 1, shelves: 2 } },
    }];
    document.levels[0].instances = [{
      id: 'cabinet-1', assetId: 'custom:cabinet', t: { x: 0, y: 0, rot: 0 },
      parameters: { openCompartments: 4 },
    }];

    const result = SceneDocumentSchema.safeParse(document);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((issue) => issue.path.at(-1) === 'openCompartments')).toBe(true);
  });

  it('rejects an invalid open-bay count in the cabinet asset definition', () => {
    const document = buildBlankDocument();
    document.assets = [{
      id: 'custom:cabinet', type: 'custom', name: '定制地柜', category: '餐厨',
      w: 1800, d: 600, h: 900, color: '#a47a52', tags: [],
      geometry: { shape: 'cabinet', parameters: { compartments: 2, openCompartments: 3 } },
    }];

    const result = SceneDocumentSchema.safeParse(document);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((issue) => issue.path.at(-1) === 'openCompartments')).toBe(true);
  });

  it('validates effective cabinet parameters inherited from the asset', () => {
    const document = buildBlankDocument();
    document.assets = [{
      id: 'custom:cabinet', type: 'custom', name: '定制地柜', category: '餐厨',
      w: 1800, d: 600, h: 900, color: '#a47a52', tags: [],
      geometry: { shape: 'cabinet', parameters: { compartments: 3, openCompartments: 2 } },
    }];
    document.levels[0].instances = [{
      id: 'cabinet-1', assetId: 'custom:cabinet', t: { x: 0, y: 0, rot: 0 },
      parameters: { compartments: 1 },
    }];

    const result = SceneDocumentSchema.safeParse(document);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((issue) => issue.path.at(-1) === 'openCompartments')).toBe(true);
  });
});
