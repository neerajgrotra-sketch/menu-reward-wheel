'use client';
import React from 'react';

export type GameType =
  | 'wheel'
  | 'mystery_box'
  | 'scratch_card'
  | 'open_the_door'
  | string
  | null
  | undefined;

// ─── Wheel ────────────────────────────────────────────────────────────────────
// Same 8-segment conic-gradient palette as RewardWheel.tsx game screen.
// Used in: GameSelectionSection, RewardBanner, RewardWidget, TodaysRewardCard.

export function MiniPrizeWheel({ size = 24, boosted = false }: { size?: number; boosted?: boolean }) {
  const hubSize = Math.round(size * 0.42);
  const showLabel = size >= 40;
  const labelSize = Math.max(6, Math.round(size * 0.14));
  const pointerSize = Math.max(7, Math.round(size * 0.28));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-hidden="true">
      {/* Pointer */}
      <div
        className="absolute right-0 top-1/2 z-20 font-black leading-none text-stone-800"
        style={{
          fontSize: pointerSize,
          transform: 'translate(35%, -50%)',
        }}
      >
        ◀
      </div>

      {/* Wheel disc — animation applied via globals.css .spinbite-mini-wheel[/-fast] */}
      <div
        className={`${boosted ? 'spinbite-mini-wheel-fast' : 'spinbite-mini-wheel'} absolute inset-0 rounded-full border-2 border-white shadow-md`}
        style={{
          background:
            'conic-gradient(#FF6B00 0deg 45deg,#FFD166 45deg 90deg,#00C853 90deg 135deg,#E63939 135deg 180deg,#FF8A00 180deg 225deg,#FFF0C2 225deg 270deg,#2DD4BF 270deg 315deg,#F97316 315deg 360deg)',
        }}
      />

      {/* Centre hub */}
      <div className="absolute inset-0 z-10 flex items-center justify-center">
        <div
          className="flex items-center justify-center rounded-full bg-[#1F1F1F] text-white"
          style={{
            width: hubSize,
            height: hubSize,
            fontSize: labelSize,
            fontWeight: 900,
          }}
        >
          {showLabel ? 'SPIN' : null}
        </div>
      </div>
    </div>
  );
}

// ─── Mystery Box ──────────────────────────────────────────────────────────────
// CSS-only gift box — no emoji. Mirrors game screen gradient (#FF6B00 → #E63939).

export function MiniMysteryBox({ size = 24 }: { size?: number }) {
  return (
    <div
      className="spinbite-mini-mystery-box relative shrink-0 overflow-hidden rounded"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {/* Box body */}
      <div
        className="absolute bottom-0 left-0 right-0"
        style={{
          height: '60%',
          background: 'linear-gradient(135deg,#FF6B00,#E63939)',
          borderRadius: '0 0 4px 4px',
        }}
      />
      {/* Box lid */}
      <div
        className="absolute left-0 right-0 top-0"
        style={{
          height: '44%',
          background: 'linear-gradient(135deg,#FF8A00,#E63939)',
          borderRadius: '4px 4px 0 0',
        }}
      />
      {/* Horizontal ribbon */}
      <div
        className="absolute left-0 right-0"
        style={{ top: '40%', height: '11%', background: 'rgba(255,255,255,0.65)' }}
      />
      {/* Vertical ribbon */}
      <div
        className="absolute bottom-0 top-0"
        style={{ left: '44%', width: '12%', background: 'rgba(255,255,255,0.65)' }}
      />
      {/* Bow */}
      <div
        className="absolute"
        style={{
          top: '5%',
          left: '27%',
          width: '46%',
          height: '24%',
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.85)',
        }}
      />
    </div>
  );
}

// ─── Scratch Card ─────────────────────────────────────────────────────────────
// CSS-only card with scratch lines — no emoji. Matches game screen gradient.

export function MiniScratchCard({ size = 24 }: { size?: number }) {
  const height = Math.round(size * 0.7);
  return (
    <div
      className="spinbite-mini-scratch-card relative shrink-0 overflow-hidden rounded shadow"
      style={{
        width: size,
        height,
        background: 'linear-gradient(135deg,#fb923c 0%,#fbbf24 50%,#ef4444 100%)',
      }}
      aria-hidden="true"
    >
      {[28, 50, 72].map((pct) => (
        <div
          key={pct}
          className="absolute"
          style={{
            top: `${pct}%`,
            left: '8%',
            right: '8%',
            height: '10%',
            background: 'rgba(255,255,255,0.38)',
            borderRadius: 2,
          }}
        />
      ))}
    </div>
  );
}

// ─── Open The Door ────────────────────────────────────────────────────────────
// CSS-only door panel — no emoji.

export function MiniOpenDoor({ size = 24 }: { size?: number }) {
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded"
      style={{
        width: Math.round(size * 0.75),
        height: size,
        background: 'linear-gradient(168deg,#8a5c2e,#4a2c10)',
      }}
      aria-hidden="true"
    >
      {/* Door knob */}
      <div
        className="absolute rounded-full"
        style={{
          width: Math.max(3, Math.round(size * 0.12)),
          height: Math.max(3, Math.round(size * 0.12)),
          background: 'radial-gradient(circle at 35% 35%,#ecc84a,#7a5200)',
          right: '15%',
          top: '52%',
        }}
      />
      {/* Top panel inset */}
      <div
        className="absolute"
        style={{
          top: '8%', left: '12%', right: '12%', height: '35%',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 2,
        }}
      />
      {/* Bottom panel inset */}
      <div
        className="absolute"
        style={{
          top: '52%', left: '12%', right: '12%', bottom: '8%',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 2,
        }}
      />
    </div>
  );
}

// ─── Reward Reels ─────────────────────────────────────────────────────────────
// CSS-only slot machine reels — three coloured vertical columns, no emoji.

export function MiniRewardReels({ size = 24 }: { size?: number }) {
  const reelHeight = Math.round(size * 0.5);
  const reelWidth = Math.max(4, Math.round(size * 0.125));
  const gap = Math.max(1, Math.round(size * 0.025));
  const colors = ['#FF6B00', '#E63939', '#00C853', '#FFD166', '#2DD4BF', '#F97316'];
  return (
    <div
      className="flex shrink-0 items-center justify-center shadow-inner"
      style={{
        width: size,
        height: size,
        background: 'linear-gradient(135deg,#fde68a,#fed7aa,#fbbf24)',
        borderRadius: Math.round(size * 0.3),
      }}
      aria-hidden="true"
    >
      <div className="flex" style={{ gap }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex flex-col overflow-hidden rounded bg-white/60"
            style={{ width: reelWidth, height: reelHeight }}
          >
            {[0, 1, 2].map((j) => (
              <div key={j} className="flex-1" style={{ background: colors[(i * 3 + j) % 6] }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────

export type GameVisualData = {
  visual: React.ReactNode;
  headline: string;
  subline: string;
};

export function getGameVisual(gameType: GameType, size = 24, boosted = false): GameVisualData {
  switch (gameType) {
    case 'mystery_box':
      return {
        visual: <MiniMysteryBox size={size} />,
        headline: 'Open & Win',
        subline: 'Mystery reward today',
      };
    case 'scratch_card':
      return {
        visual: <MiniScratchCard size={size} />,
        headline: 'Scratch & Win',
        subline: 'Reveal your reward',
      };
    case 'open_the_door':
      return {
        visual: <MiniOpenDoor size={size} />,
        headline: 'Choose & Win',
        subline: 'Pick your door',
      };
    case 'reward_reels':
      return {
        visual: <MiniRewardReels size={size} />,
        headline: 'Pull & Win',
        subline: 'Lucky Reels today',
      };
    default: // 'wheel' and any unrecognised type
      return {
        visual: <MiniPrizeWheel size={size} boosted={boosted} />,
        headline: 'Spin & Win',
        subline: 'Rewards today',
      };
  }
}
