import type { SceneDocument } from '@/core/types';

export interface ProjectInfo {
  id: string;
  name: string;
  updatedAt: string;
  designCount?: number;
  /** 服务端生成的户型 2D 缩略图 SVG；空户型为空串 */
  thumbSvg?: string;
}

export type AiProviderName = 'deepseek' | 'openai';

export async function fetchProjects(): Promise<{
  projects: ProjectInfo[];
  aiMode: 'llm' | 'rules';
  aiProvider: AiProviderName | null;
  visionEnabled: boolean;
}> {
  const res = await fetch('/api/projects', { cache: 'no-store' });
  if (!res.ok) throw new Error('项目列表加载失败');
  return res.json();
}

export type ProjectTemplate = 'sample' | 'blank';

export async function createProject(name?: string, template: ProjectTemplate = 'sample', document?: SceneDocument): Promise<ProjectInfo> {
  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, template, document }),
  });
  if (!res.ok) throw new Error('创建项目失败');
  const j = await res.json();
  return j.project;
}

export async function fetchDesign(projectId: string): Promise<{ version: number; document: SceneDocument }> {
  const res = await fetch(`/api/designs?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('设计文档加载失败');
  const j = await res.json();
  return { version: j.version as number, document: j.document as SceneDocument };
}

export async function saveDesign(
  projectId: string,
  document: SceneDocument,
  version: number,
): Promise<{ version?: number; conflict?: boolean }> {
  const res = await fetch('/api/designs', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, document, version }),
  });
  if (res.status === 409) return { conflict: true };
  if (!res.ok) throw new Error('保存失败');
  return res.json();
}

export interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

export async function askAi(
  message: string,
  doc: SceneDocument,
  history: ChatMsg[],
): Promise<{ reply: string; ops: unknown[]; mode: 'llm' | 'rules' }> {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, doc, history }),
  });
  if (!res.ok) throw new Error('AI 服务暂时不可用');
  return res.json();
}
