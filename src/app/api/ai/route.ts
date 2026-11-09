/* AI 对话路由：
 * - 配置了 DEEPSEEK_API_KEY（优先）或 OPENAI_API_KEY → OpenAI 兼容接口 Function Calling
 * - 未配置 → 内置规则解析（正则意图 → DesignOp），保证离线可演示
 * 两条路径产出同一种 DesignOp；几何求解由前端 scene-core 执行器完成。 */

import { NextRequest, NextResponse } from 'next/server';
import type { DesignOp } from '@/core/ops';
import { parseAiToolCalls } from '@/core/aiTools';
import { assetCatalog, materialCatalog, parseWidthMm } from '@/core/assets';
import { pointInPoly } from '@/core/geometry';
import { formatSceneIssues, SceneDocumentSchema } from '@/core/sceneSchema';
import { instanceRef, type SceneDocument } from '@/core/types';
import { documentAssets, documentMaterials } from '@/core/sceneResources';
import { cabinetSectionTypes, isCabinetShape } from '@/core/cabinet';
import { wallStatusLabel } from '@/core/renovation';
import { getChatProviderConfig, type AiProviderConfig } from '@/lib/aiProvider';
import { z } from 'zod';

export const dynamic = 'force-dynamic';


/* ---------- 场景上下文包（带稳定 ID 和可编辑参数） ---------- */

function packContext(doc: SceneDocument): string {
  const assets = documentAssets(doc);
  const materials = materialCatalog(documentMaterials(doc));
  const catalog = assetCatalog(assets);
  const lv = doc?.levels?.[0];
  if (!lv) return '（空文档）';
  const lines: string[] = [];
  for (const level of doc.levels) {
    lines.push(`【楼层 ${level.name}，levelId=${level.id}】`);
    lines.push(`墙体：${level.walls.map((wall) => `${wall.kind}/${wallStatusLabel(wall)}（wallId=${wall.id}，${wall.x0},${wall.y0}-${wall.x1},${wall.y1}）`).join('、') || '无'}`);
    for (const r of level.rooms) {
      const instances = level.instances
        .filter((i) => pointInPoly([i.t.x, i.t.y], r.poly))
        .map((i) => {
          const asset = catalog.find((a) => a.id === i.assetId);
          const ref = instanceRef(i, asset);
          const parameters = Object.entries(asset?.geometry?.parameters ?? {})
            .map(([key, value]) => `${key}=${i.parameters?.[key as keyof NonNullable<typeof i.parameters>] ?? value}`)
            .join(',');
          const cabinetSections = asset?.geometry?.shape && isCabinetShape(asset.geometry.shape)
            ? cabinetSectionTypes({ ...asset.geometry.parameters, ...i.parameters })
            : null;
          const editableParameters = [
            parameters,
            cabinetSections ? `sections=${cabinetSections.join('/')}（逐格可设 door/open/drawers，从左到右）` : '',
          ].filter(Boolean).join(';');
          return `${ref.name}（instanceId=${i.id}，${ref.w}×${ref.d}×${ref.h}mm，${Math.round(i.t.rot)}°${editableParameters ? `，支持参数 ${editableParameters}` : ''}）`;
        });
      lines.push(`- ${r.name}${r.counted === false ? '（飘窗，不计面积）' : ''}：${instances.length ? instances.join('、') : '空'}`);
    }
  }
  const cats = [...new Set(catalog.map((a) => a.category))]
    .map((cat) => {
      const names = catalog.filter((a) => a.category === cat).map((a) => a.name);
      return `  · ${cat}：${names.join('、')}`;
    })
    .join('\n');
  return `【房间、墙体与现有布置】\n${lines.join('\n')}\n【可用材质】${materials.map((m) => m.name).join('、')}\n【组件库】\n${cats}`;
}

const SYSTEM_PROMPT = `你是 ZaoKing 室内设计助手，通过调用工具函数操作用户的户型场景。
规则：
1. 组件目标优先使用上下文中的 instanceId；同名组件有多个时调用 ask_user，不要猜。
2. 多层方案必须传 levelId，room 必须使用该楼层中出现过的房间名。
3. 不要推断精确尺寸或移动距离；只有用户明确给出毫米数或角度时才调用相应参数工具。
4. 结构参数只可修改上下文明确列出的资产参数；柜体 sections 可逐格设为 door、open 或 drawers，顺序从左到右；不支持的参数不要猜。
5. 添加组件的位置由系统求解。用户一句话包含多个意图时可调用多个工具。
6. 墙面换色使用 set_wall_color，地面材料使用 set_floor_material；不要把墙面指令误作地面指令。
7. 拆改只使用 set_wall_renovation，并且必须使用上下文给出的 wallId；承重墙或外墙拆除必须提醒现场专业核验与审批，不能将模型标记描述为施工许可。
8. 信息不足或操作有歧义时调用 ask_user；工具调用完成后简短总结，不要编造操作。`;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'add_component',
      description: '在指定房间添加一件家具/组件，系统会自动求解贴墙摆放位置',
      parameters: {
        type: 'object',
        properties: {
          room: { type: 'string', description: '房间名，如"客厅"，缺省为最大房间' },
          levelId: { type: 'string', description: '目标楼层 ID；多层项目必填' },
          query: { type: 'string', description: '组件名称关键词，如"三人沙发"' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'replace_component',
      description: '替换房间里已有的某件组件（保留位置朝向），如把床换成 1.8 米的',
      parameters: {
        type: 'object',
        properties: {
          room: { type: 'string' },
          levelId: { type: 'string' },
          instanceId: { type: 'string', description: '上下文提供的唯一实例 ID，优先使用' },
          target: { type: 'string', description: '被替换的现有组件，如"床"' },
          spec: { type: 'string', description: '目标规格或名称，如"1.8米"、"双人沙发"' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_component',
      description: '删除房间里指定的组件',
      parameters: {
        type: 'object',
        properties: { room: { type: 'string' }, levelId: { type: 'string' }, instanceId: { type: 'string' }, target: { type: 'string' } },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'move_component',
      description: '按用户明确给出的毫米偏移移动组件，或按用户明确给出的角度旋转组件',
      parameters: {
        type: 'object',
        properties: {
          room: { type: 'string' }, levelId: { type: 'string' }, instanceId: { type: 'string' }, target: { type: 'string' },
          dxMm: { type: 'number', description: '向右为正，向左为负；仅用户明确给出距离时填写' },
          dyMm: { type: 'number', description: '向下为正，向上为负；仅用户明确给出距离时填写' },
          rotationDeltaDeg: { type: 'number', description: '顺时针旋转角度，仅用户明确给出角度时填写' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'resize_component',
      description: '按用户明确给出的毫米尺寸修改组件宽、深或高',
      parameters: {
        type: 'object',
        properties: {
          room: { type: 'string' }, levelId: { type: 'string' }, instanceId: { type: 'string' }, target: { type: 'string' },
          widthMm: { type: 'number' }, depthMm: { type: 'number' }, heightMm: { type: 'number' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_component_color',
      description: '修改指定家具组件的颜色，不要用于墙面或地面',
      parameters: {
        type: 'object',
        properties: { room: { type: 'string' }, levelId: { type: 'string' }, instanceId: { type: 'string' }, target: { type: 'string' }, query: { type: 'string', description: '颜色描述' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_component_parameters',
      description: '修改定制家具实例支持的结构参数；定制柜可按从左到右逐格设置门板、开放格或抽屉',
      parameters: {
        type: 'object',
        properties: {
          room: { type: 'string' }, levelId: { type: 'string' }, instanceId: { type: 'string' }, target: { type: 'string' },
          compartments: { type: 'integer', minimum: 1, maximum: 8 },
          openCompartments: { type: 'integer', minimum: 0, maximum: 8, description: '从左侧开始开放的柜体分区数量' },
          shelves: { type: 'integer', minimum: 0, maximum: 12 },
          drawers: { type: 'integer', minimum: 1, maximum: 8 },
          seats: { type: 'integer', minimum: 1, maximum: 5 },
          sections: { type: 'array', items: { type: 'string', enum: ['door', 'open', 'drawers'] }, minItems: 1, maxItems: 8, description: '柜体每格的类型，按从左到右排列，长度必须等于分区数量' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_wall_color',
      description: '修改指定房间相邻墙体的颜色，或按 wallId 修改一段墙体',
      parameters: {
        type: 'object',
        properties: { room: { type: 'string' }, levelId: { type: 'string' }, wallId: { type: 'string' }, query: { type: 'string', description: '颜色描述，如浅灰色或 #c8c8c5' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_floor_material',
      description: '更换房间地面材质',
      parameters: {
        type: 'object',
        properties: { room: { type: 'string' }, levelId: { type: 'string' }, query: { type: 'string', description: '材质名或颜色描述，如"浅灰色地砖"' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_wall_renovation',
      description: '将一段指定墙体标记为保留、新建或拆除，必须使用上下文中提供的 wallId',
      parameters: {
        type: 'object',
        properties: {
          levelId: { type: 'string' },
          wallId: { type: 'string' },
          status: { type: 'string', enum: ['retained', 'new', 'demolished'] },
        },
        required: ['wallId', 'status'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ask_user',
      description: '存在歧义时向用户提问',
      parameters: {
        type: 'object',
        properties: { question: { type: 'string' } },
        required: ['question'],
      },
    },
  },
];

/* ---------- LLM 路径（DeepSeek 优先的 OpenAI 兼容接口） ---------- */

async function withLLM(
  provider: AiProviderConfig,
  message: string,
  doc: SceneDocument,
  history: Array<{ role: string; content: string }>,
): Promise<Response> {
  const res = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
    body: JSON.stringify({
      model: provider.model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: `${SYSTEM_PROMPT}\n\n${packContext(doc)}` },
        ...history.slice(-8).map((m) => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: String(m.content).slice(0, 500),
        })),
        { role: 'user', content: message },
      ],
      tools: TOOLS,
      tool_choice: 'auto',
    }),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const m = data.choices?.[0]?.message ?? {};
  const ops = parseAiToolCalls(m.tool_calls);
  const reply =
    (typeof m.content === 'string' ? m.content.trim() : '') ||
    (ops.length ? '好的，我来调整场景。' : '抱歉，我没有理解这个需求，可以换个说法试试。');
  return NextResponse.json({ reply, ops, mode: 'llm', provider: provider.name });
}

/* ---------- 规则路径（离线兜底） ----------
 * 支持一句话多个意图（"把床换成1.8米的，并加上梳妆台"）：
 * 先按连接词拆子句，每句独立做意图匹配。 */

function parseClause(msg: string, ops: DesignOp[]): string | null {
  const parameter = msg.match(/(?:把|将)(?:(.{1,10}?)的)?(书架|书柜|柜子|衣柜|梳妆台|沙发)(?:的)?(层板|抽屉|座位|分格)(?:数量|数)?(?:改成|调整为|增加到|设为)(\d+)/);
  if (parameter) {
    const key = parameter[3] === '层板' ? 'shelves' : parameter[3] === '抽屉' ? 'drawers' : parameter[3] === '座位' ? 'seats' : 'compartments';
    ops.push({ op: 'set_component_parameters', room: parameter[1]?.trim(), target: parameter[2], [key]: Number(parameter[4]) });
    return '好的，我来调整组件结构参数。';
  }
  const wallColor = msg.match(/(?:把|将)(.{1,10}?)的?(?:墙面|墙壁)(?:颜色)?(?:改成|换成|设为)(#[\da-fA-F]{6}|浅灰色?|淡灰色?|灰色|深灰色?|米白色?|奶白色?|白色|浅蓝色?|天蓝色?|深蓝色?|浅绿色?|薄荷绿|绿色|深绿色?|粉色|红色|黄色|橙色|黑色|原木色?|棕色|咖色)/);
  if (wallColor) {
    ops.push({ op: 'set_wall_color', room: wallColor[1].trim(), query: wallColor[2] });
    return '好的，我来调整墙面颜色。';
  }
  const color = msg.match(/(?:把|将)(?:(.{1,10}?)的)?(.+?)(?:颜色)?(?:改成|换成|设为)(#[\da-fA-F]{6}|浅灰色?|淡灰色?|灰色|深灰色?|米白色?|奶白色?|白色|浅蓝色?|天蓝色?|深蓝色?|浅绿色?|薄荷绿|绿色|深绿色?|粉色|红色|黄色|橙色|黑色|原木色?|棕色|咖色)/);
  if (color && !/墙面|地面|地板|地砖/.test(color[2])) {
    ops.push({ op: 'set_component_color', room: color[1]?.trim(), target: color[2].trim(), query: color[3] });
    return '好的，我来调整组件颜色。';
  }

  const dimension = msg.match(/(?:把|将)(?:(.{1,10}?)的)?(.+?)(宽度|宽|深度|深|高度|高)(?:改成|调整为|改为|设为)(\d+(?:\.\d+)?\s*(?:mm|毫米|米|m))/i);
  if (dimension) {
    const value = parseWidthMm(dimension[4]);
    if (value) {
      const key = /宽/.test(dimension[3]) ? 'widthMm' : /深/.test(dimension[3]) ? 'depthMm' : 'heightMm';
      ops.push({ op: 'resize_component', room: dimension[1]?.trim(), target: dimension[2].trim(), [key]: value });
      return '好的，我来调整组件尺寸。';
    }
  }

  const move = msg.match(/(?:把|将)(?:(.{1,10}?)的)?(.+?)(?:向|往)(左|右|上|下)(?:移动|挪动|平移)(\d+(?:\.\d+)?\s*(?:mm|毫米|米|m))/i);
  if (move) {
    const distance = parseWidthMm(move[4]);
    if (distance) {
      const signed = move[3] === '左' || move[3] === '上' ? -distance : distance;
      ops.push({ op: 'move_component', room: move[1]?.trim(), target: move[2].trim(), dxMm: move[3] === '左' || move[3] === '右' ? signed : 0, dyMm: move[3] === '上' || move[3] === '下' ? signed : 0 });
      return '好的，我来移动组件。';
    }
  }

  const rotate = msg.match(/(?:把|将)(?:(.{1,10}?)的)?(.+?)(?:顺时针|逆时针)?旋转(\d+(?:\.\d+)?)\s*(?:度|°)/);
  if (rotate) {
    const direction = /逆时针/.test(msg) ? -1 : 1;
    ops.push({ op: 'move_component', room: rotate[1]?.trim(), target: rotate[2].trim(), rotationDeltaDeg: Number(rotate[3]) * direction });
    return '好的，我来旋转组件。';
  }

  // 材质只识别明确的地面目标，墙面材质目前不在本版本中
  const m1 = msg.match(/(?:把|将)?(.{1,10}?)的?(?:地面|地板|地砖)(?:材质)?换成(.+)/);
  if (m1) {
    ops.push({ op: 'set_floor_material', room: m1[1].trim() || undefined, query: m1[2].trim() });
    return '好的，我来更换地面材质。';
  }
  // 替换
  const m2 = msg.match(/(?:把|将)([^换成]{1,8}?)的(.+?)换成(.+)/);
  if (m2) {
    ops.push({ op: 'replace_component', room: m2[1].trim(), target: m2[2].trim(), spec: m2[3].trim() });
    return '好的，我来替换。';
  }
  // 删除
  const m3 = msg.match(/(?:删除|删掉|去掉)([^的]{1,8}?)的(.+)/);
  if (m3) {
    ops.push({ op: 'delete_component', room: m3[1].trim(), target: m3[2].trim() });
    return '好的，我来删除。';
  }
  // 添加（房间名后可无分隔词，用前瞻界定："在主卧室加一个床头柜" → room=主卧室）
  const m4 = msg.match(/(?:在(.{1,10}?)(?:里|中|内|的)?(?=添加|加|放|摆))?(?:添加|加|放|摆)(?:上|入)?(?:一[个只张台])?(.+)/);
  if (m4) {
    ops.push({ op: 'add_component', room: m4[1]?.trim(), query: m4[2].trim() });
    return '好的，我来摆放。';
  }
  return null;
}

function withRules(message: string): Response {
  const ops: DesignOp[] = [];
  const clauses = message
    .split(/，?并(?:且|同时)?|，同时|，然后|，再|；/)
    .map((s) => s.replace(/^[，,。；\s]+|[，,。；\s]+$/g, ''))
    .filter(Boolean);
  const replies = new Set<string>();
  for (const c of clauses.length ? clauses : [message.trim()]) {
    const r = parseClause(c, ops);
    if (r) replies.add(r);
  }
  if (!ops.length) {
    return NextResponse.json({
      reply:
        '我目前支持这些指令（配置 DEEPSEEK_API_KEY 后可用自然语言自由对话）：\n' +
        '· 在客厅加一个三人沙发\n· 把主卧的床换成 1.8 米的\n· 把客厅的地面换成大理石\n· 删除客厅的茶几',
      ops,
      mode: 'rules',
    });
  }
  return NextResponse.json({ reply: [...replies].join('') || '好的，我来调整场景。', ops, mode: 'rules' });
}

export async function POST(req: NextRequest) {
  try {
    const requestSchema = z.object({
      message: z.string().trim().min(1).max(2000),
      doc: SceneDocumentSchema,
      history: z.array(z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(10000),
      }).strip()).max(16).optional(),
    }).strict();
    const request = requestSchema.safeParse(await req.json());
    if (!request.success) {
      return NextResponse.json({
        error: 'invalid AI request',
        issues: formatSceneIssues(request.error),
      }, { status: 400 });
    }
    const { message, doc, history = [] } = request.data;
    const provider = getChatProviderConfig();
    if (provider) {
      try {
        return await withLLM(provider, message, doc, history);
      } catch (e) {
        console.error(`[ai] ${provider.name} 调用失败，回退规则模式:`, e);
      }
    }
    return withRules(message);
  } catch (e) {
    console.error('[ai]', e);
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
}
