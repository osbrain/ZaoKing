'use client';

import type { ChatMsg } from '@/lib/api';

interface ChatMessageListProps {
  messages: ChatMsg[];
  busy: boolean;
  onCopy: (message: ChatMsg, key: string) => void;
  copiedKey: string | null;
}

function formatTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(date);
}

export default function ChatMessageList({ messages, busy, onCopy, copiedKey }: ChatMessageListProps) {
  return (
    <div className="space-y-3 p-3">
      {!messages.length && (
        <div className="rounded-md border border-zinc-200 bg-white p-3">
          <p className="text-xs font-semibold text-ink">你好，我是 ZaoKing 设计助手</p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">可以添加、删除、替换或调整家具尺寸，也可以修改墙面颜色和地面材质。每次场景修改都会先进入预览，确认后才应用。</p>
        </div>
      )}
      {messages.map((message, index) => {
        const key = message.id ?? `${message.role}-${index}`;
        return (
          <article key={key} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[94%] min-w-0 rounded-lg px-3 py-2 text-xs leading-relaxed ${message.role === 'user' ? 'bg-accent text-white' : 'border border-zinc-200 bg-white text-ink'}`}>
              <p className="whitespace-pre-wrap break-words">{message.content}</p>
              <div className={`mt-1.5 flex items-center justify-end gap-2 text-[10px] ${message.role === 'user' ? 'text-white/65' : 'text-zinc-400'}`}>
                {formatTime(message.createdAt) && <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>}
                <button type="button" onClick={() => onCopy(message, key)} className="hover:underline" title="复制消息">
                  {copiedKey === key ? '已复制' : '复制'}
                </button>
              </div>
            </div>
          </article>
        );
      })}
      {busy && (
        <div className="flex justify-start">
          <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-400">正在理解场景并生成建议…</div>
        </div>
      )}
    </div>
  );
}
