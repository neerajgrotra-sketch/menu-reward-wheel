'use client';

import type { Restaurant } from './types';

export type RestaurantTileSummary = {
  tablesCount: number;
  assignedMenusCount: number;
  activePromotionsCount: number;
  activeSessionsCount: number;
  orderingEnabled: boolean;
  paymentEnabled: boolean;
};

export const EMPTY_TILE_SUMMARY: RestaurantTileSummary = {
  tablesCount: 0,
  assignedMenusCount: 0,
  activePromotionsCount: 0,
  activeSessionsCount: 0,
  orderingEnabled: false,
  paymentEnabled: false,
};

function address(r: Restaurant): string {
  return [r.address_line1, r.city].filter(Boolean).join(', ') || 'Address not added';
}

function modeLabel(mode: string | null | undefined) {
  if (mode === 'menu_and_promotion') return 'Menu + Promotion';
  if (mode === 'menu_only') return 'Menu Only';
  return 'Promotion Only';
}

function Badge({ active, label }: { active: boolean; label: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${active ? 'bg-green-100 text-green-700' : 'bg-stone-100 text-stone-400'}`}>
      {label}
    </span>
  );
}

export function RestaurantDirectoryTile({ restaurant, summary }: { restaurant: Restaurant; summary: RestaurantTileSummary }) {
  return (
    <a
      href={`/admin/restaurants/${restaurant.id}`}
      className="block overflow-hidden rounded-3xl bg-white shadow-xl transition hover:-translate-y-1 hover:shadow-2xl"
    >
      {/* Hero zone — restaurant's own cover photo, brand gradient fallback */}
      <div className="relative h-40 w-full overflow-hidden bg-gradient-to-br from-orange-200 via-amber-100 to-red-100">
        {restaurant.hero_image_url && (
          <img src={restaurant.hero_image_url} alt={`${restaurant.name} cover`} className="h-full w-full object-cover" />
        )}
      </div>

      {/* Info card — logo straddles hero/card boundary */}
      <div className="relative -mt-8 rounded-t-3xl bg-white px-5 pb-5 pt-5 shadow-xl">
        <div className="absolute -top-10 left-5">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-white p-1.5 shadow-xl ring-1 ring-stone-100">
            {restaurant.logo_url ? (
              <img src={restaurant.logo_url} alt={`${restaurant.name} logo`} className="h-full w-full object-contain" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-2xl">🍽️</span>
            )}
          </div>
        </div>

        <div className="mt-9">
          <h3 className="truncate text-xl font-black text-[#1F1F1F]">{restaurant.name}</h3>
          <p className="mt-1 truncate text-sm font-semibold text-stone-500">📍 {address(restaurant)}</p>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2">
          <div className="rounded-2xl bg-stone-50 p-3 text-center">
            <p className="text-lg font-black text-stone-900">{summary.tablesCount}</p>
            <p className="text-[10px] font-bold uppercase tracking-wide text-stone-500">Tables</p>
          </div>
          <div className="rounded-2xl bg-stone-50 p-3 text-center">
            <p className="text-lg font-black text-stone-900">{summary.assignedMenusCount}</p>
            <p className="text-[10px] font-bold uppercase tracking-wide text-stone-500">Menus</p>
          </div>
          <div className="rounded-2xl bg-stone-50 p-3 text-center">
            <p className="text-lg font-black text-stone-900">{summary.activePromotionsCount}</p>
            <p className="text-[10px] font-bold uppercase tracking-wide text-stone-500">Promos</p>
          </div>
          <div className="rounded-2xl bg-stone-50 p-3 text-center">
            <p className="text-lg font-black text-stone-900">{summary.activeSessionsCount}</p>
            <p className="text-[10px] font-bold uppercase tracking-wide text-stone-500">Sessions</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          <Badge active={summary.orderingEnabled} label="Ordering" />
          <Badge active={summary.paymentEnabled} label="Payments" />
          <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-black uppercase text-[#FF6B00]">
            {modeLabel(restaurant.experience_mode)}
          </span>
        </div>

        <div className="mt-4 rounded-2xl bg-[#FF6B00] px-4 py-3 text-center text-sm font-black text-white">
          Open Workspace →
        </div>
      </div>
    </a>
  );
}
