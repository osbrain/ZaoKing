'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { createProject, type ProjectTemplate } from '@/lib/api';
import FloorplanImportPanel from '@/features/floorplan-import/FloorplanImportPanel';
import type { ImportReport } from '@/core/floorplanImport';
import type { SceneDocument } from '@/core/types';

type NewProjectMode = ProjectTemplate | 'image';

interface NewProjectDialogProps {
  visionEnabled: boolean;
  onClose: () => void;
  onCreated: (projectId: string) => void;
}

export default function NewProjectDialog({ visionEnabled, onClose, onCreated }: NewProjectDialogProps) {
  const [name, setName] = useState('');
  const [template, setTemplate] = useState<NewProjectMode>('blank');
  const [creating, setCreating] = useState(false);
  const [importedDocument, setImportedDocument] = useState<SceneDocument | null>(null);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const onImportDocumentChange = useCallback((document: SceneDocument | null, report: ImportReport | null, message: string | null) => {
    setImportedDocument(document);
    setImportReport(report);
    setImportError(message);
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !creating) onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [creating, onClose]);

  const onCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (template === 'image' && !importedDocument) return;
    setCreating(true);
    setCreateError(null);
    try {
      const selectedTemplate: ProjectTemplate = template === 'sample' ? 'sample' : 'blank';
      const document = template === 'image' ? importedDocument ?? undefined : undefined;
      const project = await createProject(name.trim() || undefined, selectedTemplate, document);
      onCreated(project.id);
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : '创建失败');
      setCreating(false);
    }
  };

  const resetImport = (nextTemplate: NewProjectMode) => {
    setTemplate(nextTemplate);
    setImportedDocument(null);
    setImportReport(null);
    setImportError(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !creating) onClose(); }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-project-title"
        onSubmit={(event) => void onCreate(event)}
        className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl sm:p-6"
      >
        <h2 id="new-project-title" className="text-base font-semibold">新建项目</h2>
        <p className="mt-1 text-xs text-zinc-400">创建后进入编辑器，可随时调整户型与布置</p>
        <label className="mt-5 flex flex-col gap-1 text-xs text-zinc-500">
          项目名称（可留空自动命名）
          <input autoFocus value={name} maxLength={200} onChange={(event) => setName(event.target.value)} placeholder="例如：我家 89㎡ 两室一厅" className="h-10 rounded border border-zinc-200 px-3 text-sm text-ink outline-none focus:border-accent" />
        </label>
        <p className="mb-2 mt-4 text-xs text-zinc-500">起始户型</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button type="button" onClick={() => resetImport('blank')} className={`rounded border p-3.5 text-left transition ${template === 'blank' ? 'border-accent bg-accent-soft' : 'border-zinc-200 hover:border-zinc-300'}`}>
            <p className="text-xs font-medium">✏️ 空白户型</p>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">从零绘制墙体、房间、门窗</p>
          </button>
          <button type="button" onClick={() => resetImport('sample')} className={`rounded border p-3.5 text-left transition ${template === 'sample' ? 'border-accent bg-accent-soft' : 'border-zinc-200 hover:border-zinc-300'}`}>
            <p className="text-xs font-medium">🏠 示例户型</p>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">使用完整布置方案快速体验编辑器</p>
          </button>
        </div>
        <button type="button" onClick={() => resetImport('image')} className={`mt-2 w-full rounded border p-3.5 text-left transition ${template === 'image' ? 'border-accent bg-accent-soft' : 'border-zinc-200 hover:border-zinc-300'}`}>
          <p className="text-xs font-medium">▧ 根据户型截图导入</p>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">上传现有平面图，识别墙体、房间和门窗后校准尺寸。</p>
        </button>
        {template === 'image' && <FloorplanImportPanel projectName={name.trim() || '截图户型'} visionEnabled={visionEnabled} onDocumentChange={onImportDocumentChange} />}
        {template === 'image' && importReport && (
          <div className="mt-3 rounded border border-emerald-200 bg-emerald-50 p-3 text-[11px] text-emerald-900">
            已生成预览：{importReport.walls} 段墙、{importReport.openings} 个门窗、{importReport.rooms} 个房间。
            {importReport.dropped > 0 && <span> 已忽略 {importReport.dropped} 个无法自动规整的对象，请检查下方提示。</span>}
            {importReport.warnings.length > 0 && <ul className="mt-1 list-inside list-disc">{importReport.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
          </div>
        )}
        {template === 'image' && importError && <p role="alert" className="mt-2 text-xs text-red-700">{importError}</p>}
        {createError && <p role="alert" className="mt-3 text-xs text-red-700">{createError}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={creating} className="h-9 rounded border border-zinc-200 px-3 text-xs hover:bg-zinc-50 disabled:opacity-40">取消</button>
          <button type="submit" disabled={creating || (template === 'image' && !importedDocument)} className="h-9 rounded bg-accent px-3.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40">
            {creating ? '创建中…' : '创建并进入编辑器'}
          </button>
        </div>
      </form>
    </div>
  );
}
