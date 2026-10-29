'use client';

import { useEffect, useState } from 'react';
import type { ProjectInfo } from '@/lib/api';

export type ProjectAction = 'rename' | 'delete';

interface ProjectActionDialogProps {
  project: ProjectInfo;
  action: ProjectAction;
  onClose: () => void;
  onConfirm: (name?: string) => Promise<void>;
}

export default function ProjectActionDialog({ project, action, onClose, onConfirm }: ProjectActionDialogProps) {
  const [name, setName] = useState(project.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [busy, onClose]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onConfirm(action === 'rename' ? name.trim() : undefined);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作失败，请重试');
      setBusy(false);
    }
  };

  const isRename = action === 'rename';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-action-title"
        onSubmit={submit}
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
      >
        <h2 id="project-action-title" className="text-base font-semibold text-ink">
          {isRename ? '重命名项目' : '删除项目'}
        </h2>
        {isRename ? (
          <>
            <label htmlFor="project-name" className="mt-4 block text-xs text-zinc-500">项目名称</label>
            <input
              id="project-name"
              autoFocus
              required
              maxLength={200}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1.5 h-10 w-full rounded border border-zinc-200 px-3 text-sm text-ink outline-none focus:border-accent"
            />
          </>
        ) : (
          <div className="mt-3 text-sm leading-6 text-zinc-600">
            <p>确定删除「<span className="font-medium text-ink">{project.name}</span>」吗？</p>
            <p className="mt-1 text-xs text-zinc-500">项目户型、设计内容和关联的 AI 对话历史都会一并永久删除。</p>
          </div>
        )}
        {error && <p role="alert" className="mt-3 text-xs text-red-700">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="h-9 rounded border border-zinc-200 px-3 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-40"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={busy || (isRename && !name.trim())}
            className={`h-9 rounded px-3 text-xs font-medium text-white disabled:opacity-50 ${isRename ? 'bg-accent hover:opacity-90' : 'bg-red-600 hover:bg-red-700'}`}
          >
            {busy ? '处理中…' : isRename ? '保存名称' : '确认删除'}
          </button>
        </div>
      </form>
    </div>
  );
}
