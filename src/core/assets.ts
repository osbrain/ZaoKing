/* ============================================================
 * scene-core · 官方资产目录与材质库
 * 数据自原型 index.html 的 LIB / MATS 移植。
 * 生产环境中此目录迁入数据库 Asset / Material 表 + pgvector 检索，
 * resolveAssetByQuery 的匹配逻辑保持不变。
 * ============================================================ */

import type { Asset, Material } from './types';

export const MATERIALS: Material[] = [
  { id: 'wood', name: '橡木地板', price: 320, sw: '#b38a5b' },
  { id: 'walnut', name: '胡桃木地板', price: 380, sw: '#744b2f' },
  { id: 'tile800', name: '800 地砖', price: 220, sw: '#cbc3b7' },
  { id: 'tile600', name: '600 地砖', price: 160, sw: '#bdc5c1' },
  { id: 'marble', name: '大理石', price: 650, sw: '#d9d5cd' },
  { id: 'antislip', name: '300 防滑砖', price: 140, sw: '#afb8b3' },
  { id: 'terrazzo', name: '水磨石', price: 280, sw: '#c9bca9' },
  { id: 'carpet', name: '满铺地毯', price: 200, sw: '#958ca7' },
];

export const materialById = (id: string): Material =>
  MATERIALS.find((m) => m.id === id) ?? MATERIALS[0];

/** 3D 占位体高度（mm），按原型类型 */
export const TYPE_H: Record<string, number> = {
  bed: 450, bunkbed: 1900, crib: 900, nightstand: 500, wardrobe: 2100, dresser: 800,
  desk: 760, chair: 880, bookshelf: 1800, baycushion: 250, sofa: 800,
  cornersofa: 850, armchair: 800, beanbag: 550, coffeetable: 450,
  sidetable: 500, tvstand: 500, rug: 15, shoecab: 1000, floorlamp: 1600,
  plant: 1400, table: 750, roundtable: 750, island: 900, barstool: 780,
  counter: 900, stove: 120, ksink: 120, fridge: 1800, fridgeSingle: 1800, fridge4: 1850, cabinet: 900,
  toilet: 760, vanity: 850, shower: 2000, bathtub: 550, washer: 850,
  waterheater: 1700, tv: 620, aircon: 1800, acwall: 300, dishwasher: 850,
  ovencol: 2100, dryer: 850, purifier: 650, officechair: 900, piano: 1200,
  treadmill: 1300,
};

type CatalogItem = [string, string, number, number, string, string?, string[]?, number?];

const RAW_LIB: Array<{ cat: string; items: CatalogItem[] }> = [
  { cat: '卧室', items: [
    ['bed', '双人床 1.8×2.0m', 1800, 2000, '#718d99', undefined, ['1.8米床', '双人床']], ['bed', '双人床 1.5×2.0m', 1500, 2000, '#94798c'], ['bed', '单人床 1.2×2.0m', 1200, 2000, '#aa854f'],
    ['crib', '婴儿床', 1250, 700, '#b39a70'], ['nightstand', '床头柜', 450, 400, '#a98257'], ['wardrobe', '衣柜', 2000, 600, '#b09b7d'],
    ['wardrobe', '小衣柜', 1200, 550, '#b09b7d'], ['dresser', '梳妆台', 1000, 450, '#aa9271'], ['desk', '书桌', 1200, 600, '#a77c4f'],
    ['chair', '椅子', 450, 480, '#8f8574'], ['bookshelf', '书架', 800, 300, '#9d754b'], ['baycushion', '飘窗垫', 520, 1800, '#a59173'],
    ['bed', '加大双人床 1.8×2.2m', 1800, 2200, '#536f62', 'bed-king-1800x2200', ['加大床', '特大床', '1.8米床']],
    ['bed', '儿童床 0.9×1.9m', 900, 1900, '#aa854f', 'bed-child-900x1900', ['儿童床', '小床']],
    ['bed', '单人床 1.0×2.0m', 1000, 2000, '#718d99', 'bed-single-1000x2000', ['单人床', '窄床']],
    ['bunkbed', '双层单人床 1.0×2.0m', 1000, 2000, '#9a734a', 'bed-bunk-1000x2000', ['双层床', '上下铺', '高低床', '上下床']],
    ['bunkbed', '加宽双层床 1.2×2.0m', 1200, 2000, '#8b755f', 'bed-bunk-1200x2000', ['双层床', '上下铺', '高低床']],
    ['wardrobe', '通顶衣柜 2.4m', 2400, 600, '#8f7255', 'wardrobe-full-height-2400', ['大衣柜', '通顶柜']]
  ] },
  { cat: '客厅', items: [
    ['sofa', '三人沙发', 2400, 900, '#536f62'], ['sofa', '双人沙发', 1700, 880, '#667c90'], ['cornersofa', '转角沙发', 2800, 1700, '#4d6858'],
    ['armchair', '单人沙发', 850, 850, '#986f4d'], ['beanbag', '懒人沙发', 800, 800, '#aa7543'], ['coffeetable', '茶几', 1300, 650, '#a77c4f'],
    ['sidetable', '边几', 500, 500, '#9d7449'], ['tvstand', '电视柜', 2400, 400, '#916b45'], ['rug', '地毯', 2400, 1700, '#a3957e'],
    ['shoecab', '鞋柜', 1000, 350, '#b09b7d'], ['shoecab', '玄关柜', 1400, 380, '#a99579'], ['floorlamp', '落地灯', 450, 450, '#3d3a34'],
    ['plant', '绿植', 500, 500, '#5f7c49'], ['plant', '大绿植', 700, 700, '#587643'],
    ['sofa', '小户型双人沙发 1.8m', 1800, 850, '#667c90', 'sofa-loveseat-1800', ['双人沙发', '小沙发', '小户型']],
    ['sofa', '加宽三人沙发 2.8m', 2800, 950, '#536f62', 'sofa-wide-2800', ['三人沙发', '大沙发']],
    ['cornersofa', '大户型转角沙发 3.2m', 3200, 1800, '#4d6858', 'sofa-corner-3200', ['L型沙发', '转角沙发']],
    ['tvstand', '电视柜 1.8m', 1800, 400, '#9d7449', 'tvstand-1800', ['电视柜', '电视地柜']],
    ['tvstand', '电视柜 3.0m', 3000, 450, '#744b2f', 'tvstand-3000', ['电视柜', '加长电视柜']],
    ['rug', '客厅地毯 2.0×3.0m', 2000, 3000, '#958ca7', 'rug-living-2000x3000', ['长地毯', '大地毯']]
  ] },
  { cat: '餐厨', items: [
    ['table', '餐桌', 1400, 800, '#a77c4f'], ['table', '六人餐桌', 1800, 900, '#9a734a'], ['roundtable', '圆桌', 1000, 1000, '#a77c4f'],
    ['chair', '餐椅', 450, 480, '#8f8574'], ['island', '岛台', 1800, 900, '#c3bbb0'], ['barstool', '吧椅', 420, 420, '#6b5d4c'],
    ['counter', '橱柜台面', 1600, 600, '#c3bbb0'], ['stove', '燃气灶', 750, 450, '#a4a5a2'], ['ksink', '水槽', 800, 450, '#a1b0b5'],
    ['fridge', '冰箱', 700, 700, '#a8b5ba'], ['cabinet', '餐边柜', 1600, 400, '#b09b7d'],
    ['table', '四人餐桌 1.2×0.75m', 1200, 750, '#a77c4f', 'table-dining-1200x750', ['四人桌', '小餐桌']],
    ['table', '八人餐桌 2.2×1.0m', 2200, 1000, '#744b2f', 'table-dining-2200x1000', ['八人桌', '长餐桌', '大餐桌']],
    ['island', '加长厨房岛台 2.4m', 2400, 950, '#b09b7d', 'island-kitchen-2400', ['厨房岛台', '中岛']],
    ['counter', '加长橱柜台面 2.4m', 2400, 600, '#c3bbb0', 'counter-kitchen-2400', ['橱柜', '厨房台面']]
  ] },
  { cat: '卫浴', items: [
    ['toilet', '马桶', 400, 700, '#f0efeb'], ['vanity', '浴室柜', 800, 500, '#b0b9bb'], ['vanity', '双盆浴室柜', 1200, 500, '#b0b9bb'],
    ['shower', '淋浴房', 900, 900, '#9eb4bb'], ['bathtub', '浴缸', 1600, 750, '#c4cdcb'], ['washer', '洗衣机', 600, 600, '#a8b5b8'],
    ['waterheater', '电热水器', 800, 450, '#c0c3be'], ['cabinet', '储物柜', 1000, 400, '#b09b7d'],
    ['vanity', '紧凑浴室柜 0.6m', 600, 480, '#718d99', 'vanity-compact-600', ['小浴室柜', '单盆浴室柜']],
    ['vanity', '加宽浴室柜 1.5m', 1500, 550, '#8f7255', 'vanity-wide-1500', ['大浴室柜', '双盆浴室柜']],
    ['shower', '长方形淋浴房 0.9×1.2m', 900, 1200, '#9eb4bb', 'shower-900x1200', ['淋浴房', '淋浴隔断']],
    ['bathtub', '加长浴缸 1.7m', 1700, 800, '#c4cdcb', 'bathtub-1700', ['浴缸', '独立浴缸']]
  ] },
  { cat: '家电', items: [
    ['tv', '65 寸电视', 1450, 80, '#1d1d1f'], ['tv', '55 寸电视', 1230, 80, '#1d1d1f'], ['fridge', '对开门冰箱', 910, 700, '#c9ced3'],
    ['aircon', '柜机空调', 500, 380, '#c2c7c5'], ['acwall', '挂机空调', 900, 250, '#c2c7c5'], ['dishwasher', '洗碗机', 600, 600, '#a3adaf'],
    ['ovencol', '蒸烤箱高柜', 600, 600, '#b09b7d'], ['dryer', '烘干机', 600, 600, '#a8b5b8'], ['purifier', '空气净化器', 400, 300, '#c0c3be'],
    ['fridgeSingle', '小型单门冰箱 300L', 600, 650, '#a8b5ba', 'fridge-single-300l', ['单门冰箱', '小冰箱', '300L']],
    ['fridge', '大容量双开门冰箱 600L', 1000, 750, '#8c989d', 'fridge-side-by-side-600l', ['双开门冰箱', '对开门冰箱', '600L']],
    ['fridge4', '十字门冰箱 500L', 830, 700, '#9ba9ad', 'fridge-cross-door-500l', ['四门冰箱', '多门冰箱', '500L'], 1800],
    ['fridge4', '法式四门冰箱 600L', 900, 750, '#718d99', 'fridge-french-door-600l', ['四门冰箱', '多门冰箱', '法式多门', '600L']],
    ['fridge', '嵌入式冰箱 450L', 750, 700, '#b09b7d', 'fridge-built-in-450l', ['嵌入式冰箱', '橱柜冰箱', '450L']]
  ] },
  { cat: '书房 · 休闲', items: [
    ['desk', '长书桌', 1600, 700, '#9a734a'], ['officechair', '办公椅', 620, 620, '#4a4f55'], ['bookshelf', '大书架', 1600, 350, '#9d754b'],
    ['piano', '立式钢琴', 1500, 600, '#1f1d1b'], ['treadmill', '跑步机', 800, 1800, '#3a3a3c'], ['armchair', '阅读椅', 750, 800, '#c9a98a'],
    ['desk', '加宽书桌 1.8m', 1800, 800, '#744b2f', 'desk-study-1800', ['大书桌', '工作桌']],
    ['officechair', '人体工学椅 0.7m', 700, 700, '#384047', 'officechair-ergonomic-700', ['办公椅', '电脑椅', '人体工学椅']],
    ['bookshelf', '窄款书架 0.6m', 600, 300, '#9d754b', 'bookshelf-narrow-600', ['小书架', '窄书架']]
  ] },
];

function buildCatalog(): Asset[] {
  const out: Asset[] = [];
  RAW_LIB.forEach((group, gi) => {
    group.items.forEach((it, ii) => {
      const [type, name, w, d, color, stableId, extraTags = [], customHeight] = it;
      out.push({
        id: stableId ?? `a${gi}_${ii}`,
        type, name, w, d, color,
        category: group.cat,
        h: customHeight ?? TYPE_H[type] ?? 700,
        tags: [type, name, ...name.split(/[\s'"]+/).filter((s) => s.length > 1), ...extraTags],
      });
    });
  });
  return out;
}

export const CATALOG: Asset[] = buildCatalog();

const BUILTIN_ASSETS = new Map(CATALOG.map((asset) => [asset.id, asset]));

export const assetById = (id: string, projectAssets: readonly Asset[] = []): Asset | undefined =>
  BUILTIN_ASSETS.get(id) ?? projectAssets.find((asset) => asset.id === id);

export const assetCatalog = (projectAssets: readonly Asset[] = []): Asset[] =>
  [...CATALOG, ...projectAssets];

export const CATEGORIES = RAW_LIB.map((g) => g.cat);

/** 种子数据用：按 原型(type,name,w,d) 就近解析资产 */
export function resolveAsset(
  type: string,
  name: string,
  w: number,
  d: number,
): Asset {
  let best = CATALOG[0];
  let bestScore = -Infinity;
  for (const a of CATALOG) {
    let s = 0;
    if (a.type === type) s += 2;
    if (a.name === name) s += 4;
    else if (name && (a.name.includes(name) || name.includes(a.name.split(' ')[0]))) s += 1;
    s -= (Math.abs(a.w - w) + Math.abs(a.d - d)) / 10000;
    if (s > bestScore) { bestScore = s; best = a; }
  }
  return best;
}

/** AI / 搜索用：按自然语言查询解析资产（名称包含 > 标签 > 类型） */
export function resolveAssetByQuery(query: string, projectAssets: readonly Asset[] = []): Asset | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const norm = q.replace(/\s+/g, '');
  let best: Asset | null = null;
  let bestScore = 0;
  for (const a of assetCatalog(projectAssets)) {
    const name = a.name.replace(/\s+/g, '').toLowerCase();
    let s = 0;
    if (name === norm) s = 12;
    else if (name.includes(norm)) s = 9;
    else if (norm.includes(name)) s = name.length >= 3 ? 6 : 3;
    for (const tag of a.tags) {
      const t = tag.replace(/\s+/g, '').toLowerCase();
      if (!t) continue;
      if (t === norm) s = Math.max(s, 11);
      else if (t.includes(norm)) s = Math.max(s, 8);
      else if (norm.includes(t)) s = Math.max(s, t.length >= 3 ? 5 : 2);
    }
    if (s > bestScore) { bestScore = s; best = a; }
  }
  return bestScore >= 3 ? best : null;
}

/** "1.8米" / "1800mm" → mm */
export function parseWidthMm(text: string): number | null {
  const mm = text.match(/(\d+(?:\.\d+)?)\s*(?:mm|毫米)/i);
  if (mm) return Math.round(parseFloat(mm[1]));
  const m = text.match(/(\d+(?:\.\d+)?)\s*(?:米|m)(?!m)/i);
  if (m) return Math.round(parseFloat(m[1]) * 1000);
  return null;
}

/** 颜色/材质词汇 → 材质（规则模式的兜底匹配） */
const COLOR_HINTS: Array<[RegExp, string[]]> = [
  [/浅灰|淡灰|灰色/, ['tile800', 'marble', 'tile600']],
  [/白色|白/, ['marble', 'tile800']],
  [/木|原木/, ['wood', 'walnut']],
  [/深色|胡桃/, ['walnut']],
  [/大理石|石材/, ['marble']],
  [/瓷砖|地砖/, ['tile800', 'tile600']],
  [/防滑/, ['antislip']],
  [/地毯/, ['carpet']],
  [/水磨石/, ['terrazzo']],
];

export function resolveMaterialByQuery(query: string): Material | null {
  const q = query.trim();
  const byName = MATERIALS.find((m) => m.name.replace(/\s+/g, '').includes(q.replace(/\s+/g, '')));
  if (byName) return byName;
  for (const [re, ids] of COLOR_HINTS) {
    if (re.test(q)) {
      const hit = MATERIALS.find((m) => ids.includes(m.id));
      if (hit) return hit;
    }
  }
  return null;
}
