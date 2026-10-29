import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

type RouteContext = { params: { conversationId: string } };

const messageRequest = z.object({
  projectId: z.string().min(1),
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(10000),
}).strict();

/** POST /api/chat/:conversationId/messages appends a durable chat message. */
export async function POST(request: Request, { params }: RouteContext) {
  const body = await request.json().catch(() => null);
  const parsed = messageRequest.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'invalid chat message' }, { status: 400 });

  const { projectId, role, content } = parsed.data;
  const result = await prisma.$transaction(async (tx) => {
    const conversation = await tx.chatConversation.findFirst({
      where: { id: params.conversationId, projectId },
      select: { id: true, title: true },
    });
    if (!conversation) return null;

    const message = await tx.chatMessage.create({
      data: { conversationId: conversation.id, role, content },
    });
    const firstUserMessage = role === 'user' && conversation.title === '新对话';
    await tx.chatConversation.update({
      where: { id: conversation.id },
      data: {
        ...(firstUserMessage ? { title: content.replace(/\s+/g, ' ').slice(0, 48) } : {}),
        updatedAt: new Date(),
      },
    });
    return message;
  });

  if (!result) return NextResponse.json({ error: 'conversation not found' }, { status: 404 });
  return NextResponse.json({ message: result }, { status: 201 });
}
