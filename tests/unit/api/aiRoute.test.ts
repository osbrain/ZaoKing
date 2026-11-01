import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/ai/route';
import { buildBlankDocument } from '@/core/seed';

afterEach(() => vi.unstubAllEnvs());

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
});
