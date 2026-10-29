/* ============================================================
 * scene-core · 户型 2D 缩略图生成（服务端/客户端同构）
 * 复用 2D 渲染原语：材质图案 + 门窗符号 + 家具图例。
 * 供项目卡片展示；空户型返回空串（由前端展示占位）。
 * ============================================================ */

import { assetById, materialCatalog } from './assets';
import { docBBox } from './geometry';
import { furnSVG, materialPatternId, openingsSvg, patternsDefs } from './symbols2d';
import { instanceGeometry, instanceRef, type SceneDocument } from './types';
import { documentAssets, documentMaterials } from './sceneResources';

const WALL_FILL: Record<string, string> = {
  bearing: '#26241f',
  exterior: '#8f897d',
  partition: '#a7a195',
  low: '#e9e3d8',
};

/** 生成项目卡片的 2D 平面缩略图；prefix 用于同页多 SVG 时避免 pattern ID 冲突 */
export function planThumbSvg(doc: SceneDocument, prefix = 'th'): string {
  const lv = doc?.levels?.[0];
  if (!lv || (lv.walls.length === 0 && lv.rooms.length === 0)) return '';
  const bb = docBBox(lv);
  const pad = 600;
  const x = bb.x0 - pad;
  const y = bb.y0 - pad;
  const w = bb.x1 - bb.x0 + pad * 2;
  const h = bb.y1 - bb.y0 + pad * 2;
  const assets = documentAssets(doc);
  const materials = materialCatalog(documentMaterials(doc));

  const rooms = lv.rooms
    .map((r) => `<polygon points="${r.poly.map((p) => p.join(',')).join(' ')}" fill="url(#${materialPatternId(r.floorMaterialId, prefix)})"/>`)
    .join('');
  const walls = lv.walls
    .map((wl) => `<rect x="${wl.x0}" y="${wl.y0}" width="${wl.x1 - wl.x0}" height="${wl.y1 - wl.y0}" fill="${wl.color ?? WALL_FILL[wl.kind] ?? '#a7a195'}"/>`)
    .join('');
  const furn = lv.instances
    .slice(0, 500)
    .map((inst) => {
      const ref = instanceRef(inst, assetById(inst.assetId, assets));
      const asset = assetById(inst.assetId, assets);
      return `<g transform="translate(${inst.t.x} ${inst.t.y}) rotate(${inst.t.rot})">${furnSVG(ref.type, ref.w, ref.d, ref.color, instanceGeometry(inst, asset))}</g>`;
    })
    .join('');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" preserveAspectRatio="xMidYMid meet">` +
    `<defs>${patternsDefs(prefix, materials)}</defs>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#f7f4ee"/>` +
    rooms +
    openingsSvg(lv) +
    walls +
    furn +
    `</svg>`
  );
}
