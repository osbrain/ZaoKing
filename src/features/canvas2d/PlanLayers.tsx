import React from 'react';
import { assetById, materialById } from '@/core/assets';
import { polyArea } from '@/core/geometry';
import { furnSVG, materialPatternId, roomFlooringPatternId } from '@/core/symbols2d';
import { instanceGeometry, instanceRef, type Asset, type ComponentInstance, type Level, type Material, type Vec2, type Wall } from '@/core/types';
import type { Selection } from '@/stores/editorStore';
import { centerInRect, type DragState, type WallEdit } from './planGeometry';

export const RoomsLayer = React.memo(function RoomsLayer({
  level,
  selection,
  onSelect,
  interactive,
}: {
  level: Level;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  interactive: boolean;
}) {
  return (
    <g>
      {level.rooms.map((room) => (
        <polygon
          key={room.id}
          points={room.poly.map((point) => point.join(',')).join(' ')}
          fill={`url(#${room.flooring ? roomFlooringPatternId(room.id) : materialPatternId(room.floorMaterialId)})`}
          className={interactive ? 'cursor-pointer' : ''}
          fillOpacity={selection?.kind === 'room' && selection.id === room.id ? 0.75 : 1}
          onPointerDown={interactive ? (event) => { event.stopPropagation(); onSelect({ kind: 'room', id: room.id }); } : undefined}
        />
      ))}
    </g>
  );
});

export const WallsLayer = React.memo(function WallsLayer({
  level,
  wallEdit,
  selection,
  onWallDown,
  interactive,
}: {
  level: Level;
  wallEdit: WallEdit | null;
  selection: Selection;
  onWallDown: (wall: Wall, event: React.PointerEvent) => void;
  interactive: boolean;
}) {
  const moving = level.walls.find((wall) => wall.id === wallEdit?.id);
  return (
    <g>
      {level.walls.map((wall) => {
        let { x0, y0, x1, y1 } = wall;
        if (wallEdit?.id === wall.id) {
          if (wallEdit.rect) [x0, y0, x1, y1] = wallEdit.rect;
          else { x0 += wallEdit.dx ?? 0; y0 += wallEdit.dy ?? 0; x1 += wallEdit.dx ?? 0; y1 += wallEdit.dy ?? 0; }
        }
        const fill = wall.color ?? (
          wall.kind === 'bearing' ? '#26241f'
          : wall.kind === 'low' ? '#e9e3d8'
          : wall.kind === 'exterior' ? '#8f897d'
          : '#a7a195');
        return (
          <rect
            key={wall.id}
            x={x0} y={y0} width={x1 - x0} height={y1 - y0}
            fill={fill}
            stroke={wall.kind === 'low' ? '#8f897d' : selection?.kind === 'wall' && selection.id === wall.id ? '#b5653a' : 'none'}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            className={interactive ? 'cursor-move' : ''}
            onPointerDown={interactive ? (event) => onWallDown(wall, event) : undefined}
          />
        );
      })}
      {wallEdit && !wallEdit.rect && wallEdit.dx !== undefined && moving &&
        level.openings
          .filter((opening) => centerInRect(opening.rect, moving))
          .map((opening) => (
            <rect key={opening.id} x={opening.rect[0] + wallEdit.dx!} y={opening.rect[1] + wallEdit.dy!}
              width={opening.rect[2] - opening.rect[0]} height={opening.rect[3] - opening.rect[1]}
              fill="rgba(226,218,203,.9)" pointerEvents="none" />
          ))}
    </g>
  );
});

export const OpeningOverlay = React.memo(function OpeningOverlay({
  level,
  wallEdit,
  selection,
  onSelect,
  interactive,
}: {
  level: Level;
  wallEdit: WallEdit | null;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  interactive: boolean;
}) {
  const moving = level.walls.find((wall) => wall.id === wallEdit?.id && !wallEdit.rect);
  return (
    <g>
      {level.openings.map((opening) => {
        let [x0, y0, x1, y1] = opening.rect;
        if (moving && centerInRect(opening.rect, moving)) { x0 += wallEdit!.dx!; y0 += wallEdit!.dy!; x1 += wallEdit!.dx!; y1 += wallEdit!.dy!; }
        const selected = selection?.kind === 'opening' && selection.id === opening.id;
        return (
          <rect
            key={opening.id}
            x={x0} y={y0} width={x1 - x0} height={y1 - y0}
            fill={selected ? 'rgba(181,101,58,.25)' : 'transparent'}
            stroke={selected ? '#b5653a' : 'none'}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            className={interactive ? 'cursor-pointer' : ''}
            pointerEvents={interactive ? 'all' : 'none'}
            onPointerDown={interactive ? (event) => { event.stopPropagation(); onSelect({ kind: 'opening', id: opening.id }); } : undefined}
          />
        );
      })}
    </g>
  );
});

const NOLABEL = ['plant', 'floorlamp', 'sidetable', 'barstool', 'beanbag', 'rug'];

export const FurnLayer = React.memo(function FurnLayer({
  assets,
  level,
  drag,
  onDown,
  interactive,
}: {
  assets?: readonly Asset[];
  level: Level;
  drag: DragState | null;
  onDown: (instance: ComponentInstance, event: React.PointerEvent) => void;
  interactive: boolean;
}) {
  return (
    <g>
      {level.instances.map((instance) => {
        const asset = assetById(instance.assetId, assets);
        const ref = instanceRef(instance, asset);
        const geometry = instanceGeometry(instance, asset);
        const transform = drag && drag.id === instance.id ? drag : instance.t;
        return (
          <g
            key={instance.id}
            transform={`translate(${transform.x} ${transform.y}) rotate(${transform.rot})`}
            className={interactive ? 'cursor-move' : ''}
            onPointerDown={interactive ? (event) => onDown(instance, event) : undefined}
          >
            <g dangerouslySetInnerHTML={{ __html: furnSVG(ref.type, ref.w, ref.d, ref.color, geometry) }} />
            {drag?.id === instance.id && drag.invalid && (
              <rect x={-ref.w / 2} y={-ref.d / 2} width={ref.w} height={ref.d} fill="rgba(190,45,45,.18)" stroke="#be2d2d" strokeWidth={3} vectorEffect="non-scaling-stroke" pointerEvents="none" />
            )}
            {Math.min(ref.w, ref.d) >= 380 && !NOLABEL.includes(ref.type) && (
              <text transform={`rotate(${-transform.rot})`} fontSize={Math.max(80, Math.min(170, Math.min(ref.w, ref.d) * 0.2))}
                textAnchor="middle" dominantBaseline="central" fill="#4a443c" opacity={0.8} pointerEvents="none">{ref.name}</text>
            )}
          </g>
        );
      })}
    </g>
  );
});

export const LabelsLayer = React.memo(function LabelsLayer({ level, materials }: { level: Level; materials?: readonly Material[] }) {
  const halo = { stroke: '#fbf9f4', strokeWidth: 45, paintOrder: 'stroke' as const };
  return (
    <g pointerEvents="none">
      {level.rooms
        .filter((room) => room.labelAt)
        .map((room) => (
          <g key={room.id}>
            <text x={room.labelAt![0]} y={room.labelAt![1]} fontSize={250} fontWeight={600} textAnchor="middle" fill="#2b2824" {...halo}>
              {room.name}
            </text>
            <text x={room.labelAt![0]} y={room.labelAt![1] + 260} fontSize={175} textAnchor="middle" fill="#7d7366" {...halo}>
              {polyArea(room.poly).toFixed(2)} m² · {materialById(room.floorMaterialId, materials).name}
            </text>
          </g>
        ))}
    </g>
  );
});

export const SelLayer = React.memo(function SelLayer({
  assets,
  level,
  selection,
  drag,
  scale,
  wallEdit,
  onRotate,
  onWallResize,
}: {
  assets?: readonly Asset[];
  level: Level;
  selection: Selection;
  drag: DragState | null;
  scale: number;
  wallEdit: WallEdit | null;
  onRotate: (instance: ComponentInstance, event: React.PointerEvent) => void;
  onWallResize: (wall: Wall, which: 'a' | 'b', event: React.PointerEvent) => void;
}) {
  if (selection?.kind === 'furn') {
    const instance = level.instances.find((item) => item.id === selection.id);
    if (!instance) return null;
    const asset = assetById(instance.assetId, assets);
    const ref = instanceRef(instance, asset);
    const transform = drag && drag.id === instance.id ? drag : instance.t;
    const invalid = drag?.id === instance.id && drag.invalid;
    const padding = 5 / scale;
    const rotateOffset = (26 / scale) * 2;
    const angle = (transform.rot * Math.PI) / 180;
    const cos = Math.abs(Math.cos(angle));
    const sin = Math.abs(Math.sin(angle));
    const halfHeight = (ref.w / 2) * sin + (ref.d / 2) * cos;
    return (
      <g pointerEvents="none">
        <g transform={`translate(${transform.x} ${transform.y}) rotate(${transform.rot})`}>
          <rect
            x={-ref.w / 2 - padding}
            y={-ref.d / 2 - padding}
            width={ref.w + 2 * padding}
            height={ref.d + 2 * padding}
            fill="none"
            stroke={invalid ? '#be2d2d' : '#b5653a'}
            strokeWidth={1.5}
            strokeDasharray="5 3"
            vectorEffect="non-scaling-stroke"
          />
          <line x1={0} y1={-ref.d / 2 - padding} x2={0} y2={-ref.d / 2 - rotateOffset} stroke="#b5653a" vectorEffect="non-scaling-stroke" />
          <circle
            cx={0}
            cy={-ref.d / 2 - rotateOffset}
            r={6 / scale}
            fill="#fff"
            stroke="#b5653a"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            pointerEvents="all"
            style={{ cursor: 'grab' }}
            onPointerDown={(event) => onRotate(instance, event)}
          >
            <title>拖动旋转（Shift 自由角度）</title>
          </circle>
        </g>
        <text
          x={transform.x}
          y={transform.y + halfHeight + 24 / scale}
          fontSize={12 / scale}
          textAnchor="middle"
          fontWeight={600}
          fill={invalid ? '#be2d2d' : '#b5653a'}
          stroke="#fff"
          strokeWidth={3 / scale}
          paintOrder="stroke"
        >
          {invalid ? `位置冲突 · ${ref.w} × ${ref.d}` : `${ref.w} × ${ref.d}`}
        </text>
      </g>
    );
  }
  if (selection?.kind === 'room') {
    const room = level.rooms.find((item) => item.id === selection.id);
    if (!room) return null;
    return (
      <polygon
        points={room.poly.map((point) => point.join(',')).join(' ')}
        fill="rgba(181,101,58,.08)"
        stroke="#b5653a"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
    );
  }
  if (selection?.kind === 'wall') {
    const wall = level.walls.find((item) => item.id === selection.id);
    if (!wall) return null;
    const horizontal = wall.x1 - wall.x0 >= wall.y1 - wall.y0;
    const [x0, y0, x1, y1] = wallEdit?.id === wall.id && wallEdit.rect ? wallEdit.rect : [wall.x0, wall.y0, wall.x1, wall.y1];
    const endpointA: Vec2 = horizontal ? [x0, (y0 + y1) / 2] : [(x0 + x1) / 2, y0];
    const endpointB: Vec2 = horizontal ? [x1, (y0 + y1) / 2] : [(x0 + x1) / 2, y1];
    const radius = 6 / scale;
    const endpoints: Array<['a' | 'b', Vec2]> = [['a', endpointA], ['b', endpointB]];
    return (
      <g>
        <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="none" stroke="#b5653a" strokeWidth={1.5} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" pointerEvents="none" />
        <text x={(x0 + x1) / 2} y={(y0 + y1) / 2 - 20 / scale} fontSize={12 / scale} textAnchor="middle" fontWeight={600} fill="#b5653a"
          stroke="#fff" strokeWidth={3 / scale} paintOrder="stroke" pointerEvents="none">
          {Math.round(Math.max(x1 - x0, y1 - y0))} mm
        </text>
        {endpoints.map(([which, [x, y]]) => (
          <circle
            key={which}
            cx={x} cy={y} r={radius} fill="#fff" stroke="#b5653a" strokeWidth={1.5} vectorEffect="non-scaling-stroke"
            style={{ cursor: 'move' }}
            onPointerDown={(event) => onWallResize(wall, which, event)}
          >
            <title>拖动调整墙段长度</title>
          </circle>
        ))}
      </g>
    );
  }
  if (selection?.kind === 'opening') {
    const opening = level.openings.find((item) => item.id === selection.id);
    if (!opening) return null;
    return (
      <rect
        x={opening.rect[0]} y={opening.rect[1]} width={opening.rect[2] - opening.rect[0]} height={opening.rect[3] - opening.rect[1]}
        fill="none" stroke="#b5653a" strokeWidth={1.5} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" pointerEvents="none"
      />
    );
  }
  return null;
});
