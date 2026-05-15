'use client';

import { RewardWheel } from '@/components/RewardWheel';
import type { Reward } from '@/types/reward';

export type SpinWheelBuilderPreviewProps = {
  rewards?: Reward[];
  rotation?: number;
};

const fallbackRewards = [
  { id: 'preview-1', label: 'Reward 1' },
  { id: 'preview-2', label: 'Reward 2' },
  { id: 'preview-3', label: 'Reward 3' },
  { id: 'preview-4', label: 'Reward 4' },
] as Reward[];

export default function SpinWheelBuilderPreview({
  rewards = fallbackRewards,
  rotation = 0,
}: SpinWheelBuilderPreviewProps) {
  return (
    <div className="rounded-3xl bg-orange-50 p-4">
      <RewardWheel rewards={rewards} rotation={rotation} spinning={false} />
    </div>
  );
}
