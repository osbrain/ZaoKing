/* ============================================================
 * scene-core · 类型定义
 * 单位：mm 整数。2D 原点 = 户型左上角，y 向下；
 * 3D 映射：x → x, 高度 → y, y2d → -z。
 * 本目录禁止 import React —— 需保证可被服务端（AI 执行器/校验）复用。
 * ============================================================ */

export type Vec2 = [number, number];

export type WallKind = 'bearing' | 'exterior' | 'partition' | 'low';

/** 轴对齐墙矩形（与原型数据一致；V1 墙体绘制工具可迁移为中心线模型） */
export interface Wall {
  id: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  kind: WallKind;
  /** 墙高 mm（矮墙 1100，其余 2800） */
  height: number;
  /** 可选的墙体表面颜色覆盖 */
  color?: string;
}

export interface Room {
  id: string;
  name: string;
  poly: Vec2[];
  /** 标签锚点 */
  labelAt?: Vec2;
  floorMaterialId: string;
  /** 飘窗等不计入使用面积 */
  counted?: boolean;
}

export type OpeningKind = 'door' | 'entry' | 'window' | 'sliding';

/** 门窗洞口：rect 为覆盖墙厚的洞口矩形（继承原型），host 墙在几何计算时按重叠动态求解 */
export interface Opening {
  id: string;
  kind: OpeningKind;
  rect: [number, number, number, number]; // x0, y0, x1, y1
  height: number; // 洞口高
  sill: number;   // 窗台高 / 0
  // 门专属：铰点、开启方向、关闭方向、门扇宽
  hinge?: Vec2;
  openDir?: Vec2;
  closeDir?: Vec2;
  span?: number;
  // 推拉门方向
  vertical?: boolean;
  /** bypass keeps leaves inside the opening; pocket modes store leaves beyond one opening end. */
  slideMode?: 'bypass' | 'pocket-start' | 'pocket-end';
}

/** 组件实例（放置在户型上的家具）：只存变换与覆盖项 */
export interface ComponentInstance {
  id: string;
  assetId: string;
  /** 平面变换：中心点 + 旋转角(deg, 顺时针) */
  t: { x: number; y: number; rot: number };
  /** 尺寸覆盖（参数化的最简形态） */
  size?: { w?: number; d?: number; h?: number };
  /** 每个实例单独覆盖资产的结构参数（如层板、抽屉或座位数量） */
  parameters?: Partial<CustomGeometry['parameters']>;
  /** 颜色覆盖（2D 图例着色 / 3D 占位体着色） */
  color?: string;
  locked?: boolean;
}

export interface Level {
  id: string;
  name: string;
  elevation: number;
  walls: Wall[];
  rooms: Room[];
  openings: Opening[];
  instances: ComponentInstance[];
}

export interface SceneDocument {
  schemaVersion: 1;
  meta: { name: string; units: 'mm' };
  levels: Level[];
  /** 项目内组件定义，与方案一起保存；旧文档无需迁移。 */
  assets?: CustomAsset[];
  /** 导入包内预置组件的定义快照，防止目录升级后资产 ID 指向新定义。 */
  assetSnapshots?: Asset[];
  /** 地面材质快照，用于跨目录版本保留外观和铺装参数。 */
  materialSnapshots?: Material[];
}

/* ---------- 资产目录（Asset）与材质（Material） ---------- */

export interface Asset {
  id: string;
  /** 原型家具类型（决定 2D 图例与 3D 占位造型） */
  type: string;
  name: string;
  category: string;
  w: number;
  d: number;
  /** 3D 占位体高度 */
  h: number;
  color: string;
  tags: string[];
  /** 声明式几何，同时决定 2D 轮廓和 3D 造型。 */
  geometry?: CustomGeometry;
}

export type CustomShape =
  | 'box' | 'cylinder' | 'cabinet' | 'wallCabinet' | 'wardrobe' | 'bookcase' | 'dresser' | 'tvConsole' | 'vanity' | 'kitchenIsland'
  | 'sofa' | 'cornerSofa' | 'armchair' | 'bed' | 'roundTable' | 'diningTable' | 'desk' | 'chair' | 'rug'
  | 'bathtub' | 'toilet' | 'shower' | 'planter' | 'floorLamp' | 'pendantLight';

export type CustomFinish = 'wood' | 'paint' | 'fabric' | 'metal' | 'ceramic' | 'glass';

export interface CustomGeometry {
  shape: CustomShape;
  finish?: CustomFinish;
  parameters?: { compartments?: number; openCompartments?: number; shelves?: number; drawers?: number; seats?: number };
}

export interface CustomAsset extends Asset {
  /** 使用 custom: 命名空间，格式由共享 schema 校验。 */
  id: string;
  type: 'custom';
  geometry: CustomGeometry;
}

export interface Material {
  id: string;
  name: string;
  /** 每平米价格（元），估算用 */
  price: number;
  /** 2D 填充底色 */
  sw: string;
  render?: {
    pattern: 'wood' | 'tile' | 'marble' | 'terrazzo' | 'carpet' | 'plain';
    tileMm?: [number, number];
    roughness?: number;
    groutColor?: string;
  };
}

/* ---------- 派生工具 ---------- */

export const getLevel = (doc: SceneDocument): Level => doc.levels[0];

export interface AssetRef {
  w: number;
  d: number;
  h: number;
  color: string;
  type: string;
  name: string;
}

export function instanceRef(
  inst: ComponentInstance,
  asset: Asset | undefined,
): AssetRef {
  const w = inst.size?.w ?? asset?.w ?? 600;
  const d = inst.size?.d ?? asset?.d ?? 600;
  return {
    w,
    d,
    h: inst.size?.h ?? asset?.h ?? 700,
    color: inst.color ?? asset?.color ?? '#e5e0d5',
    type: asset?.type ?? 'box',
    name: asset?.name ?? '未知组件',
  };
}

export function instanceGeometry(
  inst: ComponentInstance,
  asset: Asset | undefined,
): CustomGeometry | undefined {
  if (!asset?.geometry) return undefined;
  if (!inst.parameters) return asset.geometry;
  return {
    ...asset.geometry,
    parameters: { ...asset.geometry.parameters, ...inst.parameters },
  };
}

let _n = 1;
export const uid = (prefix = 'i') =>
  `${prefix}${Date.now().toString(36)}${(_n++).toString(36)}`;
