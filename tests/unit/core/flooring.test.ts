import { describe, expect, it } from 'vitest';
import { estimateFlooring, resolveFlooring } from '@/core/flooring';
import type { Room } from '@/core/types';

const squareRoom: Room = {
  id: 'living', name: '客厅', poly: [[0, 0], [4000, 0], [4000, 4000], [0, 4000]], floorMaterialId: 'tile800',
};

describe('flooring parameters and estimates', () => {
  it('uses material defaults for legacy rooms without flooring overrides', () => {
    expect(resolveFlooring(squareRoom)).toEqual({
      tileMm: [800, 800], groutMm: 3, groutColor: '#a99f91', layout: 'straight', origin: [0, 0],
    });
  });

  it.each([
    ['straight', 0.05, 27],
    ['brick', 0.08, 27],
    ['diagonal', 0.12, 28],
  ] as const)('estimates %s quantities with an explicit allowance', (layout, wasteRate, tileCount) => {
    const room = { ...squareRoom, flooring: { tileMm: [800, 800] as [number, number], groutMm: 3, layout, origin: [0, 0] as [number, number] } };
    const estimate = estimateFlooring(room);

    expect(estimate.areaM2).toBe(16);
    expect(estimate.wasteRate).toBe(wasteRate);
    expect(estimate.estimatedTileCount).toBe(tileCount);
    expect(estimate.estimatedCost).toBeCloseTo(16 * (1 + wasteRate) * 220);
  });
});
