import type { Asset, Material, SceneDocument } from './types';

export function documentAssets(document: Pick<SceneDocument, 'assets' | 'assetSnapshots'>): Asset[] {
  return [...(document.assetSnapshots ?? []), ...(document.assets ?? [])];
}

export function documentMaterials(document: Pick<SceneDocument, 'materialSnapshots'>): Material[] {
  return document.materialSnapshots ?? [];
}
