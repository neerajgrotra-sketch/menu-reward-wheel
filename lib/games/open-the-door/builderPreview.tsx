'use client';

import type { GameBuilderPreviewProps } from '@/lib/games/types';

export default function OpenTheDoorBuilderPreview({ rewards, rotation }: GameBuilderPreviewProps) {
  console.log('OpenTheDoorPreview Rendered');
  
  return (
    <div className="mx-auto mt-5 max-w-3xl">
      <style jsx>{`
        @keyframes doorSway {
          0%, 100% { transform: perspective(1000px) rotateZ(-0.8deg) translateY(0px); }
          50% { transform: perspective(1000px) rotateZ(0.8deg) translateY(-4px); }
        }

        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.3); }
          50% { box-shadow: 0 0 0 8px rgba(245, 158, 11, 0.1); }
        }

        .preview-container {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.75rem;
          perspective: 1000px;
        }

        .preview-door {
          position: relative;
          aspect-ratio: 3/4;
          animation: doorSway 3.2s ease-in-out infinite;
        }

        .preview-door::before {
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

        .door-panel {
          position: relative;
          width: 100%;
          height: 100%;
          border-radius: 1rem;
          overflow: hidden;
          box-shadow: 
            0 20px 40px rgba(0, 0, 0, 0.4),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
          background: linear-gradient(135deg, #8B6F47 0%, #6B5333 25%, #5A4229 50%, #6B5333 75%, #8B6F47 100%);
        }

        .door-panel::before {
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
      `}</style>

      <p className="mb-3 text-center text-sm font-semibold text-slate-600">
        3 mysterious doors await your choice
      </p>

      <div className="preview-container">
        {[1, 2, 3].map((index) => (
          <div key={index} className="preview-door">
            <div className="door-panel">
              <div className="door-frame" />
              <div className="door-knob" />
              <div className="door-light-leak" />
              <div className="door-label">DOOR {index}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        <p className="font-semibold text-slate-900">✨ Open The Door Game</p>
        <p className="mt-2 text-xs leading-relaxed">
          Players choose one of three wooden doors. When selected, the door swings open with a 3D rotation effect to reveal their reward
          behind it. Features idle animations with subtle sway and pulsing glow, plus light-burst effects on reveal.
        </p>
      </div>
    </div>
  );
}
