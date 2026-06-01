'use server';

import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from '@/lib/super-admin';
import { createClient } from '@/lib/supabase/server';

const STATUSES = ['active', 'coming_soon', 'disabled'] as const;
const WIN_EFFECTS = ['confetti', 'stars', 'celebration', 'none'] as const;

type GameStatus = (typeof STATUSES)[number];
type WinEffect = (typeof WIN_EFFECTS)[number];

function toInt(value: FormDataEntryValue | null, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) ? Math.round(next) : fallback;
}

function toFloat(value: FormDataEntryValue | null, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function toGameStatus(value: FormDataEntryValue | null): GameStatus {
  const status = String(value || 'coming_soon');
  return STATUSES.includes(status as GameStatus) ? (status as GameStatus) : 'coming_soon';
}

function toWinEffect(value: FormDataEntryValue | null): WinEffect {
  const effect = String(value || 'confetti');
  return WIN_EFFECTS.includes(effect as WinEffect) ? (effect as WinEffect) : 'confetti';
}

function requiredString(value: FormDataEntryValue | null, fallback = '') {
  const next = String(value || '').trim();
  return next || fallback;
}

function hexColor(value: FormDataEntryValue | null, fallback: string) {
  const color = requiredString(value, fallback);
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : fallback;
}

export async function updateGame(formData: FormData) {
  await requireSuperAdmin();

  const id = requiredString(formData.get('id'));
  if (!id) throw new Error('Missing game id.');

  const slug = requiredString(formData.get('slug'));
  const minRewards = Math.max(1, toInt(formData.get('min_rewards'), 6));
  const maxRewards = Math.max(minRewards, toInt(formData.get('max_rewards'), 10));
  const defaultSpins = Math.max(1, toInt(formData.get('default_spins'), 3));
  const defaultCouponExpiryMinutes = Math.max(1, toInt(formData.get('default_coupon_expiry_minutes'), 20));
  const supportsTryAgain = formData.get('supports_try_again') === 'on';

  const gameType = requiredString(formData.get('game_type'));

  const updatePayload: Record<string, unknown> = {
    name: requiredString(formData.get('name'), 'Untitled Game'),
    slug,
    description: requiredString(formData.get('description')),
    status: toGameStatus(formData.get('status')),
    icon: requiredString(formData.get('icon'), '🎮'),
    min_rewards: minRewards,
    max_rewards: maxRewards,
    min_products: minRewards,
    max_products: maxRewards,
    default_spins: defaultSpins,
    default_coupon_expiry_minutes: defaultCouponExpiryMinutes,
    stop_on_win_default: formData.get('stop_on_win_default') === 'on',
    supports_coupon: formData.get('supports_coupon') === 'on',
    supports_weighting: formData.get('supports_weighting') === 'on',
    supports_try_again: supportsTryAgain,
    sort_order: toInt(formData.get('sort_order'), 0),
  };

  if (gameType) {
    updatePayload.game_type = gameType;
  }

  if (gameType === 'spin_wheel') {
    const wheelSpeed = Math.max(0.2, Math.min(3, toFloat(formData.get('wheel_speed'), 1.2)));
    const spinRotations = Math.max(2, Math.min(16, toInt(formData.get('spin_rotations'), 6)));
    const slowdownSeconds = Math.max(1, Math.min(10, toFloat(formData.get('slowdown_seconds'), 3.5)));

    updatePayload.game_config = {
      wheel: {
        speed: wheelSpeed,
        spinRotations,
        slowdownSeconds,
        winEffect: toWinEffect(formData.get('win_effect')),
        tryAgain: {
          enabled: supportsTryAgain,
          label: requiredString(formData.get('try_again_label'), 'Try Again'),
          backgroundColor: hexColor(formData.get('try_again_background_color'), '#111111'),
          textColor: hexColor(formData.get('try_again_text_color'), '#ffffff'),
        },
      },
    };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from('games')
    .update(updatePayload)
    .eq('id', id);

  if (error) throw new Error(error.message);

  revalidatePath('/super-admin/games');
}
