import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

type RouteContext = { params: { conversationId: string } };

/** GET /api/chat/:conversationId?projectId=... loads one conversation. */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const projectId = request.nextUrl.searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

  const conversation = await prisma.chatConversation.findFirst({
    where: { id: params.conversationId, projectId },
    select: {
      id: true,
      messages: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
    },
  });
  if (!conversation) return NextResponse.json({ error: 'conversation not found' }, { status: 404 });
  return NextResponse.json({ messages: conversation.messages });
}

/** DELETE removes a conversation only when explicitly requested by the user. */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const projectId = request.nextUrl.searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

  const result = await prisma.chatConversation.deleteMany({ where: { id: params.conversationId, projectId } });
  if (!result.count) return NextResponse.json({ error: 'conversation not found' }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
