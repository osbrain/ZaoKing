import Link from 'next/link';
import type { ProjectInfo } from '@/lib/api';

interface ProjectCardProps {
  project: ProjectInfo;
  onRename: (project: ProjectInfo) => void;
  onDelete: (project: ProjectInfo) => void;
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '更新时间未知';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default function ProjectCard({ project, onRename, onDelete }: ProjectCardProps) {
  return (
    <article className="overflow-hidden rounded-lg border border-zinc-200 bg-white transition-colors hover:border-zinc-300">
      <div className="flex min-h-16 items-center justify-between gap-3 px-3.5 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-medium text-ink" title={project.name}>{project.name}</h2>
          <p className="mt-1 text-[11px] text-zinc-400">更新于 {formatUpdatedAt(project.updatedAt)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label={`重命名项目：${project.name}`}
            title="重命名"
            onClick={() => onRename(project)}
            className="rounded px-2 py-1.5 text-[11px] text-zinc-500 hover:bg-zinc-100 hover:text-ink"
          >
            重命名
          </button>
          <button
            type="button"
            aria-label={`删除项目：${project.name}`}
            title="删除项目"
            onClick={() => onDelete(project)}
            className="rounded px-2 py-1.5 text-[11px] text-zinc-500 hover:bg-red-50 hover:text-red-700"
          >
            删除
          </button>
        </div>
      </div>
      <Link
        href={`/editor/${project.id}`}
        aria-label={`打开项目：${project.name}`}
        className="group block border-t border-zinc-100 p-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
      >
        <div className="flex h-36 items-center justify-center overflow-hidden rounded bg-[#f7f4ee]">
          {project.thumbSvg ? (
            <div
              className="h-full w-full [&_svg]:block [&_svg]:h-full [&_svg]:w-full"
              dangerouslySetInnerHTML={{ __html: project.thumbSvg }}
            />
          ) : (
            <span className="text-xs text-zinc-400 transition-colors group-hover:text-accent">空白户型</span>
          )}
        </div>
        <div className="flex items-center justify-between px-1 pt-2.5 text-[11px] text-zinc-500">
          <span>进入设计</span>
          <span className="transition-transform group-hover:translate-x-0.5" aria-hidden="true">→</span>
        </div>
      </Link>
    </article>
  );
}
