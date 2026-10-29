'use client';

import type { ChatConversationInfo } from '@/lib/api';

interface ChatHistoryProps {
  conversations: ChatConversationInfo[];
  activeId: string | null;
  search: string;
  disabled: boolean;
  onSearch: (value: string) => void;
  onSelect: (conversationId: string) => void;
  onDelete: (conversation: ChatConversationInfo) => void;
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

export default function ChatHistory({ conversations, activeId, search, disabled, onSearch, onSelect, onDelete }: ChatHistoryProps) {
  const filtered = conversations.filter((conversation) => conversation.title.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <section id="chat-history-panel" className="absolute left-2 right-2 top-10 z-30 rounded-md border border-zinc-200 bg-white p-2 shadow-lg" aria-label="聊天历史记录">
      <label className="sr-only" htmlFor="chat-history-search">搜索历史对话</label>
      <input
        id="chat-history-search"
        value={search}
        onChange={(event) => onSearch(event.target.value)}
        placeholder="搜索历史对话"
        className="h-8 w-full rounded border border-zinc-200 bg-white px-2.5 text-xs outline-none focus:border-accent"
      />
      <div className="mt-1.5 max-h-56 space-y-0.5 overflow-y-auto overscroll-contain">
        {filtered.map((conversation) => (
          <div key={conversation.id} className={`flex h-8 items-center rounded border ${activeId === conversation.id ? 'border-accent/30 bg-accent-soft/40' : 'border-transparent hover:bg-zinc-50'}`}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelect(conversation.id)}
              className="flex h-full min-w-0 flex-1 items-center gap-2 px-2 text-left disabled:opacity-50"
              title={conversation.title}
            >
              <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-ink">{conversation.title || '新对话'}</span>
              <span className="shrink-0 text-[9px] tabular-nums text-zinc-400">{formatUpdatedAt(conversation.updatedAt)} · {conversation.messageCount} 条</span>
            </button>
            <button
              type="button"
              aria-label={`删除对话：${conversation.title || '新对话'}`}
              title="删除对话"
              disabled={disabled}
              onClick={() => onDelete(conversation)}
              className="mr-0.5 grid h-6 w-6 shrink-0 place-items-center rounded text-sm text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
            >
              ×
            </button>
          </div>
        ))}
        {!filtered.length && <p className="px-2 py-2 text-center text-[10px] text-zinc-400">{conversations.length ? '没有匹配的对话' : '还没有保存的对话'}</p>}
      </div>
    </section>
  );
}
