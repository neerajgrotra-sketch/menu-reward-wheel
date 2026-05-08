export type BuilderGameType = 'wheel' | 'mystery_box';

export type BuilderRewardType = 'free' | 'discount' | 'custom';
export type BuilderWeightLabel = 'Common' | 'Normal' | 'Rare';
export type BuilderStatus = 'draft' | 'pending' | 'active' | 'ended';

export type BuilderPromotion = {
  id: string;
  restaurant_id: string;
  name: string;
  slug: string;
  game_type?: BuilderGameType | string | null;
  status: string;
  daily_redeem_limit?: number | null;
  max_spins?: number | null;
  coupon_expiry_minutes?: number | null;
  stop_on_win?: boolean | null;
  starts_at?: string | null;
  ends_at?: string | null;
};

export type BuilderRestaurant = {
  id: string;
  name: string;
  slug: string;
  address_line1?: string | null;
  city?: string | null;
  owner_id?: string | null;
};

export type BuilderMenu = {
  id: string;
  name: string;
  menu_type?: string | null;
  restaurant_id: string;
  item_count?: number;
};

export type BuilderMenuItem = {
  id: string;
  menu_id: string;
  restaurant_id: string;
  name: string;
  price?: number | null;
};

export type BuilderReward = {
  temp_id: string;
  id?: string;
  promotion_id: string;
  restaurant_id: string;
  menu_item_id: string | null;
  custom_name: string | null;
  label: string;
  reward_type: BuilderRewardType;
  reward_value: number | null;
  daily_limit: number;
  weight_label: BuilderWeightLabel;
  weight: number;
};

export type BuilderRules = {
  dailyLimit: number;
  maxSpins: number;
  couponExpiryMinutes: number;
  stopOnWin: boolean;
  startsAt: string;
  endsAt: string;
};

export type BuilderPreviewState = {
  rotation: number;
  spinning: boolean;
  result: string;
};

export type PromotionBuilderState = {
  promotion: BuilderPromotion | null;
  restaurant: BuilderRestaurant | null;
  gameType: BuilderGameType;
  menus: BuilderMenu[];
  menuItems: BuilderMenuItem[];
  selectedMenuId: string;
  rewards: BuilderReward[];
  rules: BuilderRules;
  preview: BuilderPreviewState;
  validationErrors: string[];
  loading: boolean;
  saving: boolean;
  launching: boolean;
  saved: boolean;
  launchSuccess: boolean;
  error: string;
};

export type PromotionBuilderAction =
  | { type: 'hydrate'; state: Partial<PromotionBuilderState> }
  | { type: 'setPromotion'; promotion: BuilderPromotion | null }
  | { type: 'setRestaurant'; restaurant: BuilderRestaurant | null }
  | { type: 'setMenus'; menus: BuilderMenu[] }
  | { type: 'setMenuItems'; menuItems: BuilderMenuItem[] }
  | { type: 'setGameType'; gameType: BuilderGameType }
  | { type: 'setRewards'; rewards: BuilderReward[] }
  | { type: 'setRules'; rules: Partial<BuilderRules> }
  | { type: 'setPreview'; preview: Partial<BuilderPreviewState> }
  | { type: 'setValidationErrors'; validationErrors: string[] }
  | { type: 'setSelectedMenuId'; selectedMenuId: string }
  | { type: 'markDirty' }
  | { type: 'setLoading'; loading: boolean }
  | { type: 'setSaving'; saving: boolean }
  | { type: 'setLaunching'; launching: boolean }
  | { type: 'setSaved'; saved: boolean }
  | { type: 'setLaunchSuccess'; launchSuccess: boolean }
  | { type: 'setError'; error: string };
