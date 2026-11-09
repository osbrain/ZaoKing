import { describe, expect, it } from 'vitest';
import { cabinetSectionTypes } from '@/core/cabinet';

describe('cabinet section layout', () => {
  it('keeps legacy open-bay defaults while allowing per-bay overrides', () => {
    expect(cabinetSectionTypes({ compartments: 3, openCompartments: 1 })).toEqual(['open', 'door', 'door']);
    expect(cabinetSectionTypes({ compartments: 3, openCompartments: 1, sections: ['door', 'drawers'] }))
      .toEqual(['door', 'drawers', 'door']);
  });

  it('uses the declared section count when a compact template omits compartments', () => {
    expect(cabinetSectionTypes({ sections: ['open', 'drawers', 'door'] })).toEqual(['open', 'drawers', 'door']);
  });

  it('truncates or fills an explicit layout when the compartment count changes', () => {
    const configured = { compartments: 3, openCompartments: 1, sections: ['door', 'drawers', 'open'] as ('door' | 'open' | 'drawers')[] };
    expect(cabinetSectionTypes({ ...configured, compartments: 2 })).toEqual(['door', 'drawers']);
    expect(cabinetSectionTypes({ ...configured, compartments: 4 })).toEqual(['door', 'drawers', 'open', 'door']);
  });
});
