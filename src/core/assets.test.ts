import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { assetById, resolveAssetByQuery } from './assets';
import { applyCmds } from './commands';
import { buildBlankDocument } from './seed';
import { instanceRef, type CustomAsset } from './types';
import { SceneDocumentSchema } from './sceneSchema';
import { instAABB } from './geometry';
import { executeOps } from './ops';
import { furnSVG } from './symbols2d';
import { createModelFactory, disposeModelGeometry } from '../features/canvas3d/modelFactory';
import { COMPONENT_TEMPLATES } from './componentTemplates';
import { CustomAssetSchema } from './assetSchema';

const asset: CustomAsset = {
  id: 'custom:console', type: 'custom', name: '定制玄关柜', category: '客厅',
  w: 1200, d: 400, h: 1800, color: '#c9b89f', tags: ['Console'], geometry: { shape: 'box' },
};
const instance = { id: 'instance-1', assetId: asset.id, t: { x: 2000, y: 2000, rot: 90 } };

describe('project component definitions', () => {
  it('round-trips a definition and its placed instance through scene serialization', () => {
    const original = buildBlankDocument();
    const document = applyCmds(original, [{ type: 'addAsset', asset }, { type: 'place', inst: instance }]);
    const restored = SceneDocumentSchema.parse(JSON.parse(JSON.stringify(document)));
    expect(original.assets).toBeUndefined();
    expect(assetById(instance.assetId, restored.assets)).toEqual(asset);
    expect(instanceRef(restored.levels[0].instances[0], restored.assets![0])).toMatchObject({ w: 1200, d: 400, h: 1800, name: '定制玄关柜' });
  });

  it('rejects duplicate definitions, invalid sizes, and missing asset references', () => {
    const document = applyCmds(buildBlankDocument(), [{ type: 'addAsset', asset }]);
    expect(() => applyCmds(document, [{ type: 'addAsset', asset }])).toThrow();
    expect(() => applyCmds(document, [{ type: 'deleteAsset', id: 'custom:missing' }])).toThrow(/不存在/);
    expect(() => applyCmds(document, [{ type: 'updateAsset', asset: { ...asset, h: -1 } }])).toThrow();
    expect(SceneDocumentSchema.safeParse({ ...document, assets: [asset, asset] }).success).toBe(false);
    document.levels[0].instances.push({ ...instance, assetId: 'custom:missing' });
    expect(SceneDocumentSchema.safeParse(document).success).toBe(false);
  });

  it('updates shared defaults while preserving instance overrides, including height', () => {
    const document = applyCmds(buildBlankDocument(), [
      { type: 'addAsset', asset }, { type: 'place', inst: instance },
      { type: 'resize', id: instance.id, size: { w: 900, h: 1900 } },
      { type: 'updateAsset', asset: { ...asset, w: 1600, d: 700, h: 2100 } },
      { type: 'resize', id: instance.id, size: { w: 1000 } },
    ]);
    expect(instanceRef(document.levels[0].instances[0], document.assets![0])).toMatchObject({ w: 1000, d: 700, h: 1900 });
    expect(document.assets![0]).toMatchObject({ w: 1600, d: 700, h: 2100 });
  });

  it('protects definitions used on any level and respects command ordering when removing instances', () => {
    const document = buildBlankDocument();
    document.assets = [asset];
    document.levels.push({ ...structuredClone(document.levels[0]), id: 'lv2', instances: [instance] });
    expect(() => applyCmds(document, [{ type: 'deleteAsset', id: asset.id }])).toThrow(/使用/);
    const updated = applyCmds(document, [{ levelId: 'lv2', type: 'delete', id: instance.id }, { type: 'deleteAsset', id: asset.id }]);
    expect(updated.assets).toEqual([]);
    expect(document.levels[1].instances).toHaveLength(1);
  });

  it('uses project definitions for search, AI lookup, and rotated collision bounds', () => {
    expect(resolveAssetByQuery('CONSOLE', [asset])?.id).toBe(asset.id);
    expect(instAABB(instance, [asset])).toEqual({ hw: expect.closeTo(200), hh: expect.closeTo(600) });
    const document = buildBlankDocument();
    document.assets = [asset];
    document.levels[0].rooms = [{ id: 'room', name: '客厅', floorMaterialId: 'wood', poly: [[0, 0], [6000, 0], [6000, 6000], [0, 6000]] }];
    const outcome = executeOps(document, [{ op: 'add_component', query: '定制玄关柜' }]);
    expect(outcome.cmds[0]).toMatchObject({ type: 'place', inst: { assetId: asset.id } });
  });
});

describe('declarative component rendering', () => {
  it('renders an ellipse in 2D and sanitizes color attributes', () => {
    expect(furnSVG('custom', 1200, 400, asset.color, { shape: 'cylinder' })).toContain('rx="576" ry="192"');
    expect(furnSVG('custom', 1200, 400, '" onload="alert(1)', { shape: 'box' })).not.toContain('onload');
  });

  it.each(['box', 'cylinder'] as const)('matches the declared width, depth, and height for a 3D %s', shape => {
    const environment = new THREE.Texture();
    const factory = createModelFactory(environment);
    const object = factory.buildFurniture({ ...asset, shape, cx: 0, cy: 0, rot: 0 });
    const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(1.2);
    expect(size.y).toBeCloseTo(1.8);
    expect(size.z).toBeCloseTo(0.4);
    disposeModelGeometry(object); factory.dispose(); environment.dispose();
  });

  it('provides a bounded 2D and 3D template for every custom furniture category', () => {
    expect(COMPONENT_TEMPLATES.length).toBeGreaterThanOrEqual(20);
    const environment = new THREE.Texture();
    const factory = createModelFactory(environment);
    for (const template of COMPONENT_TEMPLATES) {
      const customAsset: CustomAsset = {
        ...asset,
        id: `custom:${template.shape}`,
        name: template.name,
        category: template.category,
        w: template.dimensions.w,
        d: template.dimensions.d,
        h: template.dimensions.h,
        geometry: { shape: template.shape, finish: template.finish, parameters: template.parameters },
      };
      expect(() => CustomAssetSchema.parse(customAsset), template.name).not.toThrow();
      expect(furnSVG('custom', customAsset.w, customAsset.d, customAsset.color, customAsset.geometry), template.name).not.toBe('');
      const object = factory.buildFurniture({ ...customAsset, ...customAsset.geometry, cx: 0, cy: 0, rot: 0 });
      const bounds = new THREE.Box3().setFromObject(object);
      const size = bounds.getSize(new THREE.Vector3());
      expect(size.x, `${template.name} width`).toBeCloseTo(customAsset.w / 1000, 4);
      expect(size.y, `${template.name} height`).toBeCloseTo(customAsset.h / 1000, 4);
      expect(size.z, `${template.name} depth`).toBeCloseTo(customAsset.d / 1000, 4);
      expect(bounds.min.y, `${template.name} rests on the floor`).toBeCloseTo(0, 4);
      disposeModelGeometry(object);
    }
    factory.dispose();
    environment.dispose();
  });
});
