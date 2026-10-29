import { AssetDefinitionSchema } from './assetSchema';
import { assetById, assetCatalog, materialCatalog } from './assets';
import { MaterialSchema } from './materialSchema';
import { SceneDocumentSchema } from './sceneSchema';
import { documentAssets, documentMaterials } from './sceneResources';
import type { Asset, Material, SceneDocument } from './types';
import { z } from 'zod';

export const DESIGN_PACKAGE_FORMAT = 'zaoking.design';
export const DESIGN_PACKAGE_VERSION = 1;
export const ASSET_CATALOG_VERSION = '1';

const DesignPackageSchema = z.object({
  format: z.literal(DESIGN_PACKAGE_FORMAT),
  formatVersion: z.literal(DESIGN_PACKAGE_VERSION),
  catalogVersion: z.string().min(1).max(40),
  exportedAt: z.string().datetime(),
  document: z.unknown(),
  assetManifest: z.array(AssetDefinitionSchema).max(1000),
  materialManifest: z.array(MaterialSchema).max(1000),
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
    ...(validated.assets ?? []),
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
  const customIds = new Set((document.assets ?? []).map((asset) => asset.id));
  const assetSnapshots = assets.filter((asset) => !customIds.has(asset.id));
  return SceneDocumentSchema.parse({ ...document, assetSnapshots, materialSnapshots: materials }) as SceneDocument;
}

function parsePackage(value: unknown): ParsedDesignPackage {
  const parsed = DesignPackageSchema.parse(value);
  const assets = uniqueById(parsed.assetManifest, '组件');
  const materials = uniqueById(parsed.materialManifest, '材质');
  const rawDocument = z.object({ assets: z.array(z.unknown()).optional() }).passthrough().parse(parsed.document);
  const customIds = new Set((rawDocument.assets ?? []).flatMap((asset) => {
    const result = AssetDefinitionSchema.safeParse(asset);
    return result.success && result.data.id.startsWith('custom:') ? [result.data.id] : [];
  }));
  const assetIds = new Set(assets.map((asset) => asset.id));
  for (const id of customIds) assetIds.add(id);
  const structuralDocument = z.object({
    levels: z.array(z.object({
      instances: z.array(z.object({ assetId: z.string() }).passthrough()),
      rooms: z.array(z.object({ floorMaterialId: z.string() }).passthrough()),
    }).passthrough()),
  }).passthrough().parse(parsed.document);
  const usedAssetIds = new Set(structuralDocument.levels.flatMap((level) => level.instances.map((instance) => instance.assetId)));
  const knownAssetIds = new Set(assetCatalog(assets).map((asset) => asset.id));
  const missingAssets = [...usedAssetIds].filter((id) => !assetIds.has(id) || !knownAssetIds.has(id));
  if (missingAssets.length) throw new Error(`项目包缺少组件定义：${missingAssets.join('、')}`);

  const materialIds = new Set(materials.map((material) => material.id));
  const knownMaterials = new Set(materialCatalog(materials).map((material) => material.id));
  const missingMaterialIds = [...new Set(structuralDocument.levels.flatMap((level) => level.rooms.map((room) => room.floorMaterialId)))]
    .filter((id) => !materialIds.has(id) || !knownMaterials.has(id));
  if (missingMaterialIds.length) throw new Error(`项目包缺少地面材质定义：${missingMaterialIds.join('、')}`);

  const documentCustomIds = new Set(customIds);
  const hydrated = hydrateResources(parsed.document as SceneDocument, assets.filter((asset) => !documentCustomIds.has(asset.id)), materials);

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
  return JSON.stringify(createDesignPackage(document), null, 2);
}
