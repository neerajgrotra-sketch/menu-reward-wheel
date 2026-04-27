import type { Reward, RestaurantWorkspace } from '@/types/reward';

const STORAGE_KEY = 'restaurant_workspace_v1';

export function getWorkspace(): RestaurantWorkspace | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function saveWorkspace(data: RestaurantWorkspace) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function createDefaultWorkspace(): RestaurantWorkspace {
  return {
    restaurant: {
      id: 'r1',
      name: 'Demo Restaurant',
      slug: 'demo-restaurant',
      brandColor: '#f97316',
      createdAt: new Date().toISOString(),
    },
    campaign: {
      id: 'c1',
      restaurantId: 'r1',
      name: 'Default Campaign',
      status: 'active',
      maxSegments: 8,
      couponExpiryMinutes: 20,
    },
    menuItems: [],
    rewards: [],
  };
}

export function pickWeightedReward(rewards: Reward[]): Reward {
  const total = rewards.reduce((sum, reward) => sum + reward.weight, 0);
  let roll = Math.random() * total;

  for (const reward of rewards) {
    roll -= reward.weight;
    if (roll <= 0) return reward;
  }

  return rewards[0];
}

export function createCouponCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'SPIN-';
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}
