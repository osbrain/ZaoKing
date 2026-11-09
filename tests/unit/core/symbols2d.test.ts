import { describe, expect, it } from 'vitest';
import { dimensionLayout, dimsSvg, furnSVG, materialPatternId, openingsSvg, roomFlooringDefs, roomFlooringPatternId } from '@/core/symbols2d';
import type { Level } from '@/core/types';

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

describe('sliding door pocket symbols', () => {
  it('marks the selected wall pocket using the modeled leaf travel', () => {
    const svg = openingsSvg({
      ...level,
      openings: [{ id: 'slider', kind: 'sliding', rect: [1000, 1000, 2000, 1200], height: 2400, sill: 0, slideMode: 'pocket-start' }],
    });

    expect(svg).toContain('x="450" y="1000" width="550" height="200"');
    expect(svg).toContain('stroke-dasharray="5 3"');
  });
});

describe('material SVG identifiers', () => {
  it('keeps distinct material IDs distinct after encoding', () => {
    expect(materialPatternId('vendor:oak')).not.toBe(materialPatternId('vendor_oak'));
  });
});

describe('room-specific flooring patterns', () => {
  it('creates a room-scoped brick pattern with its configured grout and world origin', () => {
    const room = {
      ...level.rooms[0],
      flooring: { tileMm: [600, 300] as [number, number], groutMm: 4, groutColor: '#aaaaaa', layout: 'brick' as const, origin: [120, 240] as [number, number] },
    };
    const defs = roomFlooringDefs([room]);

    expect(defs).toContain(`id="${roomFlooringPatternId(room.id)}"`);
    expect(defs).toContain('width="1200" height="600" patternTransform="translate(120 240)"');
    expect(defs).toContain('stroke="#aaaaaa" stroke-width="4"');
    expect(defs).toContain('M300 300V600');
  });
});

describe('parameterized cabinet symbols', () => {
  it('shows open bays and shelf divisions in the plan symbol', () => {
    const svg = furnSVG('custom', 1200, 600, '#c9b89f', {
      shape: 'cabinet', parameters: { compartments: 2, openCompartments: 1, shelves: 2 },
    });
    expect(svg).toContain('#f2e7d8');
    expect(svg).toContain('stroke="none"');
    expect(svg.match(/<line /g)).toHaveLength(3);
  });

  it('renders ordered door, open, and drawer bays distinctly', () => {
    const svg = furnSVG('custom', 1800, 600, '#c9b89f', {
      shape: 'cabinet', parameters: { compartments: 3, sections: ['door', 'open', 'drawers'], shelves: 1, drawers: 3 },
    });
    expect(svg).toContain('#f2e7d8');
    expect(svg.match(/<line /g)).toHaveLength(5);
    expect(svg.match(/#807261/g)).toHaveLength(2);
  });

  it('keeps cabinet openings positive for minimum-size assets', () => {
    const svg = furnSVG('custom', 10, 10, '#c9b89f', {
      shape: 'cabinet', parameters: { compartments: 8, openCompartments: 8, shelves: 12 },
    });
    const rectangleSizes = [...svg.matchAll(/<(?:rect)\b[^>]*\b(?:width|height)="([^"]+)"/g)]
      .map((match) => Number(match[1]));
    expect(rectangleSizes.every((size) => Number.isFinite(size) && size > 0)).toBe(true);
  });
});

describe('upholstered bed plan symbol', () => {
  it('shows a layered top view with headboard, pillows, duvet, and runner', () => {
    const svg = furnSVG('bed', 1800, 2000, '#718d99');

    expect(svg).toContain('data-part="upholstered-headboard"');
    expect(svg.match(/data-part="pillow"/g)).toHaveLength(2);
    expect(svg).toContain('data-part="duvet"');
    expect(svg).toContain('data-part="bed-runner"');
  });
});
