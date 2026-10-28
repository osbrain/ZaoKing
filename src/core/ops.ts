/* ============================================================
 * scene-core · AI 设计操作（Design Ops）执行器
 * LLM / 规则解析器只产出语义化的 DesignOp（不含坐标），
 * 由本模块确定性求解为 Cmd —— 与用户手动操作共用同一命令层，
 * 因此 AI 的产物天然可撤销、可校验。
 * ============================================================ */

import type { Cmd } from './commands';
import type { Level, Room, SceneDocument } from './types';
import { uid } from './types';
import {
  CATALOG,
  assetById,
  parseWidthMm,
  resolveAssetByQuery,
  resolveMaterialByQuery,
} from './assets';
import { pointInPoly, polyArea, solvePlacement } from './geometry';

export type DesignOp =
  | { op: 'add_component'; levelId?: string; room?: string; query: string }
  | { op: 'replace_component'; levelId?: string; room?: string; target: string; spec?: string }
  | { op: 'delete_component'; levelId?: string; room?: string; target: string }
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

function matchInstance(level: Level, room: Room, target: string) {
  const q = norm(target);
  return level.instances.find((i) => {
    if (!pointInPoly([i.t.x, i.t.y], room.poly)) return false;
    const a = assetById(i.assetId);
    if (!a) return false;
    const name = norm(a.name);
    const type = norm(a.type);
    return name.includes(q) || q.includes(name) || type.includes(q) || q.includes(type);
  });
}

/* ---------- 执行器 ---------- */

export function executeOps(doc: SceneDocument, ops: DesignOp[]): OpOutcome {
  const cmds: Cmd[] = [];
  const log: string[] = [];

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
        const asset = resolveAssetByQuery(op.query);
        if (!asset) { log.push(`⚠ 组件库中没有找到「${op.query}」`); break; }
        const p = solvePlacement(level, room, asset);
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
        const room = resolveRoom(level, op.room);
        if (!room) { log.push(`⚠ 未找到房间「${op.room ?? ''}」`); break; }
        const inst = matchInstance(level, room, op.target);
        if (!inst) { log.push(`⚠「${room.name}」里没有找到「${op.target}」`); break; }
        const cur = assetById(inst.assetId)!;
        let next = null;
        const w = op.spec ? parseWidthMm(op.spec) : null;
        if (w) {
          // 同类型按目标宽度就近选规格（"1.8米的床" → 双人床 1.8m）
          next = CATALOG.filter((a) => a.type === cur.type)
            .sort((a, b) => Math.abs(a.w - w) - Math.abs(b.w - w))[0] ?? null;
        } else if (op.spec) {
          next = resolveAssetByQuery(op.spec);
        }
        if (!next || next.id === cur.id) { log.push(`⚠ 没有满足「${op.spec ?? op.target}」的替换规格`); break; }
        cmds.push({ levelId: level.id, type: 'replaceAsset', id: inst.id, assetId: next.id });
        log.push(`✓ 已将${room.name}的「${cur.name}」换成「${next.name}」（位置朝向保留）`);
        break;
      }
      case 'delete_component': {
        const room = resolveRoom(level, op.room);
        if (!room) { log.push(`⚠ 未找到房间「${op.room ?? ''}」`); break; }
        const inst = matchInstance(level, room, op.target);
        if (!inst) { log.push(`⚠「${room.name}」里没有找到「${op.target}」`); break; }
        const a = assetById(inst.assetId)!;
        cmds.push({ levelId: level.id, type: 'delete', id: inst.id });
        log.push(`✓ 已删除${room.name}的「${a.name}」`);
        break;
      }
      case 'set_floor_material': {
        const room = resolveRoom(level, op.room);
        if (!room) { log.push(`⚠ 未找到房间「${op.room ?? ''}」`); break; }
        const mat = resolveMaterialByQuery(op.query);
        if (!mat) { log.push(`⚠ 材质库中没有匹配「${op.query}」的材质`); break; }
        cmds.push({ levelId: level.id, type: 'setRoomMaterial', roomId: room.id, materialId: mat.id });
        log.push(`✓ 已将${room.name}的地面换为「${mat.name}」（¥${mat.price}/m²）`);
        break;
      }
    }
  }
  return { cmds, log };
}
