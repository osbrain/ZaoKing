import { z } from 'zod';
import { HexColorSchema } from './schemaPrimitives';
import { MAX_MATERIAL_PRICE_PER_SQM } from './pricingLimits';

export const MaterialSchema = z.object({
  id: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(100),
  price: z.number().finite().min(0).max(MAX_MATERIAL_PRICE_PER_SQM),
  sw: HexColorSchema,
  render: z.object({
    pattern: z.enum(['wood', 'tile', 'marble', 'terrazzo', 'carpet', 'plain']),
    tileMm: z.tuple([z.number().finite().positive().max(20_000), z.number().finite().positive().max(20_000)]).optional(),
    roughness: z.number().finite().min(0).max(1).optional(),
    groutColor: HexColorSchema.optional(),
  }).strict().optional(),
}).strict();
