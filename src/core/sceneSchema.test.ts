import { describe, expect, it } from 'vitest';
import { buildBlankDocument, buildSeedDocument } from './seed';
import { SceneDocumentSchema } from './sceneSchema';

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
});
