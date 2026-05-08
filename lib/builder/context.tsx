'use client';

import { createContext, useContext, useMemo, useReducer } from 'react';
import type {
  BuilderGameType,
  BuilderPreviewState,
  BuilderRules,
  PromotionBuilderAction,
  PromotionBuilderState,
} from '@/lib/builder/types';

const defaultRules: BuilderRules = {
  dailyLimit: 50,
  maxSpins: 3,
  couponExpiryMinutes: 20,
  stopOnWin: true,
  startsAt: '',
  endsAt: '',
};

const defaultPreview: BuilderPreviewState = {
  rotation: 0,
  spinning: false,
  result: '',
};

export const initialPromotionBuilderState: PromotionBuilderState = {
  promotion: null,
  restaurant: null,
  gameType: 'wheel',
  menus: [],
  menuItems: [],
  selectedMenuId: '',
  rewards: [],
  rules: defaultRules,
  preview: defaultPreview,
  validationErrors: [],
  loading: true,
  saving: false,
  launching: false,
  saved: false,
  launchSuccess: false,
  error: '',
};

function normalizeGameType(value?: string | null): BuilderGameType {
  if (value === 'mystery_box') return 'mystery_box';
  if (value === 'scratch_card') return 'scratch_card';
  return 'wheel';
}

export function promotionBuilderReducer(
  state: PromotionBuilderState,
  action: PromotionBuilderAction
): PromotionBuilderState {
  switch (action.type) {
    case 'hydrate':
      return {
        ...state,
        ...action.state,
        rules: {
          ...state.rules,
          ...action.state.rules,
        },
        preview: {
          ...state.preview,
          ...action.state.preview,
        },
        gameType: action.state.gameType ? normalizeGameType(action.state.gameType) : state.gameType,
      };
    case 'setPromotion':
      return {
        ...state,
        promotion: action.promotion,
      };
    case 'setRestaurant':
      return {
        ...state,
        restaurant: action.restaurant,
      };
    case 'setMenus':
      return {
        ...state,
        menus: action.menus,
      };
    case 'setMenuItems':
      return {
        ...state,
        menuItems: action.menuItems,
      };
    case 'setGameType':
      return {
        ...state,
        gameType: normalizeGameType(action.gameType),
        saved: false,
        launchSuccess: false,
      };
    case 'setRewards':
      return {
        ...state,
        rewards: action.rewards,
        saved: false,
        launchSuccess: false,
      };
    case 'setRules':
      return {
        ...state,
        rules: {
          ...state.rules,
          ...action.rules,
        },
        saved: false,
        launchSuccess: false,
      };
    case 'setPreview':
      return {
        ...state,
        preview: {
          ...state.preview,
          ...action.preview,
        },
      };
    case 'setValidationErrors':
      return {
        ...state,
        validationErrors: action.validationErrors,
      };
    case 'setSelectedMenuId':
      return {
        ...state,
        selectedMenuId: action.selectedMenuId,
      };
    case 'markDirty':
      return {
        ...state,
        saved: false,
        launchSuccess: false,
      };
    case 'setLoading':
      return {
        ...state,
        loading: action.loading,
      };
    case 'setSaving':
      return {
        ...state,
        saving: action.saving,
      };
    case 'setLaunching':
      return {
        ...state,
        launching: action.launching,
      };
    case 'setSaved':
      return {
        ...state,
        saved: action.saved,
      };
    case 'setLaunchSuccess':
      return {
        ...state,
        launchSuccess: action.launchSuccess,
      };
    case 'setError':
      return {
        ...state,
        error: action.error,
      };
    default:
      return state;
  }
}

type PromotionBuilderContextValue = {
  state: PromotionBuilderState;
  dispatch: React.Dispatch<PromotionBuilderAction>;
};

const PromotionBuilderContext = createContext<PromotionBuilderContextValue | null>(null);

type PromotionBuilderProviderProps = {
  children: React.ReactNode;
  initialState?: Partial<PromotionBuilderState>;
};

export function PromotionBuilderProvider({ children, initialState }: PromotionBuilderProviderProps) {
  const [state, dispatch] = useReducer(promotionBuilderReducer, {
    ...initialPromotionBuilderState,
    ...initialState,
    rules: {
      ...initialPromotionBuilderState.rules,
      ...initialState?.rules,
    },
    preview: {
      ...initialPromotionBuilderState.preview,
      ...initialState?.preview,
    },
    gameType: normalizeGameType(initialState?.gameType),
  });

  const value = useMemo(() => ({ state, dispatch }), [state]);

  return (
    <PromotionBuilderContext.Provider value={value}>
      {children}
    </PromotionBuilderContext.Provider>
  );
}

export function usePromotionBuilder() {
  const value = useContext(PromotionBuilderContext);
  if (!value) {
    throw new Error('usePromotionBuilder must be used inside PromotionBuilderProvider');
  }
  return value;
}
