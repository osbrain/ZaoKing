/* AI 对话路由：
 * - 配置了 OPENAI_API_KEY → OpenAI 兼容接口 Function Calling（tools 见 TOOLS）
 * - 未配置 → 内置规则解析（正则意图 → DesignOp），保证离线可演示
 * 两条路径产出同一种 DesignOp；几何求解由前端 scene-core 执行器完成。 */

import { NextRequest, NextResponse } from 'next/server';
import type { DesignOp } from '@/core/ops';
import { parseAiToolCalls } from '@/core/aiTools';
import { assetCatalog, MATERIALS } from '@/core/assets';
import { pointInPoly } from '@/core/geometry';
import { formatSceneIssues, SceneDocumentSchema } from '@/core/sceneSchema';
import type { SceneDocument } from '@/core/types';
import { z } from 'zod';

export const dynamic = 'force-dynamic';


/* ---------- 场景上下文包（控制 token，只传摘要不传坐标） ---------- */

function packContext(doc: SceneDocument): string {
  const catalog = assetCatalog(doc.assets);
  const lv = doc?.levels?.[0];
  if (!lv) return '（空文档）';
  const lines: string[] = [];
  for (const level of doc.levels) {
    lines.push(`【楼层 ${level.name}，levelId=${level.id}】`);
    for (const r of level.rooms) {
      const names = level.instances
        .filter((i) => pointInPoly([i.t.x, i.t.y], r.poly))
        .map((i) => catalog.find((a) => a.id === i.assetId)?.name ?? i.assetId);
      lines.push(`- ${r.name}${r.counted === false ? '（飘窗，不计面积）' : ''}：${names.length ? names.join('、') : '空'}`);
    }
  }
  const cats = [...new Set(catalog.map((a) => a.category))]
    .map((cat) => {
      const names = catalog.filter((a) => a.category === cat).map((a) => a.name);
      return `  · ${cat}：${names.join('、')}`;
    })
    .join('\n');
  return `【房间与现有布置】\n${lines.join('\n')}\n【可用材质】${MATERIALS.map((m) => m.name).join('、')}\n【组件库】\n${cats}`;
}

const SYSTEM_PROMPT = `你是 ZaoKing 室内设计助手，通过调用工具函数操作用户的户型场景。
规则：
1. 绝不虚构坐标、尺寸或 id —— 几何摆放由系统求解，你只描述意图。
2. 多层方案必须通过 levelId 选择楼层；room 参数必须是该楼层中出现过的房间名。query/target/spec 使用组件库中的名称关键词。
3. 用户一句话包含多个意图时，并行调用多个工具。
4. 信息不足或有歧义时，调用 ask_user 向用户提问（给选项）。
5. 工具调用完成后简短总结你做了什么；不要编造未执行的操作。`;

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
          target: { type: 'string', description: '被替换的现有组件，如"床"' },
          spec: { type: 'string', description: '目标规格或名称，如"1.8米"、"双人沙发"' },
        },
        required: ['target'],
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
        properties: { room: { type: 'string' }, levelId: { type: 'string' }, target: { type: 'string' } },
        required: ['target'],
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

/* ---------- LLM 路径（OpenAI 兼容接口） ---------- */

async function withLLM(
  key: string,
  message: string,
  doc: SceneDocument,
  history: Array<{ role: string; content: string }>,
): Promise<Response> {
  const base = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
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
  return NextResponse.json({ reply, ops, mode: 'llm' });
}

/* ---------- 规则路径（离线兜底） ----------
 * 支持一句话多个意图（"把床换成1.8米的，并加上梳妆台"）：
 * 先按连接词拆子句，每句独立做意图匹配。 */

function parseClause(msg: string, ops: DesignOp[]): string | null {
  // 材质
  const m1 = msg.match(/(?:把|将)?([^换]{1,8}?)的?(?:地面|地板|地砖|墙面)?换成(.+)/);
  if (m1 && /材质|地板|地砖|大理石|地毯|瓷砖|防滑|水磨石|灰色|白色|木|砖/.test(m1[2])) {
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
        '我目前支持这些指令（配置 OPENAI_API_KEY 后可用自然语言自由对话）：\n' +
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
        content: z.string().max(2000),
      }).strict()).max(16).optional(),
    }).strict();
    const request = requestSchema.safeParse(await req.json());
    if (!request.success) {
      return NextResponse.json({
        error: 'invalid AI request',
        issues: formatSceneIssues(request.error),
      }, { status: 400 });
    }
    const { message, doc, history = [] } = request.data;
    const key = process.env.OPENAI_API_KEY;
    if (key) {
      try {
        return await withLLM(key, message, doc, history);
      } catch (e) {
        console.error('[ai] LLM 调用失败，回退规则模式:', e);
      }
    }
    return withRules(message);
  } catch (e) {
    console.error('[ai]', e);
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
}
