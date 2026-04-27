export type RewardType =
  | 'PERCENT_OFF_ITEM'
  | 'PERCENT_OFF_ORDER'
  | 'DOLLAR_OFF_ORDER'
  | 'FREE_ITEM_WITH_PURCHASE'
  | 'BOGO'
  | 'CHEF_SPECIAL';

export type Reward = {
  id: string;
  label: string;
  description: string;
  weight: number;
  terms: string;
  rewardType?: RewardType;
  menuItemId?: string;
  minimumSpend?: number;
  dailyLimit?: number;
  active?: boolean;
};

export type Restaurant = {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  brandColor: string;
  createdAt: string;
};

export type MenuItem = {
  id: string;
  restaurantId: string;
  name: string;
  category: string;
  price?: number;
  description?: string;
  active: boolean;
};

export type Campaign = {
  id: string;
  restaurantId: string;
  name: string;
  status: 'draft' | 'active' | 'paused';
  maxSegments: number;
  couponExpiryMinutes: number;
};

export type RestaurantWorkspace = {
  restaurant: Restaurant;
  campaign: Campaign;
  menuItems: MenuItem[];
  rewards: Reward[];
};
