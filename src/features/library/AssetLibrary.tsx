'use client';

import { useMemo, useState } from 'react';
import { assetCatalog } from '@/core/assets';
import type { Asset, CustomAsset } from '@/core/types';
import { uid } from '@/core/types';
import { resolveRoom } from '@/core/ops';
import { solvePlacement } from '@/core/geometry';
import { useSceneStore } from '@/stores/sceneStore';
import { useEditorStore } from '@/stores/editorStore';
import { furnSVG } from '@/core/symbols2d';
import AssetEditor from './AssetEditor';
import { documentAssets } from '@/core/sceneResources';

export default function AssetLibrary() {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('all');
  const [source, setSource] = useState<'all' | 'project'>('all');
  const [editor, setEditor] = useState<{ asset?: CustomAsset } | null>(null);
  const doc = useSceneStore(s => s.doc);
  const run = useSceneStore(s => s.run);
  const planLayer = useEditorStore(s => s.planLayer);
  const viewMode = useEditorStore(s => s.viewMode);
  const canPlaceAssets = viewMode !== '2d' || planLayer === 'layout';
  const assets = useMemo(() => doc ? documentAssets(doc) : undefined, [doc?.assets, doc?.assetSnapshots]);
  const catalog = useMemo(() => assetCatalog(assets), [assets]);
  const projectAssetIds = useMemo(() => new Set(assets?.map(asset => asset.id) ?? []), [assets]);
  const categories = useMemo(() => [...new Set(catalog.map(asset => asset.category))], [catalog]);
  const groups = useMemo(() => {
    const query = q.trim().toLowerCase().replace(/\s+/g, '');
    return categories.filter(cat => category === 'all' || cat === category).map(cat => ({
      cat, items: catalog.filter(asset => asset.category === cat && (source === 'all' || projectAssetIds.has(asset.id)) &&
        (!query || [asset.name, asset.type, ...asset.tags].some(text => text.toLowerCase().replace(/\s+/g, '').includes(query)))),
    })).filter(group => group.items.length > 0);
  }, [q, category, source, catalog, categories, projectAssetIds]);
  const usage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const level of doc?.levels ?? []) for (const inst of level.instances) counts.set(inst.assetId, (counts.get(inst.assetId) ?? 0) + 1);
    return counts;
  }, [doc?.levels]);

  const addAsset = (asset: Asset) => {
    const document = useSceneStore.getState().doc;
    if (!document) return;
    const projectAssets = documentAssets(document);
    const level = document.levels[0];
    const ed = useEditorStore.getState();
    if (ed.viewMode === '2d' && ed.planLayer !== 'layout') {
      ed.showToast('切换到「布置」图层后才能放置组件');
      return;
    }
    const selection = ed.selection;
    const room = selection?.kind === 'room' ? level.rooms.find(candidate => candidate.id === selection.id) : resolveRoom(level);
    if (!room) { ed.showToast('请先使用「房间」工具绘制可放置的地面'); return; }
    const placement = solvePlacement(level, room, asset, { assets: projectAssets });
    if (!placement) { ed.showToast(`「${room.name}」里没有足够的空位`); return; }
    const id = uid();
    run('添加组件', [{ levelId: level.id, type: 'place', inst: { id, assetId: asset.id, t: placement } }]);
    ed.select({ kind: 'furn', id });
    ed.showToast(`已在${room.name}放置「${asset.name}」`);
  };

  if (editor) return <div className="h-full overflow-y-auto"><AssetEditor key={editor.asset?.id ?? 'new'} asset={editor.asset}
    onCancel={() => setEditor(null)} onSave={asset => {
      run(editor.asset ? '编辑组件定义' : '创建自定义组件', [{ type: editor.asset ? 'updateAsset' : 'addAsset', asset }]);
      setEditor(null); setSource('project'); setCategory('all'); setQ('');
      useEditorStore.getState().showToast(editor.asset ? '组件已更新，可撤销' : '已加入本方案组件库，点击组件即可放置');
    }} /></div>;

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-zinc-100 p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">组件库</h3>
          <button onClick={() => setEditor({})} className="rounded-md bg-ink px-2 py-1.5 text-[11px] text-white hover:opacity-90">＋ 新建组件</button>
        </div>
        <input aria-label="搜索组件" value={q} onChange={event => setQ(event.target.value)} placeholder="搜索名称、类型、标签…" className="w-full rounded-md border border-zinc-200 px-2.5 py-1.5 text-sm outline-none focus:border-accent" />
        <div className="flex gap-1">
          {([['all', '全部组件'], ['project', '本方案组件']] as const).map(([value, label]) => (
            <button key={value} aria-pressed={source === value} onClick={() => setSource(value)} className={`flex-1 rounded-md px-1 py-1.5 text-[11px] ${source === value ? 'bg-accent-soft text-accent' : 'text-zinc-500 hover:bg-zinc-50'}`}>{label}</button>
          ))}
        </div>
        <select aria-label="组件分类" value={category} onChange={event => setCategory(event.target.value)} className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs">
          <option value="all">全部分类</option>{categories.map(cat => <option key={cat}>{cat}</option>)}
        </select>
        <p className="text-[11px] leading-relaxed text-zinc-400">
          {canPlaceAssets ? '点击放入选中房间，默认最大房间；自动寻找空位，放置后可拖动和旋转。' : '铺装图层中可选择房间并调整地面；切换到布置图层后可放置组件。'}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
        {!groups.length && <div className="space-y-3 px-3 py-8 text-center">
          <p className="text-xs text-zinc-500">{source === 'project' && !assets?.length ? '本方案还没有自定义组件' : '没有匹配的组件'}</p>
          <button onClick={() => { setQ(''); setCategory('all'); setSource('all'); }} className="text-xs text-accent">查看全部组件</button>
        </div>}
        {groups.map(group => <section key={group.cat} className="mb-2">
          <h4 className="sticky top-0 z-10 bg-white py-2 text-[11px] font-semibold tracking-widest text-zinc-400">{group.cat} · {group.items.length}</h4>
          <div className="grid grid-cols-2 gap-1.5">
            {group.items.map(asset => {
              const custom = doc?.assets?.find(candidate => candidate.id === asset.id);
              const used = usage.get(asset.id) ?? 0;
              return <div key={asset.id} className="overflow-hidden rounded-lg border border-zinc-200 bg-white transition hover:border-accent hover:shadow-sm">
                <button onClick={() => addAsset(asset)} disabled={!canPlaceAssets} className="flex w-full flex-col items-center p-2 text-center disabled:cursor-not-allowed disabled:opacity-45" title={canPlaceAssets ? `放置 ${asset.name} · ${asset.w}×${asset.d}×${asset.h} mm` : '请切换到布置图层放置组件'}>
                  <svg viewBox={`${-asset.w / 2 - 80} ${-asset.d / 2 - 80} ${asset.w + 160} ${asset.d + 160}`} className="h-12 w-full" aria-hidden="true">
                    <g dangerouslySetInnerHTML={{ __html: furnSVG(asset.type, asset.w, asset.d, asset.color, asset.geometry) }} />
                  </svg>
                  <span className="mt-1 w-full truncate text-[11px] font-medium">{asset.name}</span>
                  <span className="text-[10px] text-zinc-400">{asset.w}×{asset.d}×{asset.h}</span>
                </button>
                {custom && <div className="flex border-t border-zinc-100">
                  <button aria-label={`编辑 ${asset.name}`} onClick={() => setEditor({ asset: custom })} className="flex-1 py-1.5 text-[10px] text-accent hover:bg-zinc-50">编辑</button>
                  <button aria-label={`删除组件 ${asset.name}`} disabled={used > 0} title={used ? `已使用 ${used} 次，请先删除对应实例` : '从组件库删除，可撤销'}
                    onClick={() => { run('删除组件定义', [{ type: 'deleteAsset', id: asset.id }]); useEditorStore.getState().showToast('组件已删除，可撤销'); }} className="flex-1 border-l border-zinc-100 py-1.5 text-[10px] text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-zinc-300">{used ? `使用中 ${used}` : '删除'}</button>
                </div>}
              </div>;
            })}
          </div>
        </section>)}
      </div>
    </div>
  );
}
