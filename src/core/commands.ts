/* ============================================================
 * scene-core · 命令层
 * 一切对 Document 的修改都通过 Cmd 表达；applyCmds 为纯函数。
 * 用户操作、AI 操作、种子初始化共用同一入口（架构关键决策）。
 * ============================================================ */

import type { ComponentInstance, CustomAsset, Opening, Room, SceneDocument, Wall } from './types';
import { CustomAssetSchema } from './assetSchema';
import { assetById, materialCatalog } from './assets';
import { MAX_FURNITURE_UNIT_PRICE, MAX_MATERIAL_PRICE_PER_SQM } from './pricingLimits';

type LevelCmd =
  | { levelId?: string; type: 'place'; inst: ComponentInstance }
  | { levelId?: string; type: 'delete'; id: string }
  | { levelId?: string; type: 'move'; id: string; t: { x: number; y: number; rot: number } }
  | { levelId?: string; type: 'resize'; id: string; size: { w?: number; d?: number; h?: number } }
  | { levelId?: string; type: 'setInstancePrice'; id: string; unitPrice: number | undefined }
  | { levelId?: string; type: 'setParameters'; id: string; parameters: NonNullable<ComponentInstance['parameters']> }
  | { levelId?: string; type: 'setColor'; id: string; color: string }
  | { levelId?: string; type: 'replaceAsset'; id: string; assetId: string }
  | { levelId?: string; type: 'setRoomMaterial'; roomId: string; materialId: string }
  | { levelId?: string; type: 'setRoomName'; roomId: string; name: string }
  /* ---- 户型编辑：墙体 ---- */
  | { levelId?: string; type: 'addWall'; wall: Wall }
  | { levelId?: string; type: 'deleteWall'; id: string }
  | { levelId?: string; type: 'setWall'; id: string; rect?: [number, number, number, number]; kind?: Wall['kind']; height?: number; color?: string }
  /* ---- 户型编辑：房间地面 ---- */
  | { levelId?: string; type: 'addRoom'; room: Room }
  | { levelId?: string; type: 'deleteRoom'; id: string }
  /* ---- 户型编辑：门窗 ---- */
  | { levelId?: string; type: 'addOpening'; opening: Opening }
  | { levelId?: string; type: 'deleteOpening'; id: string }
  | { levelId?: string; type: 'setOpening'; id: string; rect?: [number, number, number, number]; height?: number; sill?: number; slideMode?: Opening['slideMode'] };

type AssetCmd = (
  | { type: 'addAsset'; asset: CustomAsset }
  | { type: 'updateAsset'; asset: CustomAsset }
  | { type: 'deleteAsset'; id: string }
) & { levelId?: never };

type DocumentCmd = { type: 'setMaterialPrice'; materialId: string; price: number } & { levelId?: never };

export type Cmd = LevelCmd | AssetCmd | DocumentCmd;

function isAssetCommand(command: Cmd): command is AssetCmd {
  return command.type === 'addAsset' || command.type === 'updateAsset' || command.type === 'deleteAsset';
}

function isDocumentCommand(command: Cmd): command is DocumentCmd {
  return command.type === 'setMaterialPrice';
}

export function applyCmds(doc: SceneDocument, cmds: Cmd[]): SceneDocument {
  if (!cmds.length) return doc;
  const levelCommands = cmds.filter((command): command is LevelCmd => !isAssetCommand(command) && !isDocumentCommand(command));
  if (doc.levels.length > 1 && levelCommands.some((command) => !command.levelId)) {
    throw new Error('Commands must target a level when the document has multiple levels');
  }
  const unknownLevel = levelCommands.find((command) => command.levelId && !doc.levels.some((level) => level.id === command.levelId));
  if (unknownLevel) throw new Error(`Unknown level: ${unknownLevel.levelId}`);
  const d: SceneDocument = structuredClone(doc);
  for (const c of cmds) {
    if (isAssetCommand(c)) {
      const id = c.type === 'deleteAsset' ? c.id : c.asset.id;
      const exists = d.assets?.some((asset) => asset.id === id);
      if (c.type === 'deleteAsset') {
        if (!exists) throw new Error('组件不存在');
        if (d.levels.some((level) => level.instances.some((instance) => instance.assetId === id))) {
          throw new Error('组件仍在方案中使用，请先删除对应实例');
        }
        d.assets = d.assets?.filter((asset) => asset.id !== id);
      } else {
        const asset = CustomAssetSchema.parse(c.asset);
        if (c.type === 'addAsset' && exists) throw new Error('组件 ID 已存在');
        if (c.type === 'updateAsset' && !exists) throw new Error('组件不存在');
        d.assets = c.type === 'addAsset'
          ? [...(d.assets ?? []), asset]
          : d.assets!.map((current) => current.id === id ? asset : current);
      }
      continue;
    }
    if (isDocumentCommand(c)) {
      if (!Number.isFinite(c.price) || c.price < 0 || c.price > MAX_MATERIAL_PRICE_PER_SQM) {
        throw new Error(`材质单价必须在 0 至 ${MAX_MATERIAL_PRICE_PER_SQM.toLocaleString('en-US')} 元之间`);
      }
      const material = materialCatalog(d.materialSnapshots).find((item) => item.id === c.materialId);
      if (!material) throw new Error('材质不存在');
      d.materialSnapshots = [
        ...(d.materialSnapshots ?? []).filter((item) => item.id !== c.materialId),
        { ...material, price: Math.round(c.price * 100) / 100 },
      ];
      continue;
    }
    for (const lv of d.levels) {
      if (c.levelId && c.levelId !== lv.id) continue;
      switch (c.type) {
        case 'place':
          lv.instances.push(structuredClone(c.inst));
          break;
        case 'delete':
          lv.instances = lv.instances.filter((i) => i.id !== c.id);
          break;
        case 'move': {
          const i = lv.instances.find((x) => x.id === c.id);
          if (i) i.t = { ...c.t };
          break;
        }
        case 'resize': {
          const i = lv.instances.find((x) => x.id === c.id);
          if (i) i.size = { ...i.size, ...c.size };
          break;
        }
        case 'setInstancePrice': {
          if (c.unitPrice !== undefined && (!Number.isFinite(c.unitPrice) || c.unitPrice < 0 || c.unitPrice > MAX_FURNITURE_UNIT_PRICE)) {
            throw new Error(`家具单价必须在 0 至 ${MAX_FURNITURE_UNIT_PRICE.toLocaleString('en-US')} 元之间`);
          }
          const i = lv.instances.find((x) => x.id === c.id);
          if (i) i.unitPrice = c.unitPrice;
          break;
        }
        case 'setParameters': {
          const i = lv.instances.find((x) => x.id === c.id);
          if (i) {
            const asset = assetById(i.assetId, [...(d.assetSnapshots ?? []), ...(d.assets ?? [])]);
            const parameters = { ...i.parameters, ...c.parameters };
            const effectiveParameters = { ...asset?.geometry?.parameters, ...parameters };
            if (effectiveParameters.compartments !== undefined && effectiveParameters.openCompartments !== undefined
              && effectiveParameters.openCompartments > effectiveParameters.compartments) {
              parameters.openCompartments = effectiveParameters.compartments;
            }
            i.parameters = parameters;
          }
          break;
        }
        case 'setColor': {
          const i = lv.instances.find((x) => x.id === c.id);
          if (i) i.color = c.color;
          break;
        }
        case 'replaceAsset': {
          const i = lv.instances.find((x) => x.id === c.id);
          if (i) {
            i.assetId = c.assetId;
            i.size = undefined;
            i.color = undefined;
          }
          break;
        }
        case 'setRoomMaterial': {
          const r = lv.rooms.find((x) => x.id === c.roomId);
          if (r) r.floorMaterialId = c.materialId;
          break;
        }
        case 'setRoomName': {
          const r = lv.rooms.find((x) => x.id === c.roomId);
          if (r) r.name = c.name;
          break;
        }
        case 'addWall':
          lv.walls.push(structuredClone(c.wall));
          break;
        case 'deleteWall':
          lv.walls = lv.walls.filter((w) => w.id !== c.id);
          break;
        case 'setWall': {
          const w = lv.walls.find((x) => x.id === c.id);
          if (w) {
            if (c.rect) {
              [w.x0, w.y0, w.x1, w.y1] = c.rect;
            }
            if (c.kind) w.kind = c.kind;
            if (c.height !== undefined) w.height = c.height;
            if (c.color !== undefined) w.color = c.color;
          }
          break;
        }
        case 'addRoom':
          lv.rooms.push(structuredClone(c.room));
          break;
        case 'deleteRoom':
          lv.rooms = lv.rooms.filter((r) => r.id !== c.id);
          break;
        case 'addOpening':
          lv.openings.push(structuredClone(c.opening));
          break;
        case 'deleteOpening':
          lv.openings = lv.openings.filter((o) => o.id !== c.id);
          break;
        case 'setOpening': {
          const o = lv.openings.find((x) => x.id === c.id);
          if (o) {
            if (c.rect) o.rect = [...c.rect];
            if (c.height !== undefined) o.height = c.height;
            if (c.sill !== undefined) o.sill = c.sill;
            if (c.slideMode !== undefined) o.slideMode = c.slideMode;
          }
          break;
        }
      }
    }
  }
  return d;
}
