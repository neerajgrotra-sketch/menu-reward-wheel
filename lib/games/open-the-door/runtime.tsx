'use client';

import { useEffect, useRef, useState } from 'react';
import type { GamePlayProps } from '@/lib/games/types';

type DoorPhase = 'idle' | 'selected' | 'revealing' | 'coupon';

type DoorState = {
  phase: DoorPhase;
  selectedDoor: number | null;
};

const defaultDoorState: DoorState = {
  phase: 'idle',
  selectedDoor: null,
};

export default function OpenTheDoorRuntime({ canPlay, playing, playsRemaining, onPlay, winningReward }: GamePlayProps) {
  const revealTimerRef = useRef<number | null>(null);
  const couponTimerRef = useRef<number | null>(null);
  const resetTimerRef = useRef<number | null>(null);
  const [state, setState] = useState<DoorState>(defaultDoorState);

  useEffect(() => {
    return () => {
      if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current);
      if (couponTimerRef.current) window.clearTimeout(couponTimerRef.current);
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (state.phase !== 'selected') return;

    onPlay();

    // 2000ms: matches 1s centering + 1s anticipation shake before door opens
    revealTimerRef.current = window.setTimeout(() => {
      setState((current) => ({ ...current, phase: 'revealing' }));
    }, 2000);

    // 5000ms: matches resultDelayMs in contract; ~3s of prize visibility
    couponTimerRef.current = window.setTimeout(() => {
      setState((current) => ({ ...current, phase: 'coupon' }));
    }, 5000);

    resetTimerRef.current = window.setTimeout(() => {
      setState(defaultDoorState);
    }, 8000);
  }, [state.phase, onPlay]);

  function pickDoor(index: number) {
    if (!canPlay || playing || state.phase !== 'idle') return;
    setState({ phase: 'selected', selectedDoor: index });
  }

  return (
    <section className="mt-4 w-full">
      <style jsx>{`

        /* ── Keyframes ─────────────────────────────────────────────── */

        @keyframes doorSway {
          0%, 100% { transform: perspective(1000px) rotateZ(-0.8deg) translateY(0px); }
          50%       { transform: perspective(1000px) rotateZ(0.8deg)  translateY(-4px); }
        }

        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 0 0   rgba(245, 158, 11, 0.30); }
          50%       { box-shadow: 0 0 0 14px rgba(245, 158, 11, 0.12); }
        }

        /* Rattles the door panel only; 1s delay so centering finishes first */
        @keyframes anticipationShake {
          0%, 100% { transform: translateX(0)   rotateZ(0deg); }
          15%       { transform: translateX(-4px) rotateZ(-0.6deg); }
          35%       { transform: translateX(4px)  rotateZ(0.6deg); }
          55%       { transform: translateX(-3px) rotateZ(-0.4deg); }
          75%       { transform: translateX(3px)  rotateZ(0.4deg); }
          90%       { transform: translateX(0)   rotateZ(0deg); }
        }

        /* Swings to -80deg — front face stays visible; slight overshoot for weight.
           At -80deg the panel projects only ~40px wide, clearing the prize area. */
        @keyframes doorSwingOpen {
          0%   { transform: perspective(1200px) rotateY(0deg); }
          75%  { transform: perspective(1200px) rotateY(-84deg); }
          100% { transform: perspective(1200px) rotateY(-80deg); }
        }

        @keyframes prizeReveal {
          0%   { opacity: 0; transform: translateY(8px) scale(0.88); }
          100% { opacity: 1; transform: translateY(0)   scale(1); }
        }

        /* ── Container ─────────────────────────────────────────────── */

        .door-container {
          position: relative;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.75rem;
          width: 100%;
          perspective: 1000px;
        }

        /* ── Door button (outer wrapper) ───────────────────────────── */

        .door-button {
          position: relative;
          aspect-ratio: 3 / 4;
          width: 100%;
          min-width: 0;
          border: none;
          background: none;
          padding: 0;
          cursor: pointer;
          outline: none;
          /* No transform-style: preserve-3d — three layers stack by z-index */
          transition: transform 0.3s ease, opacity 0.3s ease, filter 0.3s ease;
        }

        .door-button:disabled {
          cursor: not-allowed;
        }

        .door-button.idle {
          animation: doorSway 3.2s ease-in-out infinite;
        }

        .door-button.idle::before {
          content: '';
          position: absolute;
          inset: -10px;
          border-radius: 1.5rem;
          background: radial-gradient(circle at 30% 30%, rgba(245, 158, 11, 0.24), transparent 60%);
          opacity: 0;
          animation: pulseGlow 2.6s ease-in-out infinite;
          pointer-events: none;
          z-index: -1;
        }

        .door-button.hidden {
          pointer-events: none;
          opacity: 0;
          transform: scale(0.8) translateY(12px);
        }

        .door-button.selected,
        .door-button.revealing,
        .door-button.coupon {
          grid-column: 1 / -1;
          justify-self: center;
          width: min(72vw, 18rem);
          z-index: 20;
        }

        .door-button.selected {
          cursor: default;
          /* amber halo builds during anticipation */
          filter: drop-shadow(0 0 14px rgba(245, 158, 11, 0.30));
        }

        /* ── Layer 1: Room interior (back — z-index 1) ─────────────── */

        .door-interior {
          position: absolute;
          inset: 0;
          z-index: 1;
          /* border-radius matches frame inner edge (0.875rem outer - 11px border) */
          border-radius: 3px;
          overflow: hidden;
          background: #1a0a02;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 1.25rem;
        }

        .interior-light {
          position: absolute;
          inset: 0;
          background: radial-gradient(
            ellipse at 50% 100%,
            rgba(255, 195, 70, 0.55) 0%,
            rgba(255, 140, 30, 0.22) 40%,
            transparent 65%
          );
          opacity: 0.2;
          transition: opacity 0.8s ease;
          pointer-events: none;
        }

        .door-button.selected .interior-light {
          opacity: 0.45;
        }

        .door-button.revealing .interior-light,
        .door-button.coupon   .interior-light {
          opacity: 1;
        }

        /* Shift prize into the open half of the doorway.
           The door panel (hinged left) projects ~40px at -80deg;
           30% padding-left (~86px) keeps the prize fully clear of it. */
        .door-button.revealing .door-interior,
        .door-button.coupon   .door-interior {
          padding-left: 30%;
        }

        .prize-content {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.4rem;
          animation: prizeReveal 0.65s ease-out both;
        }

        .prize-emoji {
          font-size: 2.4rem;
          line-height: 1;
          filter: drop-shadow(0 2px 10px rgba(255, 175, 35, 0.65));
        }

        .prize-name {
          font-size: 0.9rem;
          font-weight: 900;
          color: #fef3c7;
          text-align: center;
          line-height: 1.2;
          text-shadow: 0 1px 4px rgba(0, 0, 0, 0.7);
          padding: 0 0.25rem;
        }

        .prize-detail {
          font-size: 0.62rem;
          font-weight: 700;
          color: #fde68a;
          text-align: center;
          line-height: 1.3;
          text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
          padding: 0 0.25rem;
        }

        /* ── Layer 2: Door panel (middle — z-index 2, rotates and stays visible) */

        .door-panel {
          position: absolute;
          inset: 0;
          z-index: 2;
          /* Rectangular — the frame provides the visual rounding */
          border-radius: 0;
          overflow: hidden;
          transform-origin: left center;

          /* Layered wood: highlight → vignette → horizontal grain →
             vertical plank variation → base colour               */
          background:
            radial-gradient(ellipse at 22% 17%,
              rgba(255, 255, 255, 0.10) 0%, transparent 44%),
            radial-gradient(ellipse at 50% 50%,
              transparent 28%, rgba(0, 0, 0, 0.44) 100%),
            repeating-linear-gradient(
              180deg,
              transparent              0px,
              transparent              5px,
              rgba(0, 0, 0, 0.055)     5px,
              rgba(0, 0, 0, 0.055)     6px
            ),
            repeating-linear-gradient(
              91deg,
              transparent              0px,
              transparent              36px,
              rgba(0, 0, 0, 0.028)     36px,
              rgba(0, 0, 0, 0.028)     37px
            ),
            linear-gradient(168deg,
              #8a5c2e 0%,
              #6b4220 24%,
              #4a2c10 50%,
              #6a4120 76%,
              #7a5228 100%);

          box-shadow:
            0 20px 40px rgba(0, 0, 0, 0.5),
            inset 1px 0 0 rgba(255, 255, 255, 0.07);

          transition: box-shadow 0.4s ease;
        }

        /* Anticipation: amber glow + rattle; 1s delay lets door centre first */
        .door-button.selected .door-panel {
          animation: anticipationShake 1s ease-in-out 1s both;
          box-shadow:
            0 24px 50px rgba(0, 0, 0, 0.6),
            0 0 0 2px rgba(245, 158, 11, 0.32),
            0 0 28px rgba(245, 158, 11, 0.20),
            inset 1px 0 0 rgba(255, 255, 255, 0.07);
        }

        /* Open: rotates to -72deg; front face visible throughout.
           Class stays applied during 'coupon' phase so door does not snap shut. */
        .door-panel.open {
          animation: doorSwingOpen 1.1s ease-in-out forwards;
          transform-origin: left center;
        }

        /* Recessed inset panels — classic 2-panel door construction */
        .panel-inset {
          position: absolute;
          left: 11%;
          right: 11%;
          border: 1.5px solid rgba(0, 0, 0, 0.36);
          border-radius: 3px;
          background: linear-gradient(
            176deg,
            rgba(0, 0, 0, 0.10) 0%,
            transparent 50%,
            rgba(255, 255, 255, 0.04) 100%
          );
          box-shadow:
            inset  1px  1px 3px rgba(255, 255, 255, 0.06),
            inset -1px -1px 3px rgba(0, 0, 0, 0.22);
        }

        .panel-inset.upper {
          top: 9%;
          height: 35%;
        }

        .panel-inset.lower {
          top: 52%;
          height: 36%;
        }

        /* Brass knob — sphere illusion via three radial gradient layers */
        .door-knob {
          position: absolute;
          right: 13%;
          top: 50%;
          transform: translateY(-50%);
          width: 1rem;
          height: 1rem;
          border-radius: 50%;
          background:
            radial-gradient(circle at 33% 28%,
              rgba(255, 255, 255, 0.55) 0%, transparent 42%),
            radial-gradient(circle at 67% 72%,
              rgba(0, 0, 0, 0.30) 0%, transparent 40%),
            radial-gradient(circle at 50% 50%,
              #ecc84a 0%, #b8820a 55%, #7a5200 100%);
          box-shadow:
            0 3px 8px rgba(0, 0, 0, 0.55),
            0 1px 2px rgba(0, 0, 0, 0.40),
            inset -1px -1px 3px rgba(0, 0, 0, 0.28),
            inset  1px  1px 3px rgba(255, 210, 70, 0.40);
          pointer-events: none;
          z-index: 5;
        }

        /* Warm light leaking under the closed door */
        .light-leak {
          position: absolute;
          bottom: -1px;
          left: 8%;
          right: 8%;
          height: 5px;
          border-radius: 50%;
          background: rgba(255, 190, 50, 0.75);
          filter: blur(5px);
          box-shadow: 0 0 12px 5px rgba(255, 165, 25, 0.38);
          pointer-events: none;
          opacity: 0.42;
          transition: opacity 0.4s ease, filter 0.4s ease;
        }

        .door-button.selected .light-leak {
          opacity: 0.88;
          filter: blur(7px);
        }

        /* Light source moves inside once door opens */
        .door-button.revealing .light-leak,
        .door-button.coupon   .light-leak {
          opacity: 0;
        }

        .door-label {
          position: absolute;
          bottom: 8px;
          left: 0;
          right: 0;
          text-align: center;
          font-size: 0.65rem;
          font-weight: 900;
          color: #f8e08d;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
          letter-spacing: 0.08em;
          pointer-events: none;
        }

        /* ── Layer 3: Architectural frame (front — z-index 3, never moves) */

        .door-surround {
          position: absolute;
          inset: 0;
          z-index: 3;
          pointer-events: none;
          border-radius: 0.875rem;
          background: transparent;
          border: 11px solid #2a1506;
          box-shadow:
            /* depth on inner face — shadow from the room */
            inset 0 0 10px rgba(0, 0, 0, 0.55),
            /* warm bleed on inner edge when door is open */
            inset 0 0  0 1px rgba(160, 80, 10, 0.28),
            /* outer drop shadow */
            0 8px 24px rgba(0, 0, 0, 0.38);
        }

        /* ── Instruction ────────────────────────────────────────────── */

        .instruction {
          text-align: center;
          font-size: 0.95rem;
          font-weight: 700;
          color: #666;
          margin-bottom: 1rem;
        }

        @media (max-width: 640px) {
          .door-button.selected,
          .door-button.revealing,
          .door-button.coupon {
            width: min(80vw, 16rem);
          }
        }
      `}</style>

      <div className="instruction" style={{ opacity: state.selectedDoor !== null ? 0.4 : 1 }}>
        {playsRemaining > 0 ? '🚪 Choose your door' : 'No plays left'}
      </div>

      <div className="door-container">
        {[0, 1, 2].map((index) => {
          const isSelected = state.selectedDoor === index;
          const isHidden   = state.selectedDoor !== null && !isSelected;
          // True for both 'revealing' and 'coupon' so the panel class stays
          // constant across the phase boundary — door remains at -72deg.
          const isDoorOpen    = (state.phase === 'revealing' || state.phase === 'coupon') && isSelected;
          const isPrizeVisible = isDoorOpen && !!winningReward;

          return (
            <button
              key={index}
              onClick={() => pickDoor(index)}
              disabled={!canPlay || playing || state.selectedDoor !== null}
              className={`door-button ${state.phase === 'idle' && !isHidden ? 'idle' : ''} ${isHidden ? 'hidden' : ''} ${isSelected ? state.phase : ''}`}
              aria-label={`Door ${index + 1}`}
            >
              {/* ── Layer 1: Room interior ───────────────────────── */}
              <div className="door-interior">
                <div className="interior-light" />
                {isPrizeVisible && (
                  <div className="prize-content">
                    <div className="prize-emoji">🎁</div>
                    <div className="prize-name">{winningReward.label}</div>
                    <div className="prize-detail">{winningReward.description}</div>
                  </div>
                )}
              </div>

              {/* ── Layer 2: Door panel ──────────────────────────── */}
              <div className={`door-panel ${isDoorOpen ? 'open' : ''}`}>
                <div className="panel-inset upper" />
                <div className="panel-inset lower" />
                <div className="door-knob" />
                <div className="light-leak" />
                <div className="door-label">DOOR {index + 1}</div>
              </div>

              {/* ── Layer 3: Permanent architectural frame ────────── */}
              <div className="door-surround" />
            </button>
          );
        })}
      </div>
    </section>
  );
}
