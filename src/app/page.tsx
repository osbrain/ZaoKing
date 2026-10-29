'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createProject, fetchProjects, type ProjectInfo, type ProjectTemplate } from '@/lib/api';

export default function HomePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectInfo[] | null>(null);
  const [aiMode, setAiMode] = useState<'llm' | 'rules'>('rules');
  const [error, setError] = useState<string | null>(null);

  /* 新建对话框状态 */
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [template, setTemplate] = useState<ProjectTemplate>('blank');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { projects: list, aiMode: m } = await fetchProjects();
        setAiMode(m);
        setProjects(list);
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载失败');
      }
    })();
  }, [router]);

  const onCreate = async () => {
    setCreating(true);
    try {
      const p = await createProject(name.trim() || undefined, template);
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
            {aiMode === 'llm' ? ' · AI：大模型模式' : ' · AI：离线规则模式（配置 OPENAI_API_KEY 启用大模型）'}
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
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
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
                onClick={() => setTemplate('blank')}
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
                onClick={() => setTemplate('sample')}
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
                disabled={creating}
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
