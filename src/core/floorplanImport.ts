/* ============================================================
 * scene-core · 户型截图导入：草稿规整 + 文档生成（纯函数，无网络）
 * 视觉模型只负责产出 FloorPlanDraft（坐标 mm、允许粗糙），
 * 本模块做确定性的几何规整（正交展开/去重/洞口吸附/材质启发），
 * 再经 SceneDocumentSchema 校验；结构错误时保留报告并要求修正草稿，不静默剔除实体。
 * ============================================================ */

import { z } from 'zod';
import { isSimplePolygon } from './geometry';
import { formatSceneIssues, SceneDocumentSchema } from './sceneSchema';
import { uid, type SceneDocument } from './types';

const MAX_FLOORPLAN_COORDINATE_MM = 100_000;
const floorplanCoordinate = z.number().finite().min(-MAX_FLOORPLAN_COORDINATE_MM).max(MAX_FLOORPLAN_COORDINATE_MM);

/* ---------- 草稿类型（视觉模型输出约定） ---------- */

export const FloorPlanDraftSchema = z.object({
  walls: z.array(z.object({
    x0: floorplanCoordinate, y0: floorplanCoordinate, x1: floorplanCoordinate, y1: floorplanCoordinate,
    kind: z.enum(['bearing', 'exterior', 'partition', 'low', '承重', '外墙', '非承重', '矮墙']).optional(),
  }).strict()),
  openings: z.array(z.object({
    kind: z.enum(['door', 'entry', 'window', 'sliding']),
    rect: z.tuple([floorplanCoordinate, floorplanCoordinate, floorplanCoordinate, floorplanCoordinate])
      .refine(([x0, y0, x1, y1]) => x0 < x1 && y0 < y1, 'Opening rectangle must have positive width and height'),
    hinge: z.tuple([floorplanCoordinate, floorplanCoordinate]).optional(),
    openDir: z.tuple([z.number().finite(), z.number().finite()]).optional(),
    closeDir: z.tuple([z.number().finite(), z.number().finite()]).optional(),
    span: z.number().finite().optional(),
  }).strict()).optional(),
  rooms: z.array(z.object({
    name: z.string().max(60),
    poly: z.array(z.tuple([floorplanCoordinate, floorplanCoordinate])).max(256),
  }).strict()).optional(),
}).strict();

export type FloorPlanDraft = z.infer<typeof FloorPlanDraftSchema>;

const confidence = z.number().min(0).max(1).optional();
const pixelPoint = z.tuple([z.number().finite(), z.number().finite()]);

/** Vision-model coordinates are pixels in the original uploaded image, never millimetres. */
export const FloorPlanPixelDraftSchema = z.object({
  walls: z.array(z.object({
    x0: z.number().finite(), y0: z.number().finite(), x1: z.number().finite(), y1: z.number().finite(),
    kind: z.enum(['bearing', 'exterior', 'partition', 'low']).optional(),
    confidence,
  }).strict()).min(1).max(1000),
  openings: z.array(z.object({
    kind: z.enum(['door', 'entry', 'window', 'sliding']),
    rect: z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()])
      .refine(([x0, y0, x1, y1]) => x0 < x1 && y0 < y1, 'Opening rectangle must have positive width and height'),
    confidence,
  }).strict()).max(1000).optional(),
  rooms: z.array(z.object({
    name: z.string().trim().min(1).max(60),
    poly: z.array(pixelPoint).min(3).max(256),
    confidence,
  }).strict()).max(500).optional(),
}).strict();

export type FloorPlanPixelDraft = z.infer<typeof FloorPlanPixelDraftSchema>;

/** Map model-image pixel coordinates back onto the original uploaded image. */
export function scalePixelDraftCoordinates(
  draft: FloorPlanPixelDraft,
  from: { width: number; height: number },
  to: { width: number; height: number },
): FloorPlanPixelDraft {
  const scaleX = to.width / from.width;
  const scaleY = to.height / from.height;
  const point = ([x, y]: [number, number]): [number, number] => [x * scaleX, y * scaleY];
  return {
    walls: draft.walls.map((wall) => ({
      ...wall,
      x0: wall.x0 * scaleX,
      y0: wall.y0 * scaleY,
      x1: wall.x1 * scaleX,
      y1: wall.y1 * scaleY,
    })),
    openings: draft.openings?.map((opening) => ({
      ...opening,
      rect: [opening.rect[0] * scaleX, opening.rect[1] * scaleY, opening.rect[2] * scaleX, opening.rect[3] * scaleY],
    })),
    rooms: draft.rooms?.map((room) => ({ ...room, poly: room.poly.map(point) })),
  };
}

export function pixelDraftToMmDraft(
  draft: FloorPlanPixelDraft,
  reference: { a: [number, number]; b: [number, number]; lengthMm: number },
): FloorPlanDraft {
  const pixelLength = Math.hypot(reference.b[0] - reference.a[0], reference.b[1] - reference.a[1]);
  if (!Number.isFinite(pixelLength) || pixelLength < 10 || !Number.isFinite(reference.lengthMm) || reference.lengthMm < 100 || reference.lengthMm > 50000) {
    throw new Error('比例标定无效：请选择间距至少 10 像素的两点，并输入 100–50000 mm 的实测长度');
  }
  const scale = reference.lengthMm / pixelLength;
  const points = [
    ...draft.walls.flatMap((wall) => [[wall.x0, wall.y0], [wall.x1, wall.y1]]),
    ...(draft.openings ?? []).flatMap((opening) => [[opening.rect[0], opening.rect[1]], [opening.rect[2], opening.rect[3]]]),
    ...(draft.rooms ?? []).flatMap((room) => room.poly),
  ];
  const bounds = points.reduce((current, [x, y]) => ({
    minX: Math.min(current.minX, x), minY: Math.min(current.minY, y),
    maxX: Math.max(current.maxX, x), maxY: Math.max(current.maxY, y),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  if (Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * scale > MAX_FLOORPLAN_COORDINATE_MM - 1000) {
    throw new Error('标定后的户型范围超过 99 米，请检查标定点和实测尺寸');
  }
  const minX = bounds.minX;
  const minY = bounds.minY;
  const toMm = ([x, y]: [number, number]): [number, number] => [Math.round((x - minX) * scale), Math.round((y - minY) * scale)];
  return {
    walls: draft.walls.map((wall) => {
      const [x0, y0] = toMm([wall.x0, wall.y0]);
      const [x1, y1] = toMm([wall.x1, wall.y1]);
      return { x0, y0, x1, y1, kind: wall.kind };
    }),
    openings: (draft.openings ?? []).map((opening) => {
      const [x0, y0] = toMm([opening.rect[0], opening.rect[1]]);
      const [x1, y1] = toMm([opening.rect[2], opening.rect[3]]);
      return { kind: opening.kind, rect: [x0, y0, x1, y1] as [number, number, number, number] };
    }),
    rooms: (draft.rooms ?? []).map((room) => ({ name: room.name, poly: room.poly.map(toMm) })),
  };
}

export interface ImportReport {
  walls: number;
  openings: number;
  rooms: number;
  dropped: number;
  warnings: string[];
}

const r10 = (v: number) => Math.round(v / 10) * 10;

const KIND_MAP: Record<string, 'bearing' | 'exterior' | 'partition' | 'low'> = {
  bearing: 'bearing', exterior: 'exterior', partition: 'partition', low: 'low',
  承重: 'bearing', 外墙: 'exterior', 非承重: 'partition', 矮墙: 'low',
};

/** 薄线段墙展开为矩形（默认 200 厚）；双向过厚/过小的墙体丢弃 */
function rectifyWall(w: DraftWallRaw): { rect: [number, number, number, number]; horizontal: boolean } | null {
  const x0 = r10(Math.min(w.x0, w.x1));
  const x1 = r10(Math.max(w.x0, w.x1));
  const y0 = r10(Math.min(w.y0, w.y1));
  const y1 = r10(Math.max(w.y0, w.y1));
  let width = x1 - x0;
  let height = y1 - y0;
  if (width < 50 && height < 50) return null; // 双向退化
  const horizontal = height <= width;
  if (horizontal && height < 100) {
    const cy = (y0 + y1) / 2;
    return { rect: [x0, Math.round(cy - 100), x1, Math.round(cy + 100)], horizontal };
  }
  if (!horizontal && width < 100) {
    const cx = (x0 + x1) / 2;
    return { rect: [Math.round(cx - 100), y0, Math.round(cx + 100), y1], horizontal };
  }
  if (Math.min(width, height) > 600) return null; // 双向过厚：多半不是墙
  if (Math.max(width, height) < 300) return null; // 过短
  return { rect: [x0, y0, x1, y1], horizontal };
}

interface DraftWallRaw { x0: number; y0: number; x1: number; y1: number; kind?: string }

/** 草稿 → SceneDocument；无法得到合法文档时返回 null */
export function draftToDocument(draft: FloorPlanDraft, projectName: string): { doc: SceneDocument | null; report: ImportReport } {
  const warnings: string[] = [];
  let dropped = 0;
  const validatedDraft = FloorPlanDraftSchema.safeParse(draft);
  if (!validatedDraft.success) {
    return { doc: null, report: { walls: 0, openings: 0, rooms: 0, dropped, warnings: validatedDraft.error.issues.map((issue) => issue.message) } };
  }
  draft = validatedDraft.data;

  /* ---- 墙体：规整 + 去重 + 外墙启发 ---- */
  const seen = new Set<string>();
  const walls: Array<{ id: string; rect: [number, number, number, number]; kind: 'bearing' | 'exterior' | 'partition' | 'low'; explicitKind: boolean }> = [];
  for (const raw of draft.walls) {
    const r = rectifyWall(raw);
    if (!r) { dropped++; continue; }
    const key = r.rect.join(',');
    if (seen.has(key)) { dropped++; continue; }
    seen.add(key);
    walls.push({ id: uid('w'), rect: r.rect, kind: KIND_MAP[raw.kind ?? ''] ?? 'partition', explicitKind: raw.kind !== undefined });
  }
  if (!walls.length) {
    return {
      doc: null,
      report: {
        walls: 0, openings: 0, rooms: 0, dropped,
        warnings: ['未能从图片中识别出有效墙体', ...(dropped ? [`已忽略 ${dropped} 个过短或重复的墙体`] : [])],
      },
    };
  }
  // Only classify a wall as exterior when it is close to the bounding edge along its normal axis.
  const bx0 = Math.min(...walls.map((w) => w.rect[0]));
  const by0 = Math.min(...walls.map((w) => w.rect[1]));
  const bx1 = Math.max(...walls.map((w) => w.rect[2]));
  const by1 = Math.max(...walls.map((w) => w.rect[3]));
  const TOL = 260;
  for (const w of walls) {
    if (w.kind !== 'partition' || w.explicitKind) continue;
    const [x0, y0, x1, y1] = w.rect;
    const horizontal = x1 - x0 >= y1 - y0;
    const coverage = horizontal
      ? (x1 - x0) / Math.max(1, bx1 - bx0)
      : (y1 - y0) / Math.max(1, by1 - by0);
    const nearPerimeter = horizontal
      ? Math.abs(y0 - by0) <= TOL || Math.abs(y1 - by1) <= TOL
      : Math.abs(x0 - bx0) <= TOL || Math.abs(x1 - bx1) <= TOL;
    const onEdge = nearPerimeter && coverage >= 0.45;
    if (onEdge) w.kind = 'exterior';
  }

  /* ---- 门窗：吸附宿主墙 + 补齐门扇字段 ---- */
  const openings: Array<Record<string, unknown>> = [];
  for (const o of draft.openings ?? []) {
    const host = walls.find((w) => {
      const [wx0, wy0, wx1, wy1] = w.rect;
      const cx = (o.rect[0] + o.rect[2]) / 2;
      const cy = (o.rect[1] + o.rect[3]) / 2;
      const horizontal = wy1 - wy0 <= wx1 - wx0;
      return horizontal
        ? cx >= wx0 - 100 && cx <= wx1 + 100 && cy >= wy0 - 260 && cy <= wy1 + 260
        : cy >= wy0 - 100 && cy <= wy1 + 100 && cx >= wx0 - 260 && cx <= wx1 + 260;
    });
    if (!host) { dropped++; warnings.push(`一个${o.kind === 'window' ? '窗' : '门'}洞未能吸附到墙体，已忽略`); continue; }
    const [wx0, wy0, wx1, wy1] = host.rect;
    const horizontal = wy1 - wy0 <= wx1 - wx0;
    let a: number; let b: number; let rect: [number, number, number, number];
    if (horizontal) {
      const span = Math.min(4000, Math.max(300, o.rect[2] - o.rect[0]));
      const cx = Math.min(Math.max((o.rect[0] + o.rect[2]) / 2, wx0 + span / 2 + 100), wx1 - span / 2 - 100);
      if (wx1 - wx0 < span + 200) { dropped++; warnings.push(`一个${o.kind === 'window' ? '窗' : '门'}洞所在墙段过短，已忽略`); continue; }
      a = Math.round(cx - span / 2);
      b = Math.round(cx + span / 2);
      rect = [a, wy0, b, wy1];
    } else {
      const span = Math.min(4000, Math.max(300, o.rect[3] - o.rect[1]));
      const cy = Math.min(Math.max((o.rect[1] + o.rect[3]) / 2, wy0 + span / 2 + 100), wy1 - span / 2 - 100);
      if (wy1 - wy0 < span + 200) { dropped++; warnings.push(`一个${o.kind === 'window' ? '窗' : '门'}洞所在墙段过短，已忽略`); continue; }
      a = Math.round(cy - span / 2);
      b = Math.round(cy + span / 2);
      rect = [wx0, a, wx1, b];
    }
    const item: Record<string, unknown> = { id: uid('o'), kind: o.kind, rect, height: o.kind === 'window' ? 1500 : o.kind === 'sliding' ? 2400 : 2100, sill: o.kind === 'window' ? 900 : 0 };
    if (o.kind === 'door' || o.kind === 'entry') {
      item.hinge = o.hinge ?? [rect[0], rect[1]];
      item.closeDir = o.closeDir ?? (horizontal ? [0, 1] : [1, 0]);
      item.openDir = o.openDir ?? (horizontal ? [-1, 0] : [0, -1]);
      item.span = horizontal ? rect[2] - rect[0] : rect[3] - rect[1];
    }
    if (o.kind === 'sliding') item.vertical = !horizontal;
    openings.push(item);
  }

  /* ---- 房间：多边形校验 + 材质启发 ---- */
  const rooms: Array<{
    id: string;
    name: string;
    poly: Array<[number, number]>;
    labelAt: [number, number];
    floorMaterialId: string;
    counted?: boolean;
  }> = [];
  for (const r of draft.rooms ?? []) {
    const poly = r.poly.map(([x, y]) => [r10(x), r10(y)] as [number, number]);
    if (poly.length < 3 || !isSimplePolygon(poly)) { dropped++; warnings.push(`房间「${r.name}」边界无效，已忽略`); continue; }
    const labelAt: [number, number] = [
      Math.round(poly.reduce((s, p) => s + p[0], 0) / poly.length),
      Math.round(poly.reduce((s, p) => s + p[1], 0) / poly.length),
    ];
    rooms.push({
      id: uid('r'),
      name: r.name.trim().slice(0, 60) || '房间',
      poly, labelAt,
      floorMaterialId: materialHeuristic(r.name),
      ...(r.name.includes('飘窗') ? { counted: false } : {}),
    });
  }

  if (dropped > 0) warnings.unshift(`已忽略 ${dropped} 个重复、过短或无法吸附的识别对象`);

  const outsideImportBounds = walls.some(({ rect }) => rect.some((coordinate) => Math.abs(coordinate) > MAX_FLOORPLAN_COORDINATE_MM)) ||
    rooms.some((room) => room.poly.some(([x, y]) => Math.abs(x) > MAX_FLOORPLAN_COORDINATE_MM || Math.abs(y) > MAX_FLOORPLAN_COORDINATE_MM));
  if (outsideImportBounds) {
    return {
      doc: null,
      report: { walls: walls.length, openings: openings.length, rooms: rooms.length, dropped, warnings: [...warnings, '户型范围超过 100 米，未创建项目；请检查截图或重新标定比例'] },
    };
  }

  /* ---- 组装 + 校验；保留所有有效实体，遇到结构错误时要求修正草稿 ---- */
  const build = (): SceneDocument => ({
    schemaVersion: 1,
    meta: { name: projectName, units: 'mm' },
    levels: [{
      id: 'lv1', name: '一层', elevation: 0,
      walls: walls.map((w) => ({ id: w.id, x0: w.rect[0], y0: w.rect[1], x1: w.rect[2], y1: w.rect[3], kind: w.kind, height: w.kind === 'low' ? 1100 : 2800 })),
      rooms: structuredClone(rooms) as never,
      openings: structuredClone(openings) as never,
      instances: [],
    }],
  });

  const doc = build();
  const parsed = SceneDocumentSchema.safeParse(doc);
  if (parsed.success) return { doc: parsed.data, report: { walls: walls.length, openings: openings.length, rooms: rooms.length, dropped, warnings } };
  return {
    doc: null,
    report: {
      walls: walls.length, openings: openings.length, rooms: rooms.length, dropped,
      warnings: [...warnings, ...formatSceneIssues(parsed.error).map((issue) => `${issue.path}: ${issue.message}`), '识别结果没有被写入，请移除或重新识别无法修正的对象'],
    },
  };
}

function materialHeuristic(name: string): string {
  if (/卫|厕|洗/.test(name)) return 'antislip';
  if (/厨/.test(name)) return 'tile600';
  if (/卧|室|房/.test(name)) return 'wood';
  if (/阳台/.test(name)) return 'walnut';
  if (/飘窗/.test(name)) return 'marble';
  return 'tile800';
}
