import { z } from 'zod';

export const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, '请选择有效的十六进制颜色');
