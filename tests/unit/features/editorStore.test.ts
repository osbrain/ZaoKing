import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '@/stores/editorStore';

describe('editor plan layers', () => {
  beforeEach(() => {
    useEditorStore.setState({
      viewMode: '2d',
      planLayer: 'layout',
      tool: 'select',
      selection: null,
    });
  });

  it('resets drawing tools and keeps a selected room when entering the floor layer', () => {
    useEditorStore.getState().select({ kind: 'room', id: 'living' });
    useEditorStore.getState().setTool('wall');
    useEditorStore.getState().setPlanLayer('floor');

    expect(useEditorStore.getState().planLayer).toBe('floor');
    expect(useEditorStore.getState().tool).toBe('select');
    expect(useEditorStore.getState().selection).toEqual({ kind: 'room', id: 'living' });
  });

  it('clears layout-only selections and prevents drawing tools in the floor layer', () => {
    useEditorStore.getState().select({ kind: 'wall', id: 'wall-1' });
    useEditorStore.getState().setPlanLayer('floor');
    useEditorStore.getState().setTool('door');

    expect(useEditorStore.getState().selection).toBeNull();
    expect(useEditorStore.getState().tool).toBe('select');
    useEditorStore.getState().select(null);
    expect(useEditorStore.getState().selection).toBeNull();
  });

  it('clears a 3D furniture selection when returning to the 2D floor layer', () => {
    useEditorStore.getState().setPlanLayer('floor');
    useEditorStore.getState().setViewMode('3d');
    useEditorStore.getState().select({ kind: 'furn', id: 'sofa-1' });
    useEditorStore.getState().setViewMode('2d');

    expect(useEditorStore.getState().selection).toBeNull();
  });

  it('keeps only wall selection and prevents drawing tools in the renovation layer', () => {
    useEditorStore.getState().select({ kind: 'furn', id: 'sofa-1' });
    useEditorStore.getState().setPlanLayer('renovation');
    expect(useEditorStore.getState().selection).toBeNull();
    useEditorStore.getState().select({ kind: 'wall', id: 'wall-1' });
    useEditorStore.getState().setTool('door');

    expect(useEditorStore.getState().selection).toEqual({ kind: 'wall', id: 'wall-1' });
    expect(useEditorStore.getState().tool).toBe('select');
  });
});
