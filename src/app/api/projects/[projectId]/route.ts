import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { SceneDocumentSchema } from '@/core/sceneSchema';

const RenameProjectSchema = z.object({
  name: z.string().trim().min(1).max(200),
}).strict();

export async function PATCH(req: Request, { params }: { params: { projectId: string } }) {
  const body = await req.json().catch(() => null);
  const parsed = RenameProjectSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: '项目名称不能为空，且不能超过 200 个字符' }, { status: 400 });

  const project = await prisma.$transaction(async (tx) => {
    const existing = await tx.project.findUnique({ where: { id: params.projectId }, select: { id: true } });
    if (!existing) return null;

    const latestDesign = await tx.design.findFirst({
      where: { projectId: params.projectId },
      orderBy: { updatedAt: 'desc' },
    });
    if (latestDesign) {
      try {
        const parsedDocument = SceneDocumentSchema.safeParse(JSON.parse(latestDesign.document));
        if (parsedDocument.success) {
          await tx.design.update({
            where: { id: latestDesign.id },
            data: {
              document: JSON.stringify({ ...parsedDocument.data, meta: { ...parsedDocument.data.meta, name: parsed.data.name } }),
              version: { increment: 1 },
            },
          });
        }
      } catch {
        // Keep project management available if a legacy design document is malformed.
      }
    }

    return tx.project.update({
      where: { id: params.projectId },
      data: { name: parsed.data.name },
      select: { id: true, name: true, updatedAt: true },
    });
  });
  if (!project) return NextResponse.json({ error: '项目不存在或已删除' }, { status: 404 });

  return NextResponse.json({ project: { ...project, updatedAt: project.updatedAt.toISOString() } });
}

export async function DELETE(_req: Request, { params }: { params: { projectId: string } }) {
  const deleted = await prisma.project.deleteMany({ where: { id: params.projectId } });
  if (!deleted.count) return NextResponse.json({ error: '项目不存在或已删除' }, { status: 404 });
  return NextResponse.json({ success: true });
}
