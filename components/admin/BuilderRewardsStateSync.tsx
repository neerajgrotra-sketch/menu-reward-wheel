'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { usePromotionBuilder } from '@/lib/builder/context';
import type { BuilderReward, BuilderRewardType, BuilderWeightLabel } from '@/lib/builder/types';

type Props = {
  promotionId: string;
};

function tempId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

function weightLabel(weight?: number | null): BuilderWeightLabel {
  if (weight === 60) return 'Common';
  if (weight === 10) return 'Rare';
  return 'Normal';
}

function normalizeRewardType(value?: string | null): BuilderRewardType {
  if (value === 'free' || value === 'custom') return value;
  return 'discount';
}

export default function BuilderRewardsStateSync({ promotionId }: Props) {
  const { dispatch } = usePromotionBuilder();

  useEffect(() => {
    let cancelled = false;

    async function syncRewards() {
      if (!promotionId) return;

      const supabase = createClient();
      const rewardResult = await supabase
        .from('promotion_rewards')
        .select('id,promotion_id,restaurant_id,menu_item_id,custom_name,reward_type,reward_value,daily_limit,weight')
        .eq('promotion_id', promotionId)
        .order('created_at', { ascending: false });

      if (cancelled) return;

      if (rewardResult.error) {
        dispatch({ type: 'setError', error: rewardResult.error.message });
        return;
      }

      const rawRewards = rewardResult.data || [];
      const menuItemIds = rawRewards.map((item: any) => item.menu_item_id).filter(Boolean);
      let namesById: Record<string, string> = {};

      if (menuItemIds.length) {
        const itemResult = await supabase.from('menu_items').select('id,name').in('id', menuItemIds);
        if (!cancelled) {
          namesById = Object.fromEntries((itemResult.data || []).map((item: any) => [item.id, item.name]));
        }
      }

      if (cancelled) return;

      const rewards: BuilderReward[] = rawRewards.map((item: any) => ({
        temp_id: tempId(),
        id: item.id,
        promotion_id: item.promotion_id,
        restaurant_id: item.restaurant_id,
        menu_item_id: item.menu_item_id,
        custom_name: item.custom_name,
        label: item.custom_name || namesById[item.menu_item_id] || 'Reward',
        reward_type: normalizeRewardType(item.reward_type),
        reward_value: item.reward_value,
        daily_limit: item.daily_limit || 10,
        weight_label: weightLabel(item.weight),
        weight: item.weight || 30,
      }));

      dispatch({
        type: 'hydrate',
        state: {
          rewards,
        },
      });
    }

    syncRewards();

    return () => {
      cancelled = true;
    };
  }, [dispatch, promotionId]);

  return null;
}
