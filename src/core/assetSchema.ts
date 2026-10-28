import { z } from 'zod';

/** 自定义组件只接受声明式数据，禁止脚本、HTML 和外部资源。 */
export const CustomAssetSchema = z.object({
  id: z.string().regex(/^custom:[a-zA-Z0-9_-]{1,100}$/),
  type: z.literal('custom'),
  name: z.string().trim().min(1, '请输入组件名称').max(60, '名称最多 60 字'),
  category: z.string().trim().min(1).max(60),
  w: z.number().finite().min(10, '尺寸不能小于 10 mm').max(20000, '尺寸不能大于 20000 mm'),
  d: z.number().finite().min(10, '尺寸不能小于 10 mm').max(20000, '尺寸不能大于 20000 mm'),
  h: z.number().finite().min(10, '尺寸不能小于 10 mm').max(20000, '尺寸不能大于 20000 mm'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, '请选择有效颜色'),
  tags: z.array(z.string().trim().min(1).max(60)).max(20),
  geometry: z.object({ shape: z.enum(['box', 'cylinder']) }).strict(),
}).strict();
