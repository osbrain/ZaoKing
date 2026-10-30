'use client';

import { useEffect, useRef, useState } from 'react';
import {
  draftToDocument,
  FloorPlanPixelDraftSchema,
  pixelDraftToMmDraft,
  type FloorPlanPixelDraft,
  type ImportReport,
} from '@/core/floorplanImport';
import type { SceneDocument, Vec2 } from '@/core/types';
import { prepareVisionImage } from './prepareVisionImage';

interface Props {
  projectName: string;
  visionEnabled: boolean;
  onDocumentChange: (document: SceneDocument | null, report: ImportReport | null, error: string | null) => void;
}

export default function FloorplanImportPanel({ projectName, visionEnabled, onDocumentChange }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [draft, setDraft] = useState<FloorPlanPixelDraft | null>(null);
  const [points, setPoints] = useState<Vec2[]>([]);
  const [lengthMm, setLengthMm] = useState('');
  const [calibrating, setCalibrating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onDocumentChangeRef = useRef(onDocumentChange);
  onDocumentChangeRef.current = onDocumentChange;

  useEffect(() => {
    if (!file) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!draft || !imageSize || points.length !== 2 || !lengthMm.trim()) {
      onDocumentChangeRef.current(null, null, null);
      return;
    }
    try {
      const mmDraft = pixelDraftToMmDraft(draft, {
        a: points[0], b: points[1], lengthMm: Number(lengthMm),
      });
      const result = draftToDocument(mmDraft, projectName || '截图户型');
      const lowConfidence = [
        ...draft.walls.map((item) => item.confidence),
        ...(draft.openings ?? []).map((item) => item.confidence),
        ...(draft.rooms ?? []).map((item) => item.confidence),
      ].filter((value) => value !== undefined && value < 0.65).length;
      const report = {
        ...result.report,
        warnings: lowConfidence
          ? [...result.report.warnings, `${lowConfidence} 个识别对象置信度较低，请在编辑器中重点核对`]
          : result.report.warnings,
      };
      onDocumentChangeRef.current(result.doc, report, result.doc ? null : report.warnings.at(-1) ?? '户型无法生成');
    } catch (cause) {
      onDocumentChangeRef.current(null, null, cause instanceof Error ? cause.message : '比例标定无效');
    }
  }, [draft, imageSize, points, lengthMm, projectName]);

  const recognize = async () => {
    if (!file || !imageSize) return;
    setBusy(true);
    setError(null);
    setDraft(null);
    setPoints([]);
    onDocumentChangeRef.current(null, null, null);
    try {
      const form = new FormData();
      const prepared = await prepareVisionImage(file);
      form.set('image', prepared.file);
      form.set('widthPx', String(prepared.widthPx));
      form.set('heightPx', String(prepared.heightPx));
      form.set('sourceWidthPx', String(imageSize.width));
      form.set('sourceHeightPx', String(imageSize.height));
      const response = await fetch('/api/floorplan-import', { method: 'POST', body: form });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? '户型识别失败');
      const parsed = FloorPlanPixelDraftSchema.safeParse(payload.draft);
      if (!parsed.success) throw new Error('识别结果格式无效，请换一张图片重试');
      setDraft(parsed.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '户型识别失败');
    } finally {
      setBusy(false);
    }
  };

  const captureCalibrationPoint = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!calibrating || !imageSize) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const point: Vec2 = [
      ((event.clientX - rect.left) / rect.width) * imageSize.width,
      ((event.clientY - rect.top) / rect.height) * imageSize.height,
    ];
    setPoints((current) => current.length >= 2 ? [point] : [...current, point]);
    if (points.length >= 1) setCalibrating(false);
  };

  const editDraft = (edit: (current: FloorPlanPixelDraft) => FloorPlanPixelDraft) => {
    setDraft((current) => current ? FloorPlanPixelDraftSchema.parse(edit(structuredClone(current))) : current);
  };

  return (
    <div className="mt-4 space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-ink">从户型截图生成初始平面</p>
          <p className="mt-0.5 text-[11px] text-zinc-500">支持清晰的平面图。默认使用百炼 Qwen3-VL-Plus；识别后需用一段已知长度校准比例。</p>
        </div>
        <label className="cursor-pointer rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs hover:bg-zinc-100">
          选择图片
          <input
            type="file" accept="image/png,image/jpeg,image/webp" className="sr-only"
            onChange={(event) => {
              const next = event.target.files?.[0] ?? null;
              setFile(next); setDraft(null); setPoints([]); setImageSize(null); setError(null);
              onDocumentChangeRef.current(null, null, null);
            }}
          />
        </label>
      </div>

      {previewUrl && (
        <div className="space-y-3">
          <div className="relative mx-auto w-full max-w-[680px] overflow-hidden border border-zinc-300 bg-white" style={imageSize ? { aspectRatio: `${imageSize.width}/${imageSize.height}` } : undefined}>
            <img
              src={previewUrl} alt="待识别的户型截图" className="absolute inset-0 h-full w-full"
              onLoad={(event) => setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
            />
            {draft && imageSize && (
              <svg viewBox={`0 0 ${imageSize.width} ${imageSize.height}`} preserveAspectRatio="none" className={`absolute inset-0 h-full w-full ${calibrating ? 'cursor-crosshair' : ''}`} onClick={captureCalibrationPoint}>
                {(draft.rooms ?? []).map((room, index) => (
                  <polygon key={`r${index}`} points={room.poly.map(([x, y]) => `${x},${y}`).join(' ')} fill="#62a58a" fillOpacity="0.16" stroke="#26795d" strokeWidth={Math.max(imageSize.width / 500, 2)} />
                ))}
                {draft.walls.map((wall, index) => (
                  <line key={`w${index}`} x1={wall.x0} y1={wall.y0} x2={wall.x1} y2={wall.y1}
                    stroke={wall.confidence !== undefined && wall.confidence < 0.65 ? '#dc5656' : wall.kind === 'bearing' ? '#343b45' : '#d27655'}
                    strokeWidth={Math.max(imageSize.width / 350, 3)} strokeLinecap="round" />
                ))}
                {(draft.openings ?? []).map((opening, index) => (
                  <rect key={`o${index}`} x={opening.rect[0]} y={opening.rect[1]} width={opening.rect[2] - opening.rect[0]} height={opening.rect[3] - opening.rect[1]}
                    fill="#77a9d0" fillOpacity="0.65" stroke="#37739b" strokeWidth={Math.max(imageSize.width / 700, 2)} />
                ))}
                {points.map(([x, y], index) => <circle key={`p${index}`} cx={x} cy={y} r={Math.max(imageSize.width / 100, 5)} fill={index ? '#20764f' : '#dc5656'} stroke="white" strokeWidth={3} />)}
              </svg>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <button onClick={recognize} disabled={!imageSize || busy || !visionEnabled} className="rounded-md bg-ink px-3 py-2 text-xs font-medium text-white disabled:opacity-40">
              {busy ? '识别中（可能需要 1–3 分钟）…' : draft ? '重新识别' : 'AI 识别户型'}
            </button>
            {draft && (
              <>
                <button onClick={() => { setPoints([]); setCalibrating(true); }} className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs hover:bg-zinc-100">
                  {calibrating ? `点击图片选第 ${points.length + 1} 个端点` : points.length === 2 ? '重新标定比例' : '标定比例'}
                </button>
                <label className="flex flex-col gap-1 text-[10px] text-zinc-500">
                  两点间的实际长度 (mm)
                  <input value={lengthMm} onChange={(event) => setLengthMm(event.target.value)} inputMode="numeric" placeholder="例如 3000"
                    className="w-36 rounded-md border border-zinc-300 bg-white px-2 py-2 text-xs text-ink outline-none focus:border-accent" />
                </label>
                <span className="pb-2 text-[11px] text-zinc-500">
                  {points.length === 2 ? `标定线约 ${Math.round(Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1]))} px` : '先点“标定比例”，再点一段已知尺寸的两个端点'}
                </span>
              </>
            )}
          </div>

          {draft && (
            <details className="rounded-md border border-zinc-200 bg-white">
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium">检查并修正识别项：{draft.walls.length} 段墙、{draft.openings?.length ?? 0} 个门窗、{draft.rooms?.length ?? 0} 个房间</summary>
              <div className="max-h-52 space-y-1 overflow-y-auto border-t border-zinc-100 p-2">
                {draft.walls.map((wall, index) => (
                  <div key={`w${index}`} className="flex items-center gap-2 text-[11px]">
                    <span className="w-12 shrink-0 text-zinc-500">墙 {index + 1}</span>
                    <select value={wall.kind ?? 'partition'} onChange={(event) => editDraft((current) => { current.walls[index].kind = event.target.value as typeof wall.kind; return current; })} className="rounded border border-zinc-200 px-1.5 py-1">
                      <option value="exterior">外墙</option><option value="partition">隔墙</option><option value="bearing">承重墙</option><option value="low">矮墙</option>
                    </select>
                    <span className="flex-1 text-zinc-400">置信度 {wall.confidence === undefined ? '未提供' : `${Math.round(wall.confidence * 100)}%`}</span>
                    <button disabled={draft.walls.length === 1} onClick={() => editDraft((current) => { current.walls.splice(index, 1); return current; })} className="px-2 py-1 text-red-600 disabled:opacity-35">移除</button>
                  </div>
                ))}
                {(draft.rooms ?? []).map((room, index) => (
                  <div key={`r${index}`} className="flex items-center gap-2 text-[11px]">
                    <span className="w-12 shrink-0 text-zinc-500">房间 {index + 1}</span>
                    <input value={room.name} onChange={(event) => editDraft((current) => { current.rooms![index].name = event.target.value; return current; })} className="min-w-0 flex-1 rounded border border-zinc-200 px-2 py-1" />
                    <span className="text-zinc-400">{room.confidence === undefined ? '' : `${Math.round(room.confidence * 100)}%`}</span>
                    <button onClick={() => editDraft((current) => { current.rooms!.splice(index, 1); return current; })} className="px-2 py-1 text-red-600">移除</button>
                  </div>
                ))}
                {(draft.openings ?? []).map((opening, index) => (
                  <div key={`o${index}`} className="flex items-center gap-2 text-[11px]">
                    <span className="w-12 shrink-0 text-zinc-500">门窗 {index + 1}</span>
                    <select value={opening.kind} onChange={(event) => editDraft((current) => { current.openings![index].kind = event.target.value as typeof opening.kind; return current; })} className="rounded border border-zinc-200 px-1.5 py-1">
                      <option value="door">门</option><option value="entry">入户门</option><option value="window">窗</option><option value="sliding">推拉门</option>
                    </select>
                    <span className="flex-1 text-zinc-400">{opening.confidence === undefined ? '' : `${Math.round(opening.confidence * 100)}%`}</span>
                    <button onClick={() => editDraft((current) => { current.openings!.splice(index, 1); return current; })} className="px-2 py-1 text-red-600">移除</button>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      {!visionEnabled && <p className="text-xs text-amber-800">截图识别尚未启用，请在环境变量中设置 VISION_API_KEY（百炼 API Key）。</p>}
      {!error && draft && <p className="text-[11px] text-zinc-500">墙线、房间和门窗叠加在原图上。确认创建后仍可在 2D 编辑器中继续调整。</p>}
    </div>
  );
}
