'use client';

import type { RefObject } from 'react';

export default function OrientationCompass({ arrowRef }: { arrowRef?: RefObject<SVGGElement> }) {
  return (
    <div role="img" aria-label="户型北向标记" title="北向" className="pointer-events-none grid h-10 w-10 place-items-center rounded-full border border-zinc-200 bg-white/95 shadow-sm">
      <svg viewBox="0 0 40 40" className="h-8 w-8" aria-hidden="true">
        <text x="20" y="8" textAnchor="middle" fontSize="7" fontWeight="700" fill="#57534e">北</text>
        <g ref={arrowRef} transform="rotate(0 20 20)">
          <path d="M20 11 25 24 20 21 15 24Z" fill="#b5653a" />
          <path d="M20 21 25 24 20 31 15 24Z" fill="#d6d3d1" />
          <circle cx="20" cy="21" r="1.6" fill="#57534e" />
        </g>
      </svg>
    </div>
  );
}
