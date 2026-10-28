'use client';

/* 编辑器主壳：顶栏（视图切换/撤销重做/保存状态）、左右面板、状态栏、
 * 快捷键、自动保存（乐观锁）。 */

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import PlanView from '@/features/canvas2d/PlanView';
import AssetLibrary from '@/features/library/AssetLibrary';
import { PropsPanel, StatsPanel } from '@/features/inspector/Inspector';
import ChatPanel from '@/features/chat/ChatPanel';
import { useSceneStore } from '@/stores/sceneStore';
import { useEditorStore } from '@/stores/editorStore';
import { fetchDesign, saveDesign } from '@/lib/api';
import { createAutosaver } from '@/lib/autosave';

const Scene3D = dynamic(() => import('@/features/canvas3d/Scene3D'), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-zinc-400">3D 引擎加载中…</div>,
});

type SaveStatus = 'saved' | 'saving' | 'error' | 'conflict';

const SAVE_TEXT: Record<SaveStatus, { label: string; cls: string }> = {
  saved: { label: '已保存', cls: 'text-emerald-600' },
  saving: { label: '保存中…', cls: 'text-amber-600' },
  error: { label: '保存失败', cls: 'text-red-600' },
  conflict: { label: '版本冲突', cls: 'text-red-600' },
};

export default function EditorShell({ projectId }: { projectId: string }) {
  const doc = useSceneStore((s) => s.doc);
  const hydrate = useSceneStore((s) => s.hydrate);
  const canUndo = useSceneStore((s) => s.past.length > 0);
  const canRedo = useSceneStore((s) => s.future.length > 0);
  const lastAction = useSceneStore((s) => s.lastAction);

  const viewMode = useEditorStore((s) => s.viewMode);
  const setViewMode = useEditorStore((s) => s.setViewMode);
  const rightTab = useEditorStore((s) => s.rightTab);
  const setRightTab = useEditorStore((s) => s.setRightTab);
  const cursor = useEditorStore((s) => s.cursor);
  const camera = useEditorStore((s) => s.camera);
  const toast = useEditorStore((s) => s.toast);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [loadedProject, setLoadedProject] = useState<string | null>(null);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const autosaverRef = useRef<ReturnType<typeof createAutosaver> | null>(null);

  /* 加载文档 */
  useEffect(() => {
    let alive = true;
    let unsub: (() => void) | undefined;
    setLoadError(null);
    setLoadedProject(null);
    (async () => {
      try {
        const { version, document } = await fetchDesign(projectId);
        if (!alive) return;
        hydrate(document);
        useEditorStore.getState().select(null);
        setSaveStatus('saved');
        setLoadedProject(projectId);
        const saver = createAutosaver({
          version,
          save: (document, currentVersion) => saveDesign(projectId, document, currentVersion),
          onStatus: (status) => {
            if (!alive) return;
            setSaveStatus(status);
            if (status === 'conflict') {
              useEditorStore.getState().showToast('保存冲突：该方案已在别处被修改，请保留当前页面并重新加载方案');
            }
          },
        });
        autosaverRef.current = saver;
        unsub = useSceneStore.subscribe((s, prev) => {
          if (s.rev !== prev.rev && s.doc) saver.schedule({ doc: s.doc, rev: s.rev });
        });
      } catch (e) {
        if (alive) setLoadError(e instanceof Error ? e.message : '加载失败');
      }
    })();
    return () => {
      alive = false;
      unsub?.();
      // Flush the snapshot associated with this project before releasing the writer.
      const saver = autosaverRef.current;
      autosaverRef.current = null;
      if (saver) void saver.flush().finally(() => saver.dispose());
    };
  }, [projectId, hydrate]);

  /* 离开页面前提示尚未落盘的更改；普通返回先等待写入。 */
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!autosaverRef.current?.isDirty()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  /* 快捷键 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const scene = useSceneStore.getState();
      const ed = useEditorStore.getState();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) scene.redo();
        else scene.undo();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (ed.selection && scene.doc) {
          e.preventDefault();
          const lv = scene.doc.levels[0];
          const cmds: import('@/core/commands').Cmd[] = [];
          if (ed.selection.kind === 'furn') cmds.push({ type: 'delete', id: ed.selection.id });
          else if (ed.selection.kind === 'wall') {
            const w = lv.walls.find((x) => x.id === ed.selection!.id);
            if (w) {
              cmds.push({ type: 'deleteWall', id: w.id });
              for (const o of lv.openings) {
                const cx = (o.rect[0] + o.rect[2]) / 2;
                const cy = (o.rect[1] + o.rect[3]) / 2;
                if (cx >= w.x0 && cx <= w.x1 && cy >= w.y0 && cy <= w.y1) cmds.push({ type: 'deleteOpening', id: o.id });
              }
            }
          } else if (ed.selection.kind === 'opening') cmds.push({ type: 'deleteOpening', id: ed.selection.id });
          else if (ed.selection.kind === 'room') cmds.push({ type: 'deleteRoom', id: ed.selection.id });
          if (cmds.length) {
            scene.run('删除', cmds);
            ed.select(null);
          }
        }
        return;
      }
      if (e.key === 'Escape') {
        ed.select(null);
        ed.setTool('select');
      } else if (e.key.toLowerCase() === 't') {
        ed.setViewMode(ed.viewMode === '2d' ? '3d' : '2d');
      } else if (e.key.toLowerCase() === 'v') {
        ed.setTool('select');
      } else if (e.key.toLowerCase() === 'w') {
        ed.setViewMode('2d');
        ed.setTool('wall');
      } else if (e.key.toLowerCase() === 'r') {
        ed.setViewMode('2d');
        ed.setTool('room');
      } else if (e.key.toLowerCase() === 'd') {
        ed.setViewMode('2d');
        ed.setTool('door');
      } else if (e.key.toLowerCase() === 'n') {
        ed.setViewMode('2d');
        ed.setTool('window');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (loadError) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3">
        <p className="text-sm">文档加载失败：{loadError}</p>
        <Link href="/" className="text-xs text-accent underline">← 返回项目列表</Link>
      </div>
    );
  }
  if (loadedProject !== projectId) {
    return <div className="flex h-dvh items-center justify-center text-sm text-zinc-400">文档加载中…</div>;
  }

  return (
    <div className="flex h-dvh flex-col bg-zinc-100">
      {/* 顶栏 */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-zinc-200 bg-white px-2 sm:gap-3 sm:px-3">
        <Link href="/" className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100" title="返回项目列表">
          ←
        </Link>
        <div className="min-w-0 max-w-[106px] sm:max-w-none">
          <p className="truncate text-sm font-semibold leading-tight">{doc?.meta.name ?? '加载中…'}</p>
          <p className="hidden text-[10px] leading-tight text-zinc-400 sm:block">
            {lastAction ? `上次操作：${lastAction}` : '三室两厅两卫 · 单位 mm'}
          </p>
        </div>

        <div className="ml-1 flex overflow-hidden rounded-lg border border-zinc-200 sm:ml-2">
          <button
            onClick={() => setViewMode('2d')}
            className={`w-16 py-1.5 text-[11px] font-medium transition sm:w-20 sm:text-xs ${viewMode === '2d' ? 'bg-ink text-white' : 'hover:bg-zinc-50'}`}
          >
            2D 平面
          </button>
          <button
            onClick={() => setViewMode('3d')}
            className={`w-16 border-l border-zinc-200 py-1.5 text-[11px] font-medium transition sm:w-20 sm:text-xs ${viewMode === '3d' ? 'bg-ink text-white' : 'hover:bg-zinc-50'}`}
          >
            3D 场景
          </button>
        </div>

        <div className="hidden gap-1 sm:flex">
          <button
            onClick={() => useSceneStore.getState().undo()}
            disabled={!canUndo}
            className="rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs hover:bg-zinc-50 disabled:opacity-35"
            title="撤销 (Ctrl+Z)"
          >
            ↩ 撤销
          </button>
          <button
            onClick={() => useSceneStore.getState().redo()}
            disabled={!canRedo}
            className="rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs hover:bg-zinc-50 disabled:opacity-35"
            title="重做 (Ctrl+Shift+Z)"
          >
            ↪ 重做
          </button>
        </div>

        <div className="flex-1" />
        <span className={`text-xs font-medium ${SAVE_TEXT[saveStatus].cls}`}>{SAVE_TEXT[saveStatus].label}</span>
      </header>

      {/* 主体三栏 */}
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 border-r border-zinc-200 bg-white md:block">
          <AssetLibrary />
        </aside>

        <main className="relative min-w-0 flex-1">
          {viewMode === '2d' ? <PlanView /> : <Scene3D />}
        </main>

        <aside className="hidden w-80 shrink-0 flex-col border-l border-zinc-200 bg-white md:flex">
          <div className="flex shrink-0 border-b border-zinc-200">
            {(
              [
                ['props', '属性'],
                ['ai', 'AI 助手'],
                ['stats', '统计'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setRightTab(k)}
                className={`flex-1 py-2 text-xs font-medium transition ${
                  rightTab === k ? 'border-b-2 border-accent text-accent' : 'text-zinc-500 hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {rightTab === 'props' && <PropsPanel />}
            {rightTab === 'ai' && <ChatPanel />}
            {rightTab === 'stats' && <StatsPanel />}
          </div>
        </aside>
      </div>

      {mobilePanelOpen && <button aria-label="关闭属性面板" onClick={() => setMobilePanelOpen(false)} className="fixed inset-x-0 top-12 bottom-7 z-30 bg-black/20 md:hidden" />}
      <aside className={`fixed bottom-7 right-0 top-12 z-40 flex w-[min(88vw,320px)] flex-col border-l border-zinc-200 bg-white shadow-xl transition-transform md:hidden ${mobilePanelOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex shrink-0 border-b border-zinc-200">
          {([
            ['props', '属性'], ['ai', 'AI 助手'], ['stats', '统计'],
          ] as const).map(([k, label]) => (
            <button key={k} onClick={() => setRightTab(k)} className={`flex-1 py-2 text-xs font-medium ${rightTab === k ? 'border-b-2 border-accent text-accent' : 'text-zinc-500'}`}>{label}</button>
          ))}
          <button aria-label="关闭属性面板" title="关闭属性面板" onClick={() => setMobilePanelOpen(false)} className="w-9 border-l border-zinc-100 text-lg text-zinc-500">×</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {rightTab === 'props' && <PropsPanel />}
          {rightTab === 'ai' && <ChatPanel />}
          {rightTab === 'stats' && <StatsPanel />}
        </div>
      </aside>
      {!mobilePanelOpen && <button aria-label="打开属性面板" title="打开属性面板" onClick={() => setMobilePanelOpen(true)} className="fixed bottom-10 right-3 z-20 rounded-md border border-zinc-200 bg-white/95 px-2.5 py-1.5 text-xs font-medium text-ink shadow-sm md:hidden">面板</button>}

      {/* 状态栏 */}
      <footer className="flex h-7 shrink-0 items-center gap-5 border-t border-zinc-200 bg-white px-3 text-[11px] text-zinc-500">
        <span className="tabular-nums">
          X {cursor ? cursor.x : '—'} · Y {cursor ? cursor.y : '—'} mm
        </span>
        <span className="tabular-nums">缩放 {(camera.scale * 100).toFixed(0)}%</span>
        <span>{viewMode === '2d' ? '2D 平面' : '3D 场景'}</span>
        <span className="flex-1" />
        <span className="hidden sm:inline">Ctrl+Z 撤销 · Delete 删除 · V 选择 · W 画墙 · R 房间 · D 门 · N 窗 · T 切换 2D/3D</span>
      </footer>

      {/* Toast */}
      {toast && (
        <div className="pointer-events-none fixed bottom-12 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-ink px-4 py-2 text-xs text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
