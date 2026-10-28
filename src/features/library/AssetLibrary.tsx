'use client';

/* 左侧组件库：点击放入当前选中房间（未选中时放面积最大房间），
 * 摆放位置由 core/geometry 的求解器计算（贴墙、避让现有家具）。 */

import { useMemo, useState } from 'react';
import { CATALOG, CATEGORIES } from '@/core/assets';
import type { Asset } from '@/core/types';
import { uid } from '@/core/types';
import { resolveRoom } from '@/core/ops';
import { solvePlacement } from '@/core/geometry';
import { useSceneStore } from '@/stores/sceneStore';
import { useEditorStore } from '@/stores/editorStore';
import { furnSVG } from '@/core/symbols2d';

export default function AssetLibrary() {
  const [q, setQ] = useState('');
  const run = useSceneStore((s) => s.run);

  const groups = useMemo(() => {
    const query = q.trim();
    return CATEGORIES.map((cat) => ({
      cat,
      items: CATALOG.filter(
        (a) => a.category === cat && (!query || a.name.includes(query) || a.type.includes(query.toLowerCase())),
      ),
    })).filter((g) => g.items.length > 0);
  }, [q]);

  const addAsset = (asset: Asset) => {
    const { doc } = useSceneStore.getState();
    if (!doc) return;
    const level = doc.levels[0];
    const ed = useEditorStore.getState();
    const roomName =
      ed.selection?.kind === 'room' ? level.rooms.find((r) => r.id === ed.selection!.id)?.name : undefined;
    const room = resolveRoom(level, roomName);
    if (!room) {
      ed.showToast('未找到可放置的房间');
      return;
    }
    const p = solvePlacement(level, room, asset);
    if (!p) {
      ed.showToast(`「${room.name}」里没有足够的空位`);
      return;
    }
    const id = uid();
    run('添加家具', [
      { type: 'place', inst: { id, assetId: asset.id, t: p, size: { w: asset.w, d: asset.d } } },
    ]);
    ed.select({ kind: 'furn', id });
    ed.showToast(`已在${room.name}放置「${asset.name}」`);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-100 p-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索组件…"
          className="w-full rounded-md border border-zinc-200 px-2.5 py-1.5 text-sm outline-none focus:border-accent"
        />
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
          点击放入当前选中房间（默认最大房间）；摆放位置自动贴墙并避让现有家具
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
        {groups.map((g) => (
          <section key={g.cat} className="mb-2">
            <h4 className="sticky top-0 bg-white py-2 text-[11px] font-semibold tracking-widest text-zinc-400">
              {g.cat}
            </h4>
            <div className="grid grid-cols-2 gap-1.5">
              {g.items.map((a) => (
                <button
                  key={a.id}
                  onClick={() => addAsset(a)}
                  className="group flex flex-col items-center rounded-lg border border-zinc-200 bg-white p-2 text-center transition hover:border-accent hover:shadow-sm"
                  title={`${a.name} · ${a.w}×${a.d}mm`}
                >
                  <svg
                    viewBox={`${-a.w / 2 - 80} ${-a.d / 2 - 80} ${a.w + 160} ${a.d + 160}`}
                    className="h-12 w-full"
                  >
                    <g dangerouslySetInnerHTML={{ __html: furnSVG(a.type, a.w, a.d, a.color) }} />
                  </svg>
                  <span className="mt-1 w-full truncate text-[11px] font-medium">{a.name}</span>
                  <span className="text-[10px] text-zinc-400">{a.w}×{a.d}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
