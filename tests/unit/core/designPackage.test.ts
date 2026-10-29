import { describe, expect, it } from 'vitest';
import { applyCmds } from '@/core/commands';
import { createDesignPackage, DESIGN_PACKAGE_FORMAT, MAX_DESIGN_PACKAGE_BYTES, parseDesignPackage, serializeDesignPackage } from '@/core/designPackage';
import { buildBlankDocument, buildSeedDocument } from '@/core/seed';
import { SceneDocumentSchema } from '@/core/sceneSchema';
import { assetById, materialById } from '@/core/assets';
import { executeOps } from '@/core/ops';

describe('portable design packages', () => {
  it('round-trips room layout, used asset definitions, and material render parameters', () => {
    const source = buildSeedDocument('可移植方案');
    const exported = createDesignPackage(source);

    expect(exported.format).toBe(DESIGN_PACKAGE_FORMAT);
    expect(exported.document.assetSnapshots).toBeUndefined();
    expect(exported.assetManifest.length).toBeGreaterThan(0);
    expect(exported.materialManifest.some(material => material.id === 'tile800')).toBe(true);

    const imported = parseDesignPackage(JSON.stringify(exported));
    expect(imported.document.levels).toEqual(source.levels);
    expect(imported.document.assetSnapshots?.length).toBe(exported.assetManifest.length);
    expect(assetById('a1_5', imported.document.assetSnapshots)).toEqual(assetById('a1_5'));
    expect(materialById('tile800', imported.document.materialSnapshots).render).toEqual(materialById('tile800').render);
    expect(SceneDocumentSchema.safeParse(imported.document).success).toBe(true);
  });

  it('includes custom definitions and their placed instance parameters', () => {
    const asset = {
      id: 'custom:package-shelf', type: 'custom' as const, name: '可移植书架', category: '书房',
      w: 1200, d: 350, h: 2100, color: '#a47a52', tags: ['书架'],
      geometry: { shape: 'bookcase' as const, finish: 'wood' as const, parameters: { compartments: 3, shelves: 5 } },
    };
    const source = applyCmds(buildBlankDocument('含自定义组件'), [
      { type: 'addAsset', asset },
      { type: 'place', inst: { id: 'placed-shelf', assetId: asset.id, t: { x: 1000, y: 1000, rot: 0 }, parameters: { shelves: 7 } } },
    ]);

    const exported = createDesignPackage(source);
    const imported = parseDesignPackage(JSON.stringify(exported)).document;
    const previousFormatPackage = { ...exported, assetManifest: [...exported.assetManifest, asset] };
    const previousFormatImport = parseDesignPackage(JSON.stringify(previousFormatPackage)).document;
    expect(imported.assets).toEqual([asset]);
    expect(exported.assetManifest.some((definition) => definition.id === asset.id)).toBe(false);
    expect(previousFormatImport.assets).toEqual([asset]);
    expect(imported.levels[0].instances[0]).toMatchObject({ assetId: asset.id, parameters: { shelves: 7 } });
    expect(imported.assetSnapshots).toEqual([]);
  });

  it('keeps imported asset and material snapshots available to AI operations', () => {
    const source = buildBlankDocument('可检索方案');
    source.levels[0].rooms = [{
      id: 'living', name: '客厅', floorMaterialId: 'material:stone',
      poly: [[0, 0], [6000, 0], [6000, 6000], [0, 6000]],
    }];
    source.assetSnapshots = [{
      id: 'vendor:sofa-2400', type: 'sofa', name: '雾蓝三人沙发', category: '客厅',
      w: 2400, d: 900, h: 850, color: '#587c91', tags: ['雾蓝', '三人沙发'],
    }];
    source.materialSnapshots = [{
      id: 'material:stone', name: '自定义浅灰石材', price: 520, sw: '#c4c5c2',
      render: { pattern: 'marble', tileMm: [900, 900], roughness: 0.35 },
    }];

    const imported = parseDesignPackage(serializeDesignPackage(source)).document;
    const exportedAgain = createDesignPackage(imported);
    const reimported = parseDesignPackage(JSON.stringify(exportedAgain)).document;
    const placement = executeOps(imported, [{ op: 'add_component', room: '客厅', query: '雾蓝三人沙发' }]);
    const material = executeOps(imported, [{ op: 'set_floor_material', room: '客厅', query: '自定义浅灰石材' }]);

    expect(exportedAgain.assetManifest).toContainEqual(source.assetSnapshots[0]);
    expect(exportedAgain.materialManifest).toContainEqual(source.materialSnapshots[0]);
    expect(reimported.assetSnapshots).toContainEqual(source.assetSnapshots[0]);
    expect(reimported.materialSnapshots).toContainEqual(source.materialSnapshots[0]);
    expect(placement.cmds[0]).toMatchObject({ type: 'place', inst: { assetId: 'vendor:sofa-2400' } });
    expect(material.cmds).toEqual([{ levelId: 'lv1', type: 'setRoomMaterial', roomId: 'living', materialId: 'material:stone' }]);
  });

  it('accepts the previous raw scene document format and reports conversion', () => {
    const imported = parseDesignPackage(JSON.stringify(buildSeedDocument('旧格式')));
    expect(imported.source).toBe('scene-document');
    expect(imported.warnings[0]).toContain('旧版');
    expect(imported.document.assetSnapshots?.length).toBeGreaterThan(0);
  });

  it('rejects malformed files and packages with missing asset definitions', () => {
    expect(() => parseDesignPackage('{bad')).toThrow('有效的 JSON');
    expect(() => parseDesignPackage(' '.repeat(MAX_DESIGN_PACKAGE_BYTES + 1))).toThrow('不能超过 15 MB');
    const exported = createDesignPackage(buildSeedDocument());
    exported.assetManifest = [];
    expect(() => parseDesignPackage(JSON.stringify(exported))).toThrow('缺少组件定义');
  });

  it('rejects conflicting duplicate custom component definitions', () => {
    const source = buildBlankDocument('冲突组件');
    const customAsset = {
      id: 'custom:conflict-shelf', type: 'custom' as const, name: '书架', category: '书房',
      w: 900, d: 300, h: 1800, color: '#9b7653', tags: ['书架'], geometry: { shape: 'bookcase' as const },
    };
    const exported = createDesignPackage({ ...source, assets: [customAsset] });
    exported.assetManifest.push({ ...customAsset, name: '不同定义' });

    expect(() => parseDesignPackage(JSON.stringify(exported))).toThrow('组件定义冲突');
  });
});
