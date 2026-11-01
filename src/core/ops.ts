/* ============================================================
 * scene-core · AI 设计操作（Design Ops）执行器
 * LLM / 规则解析器只产出语义化的 DesignOp（不含坐标），
 * 由本模块确定性求解为 Cmd —— 与用户手动操作共用同一命令层，
 * 因此 AI 的产物天然可撤销、可校验。
 * ============================================================ */

import type { Cmd } from './commands';
import type { Asset, ComponentInstance, Level, Room, SceneDocument } from './types';
import { uid } from './types';
import {
  assetCatalog,
  assetById,
  parseWidthMm,
  resolveAssetByQuery,
  resolveMaterialByQuery,
} from './assets';
import { pointInPoly, polyArea, solvePlacement, validateComponentPlacement } from './geometry';
import { documentAssets, documentMaterials } from './sceneResources';

export type DesignOp =
  | { op: 'add_component'; levelId?: string; room?: string; query: string }
  | { op: 'replace_component'; levelId?: string; room?: string; target?: string; instanceId?: string; spec?: string }
  | { op: 'delete_component'; levelId?: string; room?: string; target?: string; instanceId?: string }
  | { op: 'move_component'; levelId?: string; room?: string; target?: string; instanceId?: string; dxMm?: number; dyMm?: number; rotationDeltaDeg?: number }
  | { op: 'resize_component'; levelId?: string; room?: string; target?: string; instanceId?: string; widthMm?: number; depthMm?: number; heightMm?: number }
  | { op: 'set_component_parameters'; levelId?: string; room?: string; target?: string; instanceId?: string; compartments?: number; openCompartments?: number; shelves?: number; drawers?: number; seats?: number }
  | { op: 'set_component_color'; levelId?: string; room?: string; target?: string; instanceId?: string; query: string }
  | { op: 'set_wall_color'; levelId?: string; room?: string; wallId?: string; query: string }
  | { op: 'set_floor_material'; levelId?: string; room?: string; query: string }
  | { op: 'ask_user'; question: string };

export interface OpOutcome {
  cmds: Cmd[];
  log: string[];
}

/* ---------- 名称模糊解析 ---------- */

const ROOM_ALIAS: Record<string, string> = {
  主卧: '主卧室', 次卧: '子女房', 儿童房: '子女房', 孩子: '小孩房',
  小孩: '小孩房', 卫生间: '卫浴', 主卫: '主卫浴', 客卫: '客卫浴',
  阳台: '休闲阳台', 玄关: '客厅', 书房: '子女房',
};

const norm = (s: string) => s.replace(/\s+/g, '').replace(/[的里中内]/g, '');

export function resolveRoom(level: Level, name?: string): Room | null {
  if (!name) {
    // 未指明房间：取面积最大的计入房间（通常是客厅）
    return (
      [...level.rooms].filter((r) => r.counted !== false)
        .sort((a, b) => polyArea(b.poly) - polyArea(a.poly))[0] ?? null
    );
  }
  const q = ROOM_ALIAS[name.trim()] ?? norm(name);
  return (
    level.rooms.find((r) => r.name === name) ??
    level.rooms.find((r) => {
      const n = norm(r.name);
      return n.includes(q) || q.includes(n);
    }) ??
    null
  );
}

function findInstances(level: Level, room: Room | null, target: string | undefined, instanceId: string | undefined, assets: readonly Asset[]) {
  return level.instances.filter((i) => {
    if (instanceId && i.id !== instanceId) return false;
    if (room && !pointInPoly([i.t.x, i.t.y], room.poly)) return false;
    if (!target || instanceId) return true;
    const a = assetById(i.assetId, assets);
    if (!a) return false;
    const q = norm(target);
    const name = norm(a.name);
    const type = norm(a.type);
    return name === q || name.includes(q) || q.includes(name) || type === q || type.includes(q);
  });
}

function colorByQuery(query: string): string | null {
  const hex = query.match(/#[\da-f]{6}\b/i)?.[0];
  if (hex) return hex.toLowerCase();
  const colors: Array<[RegExp, string]> = [
    [/深灰|炭灰/, '#55565a'], [/浅灰|淡灰|银灰|灰色/, '#c8c8c5'],
    [/米白|奶白|象牙白/, '#eee9df'], [/白色|纯白/, '#f5f5f2'],
    [/深蓝|藏蓝/, '#405f7a'], [/浅蓝|天蓝|蓝色/, '#8eb7d0'],
    [/深绿|墨绿/, '#526d59'], [/浅绿|薄荷绿|绿色/, '#9fbea7'],
    [/粉色|浅粉/, '#dfb4bd'], [/红色/, '#b65d5d'],
    [/黄色|浅黄/, '#e7d38e'], [/橙色/, '#d99562'],
    [/黑色|纯黑/, '#333333'], [/原木|木色|棕色|咖色/, '#b58c62'],
  ];
  return colors.find(([pattern]) => pattern.test(query))?.[1] ?? null;
}

function targetForOp(level: Level, op: { room?: string; target?: string; instanceId?: string }, assets: readonly Asset[]) {
  const room = op.room ? resolveRoom(level, op.room) : null;
  if (op.room && !room) return { error: `未找到房间「${op.room}」` };
  if (!op.instanceId && !op.target) return { error: '请指定要修改的组件' };
  const matches = findInstances(level, room ?? null, op.target, op.instanceId, assets);
  if (matches.length > 1) {
    const choices = matches.map((i) => `${assetById(i.assetId, assets)?.name ?? '组件'}（${i.id}）`).join('、');
    return { error: `找到多件候选组件，请指定实例 ID：${choices}` };
  }
  if (!matches.length) return { error: `未找到组件「${op.instanceId ?? op.target ?? ''}」` };
  if (matches[0].locked) return { error: '该组件已锁定，无法由 AI 修改' };
  return { instance: matches[0] };
}

function placementFailure(level: Level, instance: ComponentInstance, assets: readonly Asset[]) {
  const validation = validateComponentPlacement(level, instance, assets);
  return validation.valid ? null : validation.issues.map((issue) => issue.message).join('；');
}

function wallTouchesRoom(wall: Level['walls'][number], room: Room) {
  const tolerance = Math.min(500, Math.max(wall.x1 - wall.x0, wall.y1 - wall.y0) / 2 + 120);
  const cx = (wall.x0 + wall.x1) / 2;
  const cy = (wall.y0 + wall.y1) / 2;
  for (let index = 0; index < room.poly.length; index++) {
    const a = room.poly[index];
    const b = room.poly[(index + 1) % room.poly.length];
    const dx = Math.abs(b[0] - a[0]);
    const dy = Math.abs(b[1] - a[1]);
    if (dx >= dy) {
      const overlaps = Math.min(wall.x1, Math.max(a[0], b[0])) > Math.max(wall.x0, Math.min(a[0], b[0]));
      if (overlaps && Math.abs(cy - (a[1] + b[1]) / 2) <= tolerance) return true;
    } else {
      const overlaps = Math.min(wall.y1, Math.max(a[1], b[1])) > Math.max(wall.y0, Math.min(a[1], b[1]));
      if (overlaps && Math.abs(cx - (a[0] + b[0]) / 2) <= tolerance) return true;
    }
  }
  return false;
}

/* ---------- 执行器 ---------- */

export function executeOps(doc: SceneDocument, ops: DesignOp[]): OpOutcome {
  const cmds: Cmd[] = [];
  const log: string[] = [];
  const assets = documentAssets(doc);
  const materials = documentMaterials(doc);

  for (const op of ops) {
    if (op.op === 'ask_user') {
      log.push(`💬 ${op.question}`);
      continue;
    }
    const level = op.levelId
      ? doc.levels.find((candidate) => candidate.id === op.levelId)
      : doc.levels.length === 1 ? doc.levels[0] : undefined;
    if (!level) {
      log.push(op.levelId ? `⚠ 未找到楼层「${op.levelId}」` : '💬 请先指定要修改的楼层');
      continue;
    }
    switch (op.op) {
      case 'add_component': {
        const room = resolveRoom(level, op.room);
        if (!room) { log.push(`⚠ 未找到房间「${op.room ?? ''}」`); break; }
        const asset = resolveAssetByQuery(op.query, assets);
        if (!asset) { log.push(`⚠ 组件库中没有找到「${op.query}」`); break; }
        const p = solvePlacement(level, room, asset, { assets });
        if (!p) { log.push(`⚠「${room.name}」里没有足够的空位放置「${asset.name}」`); break; }
        cmds.push({
          levelId: level.id,
          type: 'place',
          inst: { id: uid(), assetId: asset.id, t: p, size: { w: asset.w, d: asset.d } },
        });
        log.push(`✓ 已在${room.name}放置「${asset.name}」（贴墙、朝向室内，可撤销）`);
        break;
      }
      case 'replace_component': {
        const { instance: inst, error } = targetForOp(level, op, assets);
        if (error || !inst) { log.push(`⚠ ${error}`); break; }
        const cur = assetById(inst.assetId, assets)!;
        let next = null;
        const w = op.spec ? parseWidthMm(op.spec) : null;
        if (w) {
          const candidate = assetCatalog(assets).filter((a) => a.type === cur.type)
            .sort((a, b) => Math.abs(a.w - w) - Math.abs(b.w - w))[0];
          if (candidate && Math.abs(candidate.w - w) <= 100) next = candidate;
        } else if (op.spec) {
          next = resolveAssetByQuery(op.spec, assets);
        }
        if (!next || next.id === cur.id) { log.push(`⚠ 没有满足「${op.spec ?? op.target}」的替换规格`); break; }
        const candidate = { ...inst, assetId: next.id, size: undefined, color: undefined };
        const placementError = placementFailure(level, candidate, assets);
        if (placementError) { log.push(`⚠ 替换后的「${next.name}」${placementError}`); break; }
        cmds.push({ levelId: level.id, type: 'replaceAsset', id: inst.id, assetId: next.id });
        log.push(`✓ 已将「${cur.name}」换成「${next.name}」（位置朝向保留）`);
        break;
      }
      case 'delete_component': {
        const { instance: inst, error } = targetForOp(level, op, assets);
        if (error || !inst) { log.push(`⚠ ${error}`); break; }
        const a = assetById(inst.assetId, assets)!;
        cmds.push({ levelId: level.id, type: 'delete', id: inst.id });
        log.push(`✓ 已删除「${a.name}」`);
        break;
      }
      case 'move_component': {
        const { instance: inst, error } = targetForOp(level, op, assets);
        if (error || !inst) { log.push(`⚠ ${error}`); break; }
        const deltaX = op.dxMm ?? 0;
        const deltaY = op.dyMm ?? 0;
        const rotation = op.rotationDeltaDeg ?? 0;
        if (![deltaX, deltaY, rotation].every(Number.isFinite) || Math.abs(deltaX) > 20000 || Math.abs(deltaY) > 20000 || Math.abs(rotation) > 360) {
          log.push('⚠ 移动参数超出允许范围'); break;
        }
        const t = { x: Math.round(inst.t.x + deltaX), y: Math.round(inst.t.y + deltaY), rot: ((inst.t.rot + rotation) % 360 + 360) % 360 };
        const candidate = { ...inst, t };
        const placementError = placementFailure(level, candidate, assets);
        if (placementError) { log.push(`⚠ 移动后无法放置：${placementError}`); break; }
        cmds.push({ levelId: level.id, type: 'move', id: inst.id, t });
        log.push(`✓ 已移动「${assetById(inst.assetId, assets)?.name ?? '组件'}」`);
        break;
      }
      case 'resize_component': {
        const { instance: inst, error } = targetForOp(level, op, assets);
        if (error || !inst) { log.push(`⚠ ${error}`); break; }
        const size = { w: op.widthMm, d: op.depthMm, h: op.heightMm };
        const updates = Object.fromEntries(Object.entries(size).filter(([, value]) => value !== undefined)) as { w?: number; d?: number; h?: number };
        if (!Object.keys(updates).length || Object.values(updates).some((value) => !Number.isFinite(value) || value! < 10 || value! > 20000)) {
          log.push('⚠ 尺寸必须在 10 到 20000 mm 之间'); break;
        }
        const candidate = { ...inst, size: { ...inst.size, ...updates } };
        const placementError = placementFailure(level, candidate, assets);
        if (placementError) { log.push(`⚠ 调整尺寸后无法放置：${placementError}`); break; }
        cmds.push({ levelId: level.id, type: 'resize', id: inst.id, size: updates });
        log.push(`✓ 已调整「${assetById(inst.assetId, assets)?.name ?? '组件'}」尺寸`);
        break;
      }
      case 'set_component_parameters': {
        const { instance: inst, error } = targetForOp(level, op, assets);
        if (error || !inst) { log.push(`⚠ ${error}`); break; }
        const asset = assetById(inst.assetId, assets);
        const supported = asset?.geometry?.parameters ?? {};
        const parameters: NonNullable<ComponentInstance['parameters']> = {};
        for (const key of ['compartments', 'openCompartments', 'shelves', 'drawers', 'seats'] as const) {
          const value = op[key];
          if (value === undefined) continue;
          const allowed = supported[key];
          if (allowed === undefined) { log.push(`⚠「${asset?.name ?? '该组件'}」不支持修改${key}`); continue; }
          const min = key === 'shelves' || key === 'openCompartments' ? 0 : 1;
          const max = key === 'seats' ? 5 : key === 'shelves' ? 12 : 8;
          if (!Number.isInteger(value) || value < min || value > max) { log.push(`⚠ ${key} 必须是 ${min}–${max} 的整数`); continue; }
          const totalCompartments = op.compartments ?? inst.parameters?.compartments ?? supported.compartments;
          if (key === 'openCompartments' && totalCompartments !== undefined && value > totalCompartments) {
            log.push(`⚠ 开放格数量不能超过分区数量（${totalCompartments}）`); continue;
          }
          parameters[key] = value;
        }
        if (!Object.keys(parameters).length) break;
        cmds.push({ levelId: level.id, type: 'setParameters', id: inst.id, parameters });
        log.push(`✓ 已调整「${asset?.name ?? '组件'}」结构参数`);
        break;
      }
      case 'set_component_color': {
        const { instance: inst, error } = targetForOp(level, op, assets);
        if (error || !inst) { log.push(`⚠ ${error}`); break; }
        const color = colorByQuery(op.query);
        if (!color) { log.push(`⚠ 无法识别颜色「${op.query}」`); break; }
        cmds.push({ levelId: level.id, type: 'setColor', id: inst.id, color });
        log.push(`✓ 已将「${assetById(inst.assetId, assets)?.name ?? '组件'}」颜色设为 ${color}`);
        break;
      }
      case 'set_wall_color': {
        const color = colorByQuery(op.query);
        if (!color) { log.push(`⚠ 无法识别颜色「${op.query}」`); break; }
        let walls = level.walls;
        if (op.wallId) walls = walls.filter((wall) => wall.id === op.wallId);
        else if (op.room) {
          const room = resolveRoom(level, op.room);
          if (!room) { log.push(`⚠ 未找到房间「${op.room}」`); break; }
          walls = walls.filter((wall) => wallTouchesRoom(wall, room));
        } else {
          log.push('💬 请指定房间或墙体 ID'); break;
        }
        if (!walls.length) { log.push('⚠ 没有找到该房间相邻的墙体'); break; }
        cmds.push(...walls.map((wall) => ({ levelId: level.id, type: 'setWall' as const, id: wall.id, color })));
        log.push(`✓ 已将 ${walls.length} 段墙体颜色设为 ${color}`);
        break;
      }
      case 'set_floor_material': {
        const room = resolveRoom(level, op.room);
        if (!room) { log.push(`⚠ 未找到房间「${op.room ?? ''}」`); break; }
        const mat = resolveMaterialByQuery(op.query, materials);
        if (!mat) { log.push(`⚠ 材质库中没有匹配「${op.query}」的材质`); break; }
        cmds.push({ levelId: level.id, type: 'setRoomMaterial', roomId: room.id, materialId: mat.id });
        log.push(`✓ 已将${room.name}的地面换为「${mat.name}」（¥${mat.price}/m²）`);
        break;
      }
    }
  }
  return { cmds, log };
}
