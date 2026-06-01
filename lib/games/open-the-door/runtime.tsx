'use client';

import { useEffect, useRef, useState } from 'react';
import type { GamePlayProps } from '@/lib/games/types';

type DoorState = {
  phase: 'idle' | 'selected' | 'revealing' | 'completed';
  selectedDoor: number | null;
};

const defaultDoorState: DoorState = {
  phase: 'idle',
  selectedDoor: null,
};

export default function OpenTheDoorRuntime({ canPlay, playing, playsRemaining, onPlay }: GamePlayProps) {
  const revealTimerRef = useRef<number | null>(null);
  const resetTimerRef = useRef<number | null>(null);
  const [state, setState] = useState<DoorState>(defaultDoorState);

  useEffect(() => {
    return () => {
      if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current);
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (state.phase !== 'selected') return;

    setState((current) => ({ ...current, phase: 'revealing' }));
    onPlay();

    revealTimerRef.current = window.setTimeout(() => {
      setState((current) => ({ ...current, phase: 'completed' }));
    }, 1100);

    resetTimerRef.current = window.setTimeout(() => {
      setState(defaultDoorState);
    }, 4200);
  }, [state.phase, onPlay]);

  function pickDoor(index: number) {
    if (!canPlay || playing || state.phase !== 'idle') return;
    setState({ phase: 'selected', selectedDoor: index });
  }

  return (
    <section className="mt-4 w-full">
      <style jsx>{`
        @keyframes doorSway {
          0%, 100% { transform: perspective(1000px) rotateZ(-0.8deg) translateY(0px); }
          50% { transform: perspective(1000px) rotateZ(0.8deg) translateY(-4px); }
        }

        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.3); }
          50% { box-shadow: 0 0 0 8px rgba(245, 158, 11, 0.1); }
        }

        @keyframes doorSwingOpen {
          0% { 
            transform: perspective(1200px) rotateY(0deg);
          }
          80% {
            transform: perspective(1200px) rotateY(-100deg);
          }
          100% {
            transform: perspective(1200px) rotateY(-95deg);
          }
        }

        @keyframes lightBurst {
          0% { 
            opacity: 0;
            transform: scale(0.3) translateY(20px);
          }
          40% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: scale(2.5) translateY(-60px);
          }
        }

        @keyframes rewardPop {
          0% {
            opacity: 0;
            transform: scale(0) rotateZ(-180deg);
          }
          50% {
            opacity: 1;
          }
          100% {
            opacity: 1;
            transform: scale(1) rotateZ(0deg);
          }
        }

        .door-container {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.75rem;
          width: 100%;
          perspective: 1000px;
        }

        .door-button {
          position: relative;
          aspect-ratio: 3/4;
          border: none;
          background: none;
          padding: 0;
          cursor: pointer;
          outline: none;
          transform-style: preserve-3d;
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
          inset: -8px;
          border-radius: 1.5rem;
          background: radial-gradient(circle at 30% 30%, rgba(245, 158, 11, 0.25), transparent 60%);
          opacity: 0;
          animation: pulseGlow 2.5s ease-in-out infinite;
          pointer-events: none;
          z-index: -1;
        }

        .door-button.hidden {
          opacity: 0;
          pointer-events: none;
        }

        .door {
          position: relative;
          width: 100%;
          height: 100%;
          border-radius: 1rem;
          overflow: hidden;
          box-shadow: 
            0 20px 40px rgba(0, 0, 0, 0.4),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
          background: linear-gradient(135deg, #8B6F47 0%, #6B5333 25%, #5A4229 50%, #6B5333 75%, #8B6F47 100%);
          transform-style: preserve-3d;
          transition: transform 0.2s ease;
        }

        .door.revealing {
          animation: doorSwingOpen 1.1s cubic-bezier(0.68, -0.55, 0.27, 1.55) forwards;
          transform-origin: left center;
        }

        .door::before {
          content: '';
          position: absolute;
          inset: 0;
          background: 
            repeating-linear-gradient(
              90deg,
              rgba(0, 0, 0, 0.1) 0px,
              rgba(0, 0, 0, 0.05) 2px,
              transparent 4px,
              transparent 6px
            ),
            repeating-linear-gradient(
              0deg,
              rgba(139, 111, 71, 0.3) 0px,
              rgba(107, 83, 51, 0.1) 4px,
              rgba(139, 111, 71, 0.2) 8px
            ),
            linear-gradient(180deg, rgba(255, 255, 255, 0.05) 0%, transparent 30%, rgba(0, 0, 0, 0.2) 100%);
          pointer-events: none;
        }

        .door-frame {
          position: absolute;
          inset: 3px;
          border: 2px solid rgba(0, 0, 0, 0.4);
          border-radius: 0.75rem;
          pointer-events: none;
          box-shadow: inset 0 0 8px rgba(0, 0, 0, 0.3);
        }

        .door-knob {
          position: absolute;
          right: 12%;
          top: 50%;
          transform: translateY(-50%);
          width: 0.8rem;
          height: 0.8rem;
          border-radius: 50%;
          background: radial-gradient(circle at 35% 35%, #fef3c7, #d4af37);
          box-shadow: 
            0 2px 4px rgba(0, 0, 0, 0.4),
            inset -1px -1px 2px rgba(0, 0, 0, 0.2),
            inset 1px 1px 2px rgba(255, 255, 255, 0.3);
          pointer-events: none;
          z-index: 10;
        }

        .door-light-leak {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 20%;
          background: linear-gradient(
            to top,
            rgba(255, 200, 87, 0.4),
            rgba(255, 200, 87, 0.2),
            transparent
          );
          filter: blur(4px);
          pointer-events: none;
          opacity: 0.6;
        }

        .door.completed .door-light-leak {
          animation: lightBurst 0.8s ease-out forwards;
        }

        .door-label {
          position: absolute;
          bottom: 8px;
          left: 0;
          right: 0;
          text-align: center;
          font-size: 0.65rem;
          font-weight: 900;
          color: #d4af37;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
          letter-spacing: 0.08em;
          pointer-events: none;
        }

        .reward-burst {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 3rem;
          z-index: 100;
          animation: rewardPop 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
          filter: drop-shadow(0 0 8px rgba(251, 191, 36, 0.8));
          pointer-events: none;
        }

        .instruction {
          text-align: center;
          font-size: 0.95rem;
          font-weight: 700;
          color: #666;
          margin-bottom: 1rem;
        }

        .instruction.faded {
          opacity: 0.5;
        }
      `}</style>

      <div className="instruction" style={{ opacity: state.selectedDoor !== null ? 0.4 : 1 }}>
        {playsRemaining > 0 ? '🚪 Choose your door' : 'No plays left'}
      </div>

      <div className="door-container">
        {[0, 1, 2].map((index) => {
          const isSelected = state.selectedDoor === index;
          const isHidden = state.selectedDoor !== null && !isSelected;
          const isRevealing = state.phase === 'revealing' && isSelected;
          const isCompleted = state.phase === 'completed' && isSelected;

          return (
            <button
              key={index}
              onClick={() => pickDoor(index)}
              disabled={!canPlay || playing || state.selectedDoor !== null}
              className={`door-button ${state.phase === 'idle' && !isHidden ? 'idle' : ''} ${isHidden ? 'hidden' : ''}`}
              aria-label={`Door ${index + 1}`}
            >
              <div className={`door ${isRevealing ? 'revealing' : ''} ${isCompleted ? 'completed' : ''}`}>
                <div className="door-frame" />
                <div className="door-knob" />
                <div className="door-light-leak" />
                <div className="door-label">DOOR {index + 1}</div>

                {isCompleted && <div className="reward-burst">✨</div>}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
