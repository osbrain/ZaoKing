/* 编辑器瞬态 store：视图模式、相机、选区、工具、光标、面板状态。
 * 与 sceneStore 严格分离 —— 这里的一切都不持久化。 */

import { create } from 'zustand';

export type Selection =
  | { kind: 'furn'; id: string }
  | { kind: 'room'; id: string }
  | { kind: 'wall'; id: string }
  | { kind: 'opening'; id: string }
  | null;

export type Tool = 'select' | 'wall' | 'room' | 'door' | 'window';
export type WallPreset = 'exterior' | 'partition' | 'low';
export type PlanLayer = 'layout' | 'floor' | 'renovation';

export type Camera = { cx: number; cy: number; scale: number };

interface EditorState {
  viewMode: '2d' | '3d';
  planLayer: PlanLayer;
  camera: Camera;
  selection: Selection;
  tool: Tool;
  wallPreset: WallPreset;
  cursor: { x: number; y: number } | null;
  rightTab: 'props' | 'ai' | 'stats';
  toast: string | null;
  preset3d: { kind: 'iso' | 'top'; n: number };
  showGrid: boolean;
  showOrientation: boolean;
  showRoomNames: boolean;
  showFurniture: boolean;

  setViewMode: (m: '2d' | '3d') => void;
  setPlanLayer: (layer: PlanLayer) => void;
  setCamera: (c: Camera) => void;
  select: (s: Selection) => void;
  setTool: (t: Tool) => void;
  setWallPreset: (p: WallPreset) => void;
  setCursor: (c: { x: number; y: number } | null) => void;
  setRightTab: (t: EditorState['rightTab']) => void;
  showToast: (msg: string) => void;
  setPreset3d: (kind: 'iso' | 'top') => void;
  toggleGrid: () => void;
  toggleOrientation: () => void;
  toggleRoomNames: () => void;
  toggleFurniture: () => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  viewMode: '2d',
  planLayer: 'layout',
  camera: { cx: 5000, cy: 5000, scale: 0.06 },
  selection: null,
  tool: 'select',
  wallPreset: 'exterior',
  cursor: null,
  rightTab: 'props',
  toast: null,
  preset3d: { kind: 'iso', n: 0 },
  showGrid: true,
  showOrientation: true,
  showRoomNames: true,
  showFurniture: true,

  setViewMode: (m) => set((state) => ({
    viewMode: m,
    selection: m !== '2d' ? state.selection
      : state.planLayer === 'floor' && state.selection?.kind !== 'room' ? null
        : state.planLayer === 'renovation' && state.selection?.kind !== 'wall' ? null : state.selection,
  })),
  setPlanLayer: (planLayer) => set((state) => ({
    planLayer,
    tool: 'select',
    selection: planLayer === 'layout' ? state.selection
      : planLayer === 'floor' && state.selection?.kind !== 'room' ? null
        : planLayer === 'renovation' && state.selection?.kind !== 'wall' ? null : state.selection,
  })),
  setCamera: (c) => set({ camera: c }),
  select: (s) => {
    const state = get();
    if (s && state.viewMode === '2d' && state.planLayer !== 'layout'
      && (state.planLayer === 'floor' ? s?.kind !== 'room' : s?.kind !== 'wall')) return;
    set({ selection: s });
    if (s) set({ rightTab: 'props' });
  },
  setTool: (t) => set((state) => ({
    tool: state.viewMode === '2d' && state.planLayer !== 'layout' && t !== 'select' ? 'select' : t,
  })),
  setWallPreset: (p) => set({ wallPreset: p }),
  setCursor: (c) => set({ cursor: c }),
  setRightTab: (t) => set({ rightTab: t }),
  showToast: (msg) => {
    set({ toast: msg });
    setTimeout(() => {
      if (get().toast === msg) set({ toast: null });
    }, 2600);
  },
  setPreset3d: (kind) => set({ preset3d: { kind, n: get().preset3d.n + 1 } }),
  toggleGrid: () => set((state) => ({ showGrid: !state.showGrid })),
  toggleOrientation: () => set((state) => ({ showOrientation: !state.showOrientation })),
  toggleRoomNames: () => set((state) => ({ showRoomNames: !state.showRoomNames })),
  toggleFurniture: () => set((state) => ({ showFurniture: !state.showFurniture })),
}));
