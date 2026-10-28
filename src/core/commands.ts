/* ============================================================
 * scene-core · 命令层
 * 一切对 Document 的修改都通过 Cmd 表达；applyCmds 为纯函数。
 * 用户操作、AI 操作、种子初始化共用同一入口（架构关键决策）。
 * ============================================================ */

import type { ComponentInstance, Opening, Room, SceneDocument, Wall } from './types';

export type Cmd =
  | { type: 'place'; inst: ComponentInstance }
  | { type: 'delete'; id: string }
  | { type: 'move'; id: string; t: { x: number; y: number; rot: number } }
  | { type: 'resize'; id: string; size: { w: number; d: number } }
  | { type: 'setColor'; id: string; color: string }
  | { type: 'replaceAsset'; id: string; assetId: string }
  | { type: 'setRoomMaterial'; roomId: string; materialId: string }
  | { type: 'setRoomName'; roomId: string; name: string }
  /* ---- 户型编辑：墙体 ---- */
  | { type: 'addWall'; wall: Wall }
  | { type: 'deleteWall'; id: string }
  | { type: 'setWall'; id: string; rect?: [number, number, number, number]; kind?: Wall['kind']; height?: number }
  /* ---- 户型编辑：房间地面 ---- */
  | { type: 'addRoom'; room: Room }
  | { type: 'deleteRoom'; id: string }
  /* ---- 户型编辑：门窗 ---- */
  | { type: 'addOpening'; opening: Opening }
  | { type: 'deleteOpening'; id: string }
  | { type: 'setOpening'; id: string; rect?: [number, number, number, number]; height?: number; sill?: number };

export function applyCmds(doc: SceneDocument, cmds: Cmd[]): SceneDocument {
  if (!cmds.length) return doc;
  const d: SceneDocument = structuredClone(doc);
  for (const lv of d.levels) {
    for (const c of cmds) {
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
          if (i) i.size = { ...c.size };
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
          }
          break;
        }
      }
    }
  }
  return d;
}
