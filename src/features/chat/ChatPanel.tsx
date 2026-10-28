'use client';

/* AI 对话面板：POST /api/ai 获得回复 + DesignOp 列表，
 * 在浏览器端经 scene-core 的 executeOps 转为命令提交 ——
 * 与手动操作共用同一命令层（可撤销、可校验）。 */

import { useEffect, useRef, useState } from 'react';
import { askAi, type ChatMsg } from '@/lib/api';
import { executeOps, type DesignOp } from '@/core/ops';
import { useSceneStore } from '@/stores/sceneStore';

const QUICK_PROMPTS = [
  '在客厅加一个三人沙发',
  '把主卧的床换成 1.8 米的',
  '把客厅的地面换成大理石',
  '删除客厅的茶几',
];

export default function ChatPanel() {
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: 'assistant',
      content: '你好，我是设计助手。试着对我说：「在客厅加一个三人沙发」「把主卧的床换成 1.8 米的」「把客厅的地面换成大理石」。',
    },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  const send = async (text?: string) => {
    const message = (text ?? input).trim();
    if (!message || busy) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: message }]);
    setBusy(true);
    try {
      const doc = useSceneStore.getState().doc;
      if (!doc) throw new Error('文档未加载');
      const res = await askAi(message, doc, messages);
      let content = res.reply;
      const ops = res.ops as DesignOp[];
      if (ops.length) {
        const outcome = executeOps(doc, ops);
        if (outcome.cmds.length) {
          useSceneStore.getState().run(`AI · ${ops[0].op}`, outcome.cmds);
        }
        content = `${res.reply}\n${outcome.log.join('\n')}`.trim();
      }
      setMessages((m) => [...m, { role: 'assistant', content }]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: `出错了：${e instanceof Error ? e.message : '请稍后再试'}` },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[92%] whitespace-pre-wrap rounded-xl px-3 py-2 text-xs leading-relaxed ${
                m.role === 'user' ? 'bg-accent text-white' : 'border border-zinc-200 bg-white text-ink'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-400">思考中…</div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 border-t border-zinc-100 px-3 py-2">
        {QUICK_PROMPTS.map((p) => (
          <button
            key={p}
            onClick={() => send(p)}
            disabled={busy}
            className="rounded-full border border-zinc-200 px-2.5 py-1 text-[11px] text-zinc-500 transition hover:border-accent hover:text-accent disabled:opacity-40"
          >
            {p}
          </button>
        ))}
      </div>

      <div className="flex gap-2 border-t border-zinc-100 p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) send();
          }}
          placeholder="用自然语言描述你想改动的内容…"
          className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-xs outline-none focus:border-accent"
        />
        <button
          onClick={() => send()}
          disabled={busy || !input.trim()}
          className="rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          发送
        </button>
      </div>
    </div>
  );
}
