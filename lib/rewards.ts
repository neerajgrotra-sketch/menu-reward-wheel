import type { Reward, RestaurantWorkspace } from '@/types/reward';

const STORAGE_KEY = 'restaurant_workspace_v1';

export const demoRewards: Reward[] = [
  { id: 'r1', label: '5% Off', description: 'Save 5% on your order', weight: 28, terms: 'One reward per customer per day.', active: true },
  { id: 'r2', label: '10% Paneer', description: '10% off Paneer Tikka', weight: 18, terms: 'Valid for Paneer Tikka only.', active: true },
  { id: 'r3', label: 'Free Lassi', description: 'Free Mango Lassi with entree', weight: 16, terms: 'Requires purchase of an entree.', active: true },
  { id: 'r4', label: 'Dessert', description: 'Free dessert over $40', weight: 10, terms: 'Minimum spend of $40 before tax.', active: true },
  { id: 'r5', label: 'App Deal', description: 'Second appetizer 50% off', weight: 12, terms: 'Dine-in only.', active: true },
  { id: 'r6', label: '$3 Lunch', description: '$3 off lunch special', weight: 10, terms: 'Valid during lunch hours.', active: true },
  { id: 'r7', label: 'Chef Pick', description: 'Chef surprise offer', weight: 5, terms: 'Subject to availability.', active: true },
  { id: 'r8', label: 'Free Entree', description: 'Rare prize: free entree', weight: 1, terms: 'Manager approval required. One per day.', active: true },
];

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
    menuItems: [
      { id: 'm1', restaurantId: 'r1', name: 'Paneer Tikka', category: 'Appetizers', price: 14, active: true },
      { id: 'm2', restaurantId: 'r1', name: 'Mango Lassi', category: 'Drinks', price: 6, active: true },
    ],
    rewards: demoRewards,
  };
}

export function pickWeightedReward(rewards: Reward[]): Reward {
  const activeRewards = rewards.filter((reward) => reward.active !== false);
  const pool = activeRewards.length > 0 ? activeRewards : rewards;
  const total = pool.reduce((sum, reward) => sum + reward.weight, 0);
  let roll = Math.random() * total;

  for (const reward of pool) {
    roll -= reward.weight;
    if (roll <= 0) return reward;
  }

  return pool[0];
}

export function createCouponCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'SPIN-';
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}
