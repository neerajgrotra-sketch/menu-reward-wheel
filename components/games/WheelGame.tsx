'use client';

import SpinWheelRuntime from '@/lib/games/spin-wheel/runtime';
import type { GamePlayProps } from '@/lib/games/types';

export default function WheelGame(props: GamePlayProps) {
  return <SpinWheelRuntime {...props} />;
}
