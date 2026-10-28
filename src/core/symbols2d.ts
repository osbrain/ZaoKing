/* ============================================================
 * scene-core · 2D 符号渲染（自原型 index.html 1:1 移植）
 * furnSVG 生成家具平面图例；patterns 为地面材质填充；
 * openingsSvg / dimsSvg 生成门窗与尺寸标注。
 * 生产环境中资产将携带 plan2d 矢量符号或俯视投影图，此处为官方内置符号。
 * ============================================================ */

import type { Asset, Level } from './types';

/* ---------- 基础工具 ---------- */

export function hex2rgb(h: string): number[] {
  let s = h.replace('#', '');
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function shade(h: string, k: number): string {
  const f = (v: number) =>
    Math.max(0, Math.min(255, Math.round(k > 1 ? v + (255 - v) * (k - 1) * 2 : v * k)));
  return '#' + hex2rgb(h).map((v) => f(v).toString(16).padStart(2, '0')).join('');
}

const ST = 'stroke="#3d3a34" stroke-width="1" vector-effect="non-scaling-stroke"';
const DASH = 'stroke-dasharray="4 3"';
const rc = (x: number, y: number, w: number, h: number, f: string, ex = '') =>
  `<rect x="${x}" y="${y}" width="${Math.max(0, w)}" height="${Math.max(0, h)}" fill="${f}" ${ST} ${ex}/>`;
const ec = (cx: number, cy: number, rx: number, ry: number, f: string, ex = '') =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${Math.max(0, rx)}" ry="${Math.max(0, ry)}" fill="${f}" ${ST} ${ex}/>`;
const ln = (x1: number, y1: number, x2: number, y2: number, ex = '') =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${ST} ${ex}/>`;
const pa = (d: string, f = 'none', ex = '') => `<path d="${d}" fill="${f}" ${ST} ${ex}/>`;

/* ---------- 地面材质 patterns ---------- */

export function patternsDefs(): string {
  const plank = (id: string, base: string, line: string) =>
    `<pattern id="m-${id}" patternUnits="userSpaceOnUse" width="1800" height="360">
      <rect width="1800" height="360" fill="${base}"/>
      <path d="M0 0H1800M0 180H1800M1200 0V180M600 180V360" stroke="${line}" stroke-width="10"/>
      <path d="M100 70Q500 60 900 85T1700 75M200 260Q700 250 1100 275T1750 262" stroke="${line}" stroke-width="5" fill="none" opacity=".45"/></pattern>`;
  const tile = (id: string, size: number, base: string, line: string) =>
    `<pattern id="m-${id}" patternUnits="userSpaceOnUse" width="${size}" height="${size}">
      <rect width="${size}" height="${size}" fill="${base}"/><path d="M0 0H${size}M0 0V${size}" stroke="${line}" stroke-width="10"/></pattern>`;
  return (
    plank('wood', '#dcc09a', '#bf9d70') +
    plank('walnut', '#a57c56', '#80593a') +
    tile('tile800', 800, '#ece7de', '#d3cabb') +
    tile('tile600', 600, '#e2e6e3', '#c4cbc6') +
    tile('antislip', 300, '#d6dbd7', '#b3bab4') +
    `<pattern id="m-marble" patternUnits="userSpaceOnUse" width="1200" height="1200">
      <rect width="1200" height="1200" fill="#f3f0ea"/><path d="M0 0H1200M0 0V1200" stroke="#dcd5c8" stroke-width="10"/>
      <path d="M-50 300C250 260 380 520 700 470S1100 640 1260 600M200 1200C300 950 520 980 640 820" stroke="#d6cfc2" stroke-width="12" fill="none"/></pattern>
    <pattern id="m-terrazzo" patternUnits="userSpaceOnUse" width="500" height="500">
      <rect width="500" height="500" fill="#e8e1d5"/>
      <circle cx="60" cy="80" r="22" fill="#b9a58c"/><circle cx="310" cy="140" r="16" fill="#8fa3a0"/><circle cx="190" cy="330" r="26" fill="#c9b7a2"/>
      <circle cx="420" cy="400" r="18" fill="#a88f76"/><circle cx="90" cy="440" r="12" fill="#8fa3a0"/><circle cx="440" cy="40" r="10" fill="#b9a58c"/></pattern>
    <pattern id="m-carpet" patternUnits="userSpaceOnUse" width="120" height="120">
      <rect width="120" height="120" fill="#c9c3d3"/><circle cx="30" cy="30" r="8" fill="#bab3c6"/><circle cx="90" cy="90" r="8" fill="#bab3c6"/></pattern>
    <pattern id="p-grid" patternUnits="userSpaceOnUse" width="1000" height="1000">
      <path d="M500 0V1000M0 500H1000" stroke="#e5dfd3" stroke-width="8"/><path d="M0 0V1000M0 0H1000" stroke="#d8d0c1" stroke-width="14"/></pattern>`
  );
}

/* ---------- 家具平面图例（原型 furnSVG 全量移植） ---------- */

export function furnSVG(t: string, w: number, d: number, c: string, geometry?: Asset['geometry']): string {
  // SVG attributes never accept arbitrary strings from a saved document.
  c = /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#e5e0d5';
  const x = -w / 2;
  const y = -d / 2;
  const m = Math.min(w, d);
  switch (t) {
    case 'custom':
      return customPlanSvg(geometry?.shape ?? 'box', w, d, c, geometry?.parameters);
    case 'bed': {
      let s = rc(x, y, w, d, '#fbf8f2', 'rx="30"') + rc(x, y, w, Math.min(90, d * 0.05), shade(c, 0.62), 'rx="20"');
      const ph = Math.min(360, d * 0.18);
      const py = y + 150;
      if (w >= 1300) {
        const pw = (w - 240) / 2;
        s += rc(x + 80, py, pw, ph, '#fff', 'rx="70"') + rc(x + 160 + pw, py, pw, ph, '#fff', 'rx="70"');
      } else s += rc(x + 80, py, w - 160, ph, '#fff', 'rx="70"');
      const by = py + ph + 110;
      const bh = y + d - 15 - by;
      s += rc(x + 15, by, w - 30, bh, c, 'rx="40"') + pa(`M${x + 15} ${by + 300}H${x + w - 15}`, 'none', DASH);
      s += pa(`M${x + w - 15 - Math.min(420, w * 0.3)} ${by}L${x + w - 15} ${by}L${x + w - 15} ${by + Math.min(420, w * 0.3)}Z`, shade(c, 1.12));
      return s;
    }
    case 'sofa':
    case 'armchair': {
      const b = d * 0.24;
      const a = Math.min(200, w * 0.13);
      const n = t === 'armchair' ? 1 : w > 2200 ? 3 : 2;
      const cw = (w - 2 * a) / n;
      const dk = shade(c, 0.85);
      let s = rc(x, y, w, d, dk, 'rx="60"');
      for (let i = 0; i < n; i++) s += rc(x + a + i * cw, y + b, cw, d - b - 40, c, 'rx="40"');
      return s + rc(x, y, w, b, dk, 'rx="50"') + rc(x, y, a, d, dk, 'rx="50"') + rc(x + w - a, y, a, d, dk, 'rx="50"');
    }
    case 'cornersofa': {
      const k = Math.min(950, d * 0.56, w * 0.4);
      const b = 220;
      const dk = shade(c, 0.85);
      let s = pa(`M${x} ${y}H${x + w}V${y + k}H${x + k}V${y + d}H${x}Z`, dk);
      const cw = (w - b - 200) / 2;
      s += rc(x + b, y + b, cw, k - b - 30, c, 'rx="40"') + rc(x + b + cw, y + b, cw, k - b - 30, c, 'rx="40"') + rc(x + b, y + k, k - b - 30, d - k - 200, c, 'rx="40"');
      return s + rc(x, y, w, b, dk, 'rx="50"') + rc(x, y, b, d, dk, 'rx="50"') + rc(x + w - 200, y, 200, k, dk, 'rx="50"') + rc(x, y + d - 200, k, 200, dk, 'rx="50"');
    }
    case 'nightstand':
      return rc(x, y, w, d, c, 'rx="30"') + `<circle r="${m * 0.24}" fill="#fff6dd" ${ST}/>` + `<circle r="${m * 0.08}" fill="${shade(c, 0.8)}" ${ST}/>`;
    case 'wardrobe': {
      let s = rc(x, y, w, d, c) + ln(x + 50, 0, x + w - 50, 0);
      for (let hx = x + 160; hx < x + w - 100; hx += 180) s += ln(hx - 45, -d * 0.28, hx + 45, d * 0.28, 'opacity=".6"');
      return s;
    }
    case 'cabinet':
    case 'shoecab':
      return rc(x, y, w, d, c) + ln(x, y + d, x + w, y);
    case 'dresser':
      return rc(x, y, w, d, c, 'rx="20"') + rc(x + w * 0.2, y, w * 0.6, 55, '#dfe9ee') + ec(0, y + d + 180 > y + d ? y + d - 180 : y + d + 180, 160, 140, shade(c, 0.9));
    case 'desk':
      return rc(x, y, w, d, c, 'rx="20"') + rc(-w * 0.18, y + 50, w * 0.36, 45, '#555') + rc(-w * 0.14, y + d * 0.45, w * 0.28, d * 0.28, '#f4f4f4', 'rx="10"');
    case 'chair':
      return rc(x + 25, y + d * 0.16, w - 50, d * 0.84 - 10, c, 'rx="60"') + rc(x, y, w, d * 0.2, shade(c, 0.78), 'rx="40"');
    case 'bookshelf': {
      let s = rc(x, y, w, d, c);
      for (let bx = x + 400; bx < x + w - 50; bx += 400) s += ln(bx, y, bx, y + d);
      return s;
    }
    case 'baycushion':
      return rc(x, y, w, d, c, 'rx="60"') + rc(x + 60, y + 80, w - 120, Math.min(300, d * 0.2), '#fff', 'rx="60"') + rc(x + 60, y + d - 80 - Math.min(300, d * 0.2), w - 120, Math.min(300, d * 0.2), '#fff', 'rx="60"');
    case 'coffeetable':
      return rc(x, y, w, d, c, 'rx="80"') + rc(x + 60, y + 60, w - 120, d - 120, shade(c, 1.06), 'rx="50"');
    case 'tvstand':
      return rc(x, y, w, d, c) + rc(x + w * 0.15, y + 30, w * 0.7, 55, '#3a3a3a');
    case 'rug':
      return rc(x, y, w, d, c, 'rx="40" fill-opacity=".6"') + rc(x + 90, y + 90, w - 180, d - 180, 'none', 'rx="30" stroke-dasharray="3 3" opacity=".6"');
    case 'plant': {
      let s = `<circle r="${m / 2}" fill="${c}" fill-opacity=".85" ${ST}/>`;
      for (let k = 0; k < 8; k++) s += `<ellipse cx="0" cy="${-m * 0.27}" rx="${m * 0.1}" ry="${m * 0.21}" transform="rotate(${k * 45})" fill="${shade(c, 0.8)}" ${ST}/>`;
      return s + `<circle r="${m * 0.1}" fill="#8a6a4a" ${ST}/>`;
    }
    case 'table':
      return rc(x, y, w, d, c, 'rx="30"') + rc(x + 50, y + 50, w - 100, d - 100, 'none', 'rx="20" opacity=".4"');
    case 'roundtable':
      return ec(0, 0, w / 2, d / 2, c) + ec(0, 0, w / 2 - 50, d / 2 - 50, 'none', 'opacity=".4"');
    case 'counter':
      return rc(x, y, w, d, c) + ln(x, y + d - 40, x + w, y + d - 40, DASH);
    case 'stove': {
      let s = rc(x, y, w, d, '#2f2f2f', 'rx="20"');
      const r = m * 0.26;
      const pts = w / d > 1.4 ? [[-w / 4, 0], [w / 4, 0]] : [[-w / 4, -d / 4], [w / 4, -d / 4], [-w / 4, d / 4], [w / 4, d / 4]];
      pts.forEach(([px, py]) => {
        s += `<circle cx="${px}" cy="${py}" r="${r}" fill="none" stroke="#bbb" stroke-width="1" vector-effect="non-scaling-stroke"/><circle cx="${px}" cy="${py}" r="${(r * 0.45).toFixed(1)}" fill="#666"/>`;
      });
      return s;
    }
    case 'ksink':
      return rc(x, y, w, d, c, 'rx="20"') + rc(x + w * 0.06, y + d * 0.18, w * 0.42, d * 0.66, '#fff', 'rx="50"') + rc(x + w * 0.52, y + d * 0.18, w * 0.42, d * 0.66, '#fff', 'rx="50"') + `<circle cx="0" cy="${y + d * 0.09}" r="22" fill="#999"/>`;
    case 'fridge':
      return rc(x, y, w, d, c, 'rx="30"') + ln(x, y + d * 0.14, x + w, y + d * 0.14) + ln(0, y + d * 0.14, 0, y + d) + rc(-70, y + d * 0.5, 40, d * 0.25, '#aab') + rc(30, y + d * 0.5, 40, d * 0.25, '#aab');
    case 'toilet':
      return rc(x + w * 0.04, y, w * 0.92, d * 0.27, c, 'rx="30"') + ec(0, y + d * 0.27 + d * 0.36, w * 0.47, d * 0.36, c) + ec(0, y + d * 0.27 + d * 0.4, w * 0.3, d * 0.24, '#eef4f7');
    case 'vanity':
      return rc(x, y, w, d, c, 'rx="20"') + ec(0, y + d * 0.57, Math.min(w * 0.32, 260), d * 0.28, '#fff') + `<circle cx="0" cy="${y + d * 0.17}" r="26" fill="#999"/>`;
    case 'shower':
      return rc(x, y, w, d, c) + ln(x, y, x + w, y + d, DASH) + ln(x + w, y, x, y + d, DASH) + `<circle r="45" fill="#fff" ${ST}/>`;
    case 'bathtub':
      return rc(x, y, w, d, c, 'rx="40"') + rc(x + 80, y + 80, w - 160, d - 160, '#fff', `rx="${m * 0.33}"`) + `<circle cx="${x + w - 260}" cy="0" r="35" fill="#ccc" ${ST}/>`;
    case 'washer':
    case 'dryer':
      return rc(x, y, w, d, c, 'rx="30"') + rc(x, y, w, d * 0.14, shade(c, 0.9)) + `<circle cy="${d * 0.06}" r="${m * 0.34}" fill="#fff" ${ST}/><circle cy="${d * 0.06}" r="${m * 0.24}" fill="${t === 'dryer' ? '#e9dccb' : '#cfdde4'}" ${ST}/>`;
    case 'crib': {
      let s = rc(x, y, w, d, c, 'rx="20"') + rc(x + 45, y + 45, w - 90, d - 90, '#fff', 'rx="20"');
      for (let sx = x + 90; sx < x + w - 60; sx += 90) s += ln(sx, y, sx, y + 45, 'opacity=".5"') + ln(sx, y + d - 45, sx, y + d, 'opacity=".5"');
      return s;
    }
    case 'beanbag':
      return ec(0, 0, w / 2, d / 2, c) + ec(-w * 0.04, -d * 0.06, w * 0.3, d * 0.28, shade(c, 1.12), 'opacity=".9"');
    case 'sidetable':
      return ec(0, 0, w / 2, d / 2, c) + ec(0, 0, w * 0.12, d * 0.12, 'none', 'opacity=".5"');
    case 'floorlamp':
      return `<circle r="${m * 0.5}" fill="#fff6dd" fill-opacity=".85" ${ST}/>` + `<circle r="${m * 0.32}" fill="none" ${ST} ${DASH}/>` + `<circle r="${m * 0.07}" fill="${c}" ${ST}/>`;
    case 'island':
      return rc(x, y, w, d, c) + ln(x, y + d - 250, x + w, y + d - 250, DASH);
    case 'barstool':
      return `<circle r="${m / 2}" fill="${c}" ${ST}/><circle r="${(m * 0.3).toFixed(1)}" fill="${shade(c, 1.15)}" ${ST}/>`;
    case 'waterheater':
      return rc(x, y, w, d, c, `rx="${(d / 2).toFixed(1)}" ${DASH}`) + ln(x + w * 0.2, 0, x + w * 0.8, 0, DASH);
    case 'tv':
      return rc(x, y, w, d, c, 'rx="10"') + rc(x + w * 0.3, y + d, w * 0.4, Math.min(40, d), '#666');
    case 'aircon':
      return rc(x, y, w, d, c, 'rx="30"') + ln(x + 40, y + d * 0.72, x + w - 40, y + d * 0.72) + ln(x + 40, y + d * 0.86, x + w - 40, y + d * 0.86);
    case 'acwall': {
      let s = rc(x, y, w, d, c, `rx="30" ${DASH}`);
      [0.25, 0.5, 0.75].forEach((k) => { s += ln(x + w * k, y + d, x + w * k, y + d + 200, `${DASH} opacity=".6"`); });
      return s;
    }
    case 'dishwasher':
      return rc(x, y, w, d, c, 'rx="15"') + ln(x, y + d - 70, x + w, y + d - 70) + rc(x + w * 0.3, y + d - 45, w * 0.4, 25, '#888');
    case 'ovencol':
      return rc(x, y, w, d, c) + ln(x, y, x + w, y + d) + ln(x + w, y, x, y + d);
    case 'purifier':
      return rc(x, y, w, d, c, 'rx="60"') + rc(x + 45, y + 45, w - 90, d - 90, 'none', `rx="40" ${DASH}`);
    case 'officechair': {
      let s = '';
      for (let k = 0; k < 5; k++) s += `<line x1="0" y1="0" x2="0" y2="${(m * 0.48).toFixed(1)}" transform="rotate(${k * 72 + 36})" stroke="#555" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
      return s + rc(x + w * 0.12, y + d * 0.22, w * 0.76, d * 0.66, c, 'rx="80"') + rc(x + w * 0.15, y + d * 0.04, w * 0.7, d * 0.16, shade(c, 0.78), 'rx="40"') + rc(x + w * 0.02, y + d * 0.3, w * 0.1, d * 0.45, shade(c, 0.7), 'rx="30"') + rc(x + w * 0.88, y + d * 0.3, w * 0.1, d * 0.45, shade(c, 0.7), 'rx="30"');
    }
    case 'piano': {
      let s = rc(x, y, w, d * 0.55, c, 'rx="10"') + rc(x + 40, y + d * 0.55, w - 80, d * 0.4, shade(c, 1.4), 'rx="10"');
      const kx = x + 90;
      const kw = w - 180;
      const kd = d * 0.2;
      s += rc(kx, y + d * 0.55, kw, kd, '#faf8f3');
      for (let i = 1; i < 26; i++) s += ln(kx + (kw * i) / 26, y + d * 0.55, kx + (kw * i) / 26, y + d * 0.55 + kd, 'opacity=".5"');
      return s;
    }
    case 'treadmill':
      return rc(x, y, w, d, c, 'rx="50"') + rc(x + 90, y + 320, w - 180, d - 400, '#1c1c1e', 'rx="25"') + rc(x, y, w, 230, shade(c, 1.4), 'rx="40"');
    default:
      return rc(x, y, w, d, c);
  }
}

function customPlanSvg(
  shape: NonNullable<Asset['geometry']>['shape'], w: number, d: number, color: string,
  parameters?: NonNullable<Asset['geometry']>['parameters'],
): string {
  const x = -w / 2, y = -d / 2, p = parameters ?? {};
  const label = (geometry: string) => geometry;
  switch (shape) {
    case 'cylinder': case 'roundTable': case 'planter':
      return ec(0, 0, w * .48, d * .48, color) + ec(0, 0, w * .42, d * .42, 'none');
    case 'cabinet': case 'wallCabinet': case 'wardrobe': case 'tvConsole': case 'kitchenIsland': {
      const count = p.compartments ?? 2;
      let s = rc(x, y, w, d, color, 'rx="18"') + rc(x + 45, y + 45, w - 90, d - 90, 'none', 'rx="10"');
      for (let i = 1; i < count; i++) s += ln(x + w * i / count, y + 50, x + w * i / count, y + d - 50);
      if (shape === 'wardrobe') for (let i = 0; i < count; i++) s += ec(x + w * (i + .83) / count, 0, 14, 14, '#807261');
      if (shape === 'kitchenIsland') s += rc(x + w * .14, y + d * .2, w * .3, d * .24, '#9ca7a7', 'rx="35"') + ec(x + w * .68, y + d * .32, Math.min(w, d) * .08, Math.min(w, d) * .08, 'none');
      return s;
    }
    case 'bookcase': {
      const count = p.shelves ?? 5;
      let s = rc(x, y, w, d, color) + ln(x + 45, y, x + 45, y + d) + ln(x + w - 45, y, x + w - 45, y + d);
      for (let i = 1; i < count; i++) s += ln(x + 45, y + d * i / count, x + w - 45, y + d * i / count);
      return s;
    }
    case 'dresser': {
      const count = p.drawers ?? 4;
      let s = rc(x, y, w, d, color, 'rx="12"');
      for (let i = 0; i < count; i++) {
        const rowY = y + d * i / count;
        s += rc(x + 70, rowY + 40, w - 140, d / count - 80, 'none', 'rx="10"') + ln(-45, rowY + d / count / 2, 45, rowY + d / count / 2);
      }
      return s;
    }
    case 'vanity':
      return rc(x, y, w, d, color, 'rx="18"') + rc(x + 55, y + 45, w - 110, d * .36, 'none') +
        ec(0, y + d * .68, w * .24, d * .22, '#f5f4ef') + ec(0, y + d * .68, 22, 22, '#88949a');
    case 'sofa': case 'cornerSofa': case 'armchair': {
      const count = shape === 'armchair' ? 1 : p.seats ?? 3, arm = Math.min(w * .14, d * .24);
      if (shape === 'cornerSofa') {
        const depth = Math.min(d * .32, w * .3);
        return rc(x, y, w, d, shade(color, .82), 'rx="80"') + rc(x + arm, y + depth, w - arm - depth, d - depth - 35, color, 'rx="55"') +
          rc(x + arm, y + 35, w - arm * 2, depth, shade(color, .76), 'rx="55"') + rc(x + arm, y + depth, depth, d - depth - 35, shade(color, .76), 'rx="55"');
      }
      let s = rc(x, y, w, d, shade(color, .82), 'rx="80"') + rc(x + arm, y + d * .25, w - arm * 2, d * .7, color, 'rx="55"');
      for (let i = 1; i < count; i++) s += ln(x + arm + (w - arm * 2) * i / count, y + d * .32, x + arm + (w - arm * 2) * i / count, y + d * .87);
      return s;
    }
    case 'bed':
      return rc(x, y, w, d, '#eee8de', 'rx="28"') + rc(x + 40, y + 45, w - 80, d * .18, shade(color, .75), 'rx="20"') +
        rc(x + 65, y + d * .26, w * .37, d * .16, '#fff', 'rx="42"') + rc(-x - w * .37 - 65, y + d * .26, w * .37, d * .16, '#fff', 'rx="42"') +
        rc(x + 25, y + d * .47, w - 50, d * .49, color, 'rx="35"');
    case 'diningTable': case 'desk': case 'rug':
      if (shape === 'rug') return rc(x, y, w, d, color, 'rx="100"') + rc(x + 65, y + 65, w - 130, d - 130, 'none', 'rx="65"');
      return rc(x, y, w, d, color, 'rx="32"') + rc(x + w * .1, y + d * .12, w * .8, d * .76, 'none', 'rx="20"') +
        (shape === 'desk' ? ec(0, y + d + Math.min(d * .18, 120), Math.min(w * .12, 160), Math.min(d * .12, 100), '#8c9694') : '');
    case 'chair':
      return rc(x + w * .12, y + d * .35, w * .76, d * .55, color, 'rx="22"') + rc(x + w * .12, y + d * .08, w * .76, d * .18, shade(color, .8), 'rx="15"');
    case 'bathtub':
      return rc(x, y, w, d, '#f6f5f1', 'rx="180"') + rc(x + w * .08, y + d * .08, w * .84, d * .84, color, 'rx="150"') + ec(x + w * .83, y + d * .16, 32, 32, '#a7abad');
    case 'toilet':
      return rc(x + w * .16, y, w * .68, d * .28, '#fff', 'rx="22"') + ec(0, y + d * .61, w * .43, d * .37, '#fff') + ec(0, y + d * .61, w * .28, d * .24, 'none');
    case 'shower':
      return rc(x, y, w, d, '#e8f0f1', 'rx="12"') + ln(x + 80, y + 80, x + w - 80, y + d - 80) + ln(x + w - 80, y + 80, x + 80, y + d - 80) + ec(x + w * .78, y + d * .2, 35, 35, '#839394');
    case 'floorLamp': case 'pendantLight': {
      const r = Math.min(w, d) * .44;
      return ec(0, 0, r, r, color) + ec(0, 0, r * .72, r * .72, '#fff9e8') +
        (shape === 'floorLamp' ? ec(0, 0, r * .12, r * .12, '#5d6062') : ec(0, 0, r * .1, r * .1, '#7a6d57'));
    }
  }
  return rc(x, y, w, d, color);
}

/* ---------- 门窗 2D 符号（原型 renderOpenings 移植） ---------- */

export function openingsSvg(level: Level): string {
  const WS = 'stroke="#4f7394" stroke-width="1" vector-effect="non-scaling-stroke"';
  const DS = 'stroke="#3d3a34" stroke-width="1" vector-effect="non-scaling-stroke"';
  let s = '';
  // 门窗台面
  const sill = (r: [number, number, number, number]) =>
    `<rect x="${r[0]}" y="${r[1]}" width="${r[2] - r[0]}" height="${r[3] - r[1]}" fill="#e2dacb" stroke="#b9b0a0" stroke-width="1" vector-effect="non-scaling-stroke" pointer-events="none"/>`;
  for (const o of level.openings) {
    if (o.kind === 'window') s += sill(o.rect);
    if (o.kind === 'door' || o.kind === 'entry') s += sill(o.rect);
    if (o.kind === 'sliding') s += sill(o.rect);
  }
  for (const o of level.openings) {
    const [x0, y0, x1, y1] = o.rect;
    const w = x1 - x0;
    const h = y1 - y0;
    if (o.kind === 'window') {
      s += `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#f7fbfd" ${WS}/>`;
      if (w >= h) [1 / 3, 2 / 3].forEach((t) => { s += `<line x1="${x0}" y1="${y0 + h * t}" x2="${x1}" y2="${y0 + h * t}" ${WS}/>`; });
      else [1 / 3, 2 / 3].forEach((t) => { s += `<line x1="${x0 + w * t}" y1="${y0}" x2="${x0 + w * t}" y2="${y1}" ${WS}/>`; });
    } else if ((o.kind === 'door' || o.kind === 'entry') && o.hinge && o.openDir && o.closeDir && o.span) {
      const [hx, hy] = o.hinge;
      const L = o.span;
      const T = 40;
      const ox = hx + o.openDir[0] * L;
      const oy = hy + o.openDir[1] * L;
      const cx2 = hx + o.closeDir[0] * L;
      const cy2 = hy + o.closeDir[1] * L;
      const sweep = o.openDir[0] * o.closeDir[1] - o.openDir[1] * o.closeDir[0] > 0 ? 1 : 0;
      const col = o.kind === 'entry' ? '#b5653a' : '#3d3a34';
      s += `<polygon points="${hx},${hy} ${ox},${oy} ${ox + o.closeDir[0] * T},${oy + o.closeDir[1] * T} ${hx + o.closeDir[0] * T},${hy + o.closeDir[1] * T}" fill="#fff" stroke="${col}" stroke-width="${o.kind === 'entry' ? 1.8 : 1}" vector-effect="non-scaling-stroke"/>`;
      s += `<path d="M${ox} ${oy}A${L} ${L} 0 0 ${sweep} ${cx2} ${cy2}" fill="none" ${DS} stroke-dasharray="5 3" opacity=".7"/>`;
    } else if (o.kind === 'sliding') {
      if (o.vertical) {
        const L = y1 - y0;
        const mx = (x0 + x1) / 2;
        s += `<rect x="${mx - 45}" y="${y0}" width="40" height="${L * 0.55}" fill="#fff" ${DS}/><rect x="${mx + 5}" y="${y1 - L * 0.55}" width="40" height="${L * 0.55}" fill="#fff" ${DS}/>`;
      } else {
        const L = x1 - x0;
        const my = (y0 + y1) / 2;
        s += `<rect x="${x0}" y="${my - 45}" width="${L * 0.55}" height="40" fill="#fff" ${DS}/><rect x="${x1 - L * 0.55}" y="${my + 5}" width="${L * 0.55}" height="40" fill="#fff" ${DS}/>`;
      }
    }
  }
  // 入户标识
  s += `<path d="M3350 8755H4350M4150 8600L4400 8755L4150 8910" fill="none" stroke="#b5653a" stroke-width="2" vector-effect="non-scaling-stroke"/>
        <text x="3380" y="8600" font-size="200" fill="#b5653a">入户</text>`;
  return s;
}

/* ---------- 尺寸标注（原型 renderDims 静态移植） ---------- */

export function dimsSvg(): string {
  const DC = '#7d7160';
  const LS = `stroke="${DC}" stroke-width="1" vector-effect="non-scaling-stroke"`;
  const TK = `stroke="${DC}" stroke-width="2" vector-effect="non-scaling-stroke"`;
  const txt = (x: number, y: number, v: number, rot?: boolean) =>
    `<text x="${x}" y="${y}" font-size="${v < 400 ? 140 : 200}" text-anchor="middle" fill="${DC}" ${rot ? `transform="rotate(-90 ${x} ${y})"` : ''}>${v}</text>`;
  const chain = (horiz: boolean, at: number, start: number, segs: number[]) => {
    const pts = [start];
    segs.forEach((v) => pts.push(pts[pts.length - 1] + v));
    let s = horiz
      ? `<line x1="${pts[0]}" y1="${at}" x2="${pts[pts.length - 1]}" y2="${at}" ${LS}/>`
      : `<line x1="${at}" y1="${pts[0]}" x2="${at}" y2="${pts[pts.length - 1]}" ${LS}/>`;
    pts.forEach((p) => {
      s += horiz
        ? `<line x1="${p}" y1="${at - 170}" x2="${p}" y2="${at + 170}" ${LS}/><line x1="${p - 80}" y1="${at + 80}" x2="${p + 80}" y2="${at - 80}" ${TK}/>`
        : `<line x1="${at - 170}" y1="${p}" x2="${at + 170}" y2="${p}" ${LS}/><line x1="${at - 80}" y1="${p + 80}" x2="${at + 80}" y2="${p - 80}" ${TK}/>`;
    });
    segs.forEach((v, i) => {
      const mid = (pts[i] + pts[i + 1]) / 2;
      s += horiz ? txt(mid, at - 70, v) : txt(at - 70, mid, v, true);
    });
    return s;
  };
  return (
    chain(true, -750, 0, [1580, 240, 2760, 240, 1540, 240, 3670]) + chain(true, -1250, 0, [10270]) +
    chain(true, 11350, 0, [2180, 240, 2160, 240, 5450, 240, 1340]) + chain(true, 11850, 0, [11850]) +
    chain(false, -800, 0, [3370, 1580, 240, 2770, 240, 2360]) + chain(false, -1300, 0, [10560]) +
    chain(false, 12750, 0, [3370, 240, 2760, 240, 3950]) + chain(false, 13250, 0, [10560])
  );
}
