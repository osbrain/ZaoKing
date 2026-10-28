/* ============================================================
 * scene-core · 官方资产目录与材质库
 * 数据自原型 index.html 的 LIB / MATS 移植。
 * 生产环境中此目录迁入数据库 Asset / Material 表 + pgvector 检索，
 * resolveAssetByQuery 的匹配逻辑保持不变。
 * ============================================================ */

import type { Asset, Material } from './types';

export const MATERIALS: Material[] = [
  { id: 'wood', name: '橡木地板', price: 320, sw: '#d8b88a' },
  { id: 'walnut', name: '胡桃木地板', price: 380, sw: '#9b7250' },
  { id: 'tile800', name: '800 地砖', price: 220, sw: '#ebe6dc' },
  { id: 'tile600', name: '600 地砖', price: 160, sw: '#dfe3e1' },
  { id: 'marble', name: '大理石', price: 650, sw: '#f1eee8' },
  { id: 'antislip', name: '300 防滑砖', price: 140, sw: '#d3d8d4' },
  { id: 'terrazzo', name: '水磨石', price: 280, sw: '#e6dfd3' },
  { id: 'carpet', name: '满铺地毯', price: 200, sw: '#c9c3d3' },
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
    ['bed', '双人床 1.8m', 1800, 2000, '#c9d6df'], ['bed', '双人床 1.5m', 1500, 2000, '#d8c7dc'], ['bed', '单人床', 1200, 2000, '#e8d5b5'],
    ['crib', '婴儿床', 1250, 700, '#efe3d0'], ['nightstand', '床头柜', 450, 400, '#e8dccb'], ['wardrobe', '衣柜', 2000, 600, '#efe6d8'],
    ['wardrobe', '小衣柜', 1200, 550, '#efe6d8'], ['dresser', '梳妆台', 1000, 450, '#efe6d8'], ['desk', '书桌', 1200, 600, '#e2cfb4'],
    ['chair', '椅子', 450, 480, '#cfc6b8'], ['bookshelf', '书架', 800, 300, '#e2cfb4'], ['baycushion', '飘窗垫', 520, 1800, '#e7dccd']] },
  { cat: '客厅', items: [
    ['sofa', '三人沙发', 2400, 900, '#b7c4b0'], ['sofa', '双人沙发', 1700, 880, '#c3cbd6'], ['cornersofa', '转角沙发', 2800, 1700, '#b7c4b0'],
    ['armchair', '单人沙发', 850, 850, '#d6b99a'], ['beanbag', '懒人沙发', 800, 800, '#e0b98f'], ['coffeetable', '茶几', 1300, 650, '#e8dccb'],
    ['sidetable', '边几', 500, 500, '#d9c3a3'], ['tvstand', '电视柜', 2400, 400, '#e2cfb4'], ['rug', '地毯', 2400, 1700, '#d9cbb8'],
    ['shoecab', '鞋柜', 1000, 350, '#efe6d8'], ['shoecab', '玄关柜', 1400, 380, '#e6dccc'], ['floorlamp', '落地灯', 450, 450, '#3d3a34'],
    ['plant', '绿植', 500, 500, '#a9c39b'], ['plant', '大绿植', 700, 700, '#9dbb8c']] },
  { cat: '餐厨', items: [
    ['table', '餐桌', 1400, 800, '#e2cfb4'], ['table', '六人餐桌', 1800, 900, '#d8c2a2'], ['roundtable', '圆桌', 1000, 1000, '#e2cfb4'],
    ['chair', '餐椅', 450, 480, '#cfc6b8'], ['island', '岛台', 1800, 900, '#e9e5de'], ['barstool', '吧椅', 420, 420, '#6b5d4c'],
    ['counter', '橱柜台面', 1600, 600, '#e9e5de'], ['stove', '燃气灶', 750, 450, '#dcdcdc'], ['ksink', '水槽', 800, 450, '#e1e6ea'],
    ['fridge', '冰箱', 700, 700, '#dfe4e8'], ['cabinet', '餐边柜', 1600, 400, '#efe6d8']] },
  { cat: '卫浴', items: [
    ['toilet', '马桶', 400, 700, '#ffffff'], ['vanity', '浴室柜', 800, 500, '#eef1f3'], ['vanity', '双盆浴室柜', 1200, 500, '#eef1f3'],
    ['shower', '淋浴房', 900, 900, '#e4edf2'], ['bathtub', '浴缸', 1600, 750, '#eef3f6'], ['washer', '洗衣机', 600, 600, '#e6ebee'],
    ['waterheater', '电热水器', 800, 450, '#f4f4f2'], ['cabinet', '储物柜', 1000, 400, '#efe6d8']] },
  { cat: '家电', items: [
    ['tv', '65 寸电视', 1450, 80, '#1d1d1f'], ['tv', '55 寸电视', 1230, 80, '#1d1d1f'], ['fridge', '对开门冰箱', 910, 700, '#c9ced3'],
    ['aircon', '柜机空调', 500, 380, '#f6f7f8'], ['acwall', '挂机空调', 900, 250, '#f6f7f8'], ['dishwasher', '洗碗机', 600, 600, '#c9ced3'],
    ['ovencol', '蒸烤箱高柜', 600, 600, '#efe6d8'], ['dryer', '烘干机', 600, 600, '#e6ebee'], ['purifier', '空气净化器', 400, 300, '#f4f4f2']] },
  { cat: '书房 · 休闲', items: [
    ['desk', '长书桌', 1600, 700, '#d8c2a2'], ['officechair', '办公椅', 620, 620, '#4a4f55'], ['bookshelf', '大书架', 1600, 350, '#e2cfb4'],
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
  const m = text.match(/(\d+(?:\.\d+)?)\s*[米mM]/);
  if (m) return Math.round(parseFloat(m[1]) * 1000);
  const mm = text.match(/(\d{3,4})\s*mm/i);
  if (mm) return parseInt(mm[1], 10);
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
