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
  bed: 450, crib: 900, nightstand: 500, wardrobe: 2100, dresser: 800,
  desk: 760, chair: 880, bookshelf: 1800, baycushion: 250, sofa: 800,
  cornersofa: 850, armchair: 800, beanbag: 550, coffeetable: 450,
  sidetable: 500, tvstand: 500, rug: 15, shoecab: 1000, floorlamp: 1600,
  plant: 1400, table: 750, roundtable: 750, island: 900, barstool: 780,
  counter: 900, stove: 120, ksink: 120, fridge: 1800, cabinet: 900,
  toilet: 760, vanity: 850, shower: 2000, bathtub: 550, washer: 850,
  waterheater: 1700, tv: 620, aircon: 1800, acwall: 300, dishwasher: 850,
  ovencol: 2100, dryer: 850, purifier: 650, officechair: 900, piano: 1200,
  treadmill: 1300,
};

const RAW_LIB: Array<{ cat: string; items: Array<[string, string, number, number, string]> }> = [
  { cat: '卧室', items: [
    ['bed', '双人床 1.8m', 1800, 2000, '#718d99'], ['bed', '双人床 1.5m', 1500, 2000, '#94798c'], ['bed', '单人床', 1200, 2000, '#aa854f'],
    ['crib', '婴儿床', 1250, 700, '#b39a70'], ['nightstand', '床头柜', 450, 400, '#a98257'], ['wardrobe', '衣柜', 2000, 600, '#b09b7d'],
    ['wardrobe', '小衣柜', 1200, 550, '#b09b7d'], ['dresser', '梳妆台', 1000, 450, '#aa9271'], ['desk', '书桌', 1200, 600, '#a77c4f'],
    ['chair', '椅子', 450, 480, '#8f8574'], ['bookshelf', '书架', 800, 300, '#9d754b'], ['baycushion', '飘窗垫', 520, 1800, '#a59173']] },
  { cat: '客厅', items: [
    ['sofa', '三人沙发', 2400, 900, '#536f62'], ['sofa', '双人沙发', 1700, 880, '#667c90'], ['cornersofa', '转角沙发', 2800, 1700, '#4d6858'],
    ['armchair', '单人沙发', 850, 850, '#986f4d'], ['beanbag', '懒人沙发', 800, 800, '#aa7543'], ['coffeetable', '茶几', 1300, 650, '#a77c4f'],
    ['sidetable', '边几', 500, 500, '#9d7449'], ['tvstand', '电视柜', 2400, 400, '#916b45'], ['rug', '地毯', 2400, 1700, '#a3957e'],
    ['shoecab', '鞋柜', 1000, 350, '#b09b7d'], ['shoecab', '玄关柜', 1400, 380, '#a99579'], ['floorlamp', '落地灯', 450, 450, '#3d3a34'],
    ['plant', '绿植', 500, 500, '#5f7c49'], ['plant', '大绿植', 700, 700, '#587643']] },
  { cat: '餐厨', items: [
    ['table', '餐桌', 1400, 800, '#a77c4f'], ['table', '六人餐桌', 1800, 900, '#9a734a'], ['roundtable', '圆桌', 1000, 1000, '#a77c4f'],
    ['chair', '餐椅', 450, 480, '#8f8574'], ['island', '岛台', 1800, 900, '#c3bbb0'], ['barstool', '吧椅', 420, 420, '#6b5d4c'],
    ['counter', '橱柜台面', 1600, 600, '#c3bbb0'], ['stove', '燃气灶', 750, 450, '#a4a5a2'], ['ksink', '水槽', 800, 450, '#a1b0b5'],
    ['fridge', '冰箱', 700, 700, '#a8b5ba'], ['cabinet', '餐边柜', 1600, 400, '#b09b7d']] },
  { cat: '卫浴', items: [
    ['toilet', '马桶', 400, 700, '#f0efeb'], ['vanity', '浴室柜', 800, 500, '#b0b9bb'], ['vanity', '双盆浴室柜', 1200, 500, '#b0b9bb'],
    ['shower', '淋浴房', 900, 900, '#9eb4bb'], ['bathtub', '浴缸', 1600, 750, '#c4cdcb'], ['washer', '洗衣机', 600, 600, '#a8b5b8'],
    ['waterheater', '电热水器', 800, 450, '#c0c3be'], ['cabinet', '储物柜', 1000, 400, '#b09b7d']] },
  { cat: '家电', items: [
    ['tv', '65 寸电视', 1450, 80, '#1d1d1f'], ['tv', '55 寸电视', 1230, 80, '#1d1d1f'], ['fridge', '对开门冰箱', 910, 700, '#c9ced3'],
    ['aircon', '柜机空调', 500, 380, '#c2c7c5'], ['acwall', '挂机空调', 900, 250, '#c2c7c5'], ['dishwasher', '洗碗机', 600, 600, '#a3adaf'],
    ['ovencol', '蒸烤箱高柜', 600, 600, '#b09b7d'], ['dryer', '烘干机', 600, 600, '#a8b5b8'], ['purifier', '空气净化器', 400, 300, '#c0c3be']] },
  { cat: '书房 · 休闲', items: [
    ['desk', '长书桌', 1600, 700, '#9a734a'], ['officechair', '办公椅', 620, 620, '#4a4f55'], ['bookshelf', '大书架', 1600, 350, '#9d754b'],
    ['piano', '立式钢琴', 1500, 600, '#1f1d1b'], ['treadmill', '跑步机', 800, 1800, '#3a3a3c'], ['armchair', '阅读椅', 750, 800, '#c9a98a']] },
];

function buildCatalog(): Asset[] {
  const out: Asset[] = [];
  RAW_LIB.forEach((group, gi) => {
    group.items.forEach((it, ii) => {
      const [type, name, w, d, color] = it;
      out.push({
        id: `a${gi}_${ii}`,
        type, name, w, d, color,
        category: group.cat,
        h: TYPE_H[type] ?? 700,
        tags: [type, name, ...name.split(/[\s'"]+/).filter((s) => s.length > 1)],
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
    if (name === norm) s = 10;
    else if (name.includes(norm) || norm.includes(name)) s = 8;
    else {
      for (const tag of a.tags) {
        const t = tag.replace(/\s+/g, '').toLowerCase();
        if (t && (t.includes(norm) || norm.includes(t))) s = Math.max(s, t.length >= 2 ? 5 : 3);
      }
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
