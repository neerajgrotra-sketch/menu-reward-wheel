export type SpinWheelPhase =
  | 'idle'
  | 'ready'
  | 'spinning'
  | 'settling'
  | 'completed';

export type SpinWheelEvent =
  | { type: 'READY' }
  | { type: 'START_SPIN' }
  | { type: 'START_SETTLING' }
  | { type: 'COMPLETE' }
  | { type: 'RESET' };

export type SpinWheelState = {
  phase: SpinWheelPhase;
};

export const defaultSpinWheelState: SpinWheelState = {
  phase: 'idle',
};

export function reduceSpinWheelState(
  state: SpinWheelState,
  event: SpinWheelEvent,
): SpinWheelState {
  switch (event.type) {
    case 'READY':
      if (state.phase !== 'idle' && state.phase !== 'completed') return state;
      return { phase: 'ready' };

    case 'START_SPIN':
      if (state.phase !== 'ready') return state;
      return { phase: 'spinning' };

    case 'START_SETTLING':
      if (state.phase !== 'spinning') return state;
      return { phase: 'settling' };

    case 'COMPLETE':
      if (state.phase !== 'settling' && state.phase !== 'spinning') return state;
      return { phase: 'completed' };

    case 'RESET':
      return defaultSpinWheelState;

    default:
      return state;
  }
}

export function getSpinWheelButtonText(
  state: SpinWheelState,
  playing: boolean,
  playsRemaining: number,
) {
  if (playing || state.phase === 'spinning' || state.phase === 'settling') return 'Spinning...';
  if (playsRemaining > 0) return 'Spin Now';
  return 'All Spins Used';
}
