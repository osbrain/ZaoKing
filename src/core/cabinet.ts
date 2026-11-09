import type { CabinetSectionType, CustomGeometry } from './types';

export const CABINET_SHAPES = ['cabinet', 'wallCabinet', 'wardrobe', 'tvConsole', 'kitchenIsland'] as const;

export function isCabinetShape(shape: CustomGeometry['shape']): boolean {
  return (CABINET_SHAPES as readonly string[]).includes(shape);
}

export function cabinetSectionTypes(
  parameters: NonNullable<CustomGeometry['parameters']> = {},
): CabinetSectionType[] {
  const count = Math.max(1, Math.min(8, Math.floor(parameters.compartments ?? Math.max(2, parameters.sections?.length ?? 0))));
  const openCount = Math.max(0, Math.min(count, Math.floor(parameters.openCompartments ?? 0)));
  return Array.from({ length: count }, (_, index) =>
    parameters.sections?.[index] ?? (index < openCount ? 'open' : 'door'));
}
