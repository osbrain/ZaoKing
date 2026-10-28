'use client';

import EditorShell from '@/features/editor/EditorShell';

export default function EditorPage({ params }: { params: { projectId: string } }) {
  return <EditorShell projectId={params.projectId} />;
}
