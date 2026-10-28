import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { buildBlankDocument, buildSeedDocument } from '@/core/seed';

export const dynamic = 'force-dynamic';

export async function GET() {
  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      designs: { orderBy: { updatedAt: 'desc' }, take: 1, select: { updatedAt: true } },
      _count: { select: { designs: true } },
    },
  });
  return NextResponse.json({
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      updatedAt: new Date(Math.max(p.updatedAt.getTime(), p.designs[0]?.updatedAt.getTime() ?? 0)).toISOString(),
      designCount: p._count.designs,
    })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    aiMode: process.env.OPENAI_API_KEY ? 'llm' : 'rules',
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}) as { name?: string; template?: string });
  const template = body.template === 'blank' ? 'blank' : 'sample';
  const doc =
    template === 'blank'
      ? buildBlankDocument(body.name?.trim() || '我的户型方案')
      : buildSeedDocument(body.name);
  const project = await prisma.project.create({
    data: {
      name: doc.meta.name,
      designs: { create: { document: JSON.stringify(doc) } },
    },
    include: { designs: { orderBy: { updatedAt: 'desc' }, take: 1 } },
  });
  return NextResponse.json({ project: { id: project.id, name: project.name, updatedAt: project.updatedAt.toISOString() } });
}
