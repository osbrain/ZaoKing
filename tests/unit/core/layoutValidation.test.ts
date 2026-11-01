import { describe, expect, it } from 'vitest';
import { analyzeLevelLayout, orientedRectCorners, orientedRectanglesOverlap, validateComponentPlacement } from '@/core/geometry';
import { resolveAssetByQuery } from '@/core/assets';
import { buildBlankDocument } from '@/core/seed';

describe('shared layout constraints', () => {
  it('uses oriented rectangles so rotated furniture does not get false-positive AABB collisions', () => {
    const asset = resolveAssetByQuery('三人沙发')!;
    const a = orientedRectCorners({ id: 'a', assetId: asset.id, t: { x: 0, y: 0, rot: 45 }, size: { w: 2000, d: 2000 } }, [asset]);
    const b = orientedRectCorners({ id: 'b', assetId: asset.id, t: { x: 1768, y: 1768, rot: 45 }, size: { w: 2000, d: 2000 } }, [asset]);

    expect(orientedRectanglesOverlap(a, b)).toBe(false);
    expect(orientedRectanglesOverlap(a, orientedRectCorners({
      id: 'c', assetId: asset.id, t: { x: 1061, y: 1061, rot: 45 }, size: { w: 2000, d: 2000 },
    }, [asset]))).toBe(true);
  });

  it('checks room boundaries and furniture collisions while allowing rugs beneath furniture', () => {
    const doc = buildBlankDocument();
    const level = doc.levels[0];
    const assets = [resolveAssetByQuery('三人沙发')!, resolveAssetByQuery('地毯')!];
    level.rooms.push({ id: 'living', name: '客厅', poly: [[0, 0], [5000, 0], [5000, 5000], [0, 5000]], floorMaterialId: 'wood' });
    const sofa = { id: 'sofa', assetId: assets[0].id, t: { x: 1200, y: 2500, rot: 0 } };
    const rug = { id: 'rug', assetId: assets[1].id, t: { x: 1200, y: 2500, rot: 0 }, size: { w: 2400, d: 1700 } };
    level.instances = [sofa, rug];

    expect(validateComponentPlacement(level, sofa, assets).valid).toBe(true);
    expect(validateComponentPlacement(level, { ...sofa, t: { x: 1000, y: 2500, rot: 0 } }, assets).issues[0].code).toBe('outside-room');
    expect(analyzeLevelLayout(level, assets)).toEqual([]);

    level.instances.push({ id: 'sofa-2', assetId: assets[0].id, t: { x: 1400, y: 2500, rot: 0 }, size: { w: 1000, d: 800 } });
    expect(analyzeLevelLayout(level, assets).some((issue) => issue.code === 'overlap')).toBe(true);
  });

  it('allows cooktops and sinks to sit on kitchen counters without allowing furniture to overlap them', () => {
    const doc = buildBlankDocument();
    const level = doc.levels[0];
    level.rooms.push({ id: 'kitchen', name: '厨房', poly: [[0, 0], [5000, 0], [5000, 5000], [0, 5000]], floorMaterialId: 'wood' });
    const counter = resolveAssetByQuery('橱柜台面')!;
    const stove = resolveAssetByQuery('燃气灶')!;
    const sink = resolveAssetByQuery('水槽')!;
    const sofa = resolveAssetByQuery('三人沙发')!;
    const assets = [counter, stove, sink, sofa];
    const counterInstance = { id: 'counter', assetId: counter.id, t: { x: 2500, y: 2500, rot: 90 } };
    const stoveInstance = { id: 'stove', assetId: stove.id, t: { x: 2500, y: 2000, rot: 90 } };
    const sinkInstance = { id: 'sink', assetId: sink.id, t: { x: 2500, y: 3000, rot: 90 } };
    level.instances = [counterInstance, stoveInstance, sinkInstance];

    expect(validateComponentPlacement(level, stoveInstance, assets).valid).toBe(true);
    expect(validateComponentPlacement(level, sinkInstance, assets).valid).toBe(true);
    expect(analyzeLevelLayout(level, assets)).toEqual([]);
    expect(validateComponentPlacement(level, {
      id: 'sofa', assetId: sofa.id, t: { x: 2500, y: 2500, rot: 0 }, size: { w: 500, d: 500 },
    }, assets).issues[0].code).toBe('overlap');
  });

  it('rejects furniture that bridges a concave cutout even when all four corners are inside', () => {
    const doc = buildBlankDocument();
    const level = doc.levels[0];
    const sofa = resolveAssetByQuery('三人沙发')!;
    level.rooms.push({
      id: 'c-room', name: 'C 形房间',
      poly: [[0, 0], [4000, 0], [4000, 1000], [1000, 1000], [1000, 3000], [4000, 3000], [4000, 4000], [0, 4000]],
      floorMaterialId: 'wood',
    });
    const instance = { id: 'sofa', assetId: sofa.id, t: { x: 1000, y: 2000, rot: 0 }, size: { w: 2000, d: 3000 } };

    expect(validateComponentPlacement(level, instance, [sofa]).issues[0].code).toBe('outside-room');
  });
});
