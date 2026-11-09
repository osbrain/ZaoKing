import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/ai/route';
import { buildBlankDocument } from '@/core/seed';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('POST /api/ai', () => {
  it('accepts persisted chat history metadata and stored message lengths', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', '');

    const response = await POST(new NextRequest('http://localhost/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: '你好',
        doc: buildBlankDocument('AI 校验测试'),
        history: [
          { id: 'message-1', role: 'user', content: '之前的要求', createdAt: '2026-10-30T08:00:00.000Z' },
          { id: 'message-2', role: 'assistant', content: '已保存的回复。'.repeat(300), createdAt: '2026-10-30T08:01:00.000Z' },
        ],
      }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ mode: 'rules' });
  });

  it('describes cabinet section values to the model even when the asset has no sections override', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-key');
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '好的。', tool_calls: [] } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const doc = buildBlankDocument('柜体 AI 上下文测试');
    doc.levels[0].rooms.push({
      id: 'living', name: '客厅', poly: [[0, 0], [5000, 0], [5000, 4000], [0, 4000]], floorMaterialId: 'tile800',
    });
    doc.assets = [{
      id: 'custom:tv-console', type: 'custom', name: '电视柜', category: '客厅',
      w: 1800, d: 400, h: 600, color: '#8f7255', tags: [],
      geometry: { shape: 'tvConsole', parameters: { compartments: 3 } },
    }];
    doc.levels[0].instances.push({
      id: 'tv-console-1', assetId: 'custom:tv-console', t: { x: 2000, y: 2000, rot: 0 },
    });

    const response = await POST(new NextRequest('http://localhost/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '把第二格改成开放格', doc }),
    }));

    expect(response.status).toBe(200);
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    const systemPrompt = requestBody.messages[0].content as string;
    expect(systemPrompt).toContain('sections=door/door/door');
    expect(systemPrompt).toContain('逐格可设 door/open/drawers');
    expect(systemPrompt).toContain('顺序从左到右');
  });
});
