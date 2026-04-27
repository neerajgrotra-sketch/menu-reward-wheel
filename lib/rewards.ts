import type { Reward } from '@/types/reward';

export const demoRewards: Reward[] = [
  { id: 'r1', label: '5% Off', description: 'Save 5% on your order', weight: 28, terms: 'One reward per customer per day.' },
  { id: 'r2', label: '10% Paneer', description: '10% off Paneer Tikka', weight: 18, terms: 'Valid for Paneer Tikka only.' },
  { id: 'r3', label: 'Free Lassi', description: 'Free Mango Lassi with entrée', weight: 16, terms: 'Requires purchase of an entrée.' },
  { id: 'r4', label: 'Dessert', description: 'Free dessert over $40', weight: 10, terms: 'Minimum spend of $40 before tax.' },
  { id: 'r5', label: 'App Deal', description: 'Second appetizer 50% off', weight: 12, terms: 'Dine-in only.' },
  { id: 'r6', label: '$3 Lunch', description: '$3 off lunch special', weight: 10, terms: 'Valid during lunch hours.' },
  { id: 'r7', label: 'Chef Pick', description: 'Chef surprise offer', weight: 5, terms: 'Subject to availability.' },
  { id: 'r8', label: 'Free Entrée', description: 'Rare prize: free entrée', weight: 1, terms: 'Manager approval required. One per day.' },
];

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
