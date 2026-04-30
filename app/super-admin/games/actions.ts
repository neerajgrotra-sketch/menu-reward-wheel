'use server';

import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from '@/lib/super-admin';
import { createClient } from '@/lib/supabase/server';

const STATUSES = ['active', 'coming_soon', 'disabled'] as const;

type GameStatus = (typeof STATUSES)[number];

function toInt(value: FormDataEntryValue | null, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function toGameStatus(value: FormDataEntryValue | null): GameStatus {
  const status = String(value || 'coming_soon');
  return STATUSES.includes(status as GameStatus) ? (status as GameStatus) : 'coming_soon';
}

function requiredString(value: FormDataEntryValue | null, fallback = '') {
  const next = String(value || '').trim();
  return next || fallback;
}

export async function updateGame(formData: FormData) {
  await requireSuperAdmin();

  const id = requiredString(formData.get('id'));
  if (!id) throw new Error('Missing game id.');

  const minRewards = Math.max(1, toInt(formData.get('min_rewards'), 6));
  const maxRewards = Math.max(minRewards, toInt(formData.get('max_rewards'), 10));
  const defaultSpins = Math.max(1, toInt(formData.get('default_spins'), 3));
  const defaultCouponExpiryMinutes = Math.max(1, toInt(formData.get('default_coupon_expiry_minutes'), 20));

  const supabase = createClient();
  const { error } = await supabase
    .from('games')
    .update({
      name: requiredString(formData.get('name'), 'Untitled Game'),
      slug: requiredString(formData.get('slug')),
      description: requiredString(formData.get('description')),
      status: toGameStatus(formData.get('status')),
      icon: requiredString(formData.get('icon'), '🎮'),
      min_rewards: minRewards,
      max_rewards: maxRewards,
      default_spins: defaultSpins,
      default_coupon_expiry_minutes: defaultCouponExpiryMinutes,
      stop_on_win_default: formData.get('stop_on_win_default') === 'on',
      supports_coupon: formData.get('supports_coupon') === 'on',
      supports_weighting: formData.get('supports_weighting') === 'on',
      supports_try_again: formData.get('supports_try_again') === 'on',
      sort_order: toInt(formData.get('sort_order'), 0),
    })
    .eq('id', id);

  if (error) throw new Error(error.message);

  revalidatePath('/super-admin/games');
}
