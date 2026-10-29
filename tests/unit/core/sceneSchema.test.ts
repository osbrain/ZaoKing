import { describe, expect, it } from 'vitest';
import { buildBlankDocument, buildSeedDocument } from '@/core/seed';
import { SceneDocumentSchema } from '@/core/sceneSchema';

describe('SceneDocumentSchema', () => {
  it('accepts blank and seeded documents', () => {
    expect(SceneDocumentSchema.safeParse(buildBlankDocument()).success).toBe(true);
    expect(SceneDocumentSchema.safeParse(buildSeedDocument()).success).toBe(true);
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
