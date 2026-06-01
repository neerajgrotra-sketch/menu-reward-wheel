'use client';

import type { GameBuilderPreviewProps } from '@/lib/games/types';

export default function OpenTheDoorBuilderPreview({ rewards, rotation }: GameBuilderPreviewProps) {
  console.log('OpenTheDoorPreview Rendered');
  return (
    <div className="mx-auto mt-5 max-w-4xl">
      <div className="grid gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((door) => (
          <div
            key={door}
            className="group relative overflow-hidden rounded-[2rem] border-2 border-slate-200 bg-slate-950/95 p-6 text-center text-white shadow-2xl shadow-slate-900/20 transition duration-300 hover:-translate-y-1 hover:bg-slate-900"
          >
            <div className="relative mx-auto mb-5 h-44 w-full overflow-hidden rounded-[1.7rem] bg-gradient-to-b from-slate-800 via-slate-900 to-slate-950 shadow-inner">
              <div className="absolute inset-x-8 top-6 h-24 rounded-[1.35rem] bg-gradient-to-b from-slate-900 to-slate-800 shadow-[0_0_20px_rgba(245,158,11,0.18)]" />
              <div className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-700 ring-2 ring-slate-400 shadow-lg" />
              <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-amber-400/35 to-transparent" />
            </div>
            <div className="text-sm font-black uppercase tracking-[0.24em] text-amber-300">Door {door}</div>
            <p className="mt-2 text-xs leading-5 text-slate-400">Tap to open and reveal your surprise reward.</p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-[1.75rem] border border-slate-200 bg-slate-50 p-4 text-left text-sm text-slate-700 shadow-sm">
        <p className="font-black uppercase tracking-[0.18em] text-slate-900">Open The Door Preview</p>
        <p className="mt-2">This preview uses the same door-driven encounter style as the live runtime.</p>
      </div>
    </div>
  );
}
