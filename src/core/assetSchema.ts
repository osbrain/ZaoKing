import { z } from 'zod';
import type { CustomShape } from './types';
import { HexColorSchema } from './schemaPrimitives';

export const CustomShapeSchema = z.enum([
  'box', 'cylinder', 'cabinet', 'wallCabinet', 'wardrobe', 'bookcase', 'dresser', 'tvConsole', 'vanity', 'kitchenIsland',
  'sofa', 'cornerSofa', 'armchair', 'bed', 'roundTable', 'diningTable', 'desk', 'chair', 'rug',
  'bathtub', 'toilet', 'shower', 'planter', 'floorLamp', 'pendantLight',
]) satisfies z.ZodType<CustomShape>;

const GeometrySchema = z.object({
  shape: CustomShapeSchema,
  finish: z.enum(['wood', 'paint', 'fabric', 'metal', 'ceramic', 'glass']).optional(),
  parameters: z.object({
    compartments: z.number().int().min(1).max(8).optional(),
    shelves: z.number().int().min(0).max(12).optional(),
    drawers: z.number().int().min(1).max(8).optional(),
    seats: z.number().int().min(1).max(5).optional(),
  }).strict().optional(),
}).strict();

/** 自定义组件只接受声明式数据，禁止脚本、HTML 和外部资源。 */
export const AssetDefinitionSchema = z.object({
  id: z.string().trim().min(1).max(120),
  type: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1, '请输入组件名称').max(60, '名称最多 60 字'),
  category: z.string().trim().min(1).max(60),
  w: z.number().finite().min(10, '尺寸不能小于 10 mm').max(20000, '尺寸不能大于 20000 mm'),
  d: z.number().finite().min(10, '尺寸不能小于 10 mm').max(20000, '尺寸不能大于 20000 mm'),
  h: z.number().finite().min(10, '尺寸不能小于 10 mm').max(20000, '尺寸不能大于 20000 mm'),
  color: HexColorSchema,
  tags: z.array(z.string().trim().min(1).max(60)).max(20),
  geometry: GeometrySchema.optional(),
}).strict();

export const CustomAssetSchema = AssetDefinitionSchema.extend({
  id: z.string().regex(/^custom:[a-zA-Z0-9_-]{1,100}$/),
  type: z.literal('custom'),
  geometry: GeometrySchema,
});
