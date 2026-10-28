'use client';

import { useState, type FormEvent } from 'react';
import { CATEGORIES } from '@/core/assets';
import { CustomAssetSchema } from '@/core/assetSchema';
import { furnSVG } from '@/core/symbols2d';
import { uid, type CustomAsset } from '@/core/types';

export default function AssetEditor({ asset, onSave, onCancel }: {
  asset?: CustomAsset; onSave: (asset: CustomAsset) => void; onCancel: () => void;
}) {
  const [name, setName] = useState(asset?.name ?? '');
  const [category, setCategory] = useState(asset?.category ?? '自定义');
  const [shape, setShape] = useState<'box' | 'cylinder'>(asset?.geometry.shape ?? 'box');
  const [dimensions, setDimensions] = useState({ w: String(asset?.w ?? 600), d: String(asset?.d ?? 600), h: String(asset?.h ?? 800) });
  const [color, setColor] = useState(asset?.color ?? '#c9b89f');
  const [error, setError] = useState('');
  const w = Number(dimensions.w), d = Number(dimensions.d);
  const validPreview = Number.isFinite(w) && Number.isFinite(d) && w >= 10 && d >= 10 && w <= 20000 && d <= 20000;
  const fieldClass = 'mt-1 w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm text-ink outline-none focus:border-accent';
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = CustomAssetSchema.safeParse({
      id: asset?.id ?? `custom:${uid('a')}`, type: 'custom', name, category, w, d, h: Number(dimensions.h), color,
      tags: asset?.tags ?? [], geometry: { shape },
    });
    if (!result.success) { setError(result.error.issues[0].message); return; }
    try { onSave(result.data); } catch (cause) { setError(cause instanceof Error ? cause.message : '保存组件失败'); }
  };
  return (
    <form onSubmit={submit} className="space-y-3 p-3" aria-label={asset ? '编辑自定义组件' : '新建自定义组件'}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{asset ? '编辑组件' : '新建组件'}</h3>
        <button type="button" onClick={onCancel} aria-label="关闭组件编辑" className="rounded px-2 py-1 text-zinc-500 hover:bg-zinc-100">×</button>
      </div>
      <p className="text-[11px] leading-relaxed text-zinc-500">用于占位、定制柜等基础造型，2D / 3D 同步。组件随当前方案保存。</p>
      <label className="block text-xs text-zinc-500">名称
        <input autoFocus required maxLength={60} value={name} onChange={event => setName(event.target.value)} placeholder="例如：定制玄关柜" className={fieldClass} />
      </label>
      <label className="block text-xs text-zinc-500">分类
        <select value={category} onChange={event => setCategory(event.target.value)} className={fieldClass}>
          {[...new Set(['自定义', ...CATEGORIES, ...(asset ? [asset.category] : [])])].map(value => <option key={value}>{value}</option>)}
        </select>
      </label>
      <label className="block text-xs text-zinc-500">基础造型
        <select value={shape} onChange={event => setShape(event.target.value as 'box' | 'cylinder')} className={fieldClass}>
          <option value="box">长方体 / 矩形轮廓</option><option value="cylinder">圆柱体 / 椭圆轮廓</option>
        </select>
      </label>
      <div className="grid grid-cols-3 gap-2">
        {([['w', '宽'], ['d', '深'], ['h', '高']] as const).map(([key, label]) => <label key={key} className="text-[11px] text-zinc-500">{label} (mm)
          <input type="number" required min={10} max={20000} step={1} value={dimensions[key]} onChange={event => setDimensions({ ...dimensions, [key]: event.target.value })} className={fieldClass} />
        </label>)}
      </div>
      <label className="flex items-center justify-between text-xs text-zinc-500">颜色
        <input type="color" value={color} onChange={event => setColor(event.target.value)} className="h-8 w-14 cursor-pointer rounded border border-zinc-200" />
      </label>
      <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-3">
        {validPreview && <svg aria-label="组件平面预览" viewBox={`${-w / 2 - 80} ${-d / 2 - 80} ${w + 160} ${d + 160}`} className="h-24 w-full">
          <g dangerouslySetInnerHTML={{ __html: furnSVG('custom', w, d, color, { shape }) }} />
        </svg>}
        <p className="mt-2 text-center text-[10px] text-zinc-400">2D 预览 · 尺寸范围 10–20000 mm</p>
      </div>
      {asset && <p className="text-[11px] text-zinc-500">修改同步至使用此组件的实例，单独覆盖过的尺寸和颜色保留。</p>}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="flex-1 rounded-md border border-zinc-200 py-2 text-xs hover:bg-zinc-50">取消</button>
        <button type="submit" className="flex-1 rounded-md bg-ink py-2 text-xs font-medium text-white hover:opacity-90">{asset ? '保存修改' : '加入组件库'}</button>
      </div>
    </form>
  );
}
