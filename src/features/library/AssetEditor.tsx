'use client';

import { useState, type FormEvent } from 'react';
import dynamic from 'next/dynamic';
import { COMPONENT_TEMPLATES, componentTemplateByShape } from '@/core/componentTemplates';
import { CustomAssetSchema } from '@/core/assetSchema';
import { cabinetSectionTypes, isCabinetShape } from '@/core/cabinet';
import { furnSVG } from '@/core/symbols2d';
import { uid, type CustomAsset, type CustomFinish, type CustomShape } from '@/core/types';

const ComponentPreview = dynamic(() => import('./ComponentPreview'), { ssr: false, loading: () => <div className="h-36 animate-pulse rounded-md bg-zinc-100" /> });

export default function AssetEditor({ asset, onSave, onCancel }: {
  asset?: CustomAsset; onSave: (asset: CustomAsset) => void; onCancel: () => void;
}) {
  const template = componentTemplateByShape(asset?.geometry.shape ?? 'cabinet');
  const [name, setName] = useState(asset?.name ?? template.name);
  const [category, setCategory] = useState(asset?.category ?? template.category);
  const [shape, setShape] = useState<CustomShape>(asset?.geometry.shape ?? template.shape);
  const [dimensions, setDimensions] = useState({ w: String(asset?.w ?? template.dimensions.w), d: String(asset?.d ?? template.dimensions.d), h: String(asset?.h ?? template.dimensions.h) });
  const [finish, setFinish] = useState<CustomFinish>(asset?.geometry.finish ?? template.finish);
  const [parameters, setParameters] = useState({ ...template.parameters, ...asset?.geometry.parameters });
  const [color, setColor] = useState(asset?.color ?? '#c9b89f');
  const [tags, setTags] = useState(asset?.tags.join('，') ?? '');
  const [error, setError] = useState('');
  const w = Number(dimensions.w), d = Number(dimensions.d);
  const validPreview = Number.isFinite(w) && Number.isFinite(d) && w >= 10 && d >= 10 && w <= 20000 && d <= 20000;
  const fieldClass = 'mt-1 w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm text-ink outline-none focus:border-accent';
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = CustomAssetSchema.safeParse({
      id: asset?.id ?? `custom:${uid('a')}`, type: 'custom', name, category, w, d, h: Number(dimensions.h), color,
      tags: [...new Set(tags.split(/[，,\s]+/).map(tag => tag.trim()).filter(Boolean))],
      geometry: { shape, finish, ...(Object.keys(parameters).length ? { parameters } : {}) },
    });
    if (!result.success) { setError(result.error.issues[0].message); return; }
    try { onSave(result.data); } catch (cause) { setError(cause instanceof Error ? cause.message : '保存组件失败'); }
  };
  const selectTemplate = (nextShape: CustomShape) => {
    const next = componentTemplateByShape(nextShape);
    setShape(next.shape);
    if (!asset) setName(next.name);
    setCategory(next.category);
    setDimensions({ w: String(next.dimensions.w), d: String(next.dimensions.d), h: String(next.dimensions.h) });
    setFinish(next.finish);
    setParameters(next.parameters ?? {});
  };
  const numericParameter = (key: keyof typeof parameters, label: string, min: number, max: number) => (
    <label key={key} className="text-[11px] text-zinc-500">{label}
      <input type="number" min={min} max={max} step={1} value={parameters[key] ?? min}
        onChange={event => setParameters(current => {
          const value = event.target.value === '' ? undefined : Number(event.target.value);
          const next = { ...current, [key]: value };
          if (key === 'compartments' && value !== undefined && next.openCompartments !== undefined) {
            next.openCompartments = Math.min(next.openCompartments, value);
          }
          if (key === 'compartments' && value !== undefined && isCabinetShape(shape) && current.sections) {
            next.sections = cabinetSectionTypes({ ...current, compartments: value });
          }
          return next;
        })}
        className={fieldClass} />
    </label>
  );
  const cabinetShapes = isCabinetShape(shape);
  const sections = cabinetSectionTypes(parameters);
  return (
    <form onSubmit={submit} className="space-y-3 p-3" aria-label={asset ? '编辑自定义组件' : '新建自定义组件'}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{asset ? '编辑组件' : '新建组件'}</h3>
        <button type="button" onClick={onCancel} aria-label="关闭组件编辑" className="rounded px-2 py-1 text-zinc-500 hover:bg-zinc-100">×</button>
      </div>
      <p className="text-[11px] leading-relaxed text-zinc-500">选择家具模板并设置工程尺寸、结构参数与饰面；平面符号与 3D 造型同步生成。</p>
      <label className="block text-xs text-zinc-500">名称
        <input autoFocus required maxLength={60} value={name} onChange={event => setName(event.target.value)} placeholder="例如：定制玄关柜" className={fieldClass} />
      </label>
      <label className="block text-xs text-zinc-500">分类
        <select value={category} onChange={event => setCategory(event.target.value)} className={fieldClass}>
          {[...new Set(['自定义', ...COMPONENT_TEMPLATES.map(item => item.category), ...(asset ? [asset.category] : [])])].map(value => <option key={value}>{value}</option>)}
        </select>
      </label>
      <label className="block text-xs text-zinc-500">搜索标签
        <input value={tags} onChange={event => setTags(event.target.value)} placeholder="例如：悬空、三抽、岩板" className={fieldClass} />
      </label>
      <label className="block text-xs text-zinc-500">基础造型
        <select value={shape} onChange={event => selectTemplate(event.target.value as CustomShape)} className={fieldClass}>
          {[...new Set(COMPONENT_TEMPLATES.map(item => item.group))].map(group => <optgroup key={group} label={group}>
            {COMPONENT_TEMPLATES.filter(item => item.group === group).map(item => <option key={item.shape} value={item.shape}>{item.name}</option>)}
          </optgroup>)}
        </select>
      </label>
      <div className="grid grid-cols-3 gap-2">
        {([['w', '宽'], ['d', '深'], ['h', '高']] as const).map(([key, label]) => <label key={key} className="text-[11px] text-zinc-500">{label} (mm)
          <input type="number" required min={10} max={20000} step={1} value={dimensions[key]} onChange={event => setDimensions({ ...dimensions, [key]: event.target.value })} className={fieldClass} />
        </label>)}
      </div>
      {Object.keys(parameters).length > 0 && <fieldset className="space-y-2 rounded-md border border-zinc-200 p-2">
        <legend className="px-1 text-[11px] text-zinc-500">结构参数</legend>
        <div className="grid grid-cols-2 gap-2">
          {['cabinet', 'wallCabinet', 'wardrobe', 'bookcase', 'tvConsole', 'kitchenIsland'].includes(shape) && numericParameter('compartments', '分区数量', 1, 8)}
          {(cabinetShapes || shape === 'bookcase') && numericParameter('shelves', cabinetShapes ? '每个开放格层板数' : '层板数量', 0, 12)}
          {cabinetShapes && numericParameter('drawers', '抽屉格抽屉数量', 1, 8)}
          {['dresser', 'vanity'].includes(shape) && numericParameter('drawers', '抽屉数量', 1, 8)}
          {shape === 'sofa' && numericParameter('seats', '座位数量', 1, 5)}
        </div>
        {cabinetShapes && <div className="mt-2 grid grid-cols-2 gap-2">
          {sections.map((section, index) => <label key={index} className="text-[11px] text-zinc-500">第 {index + 1} 格
            <select value={section} onChange={event => setParameters(current => {
              const nextSections = cabinetSectionTypes(current);
              nextSections[index] = event.target.value as 'door' | 'open' | 'drawers';
              return { ...current, compartments: nextSections.length, sections: nextSections };
            })} className={fieldClass}>
              <option value="door">门板</option>
              <option value="open">开放格</option>
              <option value="drawers">抽屉</option>
            </select>
          </label>)}
        </div>}
      </fieldset>}
      <label className="block text-xs text-zinc-500">饰面类型
        <select value={finish} onChange={event => setFinish(event.target.value as CustomFinish)} className={fieldClass}>
          <option value="wood">木饰面</option><option value="paint">烤漆 / 涂装</option><option value="fabric">布艺软包</option>
          <option value="metal">金属</option><option value="ceramic">陶瓷 / 石材</option><option value="glass">透明玻璃</option>
        </select>
      </label>
      <label className="flex items-center justify-between text-xs text-zinc-500">颜色
        <input type="color" value={color} onChange={event => setColor(event.target.value)} className="h-8 w-14 cursor-pointer rounded border border-zinc-200" />
      </label>
      <section className="space-y-2">
        <p className="text-[11px] font-medium text-zinc-500">3D 预览 · 拖动旋转</p>
        <ComponentPreview asset={{ id: asset?.id ?? 'custom:preview', type: 'custom', name, category, w: validPreview ? w : 600, d: validPreview ? d : 600,
          h: Number.isFinite(Number(dimensions.h)) ? Number(dimensions.h) : 800, color, tags: [], geometry: { shape, finish, parameters } }} />
        <div className="rounded-md border border-dashed border-zinc-200 bg-zinc-50 p-3">
        {validPreview && <svg aria-label="组件平面预览" viewBox={`${-w / 2 - 80} ${-d / 2 - 80} ${w + 160} ${d + 160}`} className="h-16 w-full">
          <g dangerouslySetInnerHTML={{ __html: furnSVG('custom', w, d, color, { shape, finish, parameters }) }} />
        </svg>}
        <p className="text-center text-[10px] text-zinc-400">2D 平面符号 · 正视轮廓</p>
        </div>
      </section>
      {asset && <p className="text-[11px] text-zinc-500">修改同步至使用此组件的实例，单独覆盖过的尺寸和颜色保留。</p>}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="flex-1 rounded-md border border-zinc-200 py-2 text-xs hover:bg-zinc-50">取消</button>
        <button type="submit" className="flex-1 rounded-md bg-ink py-2 text-xs font-medium text-white hover:opacity-90">{asset ? '保存修改' : '加入组件库'}</button>
      </div>
    </form>
  );
}
