'use client';

/* 2D 平面视图：与 3D 订阅同一份 sceneStore 文档。
 * 两种工作模式：
 *  - 选择模式：家具拖拽/旋转、房间/墙体/门窗选中与编辑
 *  - 户型编辑工具：画墙（轴锁+吸附）、画房间地面、在墙上开门/开窗
 * 拖拽/绘制为瞬态本地 state，pointerup 才提交命令进撤销栈。 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSceneStore } from '@/stores/sceneStore';
import { useEditorStore, type Selection, type Tool, type WallPreset } from '@/stores/editorStore';
import type { Cmd } from '@/core/commands';
import { assetById, materialById } from '@/core/assets';
import { instanceRef, uid, type ComponentInstance, type Level, type Opening, type Vec2, type Wall } from '@/core/types';
import { docBBox, polyArea } from '@/core/geometry';
import { dimsSvg, furnSVG, openingsSvg, patternsDefs } from '@/core/symbols2d';

const NOLABEL = ['plant', 'floorlamp', 'sidetable', 'barstool', 'beanbag', 'rug'];
const GRID = 100; // 绘制吸附网格 mm
const SNAP_R = 260; // 端点吸附半径 mm
const MIN_WALL = 300;

const WALL_PRESETS: Record<WallPreset, { label: string; kind: Wall['kind']; thickness: number; height: number }> = {
  exterior: { label: '外墙 240', kind: 'exterior', thickness: 240, height: 2800 },
  partition: { label: '内墙 200', kind: 'partition', thickness: 200, height: 2800 },
  low: { label: '矮墙 240', kind: 'low', thickness: 240, height: 1100 },
};

const OPENING_PRESETS = {
  door: { width: 900, height: 2100, sill: 0 },
  window: { width: 1500, height: 1500, sill: 900 },
} as const;

type Rect = [number, number, number, number];

const centerInRect = (r: Rect, w: { x0: number; y0: number; x1: number; y1: number }) => {
  const cx = (r[0] + r[2]) / 2;
  const cy = (r[1] + r[3]) / 2;
  return cx >= w.x0 && cx <= w.x1 && cy >= w.y0 && cy <= w.y1;
};

function snapPoint(level: Level, p: Vec2): Vec2 {
  let best: Vec2 | null = null;
  let bd = SNAP_R;
  for (const w of level.walls) {
    for (const c of [[w.x0, w.y0], [w.x1, w.y0], [w.x0, w.y1], [w.x1, w.y1]] as Vec2[]) {
      const d = Math.hypot(c[0] - p[0], c[1] - p[1]);
      if (d < bd) { bd = d; best = c; }
    }
  }
  if (best) return best;
  return [Math.round(p[0] / GRID) * GRID, Math.round(p[1] / GRID) * GRID];
}

function axisLock(a: Vec2, b: Vec2): Vec2 {
  return Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? [b[0], a[1]] : [a[0], b[1]];
}

function wallRectFromSegment(a: Vec2, b: Vec2, t: number): { x0: number; y0: number; x1: number; y1: number } {
  const horizontal = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]);
  if (horizontal) {
    const x0 = Math.min(a[0], b[0]);
    const x1 = Math.max(a[0], b[0]);
    const cy = (a[1] + b[1]) / 2;
    return { x0, y0: Math.round(cy - t / 2), x1, y1: Math.round(cy + t / 2) };
  }
  const y0 = Math.min(a[1], b[1]);
  const y1 = Math.max(a[1], b[1]);
  const cx = (a[0] + b[0]) / 2;
  return { x0: Math.round(cx - t / 2), y0, x1: Math.round(cx + t / 2), y1 };
}

function normRect(a: Vec2, b: Vec2): { x0: number; y0: number; x1: number; y1: number } {
  return { x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]) };
}

/** 在墙身上于点击处生成标准门/窗洞口（自动贴合墙厚、限制在墙段内） */
function openingOnWall(wall: Wall, p: Vec2, kind: 'door' | 'window'): Opening | null {
  const horizontal = wall.x1 - wall.x0 >= wall.y1 - wall.y0;
  const preset = OPENING_PRESETS[kind];
  if (horizontal) {
    const span = wall.x1 - wall.x0;
    if (span < preset.width + 200) return null;
    const cx = Math.min(Math.max(p[0], wall.x0 + preset.width / 2 + 100), wall.x1 - preset.width / 2 - 100);
    const rect: Rect = [Math.round(cx - preset.width / 2), wall.y0, Math.round(cx + preset.width / 2), wall.y1];
    const o: Opening = { id: '', kind, rect, height: preset.height, sill: preset.sill };
    if (kind === 'door') {
      o.hinge = [rect[0], rect[1]];
      o.closeDir = [0, 1];
      o.openDir = [-1, 0];
      o.span = preset.width;
    }
    return o;
  }
  const span = wall.y1 - wall.y0;
  if (span < preset.width + 200) return null;
  const cy = Math.min(Math.max(p[1], wall.y0 + preset.width / 2 + 100), wall.y1 - preset.width / 2 - 100);
  const rect: Rect = [wall.x0, Math.round(cy - preset.width / 2), wall.x1, Math.round(cy + preset.width / 2)];
  const o: Opening = { id: '', kind, rect, height: preset.height, sill: preset.sill };
  if (kind === 'door') {
    o.hinge = [rect[0], rect[1]];
    o.closeDir = [1, 0];
    o.openDir = [0, -1];
    o.span = preset.width;
  }
  return o;
}

interface DragState { id: string; x: number; y: number; rot: number }
interface WallEdit { id: string; dx?: number; dy?: number; rect?: Rect }

export default function PlanView() {
  const doc = useSceneStore((s) => s.doc);
  const run = useSceneStore((s) => s.run);
  const camera = useEditorStore((s) => s.camera);
  const setCamera = useEditorStore((s) => s.setCamera);
  const selection = useEditorStore((s) => s.selection);
  const select = useEditorStore((s) => s.select);
  const setCursor = useEditorStore((s) => s.setCursor);
  const tool = useEditorStore((s) => s.tool);
  const wallPreset = useEditorStore((s) => s.wallPreset);
  const showToast = useEditorStore((s) => s.showToast);

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 900, h: 650 });
  const [drag, setDrag] = useState<DragState | null>(null);
  const [wallDraft, setWallDraft] = useState<{ a: Vec2; b: Vec2 } | null>(null);
  const [roomDraft, setRoomDraft] = useState<{ a: Vec2; b: Vec2 } | null>(null);
  const [openingPreview, setOpeningPreview] = useState<Opening | null>(null);
  const [wallEdit, setWallEdit] = useState<WallEdit | null>(null);
  const fittedRef = useRef(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const level = doc?.levels[0];

  useEffect(() => {
    if (!level || fittedRef.current || size.w < 60) return;
    fittedRef.current = true;
    const bb = docBBox(level);
    const scale = Math.min(size.w / (bb.x1 - bb.x0), size.h / (bb.y1 - bb.y0)) * 0.82;
    setCamera({ cx: (bb.x0 + bb.x1) / 2, cy: (bb.y0 + bb.y1) / 2, scale });
  }, [level, size.w, size.h, setCamera]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cam = useEditorStore.getState().camera;
      const rect = svg.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * 0.0012);
      const scale = Math.min(0.6, Math.max(0.004, cam.scale * factor));
      const px = e.clientX - rect.left - rect.width / 2;
      const py = e.clientY - rect.top - rect.height / 2;
      setCamera({
        scale,
        cx: cam.cx + px / cam.scale - px / scale,
        cy: cam.cy + py / cam.scale - py / scale,
      });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [setCamera]);

  const toWorld = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    const cam = useEditorStore.getState().camera;
    return {
      x: cam.cx + (clientX - rect.left - rect.width / 2) / cam.scale,
      y: cam.cy + (clientY - rect.top - rect.height / 2) / cam.scale,
    };
  }, []);

  /* ---------- 选择模式：家具拖拽 ---------- */
  const startDrag = useCallback(
    (inst: ComponentInstance, e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      select({ kind: 'furn', id: inst.id });
      if (inst.locked) return;
      const sx = e.clientX;
      const sy = e.clientY;
      const t0 = inst.t;
      let cur = { x: t0.x, y: t0.y, rot: t0.rot };
      let moved = false;
      const move = (ev: PointerEvent) => {
        if (!moved && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 3) return;
        moved = true;
        const cam = useEditorStore.getState().camera;
        cur = {
          x: Math.round(t0.x + (ev.clientX - sx) / cam.scale),
          y: Math.round(t0.y + (ev.clientY - sy) / cam.scale),
          rot: t0.rot,
        };
        setDrag({ id: inst.id, ...cur });
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        setDrag(null);
        if (moved) run('移动家具', [{ type: 'move', id: inst.id, t: cur }]);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up, { once: true });
    },
    [run, select],
  );

  const startRotate = useCallback(
    (inst: ComponentInstance, e: React.PointerEvent) => {
      e.stopPropagation();
      let rot = inst.t.rot;
      const move = (ev: PointerEvent) => {
        const w = toWorld(ev.clientX, ev.clientY);
        const deg = (Math.atan2(w.y - inst.t.y, w.x - inst.t.x) * 180) / Math.PI + 90;
        rot = ev.shiftKey ? deg : Math.round(deg / 15) * 15;
        rot = ((Math.round(rot) % 360) + 360) % 360;
        setDrag({ id: inst.id, x: inst.t.x, y: inst.t.y, rot });
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        setDrag(null);
        run('旋转家具', [{ type: 'move', id: inst.id, t: { x: inst.t.x, y: inst.t.y, rot } }]);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up, { once: true });
    },
    [run, toWorld],
  );

  /* ---------- 选择模式：墙体拖动（墙上门窗跟随） ---------- */
  const startWallDrag = useCallback(
    (wall: Wall, e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      select({ kind: 'wall', id: wall.id });
      const sx = e.clientX;
      const sy = e.clientY;
      let dx = 0;
      let dy = 0;
      let moved = false;
      const move = (ev: PointerEvent) => {
        if (!moved && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 3) return;
        moved = true;
        const cam = useEditorStore.getState().camera;
        dx = Math.round((ev.clientX - sx) / cam.scale);
        dy = Math.round((ev.clientY - sy) / cam.scale);
        setWallEdit({ id: wall.id, dx, dy });
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        setWallEdit(null);
        if (!moved) return;
        const cmds: Cmd[] = [
          { type: 'setWall', id: wall.id, rect: [wall.x0 + dx, wall.y0 + dy, wall.x1 + dx, wall.y1 + dy] },
        ];
        for (const o of useSceneStore.getState().doc!.levels[0].openings) {
          if (centerInRect(o.rect, wall)) {
            cmds.push({ type: 'setOpening', id: o.id, rect: [o.rect[0] + dx, o.rect[1] + dy, o.rect[2] + dx, o.rect[3] + dy] });
          }
        }
        run('移动墙体', cmds);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up, { once: true });
    },
    [run, select],
  );

  /* ---------- 选择模式：墙体端点调整长度 ---------- */
  const startWallResize = useCallback(
    (wall: Wall, which: 'a' | 'b', e: React.PointerEvent) => {
      e.stopPropagation();
      const horizontal = wall.x1 - wall.x0 >= wall.y1 - wall.y0;
      let rect: Rect = [wall.x0, wall.y0, wall.x1, wall.y1];
      const move = (ev: PointerEvent) => {
        const w = toWorld(ev.clientX, ev.clientY);
        if (horizontal) {
          const x = Math.round(w.x / GRID) * GRID;
          rect = which === 'a'
            ? [Math.min(x, wall.x1 - MIN_WALL), wall.y0, wall.x1, wall.y1]
            : [wall.x0, wall.y0, Math.max(x, wall.x0 + MIN_WALL), wall.y1];
        } else {
          const y = Math.round(w.y / GRID) * GRID;
          rect = which === 'a'
            ? [wall.x0, Math.min(y, wall.y1 - MIN_WALL), wall.x1, wall.y1]
            : [wall.x0, wall.y0, wall.x1, Math.max(y, wall.y0 + MIN_WALL)];
        }
        setWallEdit({ id: wall.id, rect });
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        setWallEdit(null);
        run('调整墙体', [{ type: 'setWall', id: wall.id, rect }]);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up, { once: true });
    },
    [run, toWorld],
  );

  /* ---------- SVG 根事件：按工具分发 ---------- */
  const onSvgDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      if (tool === 'select') {
        // 空白处：拖拽平移 / 点按取消选择
        const start = { x: e.clientX, y: e.clientY, cam: { ...useEditorStore.getState().camera } };
        let moved = false;
        const move = (ev: PointerEvent) => {
          const dx = (ev.clientX - start.x) / start.cam.scale;
          const dy = (ev.clientY - start.y) / start.cam.scale;
          if (!moved && Math.abs(ev.clientX - start.x) + Math.abs(ev.clientY - start.y) > 3) moved = true;
          if (moved) setCamera({ ...start.cam, cx: start.cam.cx - dx, cy: start.cam.cy - dy });
        };
        const up = () => {
          window.removeEventListener('pointermove', move);
          if (!moved) select(null);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up, { once: true });
        return;
      }
      if (!level) return;
      const w = toWorld(e.clientX, e.clientY);
      if (tool === 'wall') {
        const a = snapPoint(level, [w.x, w.y]);
        setWallDraft({ a, b: a });
        const move = (ev: PointerEvent) => {
          const w2 = toWorld(ev.clientX, ev.clientY);
          setWallDraft({ a, b: axisLock(a, snapPoint(level, [w2.x, w2.y])) });
        };
        const up = (ev: PointerEvent) => {
          window.removeEventListener('pointermove', move);
          setWallDraft(null);
          const w2 = toWorld(ev.clientX, ev.clientY);
          const b = axisLock(a, snapPoint(level, [w2.x, w2.y]));
          if (Math.hypot(b[0] - a[0], b[1] - a[1]) < MIN_WALL) return;
          const p = WALL_PRESETS[wallPreset];
          const r = wallRectFromSegment(a, b, p.thickness);
          run('画墙', [{ type: 'addWall', wall: { id: uid('w'), ...r, kind: p.kind, height: p.height } }]);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up, { once: true });
        return;
      }
      if (tool === 'room') {
        const a = snapPoint(level, [w.x, w.y]);
        setRoomDraft({ a, b: a });
        const move = (ev: PointerEvent) => {
          const w2 = toWorld(ev.clientX, ev.clientY);
          setRoomDraft({ a, b: snapPoint(level, [w2.x, w2.y]) });
        };
        const up = (ev: PointerEvent) => {
          window.removeEventListener('pointermove', move);
          setRoomDraft(null);
          const w2 = toWorld(ev.clientX, ev.clientY);
          const r = normRect(a, snapPoint(level, [w2.x, w2.y]));
          if (r.x1 - r.x0 < 1200 || r.y1 - r.y0 < 1200) {
            showToast('房间太小：至少 1200 × 1200 mm');
            return;
          }
          const poly: Vec2[] = [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]];
          const name = `房间 ${level.rooms.length + 1}`;
          run('画房间', [{
            type: 'addRoom',
            room: {
              id: uid('r'), name, poly,
              labelAt: [Math.round((r.x0 + r.x1) / 2), Math.round((r.y0 + r.y1) / 2)],
              floorMaterialId: 'tile800',
            },
          }]);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up, { once: true });
        return;
      }
      // door / window：点击墙面放置洞口
      const wall = [...level.walls].reverse().find((wl) => w.x >= wl.x0 && w.x <= wl.x1 && w.y >= wl.y0 && w.y <= wl.y1);
      if (!wall) {
        showToast('请点击在墙体上');
        return;
      }
      const o = openingOnWall(wall, [w.x, w.y], tool);
      if (!o) {
        showToast('这面墙太短，放不下这个洞口');
        return;
      }
      run(tool === 'door' ? '开门' : '开窗', [{ type: 'addOpening', opening: { ...o, id: uid('o') } }]);
    },
    [level, run, select, setCamera, showToast, toWorld, tool, wallPreset],
  );

  const onSvgMove = useCallback(
    (e: React.PointerEvent) => {
      if (!level) return;
      if (tool === 'select') {
        const w = toWorld(e.clientX, e.clientY);
        setCursor({ x: Math.round(w.x / 10) * 10, y: Math.round(w.y / 10) * 10 });
        return;
      }
      if (tool === 'door' || tool === 'window') {
        const w = toWorld(e.clientX, e.clientY);
        const wall = [...level.walls].reverse().find((wl) => w.x >= wl.x0 && w.x <= wl.x1 && w.y >= wl.y0 && w.y <= wl.y1);
        setOpeningPreview(wall ? openingOnWall(wall, [w.x, w.y], tool) : null);
      }
    },
    [level, setCursor, toWorld, tool],
  );

  const onSvgLeave = useCallback(() => {
    setCursor(null);
    setOpeningPreview(null);
  }, [setCursor]);

  const zoomBy = (f: number) => {
    const cam = useEditorStore.getState().camera;
    setCamera({ ...cam, scale: Math.min(0.6, Math.max(0.004, cam.scale * f)) });
  };

  const fit = () => {
    if (!level) return;
    const bb = docBBox(level);
    const scale = Math.min(size.w / (bb.x1 - bb.x0), size.h / (bb.y1 - bb.y0)) * 0.82;
    setCamera({ cx: (bb.x0 + bb.x1) / 2, cy: (bb.y0 + bb.y1) / 2, scale });
  };

  if (!doc || !level) {
    return <div className="flex h-full items-center justify-center text-sm text-zinc-400">文档加载中…</div>;
  }

  const vw = size.w / camera.scale;
  const vh = size.h / camera.scale;
  const vb = `${camera.cx - vw / 2} ${camera.cy - vh / 2} ${vw} ${vh}`;
  const selecting = tool === 'select';
  const blankPlan = level.walls.length === 0 && level.rooms.length === 0;

  const TOOL_HINTS: Record<Tool, string> = {
    select: '拖拽移动 · 顶部圆点旋转 · 点墙体/门窗可选中编辑 · 滚轮缩放',
    wall: '画墙：按住拖出墙体，自动水平/垂直，端点吸附已有墙角',
    room: '画房间：拖出矩形作为地面区域（用于铺装材质与 AI 摆放）',
    door: '开门：点击任意墙体放置 900mm 门洞',
    window: '开窗：点击任意墙体放置 1500mm 窗洞',
  };

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-[#f7f4ee]">
      <svg
        ref={svgRef}
        width={size.w}
        height={size.h}
        viewBox={vb}
        className={`block touch-none select-none ${selecting ? 'cursor-default' : 'cursor-crosshair'}`}
        onPointerDown={onSvgDown}
        onPointerMove={onSvgMove}
        onPointerLeave={onSvgLeave}
      >
        <defs dangerouslySetInnerHTML={{ __html: patternsDefs() }} />
        <RoomsLayer level={level} selection={selection} onSelect={select} interactive={selecting} />
        <WallsLayer level={level} wallEdit={wallEdit} selection={selection} onWallDown={startWallDrag} interactive={selecting} />
        <g dangerouslySetInnerHTML={{ __html: openingsSvg(level) }} pointerEvents="none" />
        <OpeningOverlay level={level} wallEdit={wallEdit} selection={selection} onSelect={select} interactive={selecting} />
        <FurnLayer level={level} drag={drag} onDown={startDrag} interactive={selecting} />
        <LabelsLayer level={level} />
        <g dangerouslySetInnerHTML={{ __html: dimsSvg() }} pointerEvents="none" />
        {/* 绘制预览 */}
        {wallDraft && Math.hypot(wallDraft.b[0] - wallDraft.a[0], wallDraft.b[1] - wallDraft.a[1]) > 10 && (() => {
          const p = WALL_PRESETS[wallPreset];
          const r = wallRectFromSegment(wallDraft.a, wallDraft.b, p.thickness);
          const len = Math.round(Math.hypot(wallDraft.b[0] - wallDraft.a[0], wallDraft.b[1] - wallDraft.a[1]));
          return (
            <g pointerEvents="none">
              <rect x={r.x0} y={r.y0} width={r.x1 - r.x0} height={r.y1 - r.y0} fill="rgba(181,101,58,.35)" stroke="#b5653a" strokeWidth={1.5} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
              <text x={(r.x0 + r.x1) / 2} y={(r.y0 + r.y1) / 2 - 150} fontSize={200} textAnchor="middle" fill="#b5653a" fontWeight={600} stroke="#f7f4ee" strokeWidth={40} paintOrder="stroke">{len}</text>
            </g>
          );
        })()}
        {roomDraft && (() => {
          const r = normRect(roomDraft.a, roomDraft.b);
          return (
            <g pointerEvents="none">
              <rect x={r.x0} y={r.y0} width={r.x1 - r.x0} height={r.y1 - r.y0} fill="rgba(47,93,98,.15)" stroke="#2f5d62" strokeWidth={1.5} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
              <text x={(r.x0 + r.x1) / 2} y={(r.y0 + r.y1) / 2} fontSize={220} textAnchor="middle" fill="#2f5d62" fontWeight={600} stroke="#f7f4ee" strokeWidth={40} paintOrder="stroke">
                {((r.x1 - r.x0) / 1000).toFixed(1)} × {((r.y1 - r.y0) / 1000).toFixed(1)} m
              </text>
            </g>
          );
        })()}
        {openingPreview && (
          <rect
            x={openingPreview.rect[0]} y={openingPreview.rect[1]}
            width={openingPreview.rect[2] - openingPreview.rect[0]} height={openingPreview.rect[3] - openingPreview.rect[1]}
            fill="rgba(79,115,148,.4)" stroke="#4f7394" strokeWidth={1.5} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" pointerEvents="none"
          />
        )}
        <SelLayer level={level} selection={selection} drag={drag} scale={camera.scale} wallEdit={wallEdit} onRotate={startRotate} onWallResize={startWallResize} />
      </svg>

      {/* 工具条 */}
      <div className="absolute left-3 top-3 flex flex-col gap-0.5 rounded-xl border border-zinc-200 bg-white p-1 shadow-sm">
        {(
          [
            ['select', '选择', 'V'],
            ['wall', '画墙', 'W'],
            ['room', '房间', 'R'],
            ['door', '开门', 'D'],
            ['window', '开窗', 'N'],
        ] as Array<[Tool, string, string]>
        ).map(([t, label, key]) => (
          <button
            key={t}
            onClick={() => useEditorStore.getState().setTool(t)}
            className={`flex w-20 items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition ${
              tool === t ? 'bg-ink text-white' : 'text-zinc-600 hover:bg-zinc-100'
            }`}
            title={`${label} (${key})`}
          >
            <span>{label}</span>
            <span className={`text-[10px] ${tool === t ? 'text-white/60' : 'text-zinc-300'}`}>{key}</span>
          </button>
        ))}
        {tool === 'wall' && (
          <div className="mt-1 flex flex-col gap-0.5 border-t border-zinc-100 pt-1">
            {(Object.keys(WALL_PRESETS) as WallPreset[]).map((k) => (
              <button
                key={k}
                onClick={() => useEditorStore.getState().setWallPreset(k)}
                className={`rounded-lg px-2.5 py-1 text-[11px] transition ${
                  wallPreset === k ? 'bg-accent-soft text-accent' : 'text-zinc-500 hover:bg-zinc-100'
                }`}
              >
                {WALL_PRESETS[k].label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 比例尺 */}
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-zinc-200 bg-white/90 px-3 py-1.5 text-xs">
        <span>1 m</span>
        <div className="mt-1 h-1.5 border-x-2 border-b-2 border-ink" style={{ width: 1000 * camera.scale }} />
      </div>

      {/* 缩放控制 */}
      <div className="absolute right-3 top-3 flex flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
        <button className="h-8 w-8 text-lg leading-none hover:bg-zinc-50" onClick={() => zoomBy(1.25)} title="放大">＋</button>
        <button className="h-8 w-8 border-t border-zinc-100 text-lg leading-none hover:bg-zinc-50" onClick={() => zoomBy(0.8)} title="缩小">−</button>
        <button className="h-8 w-8 border-t border-zinc-100 text-xs hover:bg-zinc-50" onClick={fit} title="适应窗口">适</button>
      </div>
      <p className="pointer-events-none absolute bottom-3 right-3 text-xs text-zinc-400">{TOOL_HINTS[tool]}</p>

      {blankPlan && (
        <div className="pointer-events-none absolute left-1/2 top-14 w-fit -translate-x-1/2 rounded-xl border border-zinc-200 bg-white/95 px-5 py-3 text-xs leading-relaxed text-zinc-500 shadow-sm">
          <b className="text-ink">空白户型</b>：① 用「画墙」勾勒墙体 → ②「开门/开窗」在墙上点出洞口 → ③「房间」框出地面（用于铺装与 AI 摆放）→ ④ 左侧组件库添加家具
        </div>
      )}
    </div>
  );
}

/* ---------------- 图层（memo，避免相机变化引发全量重渲染） ---------------- */

const RoomsLayer = React.memo(function RoomsLayer({
  level,
  selection,
  onSelect,
  interactive,
}: {
  level: Level;
  selection: Selection;
  onSelect: (s: Selection) => void;
  interactive: boolean;
}) {
  return (
    <g>
      {level.rooms.map((r) => (
        <polygon
          key={r.id}
          points={r.poly.map((p) => p.join(',')).join(' ')}
          fill={`url(#m-${r.floorMaterialId})`}
          className={interactive ? 'cursor-pointer' : ''}
          fillOpacity={selection?.kind === 'room' && selection.id === r.id ? 0.75 : 1}
          onPointerDown={interactive ? (e) => { e.stopPropagation(); onSelect({ kind: 'room', id: r.id }); } : undefined}
        />
      ))}
    </g>
  );
});

const WallsLayer = React.memo(function WallsLayer({
  level,
  wallEdit,
  selection,
  onWallDown,
  interactive,
}: {
  level: Level;
  wallEdit: WallEdit | null;
  selection: Selection;
  onWallDown: (w: Wall, e: React.PointerEvent) => void;
  interactive: boolean;
}) {
  const moving = level.walls.find((w) => w.id === wallEdit?.id);
  return (
    <g>
      {level.walls.map((w) => {
        let x0 = w.x0, y0 = w.y0, x1 = w.x1, y1 = w.y1;
        if (wallEdit?.id === w.id) {
          if (wallEdit.rect) [x0, y0, x1, y1] = wallEdit.rect;
          else { x0 += wallEdit.dx ?? 0; y0 += wallEdit.dy ?? 0; x1 += wallEdit.dx ?? 0; y1 += wallEdit.dy ?? 0; }
        }
        const fill =
          w.kind === 'bearing' ? '#26241f'
          : w.kind === 'low' ? '#e9e3d8'
          : w.kind === 'exterior' ? '#8f897d'
          : '#a7a195';
        return (
          <rect
            key={w.id}
            x={x0} y={y0} width={x1 - x0} height={y1 - y0}
            fill={fill}
            stroke={w.kind === 'low' ? '#8f897d' : selection?.kind === 'wall' && selection.id === w.id ? '#b5653a' : 'none'}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            className={interactive ? 'cursor-move' : ''}
            onPointerDown={interactive ? (e) => onWallDown(w, e) : undefined}
          />
        );
      })}
      {/* 移动中的墙：门窗跟随预览 */}
      {wallEdit && !wallEdit.rect && wallEdit.dx !== undefined && moving &&
        level.openings
          .filter((o) => centerInRect(o.rect, moving))
          .map((o) => (
            <rect key={o.id} x={o.rect[0] + wallEdit.dx!} y={o.rect[1] + wallEdit.dy!}
              width={o.rect[2] - o.rect[0]} height={o.rect[3] - o.rect[1]}
              fill="rgba(226,218,203,.9)" pointerEvents="none" />
          ))}
    </g>
  );
});

/** 门窗的透明点击层（选中用），置于墙体之上 */
const OpeningOverlay = React.memo(function OpeningOverlay({
  level,
  wallEdit,
  selection,
  onSelect,
  interactive,
}: {
  level: Level;
  wallEdit: WallEdit | null;
  selection: Selection;
  onSelect: (s: Selection) => void;
  interactive: boolean;
}) {
  const moving = level.walls.find((w) => w.id === wallEdit?.id && !wallEdit.rect);
  return (
    <g>
      {level.openings.map((o) => {
        let [x0, y0, x1, y1] = o.rect;
        if (moving && centerInRect(o.rect, moving)) { x0 += wallEdit!.dx!; y0 += wallEdit!.dy!; x1 += wallEdit!.dx!; y1 += wallEdit!.dy!; }
        const sel = selection?.kind === 'opening' && selection.id === o.id;
        return (
          <rect
            key={o.id}
            x={x0} y={y0} width={x1 - x0} height={y1 - y0}
            fill={sel ? 'rgba(181,101,58,.25)' : 'transparent'}
            stroke={sel ? '#b5653a' : 'none'}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            className={interactive ? 'cursor-pointer' : ''}
            pointerEvents={interactive ? 'all' : 'none'}
            onPointerDown={interactive ? (e) => { e.stopPropagation(); onSelect({ kind: 'opening', id: o.id }); } : undefined}
          />
        );
      })}
    </g>
  );
});

const FurnLayer = React.memo(function FurnLayer({
  level,
  drag,
  onDown,
  interactive,
}: {
  level: Level;
  drag: DragState | null;
  onDown: (inst: ComponentInstance, e: React.PointerEvent) => void;
  interactive: boolean;
}) {
  return (
    <g>
      {level.instances.map((inst) => {
        const asset = assetById(inst.assetId);
        const ref = instanceRef(inst, asset);
        const t = drag && drag.id === inst.id ? drag : inst.t;
        const label =
          Math.min(ref.w, ref.d) >= 380 && !NOLABEL.includes(ref.type)
            ? `<text transform="rotate(${-t.rot})" font-size="${Math.max(80, Math.min(170, Math.min(ref.w, ref.d) * 0.2))}" text-anchor="middle" dominant-baseline="central" fill="#4a443c" opacity=".8" pointer-events="none">${ref.name}</text>`
            : '';
        return (
          <g
            key={inst.id}
            transform={`translate(${t.x} ${t.y}) rotate(${t.rot})`}
            className={interactive ? 'cursor-move' : ''}
            onPointerDown={interactive ? (e) => onDown(inst, e) : undefined}
          >
            <g dangerouslySetInnerHTML={{ __html: furnSVG(ref.type, ref.w, ref.d, ref.color) + label }} />
          </g>
        );
      })}
    </g>
  );
});

const LabelsLayer = React.memo(function LabelsLayer({ level }: { level: Level }) {
  const halo = { stroke: '#fbf9f4', strokeWidth: 45, paintOrder: 'stroke' as const };
  return (
    <g pointerEvents="none">
      {level.rooms
        .filter((r) => r.labelAt)
        .map((r) => (
          <g key={r.id}>
            <text x={r.labelAt![0]} y={r.labelAt![1]} fontSize={250} fontWeight={600} textAnchor="middle" fill="#2b2824" {...halo}>
              {r.name}
            </text>
            <text x={r.labelAt![0]} y={r.labelAt![1] + 260} fontSize={175} textAnchor="middle" fill="#7d7366" {...halo}>
              {polyArea(r.poly).toFixed(2)} m² · {materialById(r.floorMaterialId).name}
            </text>
          </g>
        ))}
    </g>
  );
});

const SelLayer = React.memo(function SelLayer({
  level,
  selection,
  drag,
  scale,
  wallEdit,
  onRotate,
  onWallResize,
}: {
  level: Level;
  selection: Selection;
  drag: DragState | null;
  scale: number;
  wallEdit: WallEdit | null;
  onRotate: (inst: ComponentInstance, e: React.PointerEvent) => void;
  onWallResize: (w: Wall, which: 'a' | 'b', e: React.PointerEvent) => void;
}) {
  if (selection?.kind === 'furn') {
    const inst = level.instances.find((i) => i.id === selection.id);
    if (!inst) return null;
    const asset = assetById(inst.assetId);
    const ref = instanceRef(inst, asset);
    const t = drag && drag.id === inst.id ? drag : inst.t;
    const p = 5 / scale;
    const ro = (26 / scale) * 2;
    const a = (t.rot * Math.PI) / 180;
    const c = Math.abs(Math.cos(a));
    const s = Math.abs(Math.sin(a));
    const hh = (ref.w / 2) * s + (ref.d / 2) * c;
    return (
      <g pointerEvents="none">
        <g transform={`translate(${t.x} ${t.y}) rotate(${t.rot})`}>
          <rect
            x={-ref.w / 2 - p}
            y={-ref.d / 2 - p}
            width={ref.w + 2 * p}
            height={ref.d + 2 * p}
            fill="none"
            stroke="#b5653a"
            strokeWidth={1.5}
            strokeDasharray="5 3"
            vectorEffect="non-scaling-stroke"
          />
          <line x1={0} y1={-ref.d / 2 - p} x2={0} y2={-ref.d / 2 - ro} stroke="#b5653a" vectorEffect="non-scaling-stroke" />
          <circle
            cx={0}
            cy={-ref.d / 2 - ro}
            r={6 / scale}
            fill="#fff"
            stroke="#b5653a"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            pointerEvents="all"
            style={{ cursor: 'grab' }}
            onPointerDown={(e) => onRotate(inst, e)}
          >
            <title>拖动旋转（Shift 自由角度）</title>
          </circle>
        </g>
        <text
          x={t.x}
          y={t.y + hh + 24 / scale}
          fontSize={12 / scale}
          textAnchor="middle"
          fontWeight={600}
          fill="#b5653a"
          stroke="#fff"
          strokeWidth={3 / scale}
          paintOrder="stroke"
        >
          {ref.w} × {ref.d}
        </text>
      </g>
    );
  }
  if (selection?.kind === 'room') {
    const r = level.rooms.find((x) => x.id === selection.id);
    if (!r) return null;
    return (
      <polygon
        points={r.poly.map((p) => p.join(',')).join(' ')}
        fill="rgba(181,101,58,.08)"
        stroke="#b5653a"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
    );
  }
  if (selection?.kind === 'wall') {
    const w = level.walls.find((x) => x.id === selection.id);
    if (!w) return null;
    const horizontal = w.x1 - w.x0 >= w.y1 - w.y0;
    const [x0, y0, x1, y1] = wallEdit?.id === w.id && wallEdit.rect ? wallEdit.rect : [w.x0, w.y0, w.x1, w.y1];
    const ea: Vec2 = horizontal ? [x0, (y0 + y1) / 2] : [(x0 + x1) / 2, y0];
    const eb: Vec2 = horizontal ? [x1, (y0 + y1) / 2] : [(x0 + x1) / 2, y1];
    const r = 6 / scale;
    const ends: Array<['a' | 'b', Vec2]> = [['a', ea], ['b', eb]];
    return (
      <g>
        <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="none" stroke="#b5653a" strokeWidth={1.5} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" pointerEvents="none" />
        <text x={(x0 + x1) / 2} y={(y0 + y1) / 2 - 20 / scale} fontSize={12 / scale} textAnchor="middle" fontWeight={600} fill="#b5653a"
          stroke="#fff" strokeWidth={3 / scale} paintOrder="stroke" pointerEvents="none">
          {Math.round(Math.max(x1 - x0, y1 - y0))} mm
        </text>
        {ends.map(([k, [px, py]]) => (
          <circle
            key={k}
            cx={px} cy={py} r={r} fill="#fff" stroke="#b5653a" strokeWidth={1.5} vectorEffect="non-scaling-stroke"
            style={{ cursor: 'move' }}
            onPointerDown={(e) => onWallResize(w, k, e)}
          >
            <title>拖动调整墙段长度</title>
          </circle>
        ))}
      </g>
    );
  }
  if (selection?.kind === 'opening') {
    const o = level.openings.find((x) => x.id === selection.id);
    if (!o) return null;
    return (
      <rect
        x={o.rect[0]} y={o.rect[1]} width={o.rect[2] - o.rect[0]} height={o.rect[3] - o.rect[1]}
        fill="none" stroke="#b5653a" strokeWidth={1.5} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" pointerEvents="none"
      />
    );
  }
  return null;
});
