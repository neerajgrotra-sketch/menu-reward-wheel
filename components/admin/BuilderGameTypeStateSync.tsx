'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { usePromotionBuilder } from '@/lib/builder/context';
import type { BuilderGameType } from '@/lib/builder/types';

type Props = {
  promotionId: string;
};

function normalizeGameType(value?: string | null): BuilderGameType {
  if (value === 'mystery_box') return 'mystery_box';
  if (value === 'scratch_card') return 'scratch_card';
  if (value === 'open_the_door') return 'open_the_door';
  return 'wheel';
}

export default function BuilderGameTypeStateSync({ promotionId }: Props) {
  const { dispatch } = usePromotionBuilder();

  useEffect(() => {
    let cancelled = false;

    async function syncGameType() {
      if (!promotionId) return;

      const supabase = createClient();
      const result = await supabase
        .from('promotions')
        .select('game_type')
        .eq('id', promotionId)
        .single();

      if (cancelled) return;

      if (result.error) {
        dispatch({ type: 'setError', error: result.error.message });
        return;
      }

      dispatch({
        type: 'hydrate',
        state: {
          gameType: normalizeGameType(result.data?.game_type),
        },
      });
    }

    syncGameType();

    return () => {
      cancelled = true;
    };
  }, [dispatch, promotionId]);

  return null;
}
