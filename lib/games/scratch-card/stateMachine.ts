export type ScratchCardPhase =
  | 'idle'
  | 'scratching'
  | 'threshold_reached'
  | 'revealing'
  | 'completed';

export type ScratchCardEvent =
  | { type: 'START_SCRATCH' }
  | { type: 'UPDATE_PROGRESS'; progress: number }
  | { type: 'START_REVEAL' }
  | { type: 'COMPLETE' }
  | { type: 'RESET' };

export type ScratchCardState = {
  phase: ScratchCardPhase;
  progress: number;
  threshold: number;
};

export const defaultScratchCardState: ScratchCardState = {
  phase: 'idle',
  progress: 0,
  threshold: 68,
};

export function reduceScratchCardState(
  state: ScratchCardState,
  event: ScratchCardEvent,
): ScratchCardState {
  switch (event.type) {
    case 'START_SCRATCH':
      if (state.phase !== 'idle') return state;
      return { ...state, phase: 'scratching' };

    case 'UPDATE_PROGRESS': {
      if (state.phase !== 'scratching' && state.phase !== 'threshold_reached') return state;
      const progress = Math.max(0, Math.min(100, event.progress));
      return {
        ...state,
        progress,
        phase: progress >= state.threshold ? 'threshold_reached' : 'scratching',
      };
    }

    case 'START_REVEAL':
      if (state.phase !== 'threshold_reached') return state;
      return { ...state, phase: 'revealing' };

    case 'COMPLETE':
      if (state.phase !== 'revealing') return state;
      return { ...state, progress: 100, phase: 'completed' };

    case 'RESET':
      return { ...defaultScratchCardState, threshold: state.threshold };

    default:
      return state;
  }
}

export function getScratchCardStatusText(state: ScratchCardState, playing: boolean): string {
  if (playing || state.phase === 'revealing') return 'Revealing...';
  if (state.phase === 'completed') return 'Reward revealed!';
  if (state.phase === 'threshold_reached') return 'Release to reveal';
  if (state.phase === 'scratching') return `${Math.round(state.progress)}% scratched`;
  return 'Drag to scratch';
}
