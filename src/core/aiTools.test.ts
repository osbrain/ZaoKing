import { describe, expect, it } from 'vitest';
import { parseAiToolCalls } from './aiTools';

describe('parseAiToolCalls', () => {
  it('preserves level and instance IDs plus numeric edit parameters', () => {
    const ops = parseAiToolCalls([{ function: {
      name: 'resize_component',
      arguments: JSON.stringify({ levelId: 'lv2', room: '主卧', instanceId: 'bed-1', widthMm: 1800 }),
    } }]);
    expect(ops).toEqual([{
      op: 'resize_component', levelId: 'lv2', room: '主卧', instanceId: 'bed-1',
      target: undefined, widthMm: 1800, depthMm: undefined, heightMm: undefined,
    }]);
  });

  it('drops non-finite or non-numeric edit arguments', () => {
    const ops = parseAiToolCalls([{ function: {
      name: 'move_component',
      arguments: '{"instanceId":"sofa-1","dxMm":"100","dyMm":null}',
    } }]);
    expect(ops).toEqual([]);
  });

  it('parses instance-scoped custom component parameters', () => {
    const ops = parseAiToolCalls([{ function: {
      name: 'set_component_parameters',
      arguments: JSON.stringify({ levelId: 'lv1', instanceId: 'shelf-1', shelves: 7 }),
    } }]);
    expect(ops).toEqual([{
      op: 'set_component_parameters', levelId: 'lv1', room: undefined, target: undefined,
      instanceId: 'shelf-1', shelves: 7,
    }]);
  });
});
