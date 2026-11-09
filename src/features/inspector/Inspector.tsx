'use client';

/* 右侧面板：属性（家具/房间/墙体/门窗）与统计（面积/造价估算，算法移植自原型） */

import { useEffect, useState } from 'react';
import { useSceneStore } from '@/stores/sceneStore';
import { useEditorStore } from '@/stores/editorStore';
import { assetById, materialById, materialCatalog } from '@/core/assets';
import { instanceRef, uid, type Opening, type Wall } from '@/core/types';
import { analyzeLevelLayout, polyArea } from '@/core/geometry';
import { documentAssets, documentMaterials } from '@/core/sceneResources';
import { MAX_FURNITURE_UNIT_PRICE, MAX_MATERIAL_PRICE_PER_SQM } from '@/core/pricingLimits';

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

function MoneyField({ label, value, onCommit, allowUnset = false, hint, max = MAX_FURNITURE_UNIT_PRICE }: {
  label: string;
  value: number | undefined;
  onCommit: (value: number | undefined) => void;
  allowUnset?: boolean;
  hint?: string;
  max?: number;
}) {
  const [text, setText] = useState(value === undefined ? '' : value.toFixed(2));
  useEffect(() => setText(value === undefined ? '' : value.toFixed(2)), [value]);
  const commit = () => {
    if (!text.trim()) {
      if (allowUnset) onCommit(undefined);
      else setText(value === undefined ? '' : value.toFixed(2));
      return;
    }
    const amount = Number(text);
    if (!Number.isFinite(amount) || amount < 0 || amount > max) {
      setText(value === undefined ? '' : value.toFixed(2));
      return;
    }
    const rounded = Math.round(amount * 100) / 100;
    if (rounded !== value) onCommit(rounded);
    else setText(rounded.toFixed(2));
  };
  return (
    <label className="flex flex-col gap-1 text-[11px] text-zinc-500">
      {label}
      <input
        type="number"
        min={0}
        max={max}
        step="0.01"
        inputMode="decimal"
        value={text}
        placeholder={allowUnset ? '未设置' : undefined}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); }}
        className="rounded-md border border-zinc-200 px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
      />
      {hint && <span className="text-[10px] leading-relaxed text-zinc-400">{hint}</span>}
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
  const planLayer = useEditorStore((s) => s.planLayer);
  const viewMode = useEditorStore((s) => s.viewMode);

  if (!doc) return null;
  const floorEditing = viewMode === '2d' && planLayer === 'floor';
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
        <div className="grid grid-cols-3 gap-2">
          <NumberField min={10} max={20000} label="宽 (mm)" value={ref.w} onCommit={(w) => run('调整尺寸', [{ levelId: level.id, type: 'resize', id: inst.id, size: { w } }])} />
          <NumberField min={10} max={20000} label="深 (mm)" value={ref.d} onCommit={(d) => run('调整尺寸', [{ levelId: level.id, type: 'resize', id: inst.id, size: { d } }])} />
          <NumberField min={10} max={20000} label="高 (mm)" value={ref.h}
            onCommit={(h) => run('调整高度', [{ levelId: level.id, type: 'resize', id: inst.id, size: { h } }])} />
        </div>
        <MoneyField label="本件单价（元）" value={inst.unitPrice} allowUnset
          hint="按实际商品填写；未设置时不计入预算小计。"
          onCommit={(unitPrice) => run('设置家具单价', [{ levelId: level.id, type: 'setInstancePrice', id: inst.id, unitPrice }])} />
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
        {!floorEditing && <label className="flex flex-col gap-1 text-[11px] text-zinc-500">
          房间名称
          <input
            defaultValue={room.name}
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (name && name !== room.name) run('重命名房间', [{ type: 'setRoomName', roomId: room.id, name }]);
            }}
            className="rounded-md border border-zinc-200 px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
          />
        </label>}
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
        <MoneyField label="项目单价（元/m²）" value={mat.price} max={MAX_MATERIAL_PRICE_PER_SQM}
          hint="此价格应用到项目中所有使用该材质的房间。"
          onCommit={(price) => { if (price !== undefined) run('调整材质单价', [{ type: 'setMaterialPrice', materialId: mat.id, price }]); }} />
        {!floorEditing && <button
          className="w-full rounded-md border border-red-200 py-1.5 text-xs text-red-600 hover:bg-red-50"
          onClick={() => {
            run('删除房间', [{ type: 'deleteRoom', id: room.id }]);
            select(null);
            showToast(`已删除「${room.name}」（可撤销）`);
          }}
        >
          删除房间地面
        </button>}
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
        {o.kind === 'sliding' && (
          <div className="space-y-1.5 border-t border-zinc-100 pt-3">
            <label className="flex flex-col gap-1 text-[11px] text-zinc-500">
              推拉门方式
              <select
                value={o.slideMode ?? 'bypass'}
                onChange={(event) => run('设置推拉门方式', [{
                  type: 'setOpening', id: o.id, slideMode: event.target.value as NonNullable<Opening['slideMode']>,
                }])}
                className="rounded-md border border-zinc-200 px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
              >
                <option value="bypass">双轨错位（洞口内）</option>
                <option value="pocket-start">单侧墙体收纳（{horizontal ? '左侧' : '上侧'}）</option>
                <option value="pocket-end">单侧墙体收纳（{horizontal ? '右侧' : '下侧'}）</option>
              </select>
            </label>
            <p className="text-[10px] leading-relaxed text-zinc-400">截图识别不会推断墙体收纳方向；只在明确选择单侧收纳时检查墙体空间。</p>
          </div>
        )}
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
  const assets = documentAssets(doc);
  const level = doc.levels[0];
  const layoutChecks = analyzeLevelLayout(level, assets);
  const blockingChecks = layoutChecks.filter((check) => check.severity !== 'review');
  const reviewChecks = layoutChecks.length - blockingChecks.length;
  const counted = level.rooms.filter((r) => r.counted !== false);
  const totalArea = counted.reduce((a, r) => a + polyArea(r.poly), 0);

  const byMat = new Map<string, number>();
  for (const r of counted) {
    const a = polyArea(r.poly);
    byMat.set(r.floorMaterialId, (byMat.get(r.floorMaterialId) ?? 0) + a);
  }
  let floorCost = 0;
  const matRows = [...byMat.entries()].map(([id, area]) => {
    const m = materialById(id, materials);
    const cost = area * m.price * 1.05;
    floorCost += cost;
    return { m, area, cost };
  });

  const pricedItems = new Map<string, { name: string; quantity: number; unitPrice: number; cost: number }>();
  const unpricedItems = new Map<string, { name: string; quantity: number }>();
  for (const instance of level.instances) {
    const name = assetById(instance.assetId, assets)?.name ?? '未知组件';
    if (instance.unitPrice === undefined) {
      const item = unpricedItems.get(instance.assetId) ?? { name, quantity: 0 };
      item.quantity += 1;
      unpricedItems.set(instance.assetId, item);
      continue;
    }
    const key = `${instance.assetId}:${instance.unitPrice.toFixed(2)}`;
    const item = pricedItems.get(key) ?? { name, quantity: 0, unitPrice: instance.unitPrice, cost: 0 };
    item.quantity += 1;
    item.cost += instance.unitPrice;
    pricedItems.set(key, item);
  }
  const furnitureRows = [...pricedItems.values()];
  const furnitureCost = furnitureRows.reduce((total, item) => total + item.cost, 0);
  const totalCost = floorCost + furnitureCost;
  const unpricedFurnitureCount = [...unpricedItems.values()].reduce((total, item) => total + item.quantity, 0);

  return (
    <div className="space-y-4 p-4">
      <section className="border-b border-zinc-100 pb-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold tracking-wider text-zinc-400">方案检查</h3>
          <div className="flex flex-col items-end text-right text-[11px] font-medium leading-4">
            {blockingChecks.length > 0 && <span className="text-red-700">不满足 · {blockingChecks.length} 项需处理</span>}
            {reviewChecks > 0 && <span className="text-amber-700">需确认 · {reviewChecks} 项</span>}
            {!blockingChecks.length && !reviewChecks && <span className="text-emerald-700">通过</span>}
          </div>
        </div>
        {layoutChecks.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {layoutChecks.slice(0, 8).map((check, index) => {
              const instance = level.instances.find((item) => item.id === check.instanceId);
              const related = level.instances.find((item) => item.id === check.relatedInstanceId);
              const opening = level.openings.find((item) => item.id === check.openingId);
              const openingName = opening?.kind === 'entry' ? '入户门'
                : opening?.kind === 'sliding' ? '推拉门'
                  : opening ? '房门' : undefined;
              const name = instance ? assetById(instance.assetId, assets)?.name ?? '家具' : openingName ?? '家具';
              const relatedName = related ? assetById(related.assetId, assets)?.name : undefined;
              return (
                <li key={`${check.instanceId ?? check.openingId ?? 'layout'}-${check.code}-${check.relatedInstanceId ?? index}`} className={`text-[11px] leading-relaxed ${check.severity === 'review' ? 'text-amber-800' : 'text-red-800'}`}>
                  {name}：{check.message}{relatedName ? `（与${relatedName}）` : ''}
                </li>
              );
            })}
            {layoutChecks.length > 8 && <li className="text-[10px] text-zinc-500">另有 {layoutChecks.length - 8} 项未显示</li>}
          </ul>
        )}
        {!level.rooms.length && <p className="mt-2 text-[11px] leading-relaxed text-amber-800">尚未绘制房间边界，无法验证家具是否超出房间。</p>}
        <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">已检查房间边界、家具重叠和门洞；门前通行带、用户指定一侧的推拉门收纳区及家具操作净距按当前模型给出参考提示。全屋连续动线、商品实际轨道/开门角度、下水、电位及现场运输条件尚未验证。</p>
      </section>

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
        <p className="mt-1 text-[10px] text-zinc-400">* 飘窗不计入；按当前房间轮廓估算，不含人工、辅料、运输和安装</p>
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
          <span>地面材料小计</span>
          <span className="tabular-nums">¥{Math.round(floorCost).toLocaleString()}</span>
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold tracking-wider text-zinc-400">家具商品估算</h3>
        {furnitureRows.length > 0 ? <table className="w-full text-xs">
          <tbody>
            {furnitureRows.map((item, index) => (
              <tr key={`${item.name}-${item.unitPrice}-${index}`} className="border-b border-dashed border-zinc-100">
                <td className="py-1.5">{item.name} × {item.quantity}<span className="ml-1 text-[10px] text-zinc-400">¥{item.unitPrice.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/件</span></td>
                <td className="py-1.5 text-right tabular-nums">¥{item.cost.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
            ))}
          </tbody>
        </table> : <p className="text-[11px] text-zinc-400">尚未填写家具商品单价。</p>}
        {unpricedFurnitureCount > 0 && <div className="mt-2 rounded-md bg-amber-50 px-2.5 py-2 text-[10px] leading-relaxed text-amber-900">
          {unpricedFurnitureCount} 件家具未设置单价，未计入小计：{[...unpricedItems.values()].map((item) => `${item.name} × ${item.quantity}`).join('、')}
        </div>}
        <div className="mt-3 flex justify-between border-t border-zinc-100 pt-3 text-sm font-semibold">
          <span>已计价小计</span>
          <span className="tabular-nums text-accent">¥{totalCost.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
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
      <p className="text-[10px] leading-relaxed text-zinc-400">地面默认单价为参考估价，可在房间属性中调整；家具单价需按实际商品填写。当前未关联电商 SKU，金额不含人工、辅料、运输及安装。</p>
    </div>
  );
}
