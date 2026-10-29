import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const conversationSummary = {
  id: true,
  title: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { messages: true } },
} as const;

/** GET /api/chat?projectId=... lists saved conversations for one project. */
export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

  const conversations = await prisma.chatConversation.findMany({
    where: { projectId },
    orderBy: { updatedAt: 'desc' },
    select: conversationSummary,
  });

  return NextResponse.json({
    conversations: conversations.map(({ _count, ...conversation }) => ({ ...conversation, messageCount: _count.messages })),
  });
}

/** POST /api/chat creates an empty conversation. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = z.object({ projectId: z.string().min(1) }).strict().safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

  const project = await prisma.project.findUnique({ where: { id: parsed.data.projectId }, select: { id: true } });
  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 });

  const conversation = await prisma.chatConversation.create({
    data: { projectId: project.id },
    select: conversationSummary,
  });
  const { _count, ...summary } = conversation;
  return NextResponse.json({ conversation: { ...summary, messageCount: _count.messages } }, { status: 201 });
}
