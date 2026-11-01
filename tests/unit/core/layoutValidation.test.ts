import { describe, expect, it } from 'vitest';
import { analyzeLevelLayout, orientedRectCorners, orientedRectanglesOverlap, validateComponentPlacement } from '@/core/geometry';
import { resolveAssetByQuery } from '@/core/assets';
import { buildBlankDocument, buildSeedDocument } from '@/core/seed';

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

  it('rejects furniture that occupies a hinged door swing area', () => {
    const doc = buildBlankDocument();
    const level = doc.levels[0];
    const sofa = resolveAssetByQuery('三人沙发')!;
    level.rooms.push({ id: 'living', name: '客厅', poly: [[0, 0], [5000, 0], [5000, 5000], [0, 5000]], floorMaterialId: 'wood' });
    level.openings.push({
      id: 'living-door', kind: 'door', rect: [1400, 1400, 1600, 2300], height: 2100, sill: 0,
      hinge: [1500, 1500], openDir: [1, 0], closeDir: [0, 1], span: 900,
    });
    const instance = { id: 'sofa', assetId: sofa.id, t: { x: 1900, y: 1900, rot: 0 }, size: { w: 300, d: 300 } };
    level.instances = [instance];

    expect(validateComponentPlacement(level, instance, [sofa]).issues.map((issue) => issue.code)).toContain('door-swing');
    expect(analyzeLevelLayout(level, [sofa])).toContainEqual(expect.objectContaining({
      code: 'door-swing', instanceId: 'sofa', message: '与房门开启范围重叠，建议核对门向或移动家具',
    }));
  });

  it('does not treat sliding doors or furniture outside the swing arc as hinged-door conflicts', () => {
    const doc = buildBlankDocument();
    const level = doc.levels[0];
    const sofa = resolveAssetByQuery('三人沙发')!;
    level.rooms.push({ id: 'living', name: '客厅', poly: [[0, 0], [5000, 0], [5000, 5000], [0, 5000]], floorMaterialId: 'wood' });
    level.openings.push({ id: 'slider', kind: 'sliding', rect: [1400, 1400, 1600, 2300], height: 2400, sill: 0 });
    const instance = { id: 'sofa', assetId: sofa.id, t: { x: 3400, y: 1500, rot: 0 }, size: { w: 300, d: 300 } };

    expect(validateComponentPlacement(level, instance, [sofa]).valid).toBe(true);
    expect(analyzeLevelLayout(level, [sofa])).toEqual([]);
  });

  it('flags furniture that blocks a sliding-door opening without reporting a hinged swing', () => {
    const doc = buildBlankDocument();
    const level = doc.levels[0];
    const sofa = resolveAssetByQuery('三人沙发')!;
    level.rooms.push({ id: 'living', name: '客厅', poly: [[0, 0], [5000, 0], [5000, 5000], [0, 5000]], floorMaterialId: 'wood' });
    level.openings.push({ id: 'slider', kind: 'sliding', rect: [1400, 1400, 1600, 2300], height: 2400, sill: 0 });
    const instance = { id: 'sofa', assetId: sofa.id, t: { x: 1500, y: 1850, rot: 0 }, size: { w: 300, d: 300 } };

    const issues = validateComponentPlacement(level, instance, [sofa]).issues;
    expect(issues.map((issue) => issue.code)).toContain('opening-blocked');
    expect(issues.map((issue) => issue.code)).not.toContain('door-swing');
  });

  it('checks the selected wall-pocket side for horizontal and vertical sliding doors', () => {
    const doc = buildBlankDocument();
    const level = doc.levels[0];
    const sofa = resolveAssetByQuery('三人沙发')!;
    level.rooms.push({ id: 'living', name: '客厅', poly: [[0, 0], [5000, 0], [5000, 5000], [0, 5000]], floorMaterialId: 'wood' });
    level.openings.push({ id: 'horizontal-slider', kind: 'sliding', rect: [1000, 2400, 3000, 2600], height: 2400, sill: 0, vertical: false, slideMode: 'pocket-start' });
    level.instances = [{ id: 'sofa', assetId: sofa.id, t: { x: 600, y: 2500, rot: 0 }, size: { w: 400, d: 400 } }];

    expect(analyzeLevelLayout(level, [sofa])).toContainEqual(expect.objectContaining({
      code: 'sliding-pocket', severity: 'review', openingId: 'horizontal-slider', relatedInstanceId: 'sofa',
      message: expect.stringContaining('左端'),
    }));

    level.instances[0] = { ...level.instances[0], t: { x: 3600, y: 2500, rot: 0 }, size: { w: 600, d: 400 } };
    expect(analyzeLevelLayout(level, [sofa]).some((check) => check.code === 'sliding-pocket')).toBe(false);
    level.openings[0].slideMode = 'pocket-end';
    expect(analyzeLevelLayout(level, [sofa])).toContainEqual(expect.objectContaining({
      code: 'sliding-pocket', openingId: 'horizontal-slider', relatedInstanceId: 'sofa',
      message: expect.stringContaining('右端'),
    }));

    level.instances[0] = { ...level.instances[0], t: { x: 4400, y: 2500, rot: 0 } };
    expect(analyzeLevelLayout(level, [sofa]).some((check) => check.code === 'sliding-pocket')).toBe(false);

    level.openings = [{ id: 'vertical-slider', kind: 'sliding', rect: [2400, 1000, 2600, 3000], height: 2400, sill: 0, vertical: true, slideMode: 'pocket-start' }];
    level.instances[0] = { ...level.instances[0], t: { x: 2500, y: 600, rot: 0 } };
    expect(analyzeLevelLayout(level, [sofa])).toContainEqual(expect.objectContaining({
      code: 'sliding-pocket', severity: 'review', openingId: 'vertical-slider', relatedInstanceId: 'sofa',
      message: expect.stringContaining('上端'),
    }));
  });

  it('does not flag the built-in example layout for sliding-door pocket obstruction', () => {
    const level = buildSeedDocument().levels[0];

    expect(analyzeLevelLayout(level).filter((check) => check.code === 'sliding-pocket')).toEqual([]);
  });

  it('reports tight sofa-to-coffee-table clearance as a review suggestion with measured distance', () => {
    const doc = buildBlankDocument();
    const level = doc.levels[0];
    const sofa = resolveAssetByQuery('三人沙发')!;
    const table = resolveAssetByQuery('茶几')!;
    const assets = [sofa, table];
    level.rooms.push({ id: 'living', name: '客厅', poly: [[0, 0], [5000, 0], [5000, 5000], [0, 5000]], floorMaterialId: 'wood' });
    level.instances = [
      { id: 'sofa', assetId: sofa.id, t: { x: 1500, y: 2000, rot: 0 }, size: { w: 2000, d: 800 } },
      { id: 'table', assetId: table.id, t: { x: 1500, y: 2825, rot: 0 }, size: { w: 1000, d: 500 } },
    ];

    expect(analyzeLevelLayout(level, assets)).toContainEqual(expect.objectContaining({
      code: 'usage-clearance',
      severity: 'review',
      instanceId: 'sofa',
      relatedInstanceId: 'table',
      message: expect.stringContaining('175 mm'),
    }));
  });

  it('does not report usage clearance when the furniture has sufficient space or belongs to another room', () => {
    const doc = buildBlankDocument();
    const level = doc.levels[0];
    const bed = resolveAssetByQuery('双人床')!;
    const wardrobe = resolveAssetByQuery('衣柜')!;
    level.rooms.push(
      { id: 'bedroom', name: '卧室', poly: [[0, 0], [5000, 0], [5000, 5000], [0, 5000]], floorMaterialId: 'wood' },
      { id: 'study', name: '书房', poly: [[6000, 0], [9000, 0], [9000, 4000], [6000, 4000]], floorMaterialId: 'wood' },
    );
    level.instances = [
      { id: 'bed', assetId: bed.id, t: { x: 2000, y: 2000, rot: 0 } },
      { id: 'wardrobe', assetId: wardrobe.id, t: { x: 2000, y: 4000, rot: 0 } },
    ];

    expect(analyzeLevelLayout(level, [bed, wardrobe]).some((check) => check.code === 'usage-clearance')).toBe(false);
    level.instances[1] = { ...level.instances[1], t: { x: 7500, y: 2000, rot: 0 } };
    expect(analyzeLevelLayout(level, [bed, wardrobe]).some((check) => check.code === 'usage-clearance')).toBe(false);
  });

  it('estimates the narrowest 1 m door approach and reports the measured free width', () => {
    const doc = buildBlankDocument();
    const level = doc.levels[0];
    const sofa = resolveAssetByQuery('三人沙发')!;
    level.rooms.push({ id: 'living', name: '客厅', poly: [[0, 0], [5000, 0], [5000, 5000], [0, 5000]], floorMaterialId: 'wood' });
    level.openings.push({ id: 'entry', kind: 'entry', rect: [1400, 1400, 1600, 2300], height: 2100, sill: 0 });
    level.instances = [{
      id: 'sofa', assetId: sofa.id, t: { x: 2000, y: 1850, rot: 0 }, size: { w: 800, d: 800 },
    }];

    expect(analyzeLevelLayout(level, [sofa])).toContainEqual(expect.objectContaining({
      code: 'aisle-clearance',
      severity: 'review',
      openingId: 'entry',
      message: expect.stringContaining('50 mm'),
    }));
  });

  it('checks refrigerator front access in the component facing direction', () => {
    const doc = buildBlankDocument();
    const level = doc.levels[0];
    const fridge = resolveAssetByQuery('双开门冰箱')!;
    const sofa = resolveAssetByQuery('三人沙发')!;
    const assets = [fridge, sofa];
    level.rooms.push({ id: 'kitchen', name: '厨房', poly: [[0, 0], [5000, 0], [5000, 5000], [0, 5000]], floorMaterialId: 'wood' });
    level.instances = [
      { id: 'fridge', assetId: fridge.id, t: { x: 2000, y: 2000, rot: 0 }, size: { w: 700, d: 700 } },
      { id: 'sofa', assetId: sofa.id, t: { x: 2000, y: 2900, rot: 0 }, size: { w: 500, d: 500 } },
    ];

    expect(analyzeLevelLayout(level, assets)).toContainEqual(expect.objectContaining({
      code: 'front-access-clearance',
      severity: 'review',
      instanceId: 'fridge',
      relatedInstanceId: 'sofa',
      message: expect.stringContaining('300 mm'),
    }));

    level.instances[1] = { ...level.instances[1], t: { x: 2000, y: 1000, rot: 0 } };
    expect(analyzeLevelLayout(level, assets).some((check) => check.code === 'front-access-clearance')).toBe(false);

    level.instances[0] = { ...level.instances[0], t: { ...level.instances[0].t, rot: 180 } };
    expect(analyzeLevelLayout(level, assets)).toContainEqual(expect.objectContaining({
      code: 'front-access-clearance',
      instanceId: 'fridge',
      relatedInstanceId: 'sofa',
      message: expect.stringContaining('400 mm'),
    }));
  });

  it('checks clearance for modeled drawer fronts', () => {
    const doc = buildBlankDocument();
    const level = doc.levels[0];
    const nightstand = resolveAssetByQuery('床头柜')!;
    const sofa = resolveAssetByQuery('三人沙发')!;
    level.rooms.push({ id: 'bedroom', name: '卧室', poly: [[0, 0], [5000, 0], [5000, 5000], [0, 5000]], floorMaterialId: 'wood' });
    level.instances = [
      { id: 'nightstand', assetId: nightstand.id, t: { x: 2500, y: 2000, rot: 0 } },
      { id: 'sofa', assetId: sofa.id, t: { x: 2500, y: 2550, rot: 0 }, size: { w: 500, d: 500 } },
    ];

    expect(analyzeLevelLayout(level, [nightstand, sofa])).toContainEqual(expect.objectContaining({
      code: 'front-access-clearance',
      instanceId: 'nightstand',
      relatedInstanceId: 'sofa',
      message: expect.stringContaining('100 mm'),
    }));
  });
});
