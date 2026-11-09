import { describe, expect, it } from 'vitest';
import { parseAiToolCalls } from '@/core/aiTools';

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

  it('parses parameterized cabinet open-bay edits', () => {
    const ops = parseAiToolCalls([{ function: {
      name: 'set_component_parameters',
      arguments: JSON.stringify({ room: '客厅', target: '电视柜', openCompartments: 2, shelves: 1 }),
    } }]);
    expect(ops).toEqual([{
      op: 'set_component_parameters', levelId: undefined, room: '客厅', target: '电视柜',
      instanceId: undefined, openCompartments: 2, shelves: 1,
    }]);
  });

  it('requires an explicit wall ID and supported status for renovation edits', () => {
    expect(parseAiToolCalls([{ function: {
      name: 'set_wall_renovation', arguments: JSON.stringify({ wallId: 'wall-1', status: 'demolished' }),
    } }])).toEqual([{ op: 'set_wall_renovation', levelId: undefined, wallId: 'wall-1', status: 'demolished' }]);
    expect(parseAiToolCalls([{ function: {
      name: 'set_wall_renovation', arguments: JSON.stringify({ wallId: 'wall-1', status: 'maybe' }),
    } }])).toEqual([]);
  });
});
