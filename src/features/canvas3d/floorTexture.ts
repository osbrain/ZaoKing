import * as THREE from 'three';
import type { FlooringSpec, Material } from '@/core/types';

/** Parameterized preview: texture UVs and the plan SVG both use positive plan X/Y. */
export function createFloorTexture(material: Material, flooring: FlooringSpec, anisotropy: number): THREE.CanvasTexture {
  const staggered = flooring.layout === 'brick';
  const columns = staggered ? 2 : 1;
  const rows = staggered ? 2 : 1;
  const periodX = flooring.tileMm[0] * columns / 1000;
  const periodY = flooring.tileMm[1] * rows / 1000;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = Math.max(128, Math.min(2048, Math.round(canvas.width * periodY / periodX)));
  const context = canvas.getContext('2d')!;
  const { width, height } = canvas;
  context.fillStyle = material.sw;
  context.fillRect(0, 0, width, height);

  // Grain stays within the finish layer; configured joints are always drawn last.
  if (material.render?.pattern === 'wood' || material.id === 'wood' || material.id === 'walnut') {
    context.fillStyle = 'rgba(40,20,0,0.08)';
    for (let line = 0; line < 80; line++) {
      context.fillRect((line * 137) % width, (line * 29) % height, width / 3, 1);
    }
  }

  if (flooring.groutMm > 0) {
    context.fillStyle = flooring.groutColor ?? material.render?.groutColor ?? '#c5beb3';
    const gx = flooring.groutMm / (periodX * 1000) * width;
    const gy = flooring.groutMm / (periodY * 1000) * height;
    const tileWidth = width / columns;
    const tileHeight = height / rows;
    for (let row = 0; row <= rows; row++) {
      context.fillRect(0, row * tileHeight - gy / 2, width, gy);
      if (row === rows) continue;
      const offset = staggered && row % 2 ? tileWidth / 2 : 0;
      for (let column = 0; column <= columns; column++) {
        context.fillRect(column * tileWidth + offset - gx / 2, row * tileHeight, gx, tileHeight);
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.flipY = false;
  texture.repeat.set(1 / periodX, 1 / periodY);
  texture.rotation = flooring.layout === 'diagonal' ? Math.PI / 4 : 0;
  const [ox, oy] = flooring.origin.map(value => value / 1000);
  const cos = Math.cos(texture.rotation), sin = Math.sin(texture.rotation);
  // Inverse of SVG translate(origin) rotate(angle): subtract origin, then rotate back.
  texture.offset.set(-(ox * cos + oy * sin) / periodX, (ox * sin - oy * cos) / periodY);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}
