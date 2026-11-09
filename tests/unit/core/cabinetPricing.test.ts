import { describe, expect, it } from 'vitest';
import { cabinetPricingClass, estimateCabinetCost } from '@/core/cabinetPricing';

describe('made-to-measure cabinet estimates', () => {
  it('maps supported cabinet templates to their project rate class', () => {
    const asset = (shape: 'cabinet' | 'wallCabinet' | 'wardrobe' | 'bookcase') => ({
      id: `custom:${shape}`, type: 'custom', name: shape, category: 'storage',
      w: 1200, d: 500, h: 2200, color: '#a47a52', tags: [], geometry: { shape },
    });

    expect(cabinetPricingClass(asset('cabinet'))).toBe('base');
    expect(cabinetPricingClass(asset('wallCabinet'))).toBe('wall');
    expect(cabinetPricingClass(asset('wardrobe'))).toBe('tall');
    expect(cabinetPricingClass(asset('bookcase'))).toBeUndefined();
  });

  it('estimates from front width in linear meters and rounds to cents', () => {
    expect(estimateCabinetCost(1800, 12800)).toBe(23040);
    expect(estimateCabinetCost(1250, 999.99)).toBe(1249.99);
  });
});
