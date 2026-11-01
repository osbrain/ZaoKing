import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { assetById } from '@/core/assets';
import { COMPONENT_TEMPLATES } from '@/core/componentTemplates';
import type { CustomAsset } from '@/core/types';
import { createModelFactory, disposeModelGeometry } from '@/features/canvas3d/modelFactory';

describe('3D furniture model factory', () => {
  it.each([
    'bed-bunk-1000x2000',
    'fridge-single-300l',
    'fridge-side-by-side-600l',
    'fridge-cross-door-500l',
    'fridge-french-door-600l',
    'fridge-built-in-450l',
  ])('keeps %s within its declared dimensions', (id) => {
    const definition = assetById(id);
    expect(definition).toBeDefined();
    if (!definition) return;

    const environment = new THREE.Texture();
    const factory = createModelFactory(environment);
    const object = factory.buildFurniture({ ...definition, cx: 0, cy: 0, rot: 0 });
    const bounds = new THREE.Box3().setFromObject(object);
    const size = bounds.getSize(new THREE.Vector3());

    expect(size.x).toBeCloseTo(definition.w / 1000, 3);
    expect(size.y).toBeCloseTo(definition.h / 1000, 3);
    expect(size.z).toBeCloseTo(definition.d / 1000, 3);
    expect(bounds.min.y).toBeCloseTo(0, 3);

    disposeModelGeometry(object);
    factory.dispose();
    environment.dispose();
  });

  it('applies a per-instance height override to built-in furniture geometry', () => {
    const definition = assetById('a0_0');
    expect(definition).toBeDefined();
    if (!definition) return;

    const environment = new THREE.Texture();
    const factory = createModelFactory(environment);
    const object = factory.buildFurniture({ ...definition, h: 650, cx: 0, cy: 0, rot: 0 });
    const bounds = new THREE.Box3().setFromObject(object);

    expect(bounds.getSize(new THREE.Vector3()).y).toBeCloseTo(0.65, 4);
    expect(bounds.min.y).toBeCloseTo(0, 4);

    disposeModelGeometry(object);
    factory.dispose();
    environment.dispose();
  });

  it.each(['box', 'cylinder'] as const)('matches asset dimensions for a custom %s', (shape) => {
    const environment = new THREE.Texture();
    const factory = createModelFactory(environment);
    const asset: CustomAsset = {
      id: `custom:${shape}`,
      type: 'custom',
      name: '定制组件',
      category: '自定义',
      w: 1200,
      d: 400,
      h: 1800,
      color: '#c9b89f',
      tags: [],
      geometry: { shape },
    };
    const object = factory.buildFurniture({ ...asset, ...asset.geometry, cx: 0, cy: 0, rot: 0 });
    const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());

    expect(size.x).toBeCloseTo(1.2);
    expect(size.y).toBeCloseTo(1.8);
    expect(size.z).toBeCloseTo(0.4);

    disposeModelGeometry(object);
    factory.dispose();
    environment.dispose();
  });

  it('renders every supported custom template within its declared dimensions', () => {
    const environment = new THREE.Texture();
    const factory = createModelFactory(environment);

    for (const template of COMPONENT_TEMPLATES) {
      const asset: CustomAsset = {
        id: `custom:${template.shape}`,
        type: 'custom',
        name: template.name,
        category: template.category,
        w: template.dimensions.w,
        d: template.dimensions.d,
        h: template.dimensions.h,
        color: '#c9b89f',
        tags: [],
        geometry: { shape: template.shape, finish: template.finish, parameters: template.parameters },
      };
      const object = factory.buildFurniture({ ...asset, ...asset.geometry, cx: 0, cy: 0, rot: 0 });
      const bounds = new THREE.Box3().setFromObject(object);
      const size = bounds.getSize(new THREE.Vector3());

      expect(size.x, `${template.name} width`).toBeCloseTo(asset.w / 1000, 4);
      expect(size.y, `${template.name} height`).toBeCloseTo(asset.h / 1000, 4);
      expect(size.z, `${template.name} depth`).toBeCloseTo(asset.d / 1000, 4);
      expect(bounds.min.y, `${template.name} rests on the floor`).toBeCloseTo(0, 4);
      disposeModelGeometry(object);
    }

    factory.dispose();
    environment.dispose();
  });

  it('builds configurable open cabinet bays with shelves inside declared dimensions', () => {
    const environment = new THREE.Texture();
    const factory = createModelFactory(environment);
    const asset: CustomAsset = {
      id: 'custom:open-cabinet', type: 'custom', name: '开放格地柜', category: '餐厨',
      w: 1800, d: 600, h: 900, color: '#a47a52', tags: [],
      geometry: { shape: 'cabinet', finish: 'wood', parameters: { compartments: 3, openCompartments: 0, shelves: 0 } },
    };
    const closed = factory.buildFurniture({ ...asset, ...asset.geometry, cx: 0, cy: 0, rot: 0 });
    const open = factory.buildFurniture({
      ...asset, ...asset.geometry, parameters: { compartments: 3, openCompartments: 1, shelves: 4 }, cx: 0, cy: 0, rot: 0,
    });
    const openDetails = open.children[0];
    const closedDetails = closed.children[0];
    const bounds = new THREE.Box3().setFromObject(open);
    const size = bounds.getSize(new THREE.Vector3());

    expect(openDetails.children.length).toBeGreaterThan(closedDetails.children.length);
    expect(size.x).toBeCloseTo(1.8, 3);
    expect(size.y).toBeCloseTo(0.9, 3);
    expect(size.z).toBeCloseTo(0.6, 3);
    expect(bounds.min.y).toBeCloseTo(0, 3);

    disposeModelGeometry(closed);
    disposeModelGeometry(open);
    factory.dispose();
    environment.dispose();
  });

  it('keeps cabinet internals inside minimum-size asset dimensions', () => {
    const environment = new THREE.Texture();
    const factory = createModelFactory(environment);
    const asset: CustomAsset = {
      id: 'custom:tiny-cabinet', type: 'custom', name: '窄柜', category: '餐厨',
      w: 10, d: 10, h: 10, color: '#a47a52', tags: [],
      geometry: { shape: 'cabinet', finish: 'wood', parameters: { compartments: 8, openCompartments: 8, shelves: 12 } },
    };
    const model = factory.buildFurniture({ ...asset, ...asset.geometry, cx: 0, cy: 0, rot: 0 });
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());

    expect(size.x).toBeLessThanOrEqual(.010001);
    expect(size.y).toBeLessThanOrEqual(.010001);
    expect(size.z).toBeLessThanOrEqual(.010001);

    disposeModelGeometry(model);
    factory.dispose();
    environment.dispose();
  });
});
