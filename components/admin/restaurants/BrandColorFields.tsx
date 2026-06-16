'use client';

// ─── WCAG contrast utilities ──────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3,6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1];
  if (h.length === 3) {
    return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
  }
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function linearize(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

// Returns contrast ratio of hex color against white background.
// 4.5:1 is WCAG AA for normal text (brand colors used as button bg with white text).
export function contrastVsWhite(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const l = luminance(...rgb);
  return (1.05) / (l + 0.05); // white luminance = 1.0
}

function ContrastWarning({ hex, label }: { hex: string; label: string }) {
  const ratio = contrastVsWhite(hex);
  if (ratio >= 4.5) return null;
  return (
    <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
      {label} colour has low contrast — white text may be hard to read on this background.
    </p>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  brandColor: string | null | undefined;
  secondaryColor: string;
  accentColor: string;
  onSecondaryChange: (v: string) => void;
  onAccentChange: (v: string) => void;
};

export function BrandColorFields({ brandColor, secondaryColor, accentColor, onSecondaryChange, onAccentChange }: Props) {
  const primary = brandColor || '#f97316';

  return (
    <div>
      <p className="text-xs font-black uppercase tracking-wide text-stone-500">Brand Colors</p>
      <div className="mt-3 grid grid-cols-3 gap-3">

        {/* Primary — read-only */}
        <div className="rounded-2xl border border-stone-100 p-3">
          <p className="text-xs font-bold text-stone-400">Primary</p>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl border border-stone-200" style={{ background: primary }} />
            <p className="text-xs font-bold text-stone-600">{primary}</p>
          </div>
          <p className="mt-1 text-[10px] text-stone-400">Set in restaurant setup</p>
        </div>

        {/* Secondary — overridable */}
        <div className="rounded-2xl border border-stone-100 p-3">
          <p className="text-xs font-bold text-stone-400">Secondary</p>
          {secondaryColor ? (
            <>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="color"
                  value={secondaryColor}
                  onChange={(e) => onSecondaryChange(e.target.value)}
                  className="h-8 w-8 cursor-pointer rounded-xl border border-stone-200 p-0.5"
                />
                <p className="text-xs font-bold text-stone-600">{secondaryColor}</p>
              </div>
              <button
                type="button"
                onClick={() => onSecondaryChange('')}
                className="mt-1 text-[10px] font-bold text-stone-400 hover:text-red-500"
              >
                Reset to Auto
              </button>
            </>
          ) : (
            <>
              <p className="mt-2 text-xs text-stone-400 italic">Auto</p>
              <button
                type="button"
                onClick={() => onSecondaryChange('#000000')}
                className="mt-1 text-[10px] font-bold text-[#FF6B00] hover:underline"
              >
                Override
              </button>
            </>
          )}
        </div>

        {/* Accent — overridable */}
        <div className="rounded-2xl border border-stone-100 p-3">
          <p className="text-xs font-bold text-stone-400">Accent</p>
          {accentColor ? (
            <>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => onAccentChange(e.target.value)}
                  className="h-8 w-8 cursor-pointer rounded-xl border border-stone-200 p-0.5"
                />
                <p className="text-xs font-bold text-stone-600">{accentColor}</p>
              </div>
              <button
                type="button"
                onClick={() => onAccentChange('')}
                className="mt-1 text-[10px] font-bold text-stone-400 hover:text-red-500"
              >
                Reset to Auto
              </button>
            </>
          ) : (
            <>
              <p className="mt-2 text-xs text-stone-400 italic">Auto</p>
              <button
                type="button"
                onClick={() => onAccentChange('#000000')}
                className="mt-1 text-[10px] font-bold text-[#FF6B00] hover:underline"
              >
                Override
              </button>
            </>
          )}
        </div>
      </div>

      {/* Contrast warnings — only shown for actively-set colors */}
      {secondaryColor && <ContrastWarning hex={secondaryColor} label="Secondary" />}
      {accentColor && <ContrastWarning hex={accentColor} label="Accent" />}
      <ContrastWarning hex={primary} label="Primary" />
    </div>
  );
}
