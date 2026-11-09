import { describe, expect, it } from 'vitest';
import { executeOps } from '@/core/ops';
import { buildBlankDocument, buildSeedDocument } from '@/core/seed';
import { resolveAssetByQuery } from '@/core/assets';
import type { SceneDocument } from '@/core/types';

function sofaDocument(): SceneDocument {
  const document = buildBlankDocument();
  const level = document.levels[0];
  level.rooms.push({
    id: 'room-1', name: '客厅', poly: [[0, 0], [6000, 0], [6000, 6000], [0, 6000]],
    floorMaterialId: 'wood',
  });
  const sofa = resolveAssetByQuery('三人沙发')!;
  level.instances.push({ id: 'sofa-1', assetId: sofa.id, t: { x: 3000, y: 3000, rot: 0 } });
  return document;
}

describe('level-aware design operations', () => {
  it('requires a floor to be specified for operations in multi-level documents', () => {
    const document = buildSeedDocument();
    document.levels.push({ id: 'lv2', name: '二层', elevation: 3000, walls: [], rooms: [], openings: [], instances: [] });
    const outcome = executeOps(document, [{ op: 'add_component', room: '客厅', query: '三人沙发' }]);
    expect(outcome.cmds).toHaveLength(0);
    expect(outcome.log).toContain('💬 请先指定要修改的楼层');
  });

  it('sets demolition status by explicit wall ID and warns on structural walls', () => {
    const document = buildBlankDocument();
    document.levels[0].walls = [
      { id: 'partition-1', x0: 0, y0: 0, x1: 1000, y1: 200, kind: 'partition', height: 2800 },
      { id: 'bearing-1', x0: 1200, y0: 0, x1: 1400, y1: 1000, kind: 'bearing', height: 2800 },
    ];

    const partition = executeOps(document, [{ op: 'set_wall_renovation', wallId: 'partition-1', status: 'demolished' }]);
    const bearing = executeOps(document, [{ op: 'set_wall_renovation', wallId: 'bearing-1', status: 'demolished' }]);

    expect(partition.cmds).toEqual([{ levelId: 'lv1', type: 'setWall', id: 'partition-1', renovation: 'demolished' }]);
    expect(bearing.log[0]).toContain('不构成施工许可');
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

  it('creates a parameter edit for an exact component instance', () => {
    const document = sofaDocument();
    const outcome = executeOps(document, [{ op: 'resize_component', instanceId: 'sofa-1', widthMm: 2200 }]);
    expect(outcome.cmds).toEqual([{ levelId: 'lv1', type: 'resize', id: 'sofa-1', size: { w: 2200 } }]);
  });

  it('creates a height edit for an exact component instance', () => {
    const document = sofaDocument();
    const outcome = executeOps(document, [{ op: 'resize_component', instanceId: 'sofa-1', heightMm: 950 }]);
    expect(outcome.cmds).toEqual([{ levelId: 'lv1', type: 'resize', id: 'sofa-1', size: { h: 950 } }]);
  });

  it('allows furniture dimensions to change while it overlaps a floor rug', () => {
    const document = sofaDocument();
    const level = document.levels[0];
    const table = resolveAssetByQuery('茶几')!;
    const rug = resolveAssetByQuery('地毯')!;
    level.instances = [
      { id: 'table-1', assetId: table.id, t: { x: 3000, y: 3000, rot: 0 } },
      { id: 'rug-1', assetId: rug.id, t: { x: 3000, y: 3000, rot: 0 } },
    ];

    const outcome = executeOps(document, [{ op: 'resize_component', instanceId: 'table-1', widthMm: 1800 }]);

    expect(outcome.cmds).toEqual([{ levelId: 'lv1', type: 'resize', id: 'table-1', size: { w: 1800 } }]);
  });

  it('still rejects a resize that collides with another piece of furniture', () => {
    const document = sofaDocument();
    const level = document.levels[0];
    const table = resolveAssetByQuery('茶几')!;
    const chair = resolveAssetByQuery('单人沙发')!;
    level.instances = [
      { id: 'table-1', assetId: table.id, t: { x: 2200, y: 3000, rot: 0 } },
      { id: 'chair-1', assetId: chair.id, t: { x: 3500, y: 3000, rot: 0 } },
    ];

    const outcome = executeOps(document, [{ op: 'resize_component', instanceId: 'table-1', widthMm: 1800 }]);

    expect(outcome.cmds).toHaveLength(0);
    expect(outcome.log[0]).toContain('家具与其他组件重叠');
  });

  it('does not silently delete one of several same-name components', () => {
    const document = buildSeedDocument();
    const outcome = executeOps(document, [{ op: 'delete_component', room: '客厅', target: '绿植' }]);
    expect(outcome.cmds).toHaveLength(0);
    expect(outcome.log[0]).toContain('多件候选');
    expect(outcome.log[0]).toContain('seed35');
  });

  it('rejects moves and resizes that collide with room boundaries or other furniture', () => {
    const document = sofaDocument();
    const move = executeOps(document, [{ op: 'move_component', instanceId: 'sofa-1', dxMm: 20000 }]);
    expect(move.cmds).toHaveLength(0);
    expect(move.log[0]).toContain('越界');
    const resize = executeOps(document, [{ op: 'resize_component', instanceId: 'sofa-1', widthMm: 20000 }]);
    expect(resize.cmds).toHaveLength(0);
    expect(resize.log[0]).toContain('越界');
  });

  it('changes every wall adjacent to the requested room and returns undoable commands', () => {
    const document = buildBlankDocument();
    const level = document.levels[0];
    level.rooms.push({ id: 'room', name: '客厅', poly: [[200, 200], [5800, 200], [5800, 5800], [200, 5800]], floorMaterialId: 'wood' });
    level.walls = [
      { id: 'north', x0: 0, y0: 0, x1: 6000, y1: 200, kind: 'exterior', height: 2800 },
      { id: 'south', x0: 0, y0: 5800, x1: 6000, y1: 6000, kind: 'exterior', height: 2800 },
      { id: 'west', x0: 0, y0: 0, x1: 200, y1: 6000, kind: 'exterior', height: 2800 },
      { id: 'east', x0: 5800, y0: 0, x1: 6000, y1: 6000, kind: 'exterior', height: 2800 },
    ];
    const outcome = executeOps(document, [{ op: 'set_wall_color', room: '客厅', query: '浅灰色' }]);
    expect(outcome.cmds).toHaveLength(4);
    expect(outcome.cmds.every((command) => command.type === 'setWall' && command.color === '#c8c8c5')).toBe(true);
  });

  it('changes only supported per-instance custom geometry parameters', () => {
    const document = sofaDocument();
    const level = document.levels[0];
    document.assets = [{
      id: 'custom:bookcase', type: 'custom', name: '定制书架', category: '书房',
      w: 1200, d: 350, h: 2100, color: '#a47a52', tags: ['书架'],
      geometry: { shape: 'bookcase', parameters: { compartments: 3, shelves: 5 } },
    }];
    level.instances = [{ id: 'bookcase-1', assetId: 'custom:bookcase', t: { x: 3000, y: 3000, rot: 0 } }];
    const outcome = executeOps(document, [{ op: 'set_component_parameters', instanceId: 'bookcase-1', shelves: 7, seats: 2 }]);
    expect(outcome.cmds).toEqual([{ levelId: 'lv1', type: 'setParameters', id: 'bookcase-1', parameters: { shelves: 7 } }]);
    expect(outcome.log.some((line) => line.includes('不支持修改seats'))).toBe(true);
  });

  it('supports setting open cabinet bays and rejects more open bays than partitions', () => {
    const document = sofaDocument();
    const level = document.levels[0];
    document.assets = [{
      id: 'custom:cabinet', type: 'custom', name: '定制地柜', category: '餐厨',
      w: 1800, d: 600, h: 900, color: '#a47a52', tags: ['地柜'],
      geometry: { shape: 'cabinet', parameters: { compartments: 3, openCompartments: 1, shelves: 2 } },
    }];
    level.instances = [{ id: 'cabinet-1', assetId: 'custom:cabinet', t: { x: 3000, y: 3000, rot: 0 } }];
    const valid = executeOps(document, [{ op: 'set_component_parameters', instanceId: 'cabinet-1', openCompartments: 2 }]);
    expect(valid.cmds).toEqual([{ levelId: 'lv1', type: 'setParameters', id: 'cabinet-1', parameters: { openCompartments: 2 } }]);
    const invalid = executeOps(document, [{ op: 'set_component_parameters', instanceId: 'cabinet-1', openCompartments: 4 }]);
    expect(invalid.cmds).toHaveLength(0);
    expect(invalid.log[0]).toContain('开放格数量不能超过分区数量');
  });

  it('maps dark color descriptions before their broader color names', () => {
    const document = buildBlankDocument();
    const level = document.levels[0];
    level.rooms.push({ id: 'room', name: '客厅', poly: [[0, 0], [6000, 0], [6000, 6000], [0, 6000]], floorMaterialId: 'wood' });
    level.walls = [{ id: 'wall', x0: 0, y0: 0, x1: 6000, y1: 200, kind: 'exterior', height: 2800 }];
    const gray = executeOps(document, [{ op: 'set_wall_color', room: '客厅', query: '深灰色' }]);
    expect(gray.cmds).toEqual([{ levelId: 'lv1', type: 'setWall', id: 'wall', color: '#55565a' }]);
    const blue = executeOps(document, [{ op: 'set_wall_color', room: '客厅', query: '深蓝色' }]);
    expect(blue.cmds).toEqual([{ levelId: 'lv1', type: 'setWall', id: 'wall', color: '#405f7a' }]);
  });
});
