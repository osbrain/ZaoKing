import { z } from 'zod';
import { materialById } from './assets';
import { polyArea } from './geometry';
import { HexColorSchema } from './schemaPrimitives';
import type { FlooringSpec, Material, Room } from './types';

export const FlooringSchema = z.object({
  tileMm: z.tuple([
    z.number().finite().min(50).max(5000),
    z.number().finite().min(50).max(5000),
  ]),
  groutMm: z.number().finite().min(0).max(20),
  groutColor: HexColorSchema.optional(),
  layout: z.enum(['straight', 'brick', 'diagonal']),
  origin: z.tuple([z.number().finite().min(-1_000_000).max(1_000_000), z.number().finite().min(-1_000_000).max(1_000_000)]),
}).strict();

export function resolveFlooring(room: Pick<Room, 'floorMaterialId' | 'flooring'>, material?: Material): FlooringSpec {
  const definition = material ?? materialById(room.floorMaterialId);
  const tileMm = room.flooring?.tileMm ?? definition.render?.tileMm ?? [800, 800];
  return {
    tileMm: [tileMm[0], tileMm[1]],
    groutMm: room.flooring?.groutMm ?? 3,
    groutColor: room.flooring?.groutColor ?? definition.render?.groutColor,
    layout: room.flooring?.layout ?? 'straight',
    origin: room.flooring?.origin ? [...room.flooring.origin] : [0, 0],
  };
}

const FLOOR_LAYOUT_WASTE: Record<FlooringSpec['layout'], number> = {
  straight: 0.05,
  brick: 0.08,
  diagonal: 0.12,
};

export interface FloorEstimate {
  areaM2: number;
  wasteRate: number;
  requiredAreaM2: number;
  estimatedTileCount: number;
  estimatedCost: number;
}

export function estimateFlooring(room: Room, material?: Material): FloorEstimate {
  const definition = material ?? materialById(room.floorMaterialId);
  const flooring = resolveFlooring(room, definition);
  const areaM2 = polyArea(room.poly);
  const wasteRate = FLOOR_LAYOUT_WASTE[flooring.layout];
  const tileAreaM2 = flooring.tileMm[0] * flooring.tileMm[1] / 1_000_000;
  const requiredAreaM2 = areaM2 * (1 + wasteRate);

  return {
    areaM2,
    wasteRate,
    requiredAreaM2,
    estimatedTileCount: Math.ceil(requiredAreaM2 / tileAreaM2 - 1e-9),
    estimatedCost: requiredAreaM2 * definition.price,
  };
}
