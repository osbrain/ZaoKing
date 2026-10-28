/* 场景文档 store：单一数据源 + 快照式撤销栈。
 * 所有修改经 run(label, cmds) → applyCmds（纯函数）→ 新文档。
 * 2D / 3D / 属性面板 / AI 执行器全部订阅此 store。 */

import { create } from 'zustand';
import type { SceneDocument } from '@/core/types';
import { applyCmds, type Cmd } from '@/core/commands';

interface SceneState {
  doc: SceneDocument | null;
  past: SceneDocument[];
  future: SceneDocument[];
  /** 每次文档变化 +1，自动保存与拖拽绕行都依赖它 */
  rev: number;
  hydrated: boolean;
  lastAction: string;

  run: (label: string, cmds: Cmd[]) => void;
  undo: () => void;
  redo: () => void;
  hydrate: (doc: SceneDocument) => void;
}

const MAX_HISTORY = 120;

export const useSceneStore = create<SceneState>((set, get) => ({
  doc: null,
  past: [],
  future: [],
  rev: 0,
  hydrated: false,
  lastAction: '',

  run: (label, cmds) => {
    const { doc, past } = get();
    if (!doc || !cmds.length) return;
    set({
      doc: applyCmds(doc, cmds),
      past: [...past.slice(-(MAX_HISTORY - 1)), doc],
      future: [],
      rev: get().rev + 1,
      lastAction: label,
    });
  },

  undo: () => {
    const { doc, past, future } = get();
    if (!doc || !past.length) return;
    const prev = past[past.length - 1];
    set({ doc: prev, past: past.slice(0, -1), future: [doc, ...future], rev: get().rev + 1, lastAction: '撤销' });
  },

  redo: () => {
    const { doc, past, future } = get();
    if (!doc || !future.length) return;
    const next = future[0];
    set({ doc: next, past: [...past, doc], future: future.slice(1), rev: get().rev + 1, lastAction: '重做' });
  },

  hydrate: (d) =>
    set({ doc: d, past: [], future: [], rev: get().rev + 1, hydrated: true, lastAction: '' }),
}));
