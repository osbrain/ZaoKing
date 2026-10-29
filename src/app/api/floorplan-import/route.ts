import { NextResponse } from 'next/server';
import { FloorPlanPixelDraftSchema } from '@/core/floorplanImport';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 30_000_000;

function hasImageSignature(bytes: Uint8Array, type: string) {
  if (type === 'image/png') return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (type === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === 'image/webp') return String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  return false;
}

export async function POST(request: Request) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: '未配置 OPENAI_API_KEY，暂时无法进行户型截图识别' }, { status: 503 });

  const form = await request.formData().catch(() => null);
  const file = form?.get('image');
  const width = Number(form?.get('widthPx'));
  const height = Number(form?.get('heightPx'));
  if (!(file instanceof File) || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > MAX_IMAGE_PIXELS) {
    return NextResponse.json({ error: '请上传有效的户型图片' }, { status: 400 });
  }
  if (file.size < 1 || file.size > MAX_IMAGE_BYTES || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    return NextResponse.json({ error: '图片仅支持 10 MB 以内的 PNG、JPEG 或 WebP 文件' }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasImageSignature(bytes, file.type)) return NextResponse.json({ error: '图片格式与文件内容不匹配' }, { status: 400 });
  const dataUrl = `data:${file.type};base64,${Buffer.from(bytes).toString('base64')}`;
  const base = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const prompt = `请解析这张俯视、正交的室内户型平面图。图片原始尺寸是 ${width}×${height} 像素。只返回 JSON，不要 Markdown 或解释。
坐标必须是原图像素，原点在左上角，x 向右、y 向下；不要换算成毫米，不要输出图外坐标。墙线用中心线端点表示，轻微倾斜的墙尽可能吸附到水平或垂直方向。识别房间多边形、门、入户门、窗和推拉门；无法确定的实体可以省略。confidence 是 0 到 1 的视觉置信度。承重墙只有图中明确标识时才标 bearing，不要自行推断承重。
JSON 结构：{"walls":[{"x0":0,"y0":0,"x1":100,"y1":0,"kind":"partition","confidence":0.8}],"openings":[{"kind":"door","rect":[10,10,20,20],"confidence":0.7}],"rooms":[{"name":"客厅","poly":[[0,0],[100,0],[100,100],[0,100]],"confidence":0.8}]}`;

  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(90_000),
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
        ] }],
      }),
    });
    if (!response.ok) {
      console.error('[floorplan-import] vision request failed:', response.status, (await response.text()).slice(0, 300));
      return NextResponse.json({ error: '户型识别服务暂时不可用，请稍后重试' }, { status: 502 });
    }
    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content;
    const text = typeof content === 'string' ? content : Array.isArray(content)
      ? content.map((part: { type?: string; text?: string }) => part.text ?? '').join('\n')
      : '';
    const parsedJson = JSON.parse(text);
    const parsed = FloorPlanPixelDraftSchema.safeParse(parsedJson);
    if (!parsed.success) {
      console.error('[floorplan-import] invalid model draft:', parsed.error.issues.slice(0, 8));
      return NextResponse.json({ error: '识别结果结构不完整，请换一张更清晰的户型图' }, { status: 422 });
    }

    const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x <= width && y <= height;
    const allPoints = [
      ...parsed.data.walls.flatMap((wall) => [[wall.x0, wall.y0], [wall.x1, wall.y1]]),
      ...(parsed.data.openings ?? []).flatMap((opening) => [[opening.rect[0], opening.rect[1]], [opening.rect[2], opening.rect[3]]]),
      ...(parsed.data.rooms ?? []).flatMap((room) => room.poly),
    ];
    if (!allPoints.every(([x, y]) => inBounds(x, y))) {
      return NextResponse.json({ error: '识别坐标超出图片范围，请重新识别' }, { status: 422 });
    }
    return NextResponse.json({ widthPx: width, heightPx: height, draft: parsed.data });
  } catch (error) {
    console.error('[floorplan-import] request failed:', error);
    return NextResponse.json({ error: '户型识别失败，请稍后重试' }, { status: 502 });
  }
}
