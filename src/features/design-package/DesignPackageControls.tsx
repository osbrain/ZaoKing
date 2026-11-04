'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { MAX_DESIGN_PACKAGE_BYTES, parseDesignPackage, type ParsedDesignPackage } from '@/core/designPackage';
import { createProject } from '@/lib/api';
import type { SceneDocument } from '@/core/types';
import { exportCurrentViewImage, exportPlanSvg, exportProjectFile, type ImageFormat } from '@/features/editor/exportView';

function packageSummary(document: SceneDocument) {
  return {
    levels: document.levels.length,
    rooms: document.levels.reduce((total, level) => total + level.rooms.length, 0),
    components: document.levels.reduce((total, level) => total + level.instances.length, 0),
    customAssets: document.assets?.length ?? 0,
  };
}

export default function DesignPackageControls({ document, viewMode }: {
  document: SceneDocument | null;
  viewMode: '2d' | '3d';
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [imported, setImported] = useState<ParsedDesignPackage | null>(null);
  const [projectName, setProjectName] = useState('');
  const [error, setError] = useState('');
  const [exportError, setExportError] = useState('');
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setExportMenuOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape, true);
    return () => window.removeEventListener('keydown', closeOnEscape, true);
  }, [exportMenuOpen]);

  const runExport = async (action: () => void | Promise<void>) => {
    if (!document) return;
    try {
      await action();
      setExportError('');
      setExportMenuOpen(false);
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : '导出失败');
    }
  };

  const exportImage = (format: ImageFormat) => runExport(() => exportCurrentViewImage(document!, viewMode, format));

  const onFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    setError('');
    setImported(null);
    if (!file) return;
    if (file.size > MAX_DESIGN_PACKAGE_BYTES) {
      setError('文件不能超过 15 MB');
      return;
    }
    try {
      const result = parseDesignPackage(await file.text());
      setImported(result);
      setProjectName(`${result.document.meta.name}（导入）`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法读取项目文件');
    }
  };

  const confirmImport = async () => {
    if (!imported || busy) return;
    setBusy(true);
    setError('');
    try {
      const project = await createProject(projectName.trim() || imported.document.meta.name, 'blank', imported.document);
      router.push(`/editor/${project.id}`);
    } catch (cause) {
      setBusy(false);
      setError(cause instanceof Error ? cause.message : '导入项目失败');
    }
  };

  const summary = imported ? packageSummary(imported.document) : null;

  return (
    <>
      <input ref={inputRef} type="file" accept=".json,.zaoking.json,application/json" className="hidden" onChange={onFileSelected} />
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => inputRef.current?.click()} className="rounded-md border border-zinc-200 px-2 py-1.5 text-xs hover:bg-zinc-50" title="导入项目文件为新项目">
          导入
        </button>
        <button type="button" onClick={() => { setExportMenuOpen(value => !value); setExportError(''); }} disabled={!document}
          aria-expanded={exportMenuOpen} aria-haspopup="menu"
          className="rounded-md border border-zinc-200 px-2 py-1.5 text-xs hover:bg-zinc-50 disabled:opacity-40" title="导出项目、户型图或当前视图">
          导出
        </button>
      </div>
      {exportMenuOpen && <>
        <button type="button" aria-label="关闭导出菜单" className="fixed inset-0 z-30 cursor-default" onClick={() => setExportMenuOpen(false)} />
        <div role="menu" aria-label="导出格式" className="absolute right-14 top-10 z-40 w-56 rounded-lg border border-zinc-200 bg-white p-1.5 shadow-lg">
          <button role="menuitem" type="button" onClick={() => void runExport(() => exportProjectFile(document!))}
            className="flex w-full items-start rounded-md px-3 py-2 text-left text-xs hover:bg-zinc-50">
            <span><span className="block font-medium text-ink">项目参数 JSON</span><span className="mt-0.5 block text-[10px] text-zinc-400">完整户型、组件与材质，可重新导入</span></span>
          </button>
          <button role="menuitem" type="button" onClick={() => void runExport(() => exportPlanSvg(document!))}
            className="flex w-full items-start rounded-md px-3 py-2 text-left text-xs hover:bg-zinc-50">
            <span><span className="block font-medium text-ink">户型图 SVG</span><span className="mt-0.5 block text-[10px] text-zinc-400">矢量格式，适合打印与继续编辑</span></span>
          </button>
          <div className="my-1 border-t border-zinc-100" />
          <p className="px-3 py-1 text-[10px] font-medium text-zinc-400">当前视图 · {viewMode === '2d' ? '2D 平面' : '3D 场景'}</p>
          <button role="menuitem" type="button" onClick={() => void exportImage('image/png')}
            className="w-full rounded-md px-3 py-2 text-left text-xs font-medium text-ink hover:bg-zinc-50">PNG 图片</button>
          <button role="menuitem" type="button" onClick={() => void exportImage('image/jpeg')}
            className="w-full rounded-md px-3 py-2 text-left text-xs font-medium text-ink hover:bg-zinc-50">JPEG 图片</button>
          {exportError && <p role="alert" className="mx-2 mb-1 rounded-md bg-red-50 px-2 py-1.5 text-[10px] leading-4 text-red-700">{exportError}</p>}
        </div>
      </>}
      {error && !imported && <span role="alert" className="sr-only">{error}</span>}
      {(imported || (error && !imported)) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4" onClick={() => { if (!busy) { setImported(null); setError(''); } }}>
          <section role="dialog" aria-modal="true" aria-labelledby="package-title" className="w-full max-w-lg space-y-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-xl" onClick={event => event.stopPropagation()}>
            <header>
              <h2 id="package-title" className="text-base font-semibold">{imported ? '导入为新项目' : '无法导入项目文件'}</h2>
              <p className="mt-1 text-xs text-zinc-500">{imported ? '当前项目保持不变；确认后会创建一份独立副本。' : error}</p>
            </header>
            {imported && summary && <>
              <label className="block text-xs text-zinc-500">新项目名称
                <input value={projectName} maxLength={200} onChange={event => setProjectName(event.target.value)} className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm text-ink outline-none focus:border-accent" />
              </label>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-y border-zinc-100 py-3 text-xs">
                <div className="flex justify-between"><dt className="text-zinc-500">楼层</dt><dd>{summary.levels}</dd></div>
                <div className="flex justify-between"><dt className="text-zinc-500">房间</dt><dd>{summary.rooms}</dd></div>
                <div className="flex justify-between"><dt className="text-zinc-500">组件实例</dt><dd>{summary.components}</dd></div>
                <div className="flex justify-between"><dt className="text-zinc-500">自定义组件定义</dt><dd>{summary.customAssets}</dd></div>
              </dl>
              {imported.warnings.length > 0 && <ul className="space-y-1 text-xs text-amber-800">{imported.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}
            </>}
            {error && imported && <p role="alert" className="text-xs text-red-600">{error}</p>}
            <footer className="flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => { setImported(null); setError(''); }} className="rounded-md border border-zinc-200 px-3 py-2 text-xs hover:bg-zinc-50 disabled:opacity-50">取消</button>
              {imported && <button type="button" disabled={busy} onClick={() => void confirmImport()} className="rounded-md bg-ink px-3 py-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50">{busy ? '正在创建…' : '创建新项目'}</button>}
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
