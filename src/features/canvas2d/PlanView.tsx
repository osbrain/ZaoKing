'use client';

/* 2D 平面视图：与 3D 订阅同一份 sceneStore 文档。
 * 两种工作模式：
 *  - 选择模式：家具拖拽/旋转、房间/墙体/门窗选中与编辑
 *  - 户型编辑工具：画墙（轴锁+吸附）、画房间地面、在墙上开门/开窗
 * 拖拽/绘制为瞬态本地 state，pointerup 才提交命令进撤销栈。 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSceneStore } from '@/stores/sceneStore';
import { useEditorStore, type Selection, type Tool, type WallPreset } from '@/stores/editorStore';
import type { Cmd } from '@/core/commands';
import { materialCatalog } from '@/core/assets';
import { validateComponentPlacement } from '@/core/geometry';
import { uid, type ComponentInstance, type Level, type Opening, type Vec2, type Wall } from '@/core/types';
import { dimsSvg, openingsSvg, patternsDefs } from '@/core/symbols2d';
import { documentAssets, documentMaterials } from '@/core/sceneResources';
import OrientationCompass from '@/features/editor/OrientationCompass';
import { OpeningOverlay, FurnLayer, LabelsLayer, RoomsLayer, SelLayer, WallsLayer } from './PlanLayers';
import { axisLock, centerInRect, GRID, MIN_WALL, normRect, openingOnWall, planViewBounds, snapPoint, wallRectFromSegment, WALL_PRESETS, type DragState, type Rect, type WallEdit } from './planGeometry';

export default function PlanView() {
  const doc = useSceneStore((s) => s.previewDoc ?? s.doc);
  const assets = useMemo(() => doc ? documentAssets(doc) : undefined, [doc?.assets, doc?.assetSnapshots]);
  const materials = useMemo(() => doc ? materialCatalog(documentMaterials(doc)) : undefined, [doc?.materialSnapshots]);
  const run = useSceneStore((s) => s.run);
  const camera = useEditorStore((s) => s.camera);
  const setCamera = useEditorStore((s) => s.setCamera);
  const selection = useEditorStore((s) => s.selection);
  const select = useEditorStore((s) => s.select);
  const planLayer = useEditorStore((s) => s.planLayer);
  const setCursor = useEditorStore((s) => s.setCursor);
  const tool = useEditorStore((s) => s.tool);
  const wallPreset = useEditorStore((s) => s.wallPreset);
  const showGrid = useEditorStore((s) => s.showGrid);
  const showOrientation = useEditorStore((s) => s.showOrientation);
  const showRoomNames = useEditorStore((s) => s.showRoomNames);
  const showFurniture = useEditorStore((s) => s.showFurniture);
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
    const bb = planViewBounds(level);
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
      if (useEditorStore.getState().planLayer !== 'layout') return;
      if (e.button !== 0) return;
      e.stopPropagation();
      select({ kind: 'furn', id: inst.id });
      if (inst.locked) return;
      const sx = e.clientX;
      const sy = e.clientY;
      const t0 = inst.t;
      let cur = { x: t0.x, y: t0.y, rot: t0.rot };
      let moved = false;
      let failure = '';
      const move = (ev: PointerEvent) => {
        if (!moved && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 3) return;
        moved = true;
        const cam = useEditorStore.getState().camera;
        cur = {
          x: Math.round(t0.x + (ev.clientX - sx) / cam.scale),
          y: Math.round(t0.y + (ev.clientY - sy) / cam.scale),
          rot: t0.rot,
        };
        const validation = level ? validateComponentPlacement(level, { ...inst, t: cur }, assets) : { valid: true, issues: [] };
        failure = validation.issues.map((issue) => issue.message).join('；');
        setDrag({ id: inst.id, ...cur, invalid: !validation.valid });
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        setDrag(null);
        if (moved && failure) showToast(failure);
        else if (moved) run('移动家具', [{ type: 'move', id: inst.id, t: cur }]);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up, { once: true });
    },
    [assets, level, run, select, showToast],
  );

  const startRotate = useCallback(
    (inst: ComponentInstance, e: React.PointerEvent) => {
      e.stopPropagation();
      if (inst.locked) return;
      let rot = inst.t.rot;
      let failure = '';
      const move = (ev: PointerEvent) => {
        const w = toWorld(ev.clientX, ev.clientY);
        const deg = (Math.atan2(w.y - inst.t.y, w.x - inst.t.x) * 180) / Math.PI + 90;
        rot = ev.shiftKey ? deg : Math.round(deg / 15) * 15;
        rot = ((Math.round(rot) % 360) + 360) % 360;
        const transform = { x: inst.t.x, y: inst.t.y, rot };
        const validation = level ? validateComponentPlacement(level, { ...inst, t: transform }, assets) : { valid: true, issues: [] };
        failure = validation.issues.map((issue) => issue.message).join('；');
        setDrag({ id: inst.id, ...transform, invalid: !validation.valid });
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        setDrag(null);
        if (failure) showToast(failure);
        else run('旋转家具', [{ type: 'move', id: inst.id, t: { x: inst.t.x, y: inst.t.y, rot } }]);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up, { once: true });
    },
    [assets, level, run, showToast, toWorld],
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
      if (planLayer === 'floor' && tool !== 'select') return;
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
    [level, planLayer, run, select, setCamera, showToast, toWorld, tool, wallPreset],
  );

  const onSvgMove = useCallback(
    (e: React.PointerEvent) => {
      if (!level) return;
      if (planLayer === 'floor' && tool !== 'select') return;
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
    [level, planLayer, setCursor, toWorld, tool],
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
    const bb = planViewBounds(level);
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
  const layoutLayer = planLayer === 'layout';
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
        data-editor-export="plan"
        width={size.w}
        height={size.h}
        viewBox={vb}
        className={`block touch-none select-none ${selecting ? 'cursor-default' : 'cursor-crosshair'}`}
        onPointerDown={onSvgDown}
        onPointerMove={onSvgMove}
        onPointerLeave={onSvgLeave}
      >
        <defs dangerouslySetInnerHTML={{ __html: patternsDefs('', materials) }} />
        {showGrid && <rect x={camera.cx - vw / 2} y={camera.cy - vh / 2} width={vw} height={vh} fill="url(#p-grid)" pointerEvents="none" />}
        <RoomsLayer level={level} selection={selection} onSelect={select} interactive={selecting} />
        <WallsLayer level={level} wallEdit={wallEdit} selection={selection} onWallDown={startWallDrag} interactive={selecting && layoutLayer} />
        <g dangerouslySetInnerHTML={{ __html: openingsSvg(level) }} pointerEvents="none" />
        <OpeningOverlay level={level} wallEdit={wallEdit} selection={selection} onSelect={select} interactive={selecting && layoutLayer} />
        {layoutLayer && showFurniture && <FurnLayer assets={assets} level={level} drag={drag} onDown={startDrag} interactive={selecting} />}
        {showRoomNames && <LabelsLayer level={level} materials={materials} />}
        <g dangerouslySetInnerHTML={{ __html: dimsSvg(level) }} pointerEvents="none" />
        {/* 绘制预览 */}
        {wallDraft && Math.hypot(wallDraft.b[0] - wallDraft.a[0], wallDraft.b[1] - wallDraft.a[1]) > 10 && (() => {
          const p = WALL_PRESETS[wallPreset];
          const r = wallRectFromSegment(wallDraft.a, wallDraft.b, p.thickness);
          const len = Math.round(Math.hypot(wallDraft.b[0] - wallDraft.a[0], wallDraft.b[1] - wallDraft.a[1]));
          return (
            <g data-export-ignore="true" pointerEvents="none">
              <rect x={r.x0} y={r.y0} width={r.x1 - r.x0} height={r.y1 - r.y0} fill="rgba(181,101,58,.35)" stroke="#b5653a" strokeWidth={1.5} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
              <text x={(r.x0 + r.x1) / 2} y={(r.y0 + r.y1) / 2 - 150} fontSize={200} textAnchor="middle" fill="#b5653a" fontWeight={600} stroke="#f7f4ee" strokeWidth={40} paintOrder="stroke">{len}</text>
            </g>
          );
        })()}
        {roomDraft && (() => {
          const r = normRect(roomDraft.a, roomDraft.b);
          return (
            <g data-export-ignore="true" pointerEvents="none">
              <rect x={r.x0} y={r.y0} width={r.x1 - r.x0} height={r.y1 - r.y0} fill="rgba(47,93,98,.15)" stroke="#2f5d62" strokeWidth={1.5} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
              <text x={(r.x0 + r.x1) / 2} y={(r.y0 + r.y1) / 2} fontSize={220} textAnchor="middle" fill="#2f5d62" fontWeight={600} stroke="#f7f4ee" strokeWidth={40} paintOrder="stroke">
                {((r.x1 - r.x0) / 1000).toFixed(1)} × {((r.y1 - r.y0) / 1000).toFixed(1)} m
              </text>
            </g>
          );
        })()}
        {openingPreview && (
          <rect data-export-ignore="true"
            x={openingPreview.rect[0]} y={openingPreview.rect[1]}
            width={openingPreview.rect[2] - openingPreview.rect[0]} height={openingPreview.rect[3] - openingPreview.rect[1]}
            fill="rgba(79,115,148,.4)" stroke="#4f7394" strokeWidth={1.5} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" pointerEvents="none"
          />
        )}
        <g data-export-ignore="true">
          {(layoutLayer || selection?.kind === 'room') && (showFurniture || selection?.kind !== 'furn') &&
            <SelLayer assets={assets} level={level} selection={selection} drag={drag} scale={camera.scale} wallEdit={wallEdit} onRotate={startRotate} onWallResize={startWallResize} />}
        </g>
      </svg>

      <div role="group" aria-label="设计图层" className="absolute left-1/2 top-3 flex -translate-x-1/2 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
        {([
          ['layout', '布置'],
          ['floor', '铺装'],
        ] as const).map(([layer, label]) => (
          <button key={layer} type="button" aria-pressed={planLayer === layer}
            onClick={() => useEditorStore.getState().setPlanLayer(layer)}
            className={`px-3 py-1.5 text-xs font-medium transition ${planLayer === layer ? 'bg-ink text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}>
            {label}
          </button>
        ))}
      </div>

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
            disabled={!layoutLayer && t !== 'select'}
            onClick={() => useEditorStore.getState().setTool(t)}
            className={`flex w-20 items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-35 ${
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
        <div className="mt-1 flex flex-col gap-0.5 border-t border-zinc-100 pt-1">
          <button type="button" aria-pressed={showGrid} onClick={() => useEditorStore.getState().toggleGrid()}
            className={`rounded-lg px-2.5 py-1.5 text-left text-[11px] transition ${showGrid ? 'bg-accent-soft text-accent' : 'text-zinc-500 hover:bg-zinc-100'}`}>
            方格 {showGrid ? '开' : '关'}
          </button>
          <button type="button" aria-pressed={showOrientation} onClick={() => useEditorStore.getState().toggleOrientation()}
            className={`rounded-lg px-2.5 py-1.5 text-left text-[11px] transition ${showOrientation ? 'bg-accent-soft text-accent' : 'text-zinc-500 hover:bg-zinc-100'}`}>
            北向 {showOrientation ? '开' : '关'}
          </button>
          <button type="button" aria-pressed={showRoomNames} onClick={() => useEditorStore.getState().toggleRoomNames()}
            className={`rounded-lg px-2.5 py-1.5 text-left text-[11px] transition ${showRoomNames ? 'bg-accent-soft text-accent' : 'text-zinc-500 hover:bg-zinc-100'}`}>
            房间名称 {showRoomNames ? '开' : '关'}
          </button>
          {layoutLayer && <button type="button" aria-pressed={showFurniture} onClick={() => useEditorStore.getState().toggleFurniture()}
            className={`rounded-lg px-2.5 py-1.5 text-left text-[11px] transition ${showFurniture ? 'bg-accent-soft text-accent' : 'text-zinc-500 hover:bg-zinc-100'}`}>
            家具组件 {showFurniture ? '开' : '关'}
          </button>}
        </div>
      </div>

      {showOrientation && <div className="pointer-events-none absolute right-14 top-3"><OrientationCompass /></div>}

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
      <p className="pointer-events-none absolute bottom-3 right-3 text-xs text-zinc-400">
        {planLayer === 'floor' ? '选择房间以调整地面材质和单价 · 滚轮缩放' : TOOL_HINTS[tool]}
      </p>

      {blankPlan && (
        <div className="pointer-events-none absolute left-1/2 top-14 w-fit -translate-x-1/2 rounded-xl border border-zinc-200 bg-white/95 px-5 py-3 text-xs leading-relaxed text-zinc-500 shadow-sm">
          <b className="text-ink">空白户型</b>：① 用「画墙」勾勒墙体 → ②「开门/开窗」在墙上点出洞口 → ③「房间」框出地面（用于铺装与 AI 摆放）→ ④ 左侧组件库添加家具
        </div>
      )}
    </div>
  );
}
