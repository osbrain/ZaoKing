import { NextResponse } from 'next/server';
import { keepPixelDraftWithinBounds, normalizeVisionFloorPlanDraft, scalePixelDraftCoordinates } from '@/core/floorplanImport';
import { getVisionProviderConfig } from '@/lib/aiProvider';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 30_000_000;
const VISION_REQUEST_TIMEOUT_MS = 180_000;

function hasImageSignature(bytes: Uint8Array, type: string) {
  if (type === 'image/png') return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (type === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === 'image/webp') return String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  return false;
}

export async function POST(request: Request) {
  const provider = getVisionProviderConfig();
  if (!provider) return NextResponse.json({ error: '未配置视觉模型，暂时无法进行户型截图识别' }, { status: 503 });

  const form = await request.formData().catch(() => null);
  const file = form?.get('image');
  const width = Number(form?.get('widthPx'));
  const height = Number(form?.get('heightPx'));
  const sourceWidth = Number(form?.get('sourceWidthPx') ?? width);
  const sourceHeight = Number(form?.get('sourceHeightPx') ?? height);
  if (!(file instanceof File) || ![width, height, sourceWidth, sourceHeight].every(Number.isInteger)
    || width < 1 || height < 1 || sourceWidth < 1 || sourceHeight < 1
    || width * height > MAX_IMAGE_PIXELS || sourceWidth * sourceHeight > MAX_IMAGE_PIXELS) {
    return NextResponse.json({ error: '请上传有效的户型图片' }, { status: 400 });
  }
  if (file.size < 1 || file.size > MAX_IMAGE_BYTES || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    return NextResponse.json({ error: '图片仅支持 10 MB 以内的 PNG、JPEG 或 WebP 文件' }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasImageSignature(bytes, file.type)) return NextResponse.json({ error: '图片格式与文件内容不匹配' }, { status: 400 });
  const dataUrl = `data:${file.type};base64,${Buffer.from(bytes).toString('base64')}`;
  const isDashScopeQwen3Vision = provider.baseUrl.includes('dashscope.aliyuncs.com')
    && provider.model.toLowerCase().startsWith('qwen3-vl');
  const prompt = `请解析这张俯视、正交的室内户型平面图。当前图片尺寸是 ${width}×${height} 像素。只返回 JSON，不要 Markdown 或解释。
坐标必须是当前图片像素，原点在左上角，x 向右、y 向下；不要换算成毫米，也不要把图纸上的尺寸数字当坐标。墙体端点必须落在图片范围内，并且只沿户型实际墙体绘制。尺寸引线、尺寸数字、网格、箭头、水印、家具和洁具都不是墙体或门窗；不要将它们识别为户型几何。轻微倾斜的墙尽可能吸附到水平或垂直方向。只识别墙体上的真实门窗洞口，不要把门扇弧线或装饰线当成洞口；同一洞口只输出一次。洞口 kind 必须严格使用 door、entry、window、sliding，推拉门或移门统一使用 sliding。无法确定的实体可以省略。confidence 是 0 到 1 的视觉置信度。承重墙只有图中明确标识时才标 bearing，不要自行推断承重。
JSON 结构：{"walls":[{"x0":0,"y0":0,"x1":100,"y1":0,"kind":"partition","confidence":0.8}],"openings":[{"kind":"door","rect":[10,10,20,20],"confidence":0.7}],"rooms":[{"name":"客厅","poly":[[0,0],[100,0],[100,100],[0,100]],"confidence":0.8}]}`;

  try {
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
      signal: AbortSignal.timeout(VISION_REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        model: provider.model,
        temperature: 0,
        ...(isDashScopeQwen3Vision ? { enable_thinking: false } : {}),
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
    const parsed = normalizeVisionFloorPlanDraft(parsedJson);
    if (!parsed.success) {
      console.error('[floorplan-import] invalid model draft:', parsed.error.issues.slice(0, 8));
      return NextResponse.json({ error: '识别结果结构不完整，请换一张更清晰的户型图' }, { status: 422 });
    }

    const bounded = keepPixelDraftWithinBounds(parsed.data, { width, height });
    const droppedOutOfBounds = bounded.droppedWalls + bounded.droppedOpenings + bounded.droppedRooms;
    const warnings = [...parsed.warnings];
    if (droppedOutOfBounds) {
      console.warn('[floorplan-import] discarded out-of-bounds geometry:', {
        imageWidth: width,
        imageHeight: height,
        droppedWalls: bounded.droppedWalls,
        droppedOpenings: bounded.droppedOpenings,
        droppedRooms: bounded.droppedRooms,
      });
      warnings.push(`已忽略超出图片范围的识别项：墙 ${bounded.droppedWalls} 段、门窗 ${bounded.droppedOpenings} 个、房间 ${bounded.droppedRooms} 个`);
    }
    if (!bounded.draft.walls.length) {
      return NextResponse.json({ error: '模型返回的墙体坐标均超出图片范围，可能把尺寸标注或图纸辅助线识别成了墙。请裁掉户型图外的标注后重试' }, { status: 422 });
    }
    const draft = scalePixelDraftCoordinates(bounded.draft, { width, height }, { width: sourceWidth, height: sourceHeight });
    return NextResponse.json({ widthPx: sourceWidth, heightPx: sourceHeight, draft, warnings });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      console.warn('[floorplan-import] vision request timed out:', {
        model: provider.model,
        imageBytes: file.size,
        timeoutMs: VISION_REQUEST_TIMEOUT_MS,
      });
      return NextResponse.json({ error: '户型识别耗时过长，视觉模型在 3 分钟内未返回结果。请稍后重试，或上传更清晰且范围更紧凑的户型图。' }, { status: 504 });
    }
    console.error('[floorplan-import] request failed:', error);
    return NextResponse.json({ error: '户型识别失败，请稍后重试' }, { status: 502 });
  }
}
