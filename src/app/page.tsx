'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createProject, fetchProjects, type AiProviderName, type ProjectInfo, type ProjectTemplate } from '@/lib/api';
import FloorplanImportPanel from '@/features/floorplan-import/FloorplanImportPanel';
import type { ImportReport } from '@/core/floorplanImport';
import type { SceneDocument } from '@/core/types';

type NewProjectMode = ProjectTemplate | 'image';

export default function HomePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectInfo[] | null>(null);
  const [aiProvider, setAiProvider] = useState<AiProviderName | null>(null);
  const [visionEnabled, setVisionEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* 新建对话框状态 */
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [template, setTemplate] = useState<NewProjectMode>('blank');
  const [creating, setCreating] = useState(false);
  const [importedDocument, setImportedDocument] = useState<SceneDocument | null>(null);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const onImportDocumentChange = useCallback((document: SceneDocument | null, report: ImportReport | null, message: string | null) => {
    setImportedDocument(document);
    setImportReport(report);
    setImportError(message);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { projects: list, aiProvider: provider, visionEnabled: canUseVision } = await fetchProjects();
        setAiProvider(provider);
        setVisionEnabled(canUseVision);
        setProjects(list);
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载失败');
      }
    })();
  }, [router]);

  const onCreate = async () => {
    if (template === 'image' && !importedDocument) return;
    setCreating(true);
    try {
      const selectedTemplate: ProjectTemplate = template === 'sample' ? 'sample' : 'blank';
      const document = template === 'image' ? importedDocument ?? undefined : undefined;
      const p = await createProject(name.trim() || undefined, selectedTemplate, document);
      router.push(`/editor/${p.id}`);
    } catch {
      setError('创建失败');
      setCreating(false);
    }
  };

  if (error) {
    return (
      <main className="flex h-dvh items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium">加载失败：{error}</p>
          <p className="mt-2 text-sm text-zinc-500">请确认已执行 npm run db:push 初始化数据库</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-10 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-wide">
            ZaoKing <span className="font-normal text-zinc-500">室内设计工作台</span>
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            2D 户型 · 3D 场景 · AI 自然语言编辑
            {aiProvider === 'deepseek' ? ' · AI：DeepSeek 模式' : aiProvider === 'openai' ? ' · AI：OpenAI 模式' : ' · AI：离线规则模式（配置 DEEPSEEK_API_KEY 启用 DeepSeek）'}
          </p>
        </div>
        <button
          onClick={() => setDialogOpen(true)}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          ＋ 新建项目
        </button>
      </header>

      {projects !== null && projects.length === 0 && (
        <div className="mb-8 rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500">
          还没有项目 —— 点击右上角「新建项目」，选择
          <b className="text-ink">空白户型</b>从零绘制自己的家，或用<b className="text-ink">示例户型</b>直接体验。
        </div>
      )}

      {projects === null ? (
        <p className="text-sm text-zinc-400">加载中…</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/editor/${p.id}`}
              className="group rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-accent hover:shadow-md"
            >
              <div className="mb-6 flex h-28 items-center justify-center overflow-hidden rounded-lg border border-zinc-100 bg-[#f7f4ee]">
                {p.thumbSvg ? (
                  <div
                    className="h-full w-full [&_svg]:block [&_svg]:h-full [&_svg]:w-full"
                    dangerouslySetInnerHTML={{ __html: p.thumbSvg }}
                  />
                ) : (
                  <span className="text-2xl text-zinc-300 transition group-hover:text-accent">✏️ 空白户型</span>
                )}
              </div>
              <p className="font-medium">{p.name}</p>
              <p className="mt-1 text-xs text-zinc-400">
                更新于 {new Date(p.updatedAt).toLocaleString('zh-CN')}
              </p>
            </Link>
          ))}
        </div>
      )}

      {/* 新建项目对话框 */}
      {dialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => !creating && setDialogOpen(false)}
        >
          <div
            className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">新建项目</h2>
            <p className="mt-1 text-xs text-zinc-400">创建后进入编辑器，可随时调整户型与布置</p>

            <label className="mt-5 flex flex-col gap-1 text-xs text-zinc-500">
              项目名称（可留空自动命名）
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：我家 89㎡ 两室一厅"
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              />
            </label>

            <p className="mb-2 mt-4 text-xs text-zinc-500">起始户型</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => { setTemplate('blank'); setImportedDocument(null); setImportReport(null); setImportError(null); }}
                className={`rounded-xl border p-4 text-left transition ${
                  template === 'blank' ? 'border-accent bg-accent-soft' : 'border-zinc-200 hover:border-zinc-300'
                }`}
              >
                <p className="text-sm font-medium">✏️ 空白户型</p>
                <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                  从零开始：画墙、开门窗、画房间，绘制你自己家的户型
                </p>
              </button>
              <button
                onClick={() => { setTemplate('sample'); setImportedDocument(null); setImportReport(null); setImportError(null); }}
                className={`rounded-xl border p-4 text-left transition ${
                  template === 'sample' ? 'border-accent bg-accent-soft' : 'border-zinc-200 hover:border-zinc-300'
                }`}
              >
                <p className="text-sm font-medium">🏠 示例户型</p>
                <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                  三室两厅两卫完整布置，可拆改调整，适合快速体验
                </p>
              </button>
            </div>

            <button
              onClick={() => { setTemplate('image'); setImportedDocument(null); setImportReport(null); setImportError(null); }}
              className={`mt-3 w-full rounded-lg border p-4 text-left transition ${template === 'image' ? 'border-accent bg-accent-soft' : 'border-zinc-200 bg-white hover:border-zinc-300'}`}
            >
              <p className="text-sm font-medium">▧ 根据户型截图导入</p>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">上传现有平面图，识别墙体、房间和门窗后校准尺寸。</p>
            </button>

            {template === 'image' && <FloorplanImportPanel projectName={name.trim() || '截图户型'} visionEnabled={visionEnabled} onDocumentChange={onImportDocumentChange} />}
            {template === 'image' && importReport && (
              <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-[11px] text-emerald-900">
                已生成预览：{importReport.walls} 段墙、{importReport.openings} 个门窗、{importReport.rooms} 个房间。
                {importReport.dropped > 0 && <span> 已忽略 {importReport.dropped} 个无法自动规整的对象，请检查下方提示。</span>}
                {importReport.warnings.length > 0 && <ul className="mt-1 list-inside list-disc">{importReport.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
              </div>
            )}
            {template === 'image' && importError && <p role="alert" className="mt-2 text-xs text-red-700">{importError}</p>}

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setDialogOpen(false)}
                disabled={creating}
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-50 disabled:opacity-40"
              >
                取消
              </button>
              <button
                onClick={onCreate}
                disabled={creating || (template === 'image' && !importedDocument)}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
              >
                {creating ? '创建中…' : '创建并进入编辑器'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
