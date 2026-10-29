'use client';

/* 右侧面板：属性（家具/房间/墙体/门窗）与统计（面积/造价估算，算法移植自原型） */

import { useEffect, useState } from 'react';
import { useSceneStore } from '@/stores/sceneStore';
import { useEditorStore } from '@/stores/editorStore';
import { assetById, materialById, materialCatalog } from '@/core/assets';
import { instanceRef, uid, type Wall } from '@/core/types';
import { polyArea } from '@/core/geometry';
import { documentAssets, documentMaterials } from '@/core/sceneResources';

/* ---------- 数字输入（失焦/回车提交命令） ---------- */

function NumberField({
  label,
  value,
  onCommit,
  min,
  max,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  min?: number;
  max?: number;
}) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const commit = () => {
    const n = Number(v);
    if (v.trim() && Number.isFinite(n) && (min === undefined || n >= min) && (max === undefined || n <= max) && n !== value) onCommit(Math.round(n));
    else setV(String(value));
  };
  return (
    <label className="flex flex-col gap-1 text-[11px] text-zinc-500">
      {label}
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        inputMode="numeric"
        className="rounded-md border border-zinc-200 px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
      />
    </label>
  );
}

/* ---------- 属性面板 ---------- */

export function PropsPanel() {
  const doc = useSceneStore((s) => s.doc);
  const run = useSceneStore((s) => s.run);
  const selection = useEditorStore((s) => s.selection);
  const select = useEditorStore((s) => s.select);
  const showToast = useEditorStore((s) => s.showToast);

  if (!doc) return null;
  const assets = documentAssets(doc);
  const materials = materialCatalog(documentMaterials(doc));
  const level = doc.levels[0];

  if (selection?.kind === 'furn') {
    const inst = level.instances.find((i) => i.id === selection.id);
    if (!inst) return <EmptyHint />;
    const asset = assetById(inst.assetId, assets);
    const ref = instanceRef(inst, asset);
    const customParameters = asset?.geometry?.parameters;
    const instanceCompartments = inst.parameters?.compartments ?? customParameters?.compartments ?? 8;
    return (
      <div className="space-y-4 p-4">
        <div>
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold">{ref.name}</h3>
            <span className="text-[11px] text-zinc-400">{asset?.category}</span>
          </div>
          <p className="mt-0.5 text-[11px] text-zinc-400">
            {ref.w}×{ref.d}×{ref.h} mm · 组件 {inst.assetId}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <NumberField label="X (mm)" value={inst.t.x} onCommit={(x) => run('移动家具', [{ type: 'move', id: inst.id, t: { ...inst.t, x } }])} />
          <NumberField label="Y (mm)" value={inst.t.y} onCommit={(y) => run('移动家具', [{ type: 'move', id: inst.id, t: { ...inst.t, y } }])} />
          <NumberField label="角度 (°)" value={inst.t.rot} onCommit={(rot) => run('旋转家具', [{ type: 'move', id: inst.id, t: { ...inst.t, rot: ((rot % 360) + 360) % 360 } }])} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumberField min={10} max={20000} label="宽 (mm)" value={ref.w} onCommit={(w) => run('调整尺寸', [{ levelId: level.id, type: 'resize', id: inst.id, size: { w } }])} />
          <NumberField min={10} max={20000} label="深 (mm)" value={ref.d} onCommit={(d) => run('调整尺寸', [{ levelId: level.id, type: 'resize', id: inst.id, size: { d } }])} />
        </div>
        {asset?.type === 'custom' && (
          <NumberField min={10} max={20000} label="高 (mm)" value={ref.h}
            onCommit={(h) => run('调整高度', [{ levelId: level.id, type: 'resize', id: inst.id, size: { h } }])} />
        )}
        {asset?.type === 'custom' && customParameters && Object.keys(customParameters).length > 0 && (
          <div className="grid grid-cols-2 gap-2 border-t border-zinc-100 pt-3">
            {([
              ['compartments', '分区数量', 1, 8], ['openCompartments', '开放格数量', 0, instanceCompartments], ['shelves', '层板数量', 0, 12],
              ['drawers', '抽屉数量', 1, 8], ['seats', '座位数量', 1, 5],
            ] as const).filter(([key]) => customParameters[key] !== undefined).map(([key, label, min, max]) => (
              <NumberField key={key} min={min} max={max} label={label}
                value={inst.parameters?.[key] ?? customParameters[key]!}
                onCommit={(value) => run('调整组件结构参数', [{ type: 'setParameters', id: inst.id, parameters: { [key]: value } }])} />
            ))}
          </div>
        )}

        <label className="flex items-center justify-between text-[11px] text-zinc-500">
          颜色覆盖
          <input
            type="color"
            value={inst.color ?? ref.color}
            onChange={(e) => run('设置颜色', [{ type: 'setColor', id: inst.id, color: e.target.value }])}
            className="h-7 w-14 cursor-pointer rounded border border-zinc-200"
          />
        </label>

        <div className="flex gap-2 pt-1">
          <button
            className="flex-1 rounded-md border border-zinc-200 py-1.5 text-xs hover:bg-zinc-50"
            onClick={() => {
              const id = uid();
              run('复制家具', [
                {
                  type: 'place',
                  inst: { ...inst, id, t: { ...inst.t, x: inst.t.x + 300, y: inst.t.y + 300 }, size: inst.size ? { ...inst.size } : undefined },
                },
              ]);
              select({ kind: 'furn', id });
            }}
          >
            复制
          </button>
          <button
            className="flex-1 rounded-md border border-red-200 py-1.5 text-xs text-red-600 hover:bg-red-50"
            onClick={() => {
              run('删除家具', [{ type: 'delete', id: inst.id }]);
              select(null);
              showToast(`已删除「${ref.name}」（可撤销）`);
            }}
          >
            删除
          </button>
        </div>
      </div>
    );
  }

  if (selection?.kind === 'room') {
    const room = level.rooms.find((r) => r.id === selection.id);
    if (!room) return <EmptyHint />;
    const mat = materialById(room.floorMaterialId, materials);
    const area = polyArea(room.poly);
    return (
      <div className="space-y-4 p-4">
        <h3 className="text-sm font-semibold">{room.name}</h3>
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-zinc-50 p-3 text-center">
          <div>
            <p className="text-lg font-semibold tabular-nums">{area.toFixed(2)}</p>
            <p className="text-[11px] text-zinc-400">面积 m²{room.counted === false ? '（不计入）' : ''}</p>
          </div>
          <div>
            <p className="text-lg font-semibold tabular-nums text-accent">¥{Math.round(area * mat.price * 1.05).toLocaleString()}</p>
            <p className="text-[11px] text-zinc-400">地面估价（含 5% 损耗）</p>
          </div>
        </div>
        <label className="flex flex-col gap-1 text-[11px] text-zinc-500">
          房间名称
          <input
            defaultValue={room.name}
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (name && name !== room.name) run('重命名房间', [{ type: 'setRoomName', roomId: room.id, name }]);
            }}
            className="rounded-md border border-zinc-200 px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
          />
        </label>
        <div>
          <p className="mb-1.5 text-[11px] text-zinc-500">地面材质</p>
          <div className="grid grid-cols-2 gap-1.5">
            {materials.map((m) => (
              <button
                key={m.id}
                onClick={() => run('更换地面材质', [{ type: 'setRoomMaterial', roomId: room.id, materialId: m.id }])}
                className={`flex items-center gap-2 rounded-md border p-2 text-left text-[11px] transition ${
                  m.id === room.floorMaterialId ? 'border-accent bg-accent-soft' : 'border-zinc-200 hover:border-zinc-300'
                }`}
              >
                <span className="h-6 w-6 flex-none rounded border border-black/10" style={{ background: m.sw }} />
                <span>
                  {m.name}
                  <span className="block text-[10px] text-zinc-400">¥{m.price}/m²</span>
                </span>
              </button>
            ))}
          </div>
        </div>
        <button
          className="w-full rounded-md border border-red-200 py-1.5 text-xs text-red-600 hover:bg-red-50"
          onClick={() => {
            run('删除房间', [{ type: 'deleteRoom', id: room.id }]);
            select(null);
            showToast(`已删除「${room.name}」（可撤销）`);
          }}
        >
          删除房间地面
        </button>
      </div>
    );
  }

  if (selection?.kind === 'wall') {
    const w = level.walls.find((x) => x.id === selection.id);
    if (!w) return <EmptyHint />;
    const len = Math.max(w.x1 - w.x0, w.y1 - w.y0);
    const thickness = Math.min(w.x1 - w.x0, w.y1 - w.y0);
    const onWall = level.openings.filter((o) => {
      const cx = (o.rect[0] + o.rect[2]) / 2;
      const cy = (o.rect[1] + o.rect[3]) / 2;
      return cx >= w.x0 && cx <= w.x1 && cy >= w.y0 && cy <= w.y1;
    });
    return (
      <div className="space-y-4 p-4">
        <h3 className="text-sm font-semibold">墙体</h3>
        <div className="grid grid-cols-3 gap-2 rounded-lg bg-zinc-50 p-3 text-center text-xs">
          <div><p className="font-semibold tabular-nums">{len}</p><p className="text-[10px] text-zinc-400">长度 mm</p></div>
          <div><p className="font-semibold tabular-nums">{thickness}</p><p className="text-[10px] text-zinc-400">厚度 mm</p></div>
          <div><p className="font-semibold tabular-nums">{w.height}</p><p className="text-[10px] text-zinc-400">高度 mm</p></div>
        </div>
        <label className="flex flex-col gap-1 text-[11px] text-zinc-500">
          墙体类型
          <select
            value={w.kind}
            onChange={(e) => {
              const kind = e.target.value as Wall['kind'];
              run('修改墙体', [{ type: 'setWall', id: w.id, kind, height: kind === 'low' ? 1100 : 2800 }]);
            }}
            className="rounded-md border border-zinc-200 px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
          >
            <option value="exterior">外墙</option>
            <option value="bearing">承重墙（不可拆改）</option>
            <option value="partition">非承重墙</option>
            <option value="low">矮墙</option>
          </select>
        </label>
        <label className="flex items-center justify-between text-[11px] text-zinc-500">
          墙体颜色
          <input type="color" value={w.color ?? '#a7a195'} onChange={(event) => run('设置墙面颜色', [{ type: 'setWall', id: w.id, color: event.target.value }])}
            className="h-7 w-14 cursor-pointer rounded border border-zinc-200" />
        </label>
        <p className="text-[11px] text-zinc-400">墙上门窗：{onWall.length ? onWall.map((o) => (o.kind === 'window' ? '窗' : '门')).join('、') : '无'}</p>
        <p className="text-[11px] leading-relaxed text-zinc-400">提示：拖动墙身整体移动（墙上门窗跟随）；拖动端点调整长度；Delete 删除。</p>
        <button
          className="w-full rounded-md border border-red-200 py-1.5 text-xs text-red-600 hover:bg-red-50"
          onClick={() => {
            const cmds: Array<{ type: 'deleteWall' | 'deleteOpening'; id: string }> = [{ type: 'deleteWall', id: w.id }];
            for (const o of onWall) cmds.push({ type: 'deleteOpening', id: o.id });
            run('删除墙体', cmds);
            select(null);
            showToast('已删除墙体（可撤销）');
          }}
        >
          删除墙体（连带墙上门窗）
        </button>
      </div>
    );
  }

  if (selection?.kind === 'opening') {
    const o = level.openings.find((x) => x.id === selection.id);
    if (!o) return <EmptyHint />;
    const horizontal = o.rect[2] - o.rect[0] >= o.rect[3] - o.rect[1];
    const width = horizontal ? o.rect[2] - o.rect[0] : o.rect[3] - o.rect[1];
    return (
      <div className="space-y-4 p-4">
        <h3 className="text-sm font-semibold">{o.kind === 'window' ? '窗户' : o.kind === 'entry' ? '入户门' : o.kind === 'sliding' ? '推拉门' : '门'}</h3>
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="洞口宽 (mm)"
            value={width}
            onCommit={(W) => {
              const r = [...o.rect] as [number, number, number, number];
              if (horizontal) {
                const cx = (o.rect[0] + o.rect[2]) / 2;
                r[0] = Math.round(cx - W / 2);
                r[2] = Math.round(cx + W / 2);
              } else {
                const cy = (o.rect[1] + o.rect[3]) / 2;
                r[1] = Math.round(cy - W / 2);
                r[3] = Math.round(cy + W / 2);
              }
              run('调整洞口', [{ type: 'setOpening', id: o.id, rect: r }]);
            }}
          />
          <NumberField label="洞口高 (mm)" value={o.height} onCommit={(height) => run('调整洞口', [{ type: 'setOpening', id: o.id, height }])} />
          {o.kind === 'window' && (
            <NumberField label="窗台高 (mm)" value={o.sill} onCommit={(sill) => run('调整洞口', [{ type: 'setOpening', id: o.id, sill }])} />
          )}
        </div>
        <p className="text-[11px] text-zinc-400">提示：拖动墙体时，墙上的门窗会跟随移动；Delete 删除。</p>
        <button
          className="w-full rounded-md border border-red-200 py-1.5 text-xs text-red-600 hover:bg-red-50"
          onClick={() => {
            run('删除门窗', [{ type: 'deleteOpening', id: o.id }]);
            select(null);
            showToast('已删除门窗洞口（可撤销）');
          }}
        >
          删除洞口
        </button>
      </div>
    );
  }

  return <EmptyHint />;
}

function EmptyHint() {
  return (
    <div className="p-6 text-center text-xs leading-relaxed text-zinc-400">
      在 2D 平面或 3D 场景中点击家具 / 房间，
      <br />
      此处将显示其属性；也可以直接用左侧 AI 面板下指令。
    </div>
  );
}

/* ---------- 统计面板 ---------- */

export function StatsPanel() {
  const doc = useSceneStore((s) => s.doc);
  if (!doc) return null;
  const materials = materialCatalog(documentMaterials(doc));
  const level = doc.levels[0];
  const counted = level.rooms.filter((r) => r.counted !== false);
  const totalArea = counted.reduce((a, r) => a + polyArea(r.poly), 0);

  const byMat = new Map<string, number>();
  for (const r of counted) {
    const a = polyArea(r.poly);
    byMat.set(r.floorMaterialId, (byMat.get(r.floorMaterialId) ?? 0) + a);
  }
  let totalCost = 0;
  const matRows = [...byMat.entries()].map(([id, area]) => {
    const m = materialById(id, materials);
    const cost = area * m.price * 1.05;
    totalCost += cost;
    return { m, area, cost };
  });

  return (
    <div className="space-y-4 p-4">
      <section>
        <h3 className="mb-2 text-xs font-semibold tracking-wider text-zinc-400">房间面积</h3>
        <table className="w-full text-xs">
          <tbody>
            {level.rooms.map((r) => (
              <tr key={r.id} className="border-b border-dashed border-zinc-100">
                <td className="py-1.5">
                  <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: materialById(r.floorMaterialId, materials).sw }} />
                  {r.name}
                  {r.counted === false && <span className="ml-1 text-zinc-400">*</span>}
                </td>
                <td className="py-1.5 text-right tabular-nums">{polyArea(r.poly).toFixed(2)} m²</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 flex justify-between text-sm font-medium">
          <span>套内使用面积</span>
          <span className="tabular-nums">{totalArea.toFixed(2)} m²</span>
        </div>
        <p className="mt-1 text-[10px] text-zinc-400">* 飘窗不计入；面积按墙体内净尺寸计算</p>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold tracking-wider text-zinc-400">地面材料估算（含 5% 损耗）</h3>
        <table className="w-full text-xs">
          <tbody>
            {matRows.map(({ m, area, cost }) => (
              <tr key={m.id} className="border-b border-dashed border-zinc-100">
                <td className="py-1.5">{m.name}</td>
                <td className="py-1.5 text-right tabular-nums text-zinc-500">{area.toFixed(1)} m²</td>
                <td className="py-1.5 text-right tabular-nums">¥{Math.round(cost).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 flex justify-between text-sm font-medium">
          <span>合计</span>
          <span className="tabular-nums text-accent">¥{Math.round(totalCost).toLocaleString()}</span>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-zinc-50 p-3 text-center">
          <p className="text-lg font-semibold tabular-nums">{level.instances.length}</p>
          <p className="text-[11px] text-zinc-400">家具组件数</p>
        </div>
        <div className="rounded-lg bg-zinc-50 p-3 text-center">
          <p className="text-lg font-semibold tabular-nums">{level.walls.length}</p>
          <p className="text-[11px] text-zinc-400">墙段数</p>
        </div>
      </section>
    </div>
  );
}
