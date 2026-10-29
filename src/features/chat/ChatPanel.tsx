'use client';

/* AI 对话控制器：会话持久化、模型调用与场景预览确认。 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  appendChatMessage,
  askAi,
  createChatConversation,
  deleteChatConversation,
  fetchChatConversations,
  fetchChatMessages,
  type ChatConversationInfo,
  type ChatMsg,
} from '@/lib/api';
import { executeOps, type DesignOp } from '@/core/ops';
import { applyCmds } from '@/core/commands';
import { useSceneStore } from '@/stores/sceneStore';
import ChatHistory from './ChatHistory';
import ChatMessageList from './ChatMessageList';

interface PendingChange {
  label: string;
  cmds: ReturnType<typeof executeOps>['cmds'];
  log: string[];
  baseRev: number;
}

type PersistenceState = 'loading' | 'saved' | 'saving' | 'error';

const QUICK_PROMPTS = [
  '在客厅加一个三人沙发',
  '把主卧的床换成 1.8 米的',
  '把客厅的墙面改成浅灰色',
  '把客厅的地面换成大理石',
  '删除客厅的茶几',
];

function storageKey(projectId: string) {
  return `zaoking:chat:${projectId}:active`;
}

function rememberedConversation(projectId: string) {
  try {
    return window.localStorage.getItem(storageKey(projectId));
  } catch {
    return null;
  }
}

function rememberConversation(projectId: string, conversationId: string | null) {
  try {
    if (conversationId) window.localStorage.setItem(storageKey(projectId), conversationId);
    else window.localStorage.removeItem(storageKey(projectId));
  } catch {
    // The database remains the source of truth when browser storage is unavailable.
  }
}

function localMessage(role: ChatMsg['role'], content: string): ChatMsg {
  return { role, content, createdAt: new Date().toISOString() };
}

export default function ChatPanel({ projectId }: { projectId: string }) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [conversations, setConversations] = useState<ChatConversationInfo[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(true);
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [persistence, setPersistence] = useState<PersistenceState>('loading');
  const [persistenceError, setPersistenceError] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = listRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages, busy]);

  useEffect(() => {
    if (!showHistory) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowHistory(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [showHistory]);

  const refreshConversations = useCallback(async () => {
    const result = await fetchChatConversations(projectId);
    setConversations(result);
    return result;
  }, [projectId]);

  const selectConversation = useCallback(async (conversationId: string) => {
    if (conversationId === activeConversationId) {
      setShowHistory(false);
      return;
    }
    setLoadingConversation(true);
    setPersistence('loading');
    setPersistenceError('');
    setPending(null);
    useSceneStore.getState().setPreview(null);
    try {
      const loaded = await fetchChatMessages(projectId, conversationId);
      setMessages(loaded);
      setActiveConversationId(conversationId);
      rememberConversation(projectId, conversationId);
      setPersistence('saved');
      setShowHistory(false);
    } catch (error) {
      setPersistence('error');
      setPersistenceError(error instanceof Error ? error.message : '读取历史对话失败');
    } finally {
      setLoadingConversation(false);
    }
  }, [activeConversationId, projectId]);

  useEffect(() => {
    let alive = true;
    setLoadingConversation(true);
    setPersistence('loading');
    setMessages([]);
    setActiveConversationId(null);
    setPending(null);
    (async () => {
      try {
        const items = await fetchChatConversations(projectId);
        if (!alive) return;
        setConversations(items);
        const remembered = rememberedConversation(projectId);
        const active = items.find((item) => item.id === remembered) ?? items[0];
        if (active) {
          const loaded = await fetchChatMessages(projectId, active.id);
          if (!alive) return;
          setMessages(loaded);
          setActiveConversationId(active.id);
          rememberConversation(projectId, active.id);
        }
        setPersistence('saved');
      } catch (error) {
        if (!alive) return;
        setPersistence('error');
        setPersistenceError(error instanceof Error ? error.message : '读取历史对话失败');
      } finally {
        if (alive) setLoadingConversation(false);
      }
    })();
    return () => { alive = false; };
  }, [projectId]);

  const createConversation = async () => {
    if (busy || loadingConversation || pending) return;
    setLoadingConversation(true);
    setPersistenceError('');
    try {
      const conversation = await createChatConversation(projectId);
      setConversations((items) => [conversation, ...items]);
      setMessages([]);
      setActiveConversationId(conversation.id);
      rememberConversation(projectId, conversation.id);
      useSceneStore.getState().setPreview(null);
      setPending(null);
      setPersistence('saved');
      setShowHistory(false);
    } catch (error) {
      setPersistence('error');
      setPersistenceError(error instanceof Error ? error.message : '创建新对话失败');
    } finally {
      setLoadingConversation(false);
    }
  };

  const removeConversation = async (conversation: ChatConversationInfo) => {
    if (busy || loadingConversation || pending) return;
    const title = conversation.title || '新对话';
    if (!window.confirm(`删除「${title}」？此操作无法撤销。`)) return;
    try {
      await deleteChatConversation(projectId, conversation.id);
      const remaining = await refreshConversations();
      if (activeConversationId === conversation.id) {
        useSceneStore.getState().setPreview(null);
        setPending(null);
        if (remaining[0]) await selectConversation(remaining[0].id);
        else {
          setMessages([]);
          setActiveConversationId(null);
          rememberConversation(projectId, null);
        }
      }
      setPersistence('saved');
    } catch (error) {
      setPersistence('error');
      setPersistenceError(error instanceof Error ? error.message : '删除对话失败');
    }
  };

  const persistMessage = async (conversationId: string, message: ChatMsg) => {
    const saved = await appendChatMessage(projectId, conversationId, message);
    setPersistence('saved');
    setPersistenceError('');
    return saved;
  };

  const send = async (text?: string) => {
    const message = (text ?? input).trim();
    if (!message || busy || pending || loadingConversation) return;
    setInput('');
    setBusy(true);
    setPersistence('saving');
    setPersistenceError('');
    let userDraftAdded = false;
    try {
      let conversationId = activeConversationId;
      if (!conversationId) {
        const conversation = await createChatConversation(projectId);
        conversationId = conversation.id;
        setActiveConversationId(conversationId);
        setConversations((items) => [conversation, ...items]);
        rememberConversation(projectId, conversationId);
      }

      const draftId = `draft-${Date.now()}`;
      const draftMessage = { ...localMessage('user', message), id: draftId };
      setMessages((items) => [...items, draftMessage]);
      userDraftAdded = true;
      const userMessage = await persistMessage(conversationId, draftMessage);
      setMessages((items) => items.map((item) => item.id === draftId ? userMessage : item));
      setPersistence('saving');
      const state = useSceneStore.getState();
      const doc = state.doc;
      if (!doc) throw new Error('文档未加载');

      let reply: string;
      try {
        const result = await askAi(message, doc, messages.slice(-16));
        reply = result.reply;
        const ops = result.ops as DesignOp[];
        if (ops.length) {
          const outcome = executeOps(doc, ops);
          if (outcome.cmds.length) {
            state.setPreview(applyCmds(doc, outcome.cmds));
            setPending({ label: `AI · ${ops[0].op}`, cmds: outcome.cmds, log: outcome.log, baseRev: state.rev });
            reply = `${result.reply}\n已生成 ${outcome.cmds.length} 项变更，请检查预览后确认应用。${outcome.log.length ? `\n${outcome.log.join('\n')}` : ''}`.trim();
          } else {
            reply = `${result.reply}\n${outcome.log.join('\n')}`.trim();
          }
        }
      } catch (error) {
        reply = `出错了：${error instanceof Error ? error.message : '请稍后再试'}`;
      }

      try {
        const assistantMessage = await persistMessage(conversationId, localMessage('assistant', reply));
        setMessages((items) => [...items, assistantMessage]);
      } catch (error) {
        setMessages((items) => [...items, localMessage('assistant', reply)]);
        setPersistence('error');
        setPersistenceError(error instanceof Error ? error.message : 'AI 回复未能保存到历史记录');
      }
      void refreshConversations().catch(() => undefined);
    } catch (error) {
      const reply = `出错了：${error instanceof Error ? error.message : '请稍后再试'}`;
      if (!userDraftAdded) setInput(message);
      setMessages((items) => [...items, localMessage('assistant', reply)]);
      setPersistence('error');
      setPersistenceError(error instanceof Error ? error.message : '消息未能保存到历史记录');
    } finally {
      setBusy(false);
    }
  };

  const recordAssistant = async (content: string) => {
    const draftId = `draft-${Date.now()}`;
    setMessages((items) => [...items, { ...localMessage('assistant', content), id: draftId }]);
    if (!activeConversationId) return;
    try {
      const saved = await persistMessage(activeConversationId, localMessage('assistant', content));
      setMessages((items) => items.map((item) => item.id === draftId ? saved : item));
      void refreshConversations().catch(() => undefined);
    } catch (error) {
      setPersistence('error');
      setPersistenceError(error instanceof Error ? error.message : '操作结果未能保存到历史记录');
    }
  };

  const applyPending = async () => {
    if (!pending) return;
    setBusy(true);
    const scene = useSceneStore.getState();
    try {
      if (scene.rev !== pending.baseRev) {
        scene.setPreview(null);
        setPending(null);
        await recordAssistant('户型在预览期间已发生变化，请重新发送这条指令。');
        return;
      }
      scene.run(pending.label, pending.cmds);
      setPending(null);
      await recordAssistant('变更已应用，可使用撤销恢复。');
    } finally {
      setBusy(false);
    }
  };

  const cancelPending = async () => {
    setBusy(true);
    useSceneStore.getState().setPreview(null);
    setPending(null);
    try {
      await recordAssistant('已取消这次场景变更。');
    } finally {
      setBusy(false);
    }
  };

  const copyMessage = async (message: ChatMsg, key: string) => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((current) => current === key ? null : current), 1400);
    } catch {
      setPersistenceError('复制失败，请检查浏览器剪贴板权限');
    }
  };

  const activeConversation = conversations.find((item) => item.id === activeConversationId);
  const disabled = busy || loadingConversation || Boolean(pending);
  const persistenceText = persistence === 'loading' ? '读取中' : persistence === 'saving' ? '保存中' : persistence === 'error' ? '未保存' : '已保存';

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-zinc-100 px-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-ink">{activeConversation?.title ?? '新对话'}</p>
        </div>
        <span className={`text-[10px] ${persistence === 'error' ? 'text-red-600' : 'text-zinc-400'}`} title={persistenceError || '聊天记录会保留到手动删除'}>
          {persistenceText}
        </span>
        <button type="button" aria-expanded={showHistory} aria-controls="chat-history-panel" onClick={() => setShowHistory((shown) => !shown)} disabled={busy || loadingConversation}
          className={`rounded-md px-2 py-1 text-[11px] ${showHistory ? 'bg-accent-soft text-accent' : 'text-zinc-500 hover:bg-zinc-100'} disabled:opacity-40`}>
          历史{conversations.length ? ` ${conversations.length}` : ''}
        </button>
        <button type="button" onClick={createConversation} disabled={busy || loadingConversation || Boolean(pending)} title="新建对话"
          className="rounded-md border border-zinc-200 px-2 py-1 text-[11px] text-zinc-600 hover:bg-zinc-50 disabled:opacity-40">
          新建
        </button>
      </div>

      {showHistory && (
        <ChatHistory
          conversations={conversations}
          activeId={activeConversationId}
          search={historySearch}
          disabled={disabled}
          onSearch={setHistorySearch}
          onSelect={selectConversation}
          onDelete={removeConversation}
        />
      )}

      {persistenceError && persistence === 'error' && (
        <div role="status" className="shrink-0 border-b border-red-200 bg-red-50 px-3 py-1.5 text-[10px] text-red-700">{persistenceError}</div>
      )}

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
        <ChatMessageList messages={messages} busy={busy || loadingConversation} onCopy={copyMessage} copiedKey={copiedKey} />
      </div>

      {pending && (
        <div className="border-t border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold text-amber-950">待确认的场景变更 · {pending.cmds.length} 项</p>
          <ul className="mt-1 max-h-24 list-inside list-disc overflow-y-auto text-[11px] text-amber-900">
            {pending.log.filter((line) => line.startsWith('✓')).map((line, index) => <li key={index}>{line.slice(2)}</li>)}
          </ul>
          <div className="mt-2 flex justify-end gap-2">
            <button onClick={cancelPending} className="rounded-md border border-amber-300 px-3 py-1.5 text-xs text-amber-950 hover:bg-amber-100">取消</button>
            <button onClick={applyPending} className="rounded-md bg-amber-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800">确认应用</button>
          </div>
        </div>
      )}

      {!messages.length && !showHistory && (
        <div className="flex flex-wrap gap-1.5 border-t border-zinc-100 px-3 py-2">
          {QUICK_PROMPTS.map((prompt) => (
            <button key={prompt} onClick={() => send(prompt)} disabled={disabled}
              className="rounded-full border border-zinc-200 px-2.5 py-1 text-[11px] text-zinc-500 transition hover:border-accent hover:text-accent disabled:opacity-40">
              {prompt}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2 border-t border-zinc-100 p-3">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder="描述要添加、删除或调整的内容…（Enter 发送，Shift+Enter 换行）"
          rows={2}
          maxLength={2000}
          disabled={disabled}
          className="min-h-10 min-w-0 flex-1 resize-none rounded-md border border-zinc-200 px-3 py-2 text-xs outline-none focus:border-accent disabled:bg-zinc-50"
        />
        <button
          onClick={() => void send()}
          disabled={disabled || !input.trim()}
          className="self-end rounded-md bg-accent px-3.5 py-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          发送
        </button>
      </div>
      <div className="flex shrink-0 items-center justify-between px-3 pb-2 text-[10px] text-zinc-400">
        <span>对话与当前方案关联，只有手动删除时才会清除</span>
        <span>{input.length}/2000</span>
      </div>
    </div>
  );
}
