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
  id?: string;
  createdAt?: string;
}

export interface ChatConversationInfo {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

async function chatRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(payload?.error ?? '聊天记录请求失败');
  return payload as T;
}

export async function fetchChatConversations(projectId: string): Promise<ChatConversationInfo[]> {
  const result = await chatRequest<{ conversations: ChatConversationInfo[] }>(`/api/chat?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' });
  return result.conversations;
}

export async function createChatConversation(projectId: string): Promise<ChatConversationInfo> {
  const result = await chatRequest<{ conversation: ChatConversationInfo }>('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId }),
  });
  return result.conversation;
}

export async function fetchChatMessages(projectId: string, conversationId: string): Promise<ChatMsg[]> {
  const result = await chatRequest<{ messages: ChatMsg[] }>(`/api/chat/${encodeURIComponent(conversationId)}?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' });
  return result.messages;
}

export async function appendChatMessage(projectId: string, conversationId: string, message: ChatMsg): Promise<ChatMsg> {
  const result = await chatRequest<{ message: ChatMsg }>(`/api/chat/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, role: message.role, content: message.content }),
  });
  return result.message;
}

export async function deleteChatConversation(projectId: string, conversationId: string): Promise<void> {
  await chatRequest(`/api/chat/${encodeURIComponent(conversationId)}?projectId=${encodeURIComponent(projectId)}`, { method: 'DELETE' });
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
