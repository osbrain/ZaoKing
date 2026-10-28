import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { formatSceneIssues, SceneDocumentSchema } from '@/core/sceneSchema';

export const dynamic = 'force-dynamic';

/** GET /api/designs?projectId= → 最新设计文档 */
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  const design = await prisma.design.findFirst({
    where: { projectId },
    orderBy: { updatedAt: 'desc' },
  });
  if (!design) return NextResponse.json({ error: 'not found' }, { status: 404 });
  let storedDocument: unknown;
  try {
    storedDocument = JSON.parse(design.document);
  } catch {
    return NextResponse.json({ error: 'stored design document is invalid JSON' }, { status: 500 });
  }
  const parsedDocument = SceneDocumentSchema.safeParse(storedDocument);
  if (!parsedDocument.success) {
    return NextResponse.json({
      error: 'stored design document is invalid',
      issues: formatSceneIssues(parsedDocument.error),
    }, { status: 500 });
  }
  return NextResponse.json({
    id: design.id,
    version: design.version,
    document: parsedDocument.data,
  });
}

/** PUT /api/designs —— 乐观锁保存整个 SceneDocument */
export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const { projectId, document, version } = body as {
    projectId: string;
    document: unknown;
    version: number;
  };
  if (typeof projectId !== 'string' || !projectId || !document || !Number.isSafeInteger(version) || version < 1) {
    return NextResponse.json({ error: 'projectId / document / version required' }, { status: 400 });
  }
  const parsedDocument = SceneDocumentSchema.safeParse(document);
  if (!parsedDocument.success) {
    return NextResponse.json({
      error: 'invalid scene document',
      issues: formatSceneIssues(parsedDocument.error),
    }, { status: 400 });
  }
  const latest = await prisma.design.findFirst({
    where: { projectId },
    orderBy: { updatedAt: 'desc' },
  });
  if (!latest) return NextResponse.json({ error: 'not found' }, { status: 404 });
  // Compare and swap in the database: a separate read/check cannot lock a version.
  const saved = await prisma.$transaction(async (tx) => {
    const result = await tx.design.updateMany({
      where: { id: latest.id, version },
      data: { document: JSON.stringify(parsedDocument.data), version: { increment: 1 } },
    });
    if (!result.count) return false;
    await tx.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } });
    return true;
  });
  if (!saved) {
    const current = await prisma.design.findUnique({ where: { id: latest.id }, select: { version: true } });
    return NextResponse.json({ conflict: true, serverVersion: current?.version }, { status: 409 });
  }
  return NextResponse.json({ version: version + 1 });
}
