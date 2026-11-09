import type { Level, Opening, Wall } from './types';

/** Legacy plans may store an opening inside a wall or in a gap between wall segments. */
export function wallsForOpening(opening: Opening, level: Level): Wall[] {
  const [x0, y0, x1, y1] = opening.rect;
  const centerX = (x0 + x1) / 2;
  const centerY = (y0 + y1) / 2;
  const horizontal = x1 - x0 >= y1 - y0;
  const aligned = level.walls.filter((wall) => horizontal === (wall.x1 - wall.x0 >= wall.y1 - wall.y0)
    && (horizontal ? Math.min(y1, wall.y1) > Math.max(y0, wall.y0) : Math.min(x1, wall.x1) > Math.max(x0, wall.x0)));
  const containing = aligned.filter((wall) =>
    centerX >= wall.x0 && centerX <= wall.x1
    && centerY >= wall.y0 && centerY <= wall.y1);
  if (containing.length) return containing;
  return aligned.filter((wall) => horizontal
    ? Math.abs(wall.x1 - x0) < 2 || Math.abs(wall.x0 - x1) < 2
    : Math.abs(wall.y1 - y0) < 2 || Math.abs(wall.y0 - y1) < 2);
}

export function openingOnDemolishedWall(opening: Opening, level: Level) {
  const hosts = wallsForOpening(opening, level);
  return hosts.length > 0 && hosts.every((wall) => wall.renovation === 'demolished');
}

export function openingsForRenovatedLevel(level: Level) {
  return level.openings.filter((opening) => !openingOnDemolishedWall(opening, level));
}

export function wallStatusLabel(wall: Wall) {
  return wall.renovation === 'new' ? '新建' : wall.renovation === 'demolished' ? '拆除' : '保留';
}

export function renovationPatternId(prefix = '') {
  return `${prefix ? `${prefix}-` : ''}wall-demolition-hatch`;
}

export function renovationPatternDefs(prefix = '') {
  return `<pattern id="${renovationPatternId(prefix)}" patternUnits="userSpaceOnUse" width="240" height="240" patternTransform="rotate(45)"><rect width="240" height="240" fill="#fff1f0"/><path d="M0 0V240" stroke="#c94b45" stroke-width="44" opacity=".55"/></pattern>`;
}
