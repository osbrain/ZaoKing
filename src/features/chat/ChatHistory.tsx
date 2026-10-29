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
    <section className="shrink-0 border-b border-zinc-200 bg-zinc-50/80 p-2.5" aria-label="聊天历史记录">
      <label className="sr-only" htmlFor="chat-history-search">搜索历史对话</label>
      <input
        id="chat-history-search"
        value={search}
        onChange={(event) => onSearch(event.target.value)}
        placeholder="搜索历史对话"
        className="w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-accent"
      />
      <div className="mt-2 max-h-52 space-y-1 overflow-y-auto">
        {filtered.map((conversation) => (
          <div key={conversation.id} className={`flex items-center gap-1 rounded-md border ${activeId === conversation.id ? 'border-accent/30 bg-white' : 'border-transparent hover:bg-white'}`}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelect(conversation.id)}
              className="min-w-0 flex-1 px-2 py-1.5 text-left disabled:opacity-50"
              title={conversation.title}
            >
              <span className="block truncate text-xs font-medium text-ink">{conversation.title || '新对话'}</span>
              <span className="mt-0.5 block text-[10px] text-zinc-400">{formatUpdatedAt(conversation.updatedAt)} · {conversation.messageCount} 条消息</span>
            </button>
            <button
              type="button"
              aria-label={`删除对话：${conversation.title || '新对话'}`}
              title="删除对话"
              disabled={disabled}
              onClick={() => onDelete(conversation)}
              className="mr-1 grid h-7 w-7 shrink-0 place-items-center rounded text-sm text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
            >
              ×
            </button>
          </div>
        ))}
        {!filtered.length && <p className="px-2 py-3 text-center text-[11px] text-zinc-400">{conversations.length ? '没有匹配的对话' : '还没有保存的对话'}</p>}
      </div>
    </section>
  );
}
