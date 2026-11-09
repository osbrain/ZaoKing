import type { Asset, CabinetPricingClass } from './types';

export const CABINET_PRICING_RULES: Array<{
  cabinetClass: CabinetPricingClass;
  key: 'basePerLinearMeter' | 'wallPerLinearMeter' | 'tallPerLinearMeter';
  label: string;
}> = [
  { cabinetClass: 'base', key: 'basePerLinearMeter', label: '地柜 / 台面柜' },
  { cabinetClass: 'wall', key: 'wallPerLinearMeter', label: '吊柜' },
  { cabinetClass: 'tall', key: 'tallPerLinearMeter', label: '通顶柜 / 衣柜' },
];

export function cabinetPricingClass(asset?: Asset): CabinetPricingClass | undefined {
  if (asset?.type !== 'custom' || !asset.geometry) return undefined;
  switch (asset.geometry.shape) {
    case 'cabinet':
    case 'kitchenIsland':
    case 'tvConsole':
    case 'vanity':
      return 'base';
    case 'wallCabinet':
      return 'wall';
    case 'wardrobe':
      return 'tall';
    default:
      return undefined;
  }
}

export function estimateCabinetCost(widthMm: number, ratePerLinearMeter: number): number {
  return Math.round((widthMm / 1000) * ratePerLinearMeter * 100) / 100;
}
