import { AssetDefinitionSchema, CustomAssetSchema } from './assetSchema';
import { assetById, assetCatalog, materialCatalog } from './assets';
import { MaterialSchema } from './materialSchema';
import { SceneDocumentSchema } from './sceneSchema';
import { documentAssets, documentMaterials } from './sceneResources';
import type { Asset, Material, SceneDocument } from './types';
import { z } from 'zod';

export const DESIGN_PACKAGE_FORMAT = 'zaoking.design';
export const DESIGN_PACKAGE_VERSION = 1;
export const ASSET_CATALOG_VERSION = '1';
export const MAX_DESIGN_PACKAGE_BYTES = 15 * 1024 * 1024;
const MAX_ASSET_MANIFEST_ENTRIES = 2000 + assetCatalog().length;
const MAX_MATERIAL_MANIFEST_ENTRIES = 1000 + materialCatalog().length;

const DesignPackageSchema = z.object({
  format: z.literal(DESIGN_PACKAGE_FORMAT),
  formatVersion: z.literal(DESIGN_PACKAGE_VERSION),
  catalogVersion: z.string().min(1).max(40),
  exportedAt: z.string().datetime(),
  document: z.unknown(),
  assetManifest: z.array(AssetDefinitionSchema).max(MAX_ASSET_MANIFEST_ENTRIES),
  materialManifest: z.array(MaterialSchema).max(MAX_MATERIAL_MANIFEST_ENTRIES),
}).strict();

export interface DesignPackage {
  format: typeof DESIGN_PACKAGE_FORMAT;
  formatVersion: typeof DESIGN_PACKAGE_VERSION;
  catalogVersion: string;
  exportedAt: string;
  document: SceneDocument;
  assetManifest: Asset[];
  materialManifest: Material[];
}

export interface ParsedDesignPackage {
  document: SceneDocument;
  source: 'package' | 'scene-document';
  warnings: string[];
}

function uniqueById<T extends { id: string }>(items: readonly T[], kind: string): T[] {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) throw new Error(`项目包中的${kind} ID 重复：${item.id}`);
    seen.add(item.id);
  }
  return [...items];
}

function stripSnapshots(document: SceneDocument): SceneDocument {
  const { assetSnapshots: _assetSnapshots, materialSnapshots: _materialSnapshots, ...portable } = document;
  return portable;
}

export function createDesignPackage(document: SceneDocument): DesignPackage {
  const validated = SceneDocumentSchema.parse(document) as SceneDocument;
  const allAssets = documentAssets(validated);
  const usedAssetIds = new Set(validated.levels.flatMap((level) => level.instances.map((instance) => instance.assetId)));
  const assetManifest = uniqueById([
    ...(validated.assetSnapshots ?? []),
    ...[...usedAssetIds]
      .filter((id) => !allAssets.some((asset) => asset.id === id))
      .map((id) => assetById(id, allAssets))
      .filter((asset): asset is Asset => Boolean(asset)),
  ], '组件');

  const materialIds = new Set(validated.levels.flatMap((level) => level.rooms.map((room) => room.floorMaterialId)));
  const allMaterials = materialCatalog(documentMaterials(validated));
  const materialManifest = uniqueById(
    [
      ...documentMaterials(validated),
      ...[...materialIds]
        .filter((id) => !validated.materialSnapshots?.some((material) => material.id === id))
        .map((id) => allMaterials.find((material) => material.id === id))
        .filter((material): material is Material => Boolean(material)),
    ],
    '材质',
  );
  const parsed = DesignPackageSchema.parse({
    format: DESIGN_PACKAGE_FORMAT,
    formatVersion: DESIGN_PACKAGE_VERSION,
    catalogVersion: ASSET_CATALOG_VERSION,
    exportedAt: new Date().toISOString(),
    document: stripSnapshots(validated),
    assetManifest,
    materialManifest,
  });
  return parsed as DesignPackage;
}

function hydrateResources(document: SceneDocument, assets: Asset[], materials: Material[]): SceneDocument {
  const customAssets = new Map((document.assets ?? []).map((asset) => [asset.id, asset]));
  const assetSnapshots: Asset[] = [];
  for (const asset of assets) {
    if (!asset.id.startsWith('custom:')) {
      assetSnapshots.push(asset);
      continue;
    }
    const customAsset = CustomAssetSchema.parse(asset);
    const existing = customAssets.get(customAsset.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(customAsset)) {
      throw new Error(`项目包中的组件定义冲突：${customAsset.id}`);
    }
    customAssets.set(customAsset.id, customAsset);
  }

  const hydrated: SceneDocument = { ...document, assetSnapshots, materialSnapshots: materials };
  if (customAssets.size) hydrated.assets = [...customAssets.values()];
  else if (!document.assets?.length) delete hydrated.assets;
  return SceneDocumentSchema.parse(hydrated) as SceneDocument;
}

function parsePackage(value: unknown): ParsedDesignPackage {
  const parsed = DesignPackageSchema.parse(value);
  const assets = uniqueById(parsed.assetManifest, '组件');
  const materials = uniqueById(parsed.materialManifest, '材质');
  const rawDocument = z.object({ assets: z.array(CustomAssetSchema).optional() }).passthrough().parse(parsed.document);
  // Full scene validation runs after the manifests have been hydrated below.
  const document = rawDocument as unknown as SceneDocument;
  const customIds = new Set((document.assets ?? []).map((asset) => asset.id));
  const assetIds = new Set(assets.map((asset) => asset.id));
  for (const id of customIds) assetIds.add(id);
  const structuralDocument = z.object({
    levels: z.array(z.object({
      instances: z.array(z.object({ assetId: z.string() }).passthrough()),
      rooms: z.array(z.object({ floorMaterialId: z.string() }).passthrough()),
    }).passthrough()),
  }).passthrough().parse(parsed.document);
  const usedAssetIds = new Set(structuralDocument.levels.flatMap((level) => level.instances.map((instance) => instance.assetId)));
  const knownAssetIds = new Set([...assetCatalog(assets).map((asset) => asset.id), ...customIds]);
  const missingAssets = [...usedAssetIds].filter((id) => !assetIds.has(id) || !knownAssetIds.has(id));
  if (missingAssets.length) throw new Error(`项目包缺少组件定义：${missingAssets.join('、')}`);

  const materialIds = new Set(materials.map((material) => material.id));
  const knownMaterials = new Set(materialCatalog(materials).map((material) => material.id));
  const missingMaterialIds = [...new Set(structuralDocument.levels.flatMap((level) => level.rooms.map((room) => room.floorMaterialId)))]
    .filter((id) => !materialIds.has(id) || !knownMaterials.has(id));
  if (missingMaterialIds.length) throw new Error(`项目包缺少地面材质定义：${missingMaterialIds.join('、')}`);

  const hydrated = hydrateResources(document, assets, materials);

  const warnings = parsed.catalogVersion === ASSET_CATALOG_VERSION
    ? []
    : [`文件使用资产目录版本 ${parsed.catalogVersion}；已使用文件内组件和材质快照还原。`];
  return {
    document: hydrated,
    source: 'package',
    warnings,
  };
}

export function parseDesignPackage(json: string): ParsedDesignPackage {
  if (new TextEncoder().encode(json).byteLength > MAX_DESIGN_PACKAGE_BYTES) {
    throw new Error('项目文件不能超过 15 MB');
  }
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error('文件不是有效的 JSON');
  }
  if (typeof value === 'object' && value !== null && 'format' in value) {
    return parsePackage(value);
  }
  const legacyDocument = SceneDocumentSchema.parse(value) as SceneDocument;
  const normalized = createDesignPackage(legacyDocument);
  const imported = parsePackage(normalized);
  return {
    ...imported,
    source: 'scene-document',
    warnings: ['检测到旧版场景 JSON，已转换为当前项目数据格式。', ...imported.warnings],
  };
}

export function serializeDesignPackage(document: SceneDocument): string {
  const json = JSON.stringify(createDesignPackage(document), null, 2);
  if (new TextEncoder().encode(json).byteLength > MAX_DESIGN_PACKAGE_BYTES) {
    throw new Error('导出文件超过 15 MB，无法在当前版本重新导入');
  }
  return json;
}
