'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteProject, fetchProjects, renameProject, type AiProviderName, type ProjectInfo } from '@/lib/api';
import NewProjectDialog from '@/features/dashboard/NewProjectDialog';
import ProjectActionDialog, { type ProjectAction } from '@/features/dashboard/ProjectActionDialog';
import ProjectCard from '@/features/dashboard/ProjectCard';

type SortOrder = 'updated-desc' | 'updated-asc' | 'name-asc';
type PendingProjectAction = { project: ProjectInfo; action: ProjectAction } | null;
const PAGE_SIZE = 12;

export default function HomePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectInfo[] | null>(null);
  const [aiProvider, setAiProvider] = useState<AiProviderName | null>(null);
  const [visionEnabled, setVisionEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('updated-desc');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [pendingAction, setPendingAction] = useState<PendingProjectAction>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);

  const loadProjects = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    setError(null);
    try {
      const result = await fetchProjects();
      setProjects(result.projects);
      setAiProvider(result.aiProvider);
      setVisionEnabled(result.visionEnabled);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载失败');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadProjects(); }, [loadProjects]);

  const visibleProjects = useMemo(() => {
    if (!projects) return [];
    const query = search.trim().toLocaleLowerCase();
    return projects
      .filter((project) => !query || project.name.toLocaleLowerCase().includes(query))
      .sort((a, b) => {
        if (sortOrder === 'name-asc') return a.name.localeCompare(b.name, 'zh-CN');
        const delta = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        return sortOrder === 'updated-desc' ? delta : -delta;
      });
  }, [projects, search, sortOrder]);

  useEffect(() => setVisibleCount(PAGE_SIZE), [search, sortOrder]);

  const confirmProjectAction = async (nextName?: string) => {
    if (!pendingAction) return;
    const { project, action } = pendingAction;
    if (action === 'rename') {
      const updated = await renameProject(project.id, nextName ?? '');
      setProjects((current) => current?.map((item) => item.id === project.id ? { ...item, ...updated } : item) ?? null);
      return;
    }
    await deleteProject(project.id);
    setProjects((current) => current?.filter((item) => item.id !== project.id) ?? null);
  };

  const aiStatus = aiProvider === 'deepseek'
    ? 'DeepSeek 已连接'
    : aiProvider === 'openai'
      ? 'OpenAI 已连接'
      : '离线规则模式';

  return (
    <main className="min-h-dvh bg-[#f7f8fa] text-ink">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded bg-accent text-sm font-semibold text-white" aria-hidden="true">Z</div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold">ZaoKing <span className="font-normal text-zinc-500">室内设计工作台</span></h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden items-center gap-1.5 text-[11px] text-zinc-500 sm:flex">
              <span className={`h-1.5 w-1.5 rounded-full ${aiProvider ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
              AI：{aiStatus}{!aiProvider && '（配置 DEEPSEEK_API_KEY 启用）'}
            </span>
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="h-9 rounded bg-accent px-3.5 text-xs font-medium text-white hover:opacity-90"
            >
              ＋ 新建项目
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-7 sm:px-8 sm:py-9">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">我的项目</h2>
            <p className="mt-1 text-xs text-zinc-500">管理户型方案与室内设计</p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <label className="relative min-w-[200px] flex-1 sm:w-64 sm:flex-none">
              <span className="sr-only">搜索项目</span>
              <span aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400">⌕</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索项目名称"
                className="h-9 w-full rounded border border-zinc-200 bg-white pl-8 pr-8 text-xs outline-none focus:border-accent"
              />
              {search && <button type="button" aria-label="清除搜索" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 px-1 text-sm text-zinc-400 hover:text-ink">×</button>}
            </label>
            <label>
              <span className="sr-only">项目排序</span>
              <select
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value as SortOrder)}
                className="h-9 rounded border border-zinc-200 bg-white px-2.5 text-xs text-zinc-600 outline-none focus:border-accent"
              >
                <option value="updated-desc">最近更新</option>
                <option value="updated-asc">最早更新</option>
                <option value="name-asc">名称排序</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => void loadProjects(true)}
              disabled={refreshing}
              title="刷新项目列表"
              aria-label="刷新项目列表"
              className="grid h-9 w-9 place-items-center rounded border border-zinc-200 bg-white text-sm text-zinc-500 hover:bg-zinc-50 disabled:opacity-50"
            >
              <span className={refreshing ? 'animate-spin' : ''} aria-hidden="true">↻</span>
            </button>
          </div>
        </div>

        {error ? (
          <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
            <span>{error}</span>
            <button type="button" onClick={() => void loadProjects(true)} className="rounded border border-red-200 bg-white px-3 py-1.5 font-medium hover:bg-red-100">重试</button>
          </div>
        ) : projects === null ? (
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-56 animate-pulse rounded-lg border border-zinc-200 bg-white" />)}
          </div>
        ) : projects.length === 0 ? (
          <div className="mt-8 flex min-h-64 flex-col items-center justify-center border-y border-dashed border-zinc-300 px-6 text-center">
            <div className="grid h-11 w-11 place-items-center rounded-full bg-white text-lg text-zinc-400">⌂</div>
            <h3 className="mt-3 text-sm font-medium">从一个户型开始</h3>
            <p className="mt-1 max-w-sm text-xs leading-5 text-zinc-500">新建空白户型、体验示例方案，或上传户型截图生成初始设计。</p>
            <button type="button" onClick={() => setDialogOpen(true)} className="mt-4 h-9 rounded bg-accent px-3.5 text-xs font-medium text-white hover:opacity-90">新建第一个项目</button>
          </div>
        ) : visibleProjects.length === 0 ? (
          <div className="mt-8 flex min-h-52 flex-col items-center justify-center border-y border-zinc-200 text-center">
            <p className="text-sm font-medium">没有找到匹配的项目</p>
            <p className="mt-1 text-xs text-zinc-500">检查项目名称，或清除搜索条件。</p>
            <button type="button" onClick={() => setSearch('')} className="mt-3 rounded px-3 py-1.5 text-xs text-accent hover:bg-accent-soft">清除搜索</button>
          </div>
        ) : (
          <>
            <div className="mb-3 mt-5 text-[11px] text-zinc-400">{search ? `找到 ${visibleProjects.length} 个项目` : `共 ${projects.length} 个项目`}</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visibleProjects.slice(0, visibleCount).map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onRename={(item) => setPendingAction({ project: item, action: 'rename' })}
                  onDelete={(item) => setPendingAction({ project: item, action: 'delete' })}
                />
              ))}
            </div>
            {visibleCount < visibleProjects.length && (
              <div className="mt-5 flex justify-center">
                <button type="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)} className="h-9 rounded border border-zinc-200 bg-white px-4 text-xs text-zinc-600 hover:bg-zinc-50">加载更多项目</button>
              </div>
            )}
          </>
        )}
      </section>

      {dialogOpen && <NewProjectDialog visionEnabled={visionEnabled} onClose={() => setDialogOpen(false)} onCreated={(projectId) => router.push(`/editor/${projectId}`)} />}

      {pendingAction && (
        <ProjectActionDialog
          key={`${pendingAction.action}:${pendingAction.project.id}`}
          project={pendingAction.project}
          action={pendingAction.action}
          onClose={() => setPendingAction(null)}
          onConfirm={confirmProjectAction}
        />
      )}
    </main>
  );
}
