import { describe, expect, it } from 'vitest';
import { executeOps } from './ops';
import { buildSeedDocument } from './seed';

describe('level-aware design operations', () => {
  it('requires a floor to be specified for operations in multi-level documents', () => {
    const document = buildSeedDocument();
    document.levels.push({ id: 'lv2', name: '二层', elevation: 3000, walls: [], rooms: [], openings: [], instances: [] });
    const outcome = executeOps(document, [{ op: 'add_component', room: '客厅', query: '三人沙发' }]);
    expect(outcome.cmds).toHaveLength(0);
    expect(outcome.log).toContain('💬 请先指定要修改的楼层');
  });

  it('attaches generated commands to the explicitly selected floor', () => {
    const document = buildSeedDocument();
    const livingRoom = document.levels[0].rooms.find((room) => room.id === 'living')!;
    document.levels.push({
      id: 'lv2', name: '二层', elevation: 3000, walls: [],
      rooms: [{ ...livingRoom, id: 'living-2', poly: livingRoom.poly.map((point) => [...point] as [number, number]) }],
      openings: [], instances: [],
    });
    const outcome = executeOps(document, [{
      op: 'add_component', levelId: 'lv2', room: '客厅', query: '三人沙发',
    }]);
    expect(outcome.cmds).toHaveLength(1);
    expect(outcome.cmds[0].levelId).toBe('lv2');
  });
});
