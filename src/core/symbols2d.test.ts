import { describe, expect, it } from 'vitest';
import { dimensionLayout, dimsSvg } from './symbols2d';
import type { Level } from './types';

const level: Level = {
  id: 'lv1', name: '一层', elevation: 0,
  walls: [
    { id: 'top', x0: 1000, y0: 2000, x1: 7000, y1: 2200, kind: 'exterior', height: 2800 },
    { id: 'left', x0: 1000, y0: 2000, x1: 1200, y1: 7200, kind: 'exterior', height: 2800 },
    { id: 'right', x0: 6800, y0: 2000, x1: 7000, y1: 7200, kind: 'exterior', height: 2800 },
    { id: 'bottom', x0: 1000, y0: 7000, x1: 7000, y1: 7200, kind: 'exterior', height: 2800 },
    { id: 'partition', x0: 3000, y0: 2200, x1: 3200, y1: 4500, kind: 'partition', height: 2800 },
  ],
  rooms: [
    { id: 'room1', name: '房间一', poly: [[1200, 2200], [3000, 2200], [3000, 4500], [1200, 4500]], floorMaterialId: 'wood' },
  ],
  openings: [], instances: [],
};

describe('2D dimensions', () => {
  it('derives aligned overall and chain dimensions from the current floorplan', () => {
    const layout = dimensionLayout(level);
    expect(layout).not.toBeNull();
    expect(layout).toMatchObject({ width: 6000, height: 5200 });
    expect(layout?.edges.top).toEqual([1000, 1200, 3000, 3200, 6800, 7000]);
    expect(layout?.edges.left).toEqual([2000, 2200, 4500, 7000, 7200]);

    const svg = dimsSvg(level);
    expect(svg).toContain('>6000</text>');
    expect(svg).toContain('>5200</text>');
    expect(svg).not.toContain('10270');
  });

  it('omits dimensions for a blank plan instead of rendering prototype values', () => {
    const blank: Level = { id: 'lv1', name: '一层', elevation: 0, walls: [], rooms: [], openings: [], instances: [] };
    expect(dimensionLayout(blank)).toBeNull();
    expect(dimsSvg(blank)).toBe('');
  });
});
