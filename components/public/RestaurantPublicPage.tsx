'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Globe, Navigation2, ShoppingCart, SlidersHorizontal } from 'lucide-react';
import { MenuFilterDrawer, type FilterId } from '@/components/public/MenuFilterDrawer';
import confetti from 'canvas-confetti';
import type { PublicRestaurant, PublicSection, PublicMenuItem, PublicPromotion, PublicReward } from '@/app/r/[restaurantSlug]/page';
import { getGameVisual, type GameType } from '@/components/game-visuals/GameVisual';
import { getGameMeta } from '@/lib/games/game-registry';
import { useCart } from '@/hooks/useCart';
import { CartBar } from '@/components/public/CartBar';
import { CartSheet } from '@/components/public/CartSheet';

// ─── Hours utilities ──────────────────────────────────────────────────────────

type DayHours = { open: string; close: string; closed: boolean };
type WeekHours = {
  monday: DayHours;
  tuesday: DayHours;
  wednesday: DayHours;
  thursday: DayHours;
  friday: DayHours;
  saturday: DayHours;
  sunday: DayHours;
};

const DAY_KEYS: Array<keyof WeekHours> = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
];
const DAY_SHORT: Record<keyof WeekHours, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
};

function parseWeekHours(raw: unknown): WeekHours {
  const fallbackDay: DayHours = { open: '11:00', close: '22:00', closed: false };
  const defaults = Object.fromEntries(DAY_KEYS.map((k) => [k, { ...fallbackDay }])) as WeekHours;
  if (!raw || typeof raw !== 'object') return defaults;
  const result = { ...defaults };
  for (const key of DAY_KEYS) {
    const d = (raw as Record<string, unknown>)[key];
    if (d && typeof d === 'object') {
      const day = d as Record<string, unknown>;
      result[key] = {
        open: typeof day.open === 'string' ? day.open : fallbackDay.open,
        close: typeof day.close === 'string' ? day.close : fallbackDay.close,
        closed: typeof day.closed === 'boolean' ? day.closed : false,
      };
    }
  }
  return result;
}

function fmt12(t24: string): string {
  const [hStr, mStr] = t24.split(':');
  const h = parseInt(hStr, 10);
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mStr} ${period}`;
}

// ─── Branding helpers ─────────────────────────────────────────────────────────

function brandPrimary(restaurant: PublicRestaurant): string {
  return restaurant.brand_color || '#FF6B00';
}

function darken(hex: string, amount = 30): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, (n >> 16) - amount);
  const g = Math.max(0, ((n >> 8) & 0xff) - amount);
  const b = Math.max(0, (n & 0xff) - amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// D2: accent color tints tag pills per restaurant branding
function TagPill({ tag, accentColor }: { tag: string; accentColor: string }) {
  return (
    <span
      className="rounded-full px-3 py-1 text-xs font-bold"
      style={{ backgroundColor: `${accentColor}1a`, color: accentColor }}
    >
      {tag}
    </span>
  );
}

function PriceBadge({
  price,
  effectivePrice,
  discountLabel,
  color,
}: {
  price: number | null;
  effectivePrice: number | null;
  discountLabel: string | null;
  color: string;
}) {
  if (price == null) return null;
  const isOnSpecial = discountLabel != null && effectivePrice != null && effectivePrice > 0 && effectivePrice !== price;
  if (!isOnSpecial && effectivePrice != null && effectivePrice <= 0) {
    console.error('[PriceBadge] Invalid effectivePrice', effectivePrice, '— rendering original price.');
  }
  if (isOnSpecial) {
    return (
      <div className="flex items-baseline gap-1.5">
        <span className="text-xs text-stone-400 line-through">
          ${Number(price).toFixed(2)}
        </span>
        <span className="text-base font-black" style={{ color }}>
          ${Number(effectivePrice).toFixed(2)}
        </span>
      </div>
    );
  }
  return (
    <span className="text-base font-black" style={{ color }}>
      ${Number(price).toFixed(2)}
    </span>
  );
}

function ItemPlaceholder() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-stone-100 text-3xl">
      🍽️
    </div>
  );
}

// Menu item card — 2-column grid
// V4 commerce density final: h-24 image, no description, micro 20px metadata zone, price-first hierarchy.
function MenuItemCard({
  item,
  brandColor,
  accentColor,
  onTap,
  onAddToCart,
}: {
  item: PublicMenuItem;
  brandColor: string;
  accentColor: string;
  onTap: () => void;
  onAddToCart?: () => void;
}) {
  const isSoldOut = !item.available;
  const isPopular = (item.tags || []).includes('popular');

  // Tier 1 left overlay — Discount only (Rule 58/59).
  // Sold Out uses full inset overlay and suppresses this slot entirely (Rule 60).
  const showDiscountBadge = !isSoldOut && item.special_active;

  // V4: Featured shows in metadata zone only when item is also on special (Tier 3 rule).
  // Chef Special removed from public grid card (lives in detail modal only).
  const showFeaturedLabel = !isSoldOut && item.is_featured && item.special_active;

  return (
    <button
      type="button"
      onClick={isSoldOut ? undefined : onTap}
      aria-disabled={isSoldOut || undefined}
      className={`flex flex-col overflow-hidden rounded-2xl bg-white text-left shadow-md transition-all duration-150 ${
        isSoldOut ? 'cursor-default opacity-60' : 'active:scale-[0.98]'
      }`}
      style={{
        borderTop: item.is_featured ? `3px solid ${accentColor}` : undefined,
      }}
    >
      {/* Image — h-24 crop for denser grid (Part 5) */}
      <div className="relative h-24 w-full shrink-0 overflow-hidden bg-stone-100">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <ItemPlaceholder />
        )}
        {/* Tier 2 — Right overlay: Featured (suppressed when on special or sold out; Rule 58) */}
        {item.is_featured && !item.special_active && !isSoldOut && (
          <span
            className="absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-black text-white shadow-sm"
            style={{ backgroundColor: accentColor }}
          >
            ⭐ Featured
          </span>
        )}
        {/* Tier 1 — Left overlay: Discount — no emoji, commerce style */}
        {showDiscountBadge && (
          <span className="absolute left-2 top-2 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-black text-white shadow-sm">
            {item.discount_label}
          </span>
        )}
        {/* Sold Out — full inset overlay, all badge slots suppressed at DOM level (Rule 60) */}
        {isSoldOut && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <span className="rounded-full bg-white/90 px-3 py-1 text-[10px] font-black text-stone-700 shadow-sm">
              🚫 Sold Out
            </span>
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="flex flex-1 flex-col p-3">
        {/* Name: 2-line clamp */}
        <p className="line-clamp-2 text-sm font-black leading-tight text-stone-800">
          {item.name}
        </p>

        {/* Metadata zone — always 20px (h-5) for vertical alignment across grid (Part 1).
            Shows Featured + Popular only; Chef lives in detail modal (Part 3). */}
        <div className="mt-1 flex h-5 items-center gap-x-1.5 overflow-hidden">
          {showFeaturedLabel && (
            <span
              className="text-[9px] font-semibold leading-none"
              style={{ color: accentColor }}
            >
              ⭐ Featured
            </span>
          )}
          {!isSoldOut && isPopular && (
            <span className="text-[9px] font-semibold leading-none text-orange-500">
              🔥 Popular
            </span>
          )}
        </div>

        {/* Price + add-to-cart row */}
        <div className="mt-0.5 flex items-center justify-between gap-1">
          <PriceBadge
            price={item.price}
            effectivePrice={item.effective_price}
            discountLabel={item.discount_label}
            color={brandColor}
          />
          {onAddToCart && !isSoldOut && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAddToCart();
              }}
              aria-label={`Add ${item.name} to cart`}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white shadow-sm active:scale-90"
              style={{ backgroundColor: brandColor }}
            >
              <span className="text-base font-black leading-none">+</span>
            </button>
          )}
        </div>
      </div>
    </button>
  );
}

// Item detail bottom sheet
function ItemDetailSheet({
  item,
  visible,
  brandColor,
  accentColor,
  onClose,
  orderingEnabled = false,
  cart,
  restaurantId,
}: {
  item: PublicMenuItem;
  visible: boolean;
  brandColor: string;
  accentColor: string;
  onClose: () => void;
  orderingEnabled?: boolean;
  cart?: ReturnType<typeof useCart>;
  restaurantId?: string;
}) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const [panelQty, setPanelQty] = useState(1);
  const [panelInstructions, setPanelInstructions] = useState('');

  // Reset ordering state when a different item is opened
  useEffect(() => {
    setPanelQty(1);
    setPanelInstructions('');
  }, [item.id]);

  // C1: Focus close button when sheet opens so keyboard users land in the dialog
  useEffect(() => {
    if (visible) closeBtnRef.current?.focus();
  }, [visible]);

  // B1: iOS-safe scroll lock — position:fixed preserves scroll on Mobile Safari
  useEffect(() => {
    if (!visible) return;
    const scrollY = window.scrollY;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, scrollY);
    };
  }, [visible]);

  // C2: Focus trap (WCAG 2.1.2) + Escape to close
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = e.currentTarget.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  function handleAddToCart() {
    if (!cart || !restaurantId) return;
    const existing = cart.items.find((i) => i.menu_item_id === item.id);
    const newTotal = (existing?.quantity ?? 0) + panelQty;
    if (!existing) {
      cart.addItem(
        {
          menu_item_id: item.id,
          name: item.name,
          price: item.price ?? 0,
          effective_price: item.effective_price ?? item.price ?? 0,
          special_active: item.special_active,
        },
        restaurantId,
      );
    }
    cart.updateQuantity(item.id, newTotal);
    if (panelInstructions.trim()) {
      cart.updateInstructions(item.id, panelInstructions.trim());
    }
    onClose();
  }

  const displayPrice = (item.special_active && item.effective_price != null)
    ? item.effective_price
    : (item.price ?? 0);

  return (
    // C3: aria-labelledby ties the dialog title to this container for screen readers
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="item-sheet-title"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        style={{ opacity: visible ? 1 : 0, transition: 'opacity 300ms ease-out' }}
        onClick={onClose}
      />

      {/* Sheet — flex column so scrollable body and sticky CTA coexist */}
      <div
        className="absolute bottom-0 left-0 right-0 max-h-[88vh] flex flex-col rounded-t-3xl bg-white"
        style={{
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 300ms ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Non-scrolling header ── */}
        <div className="shrink-0">
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="h-1 w-10 rounded-full bg-stone-300" />
          </div>

          {/* B2: 44×44px close button meets minimum touch target */}
          <div className="flex items-center justify-between px-5 pt-1">
            <div />
            <button
              ref={closeBtnRef}
              type="button"
              onClick={onClose}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-stone-100 text-stone-600"
              aria-label="Close"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {/* Image */}
          {item.image_url ? (
            <div className="mx-5 mt-3 overflow-hidden rounded-2xl bg-stone-100">
              <img
                src={item.image_url}
                alt={item.name}
                className="max-h-64 w-full object-cover"
                loading="lazy"
              />
            </div>
          ) : (
            <div className="mx-5 mt-3 flex h-40 items-center justify-center rounded-2xl bg-stone-100 text-5xl">
              🍽️
            </div>
          )}

          {/* Content */}
          <div className="px-5 pb-8 pt-5">
            {/* C3: id matches aria-labelledby on the dialog */}
            <h2 id="item-sheet-title" className="text-2xl font-black leading-tight text-stone-900">
              {item.name}
            </h2>

            {item.price != null && (
              <div className="mt-2">
                {item.special_active && item.effective_price != null && item.effective_price > 0 && item.effective_price !== item.price ? (
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-lg font-semibold text-stone-400 line-through">
                      ${Number(item.price).toFixed(2)}
                    </span>
                    <span className="text-2xl font-black" style={{ color: brandColor }}>
                      ${Number(item.effective_price).toFixed(2)}
                    </span>
                    <span className="rounded-full bg-emerald-500 px-2.5 py-1 text-xs font-black text-white">
                      {item.discount_label}
                    </span>
                  </div>
                ) : (
                  <p className="text-2xl font-black" style={{ color: brandColor }}>
                    ${Number(item.price).toFixed(2)}
                  </p>
                )}
              </div>
            )}

            {/* Merchandising + availability badges — mirrors admin Quick Action states */}
            {(item.special_active || item.is_featured || (item.tags || []).includes('chef_special') || (item.tags || []).includes('popular') || !item.available) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {item.special_active && (
                  <span className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-black text-white">
                    💸 On Special
                  </span>
                )}
                {item.is_featured && (
                  <span
                    className="rounded-full px-3 py-1 text-xs font-black"
                    style={{ backgroundColor: `${accentColor}1a`, color: accentColor }}
                  >
                    ⭐ Featured
                  </span>
                )}
                {(item.tags || []).includes('chef_special') && (
                  <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-black text-purple-700">
                    👨‍🍳 Chef Special
                  </span>
                )}
                {(item.tags || []).includes('popular') && (
                  <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-black text-orange-600">
                    🔥 Popular
                  </span>
                )}
                {!item.available && (
                  <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-black text-red-600">
                    🚫 Sold Out
                  </span>
                )}
              </div>
            )}

            {item.description && (
              <p className="mt-3 text-sm leading-relaxed text-stone-600">{item.description}</p>
            )}

            {/* User-authored tags — chef_special and popular are shown as badges above */}
            {(item.tags || []).filter((t) => t !== 'chef_special' && t !== 'popular').length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {(item.tags || [])
                  .filter((t) => t !== 'chef_special' && t !== 'popular')
                  .map((tag) => (
                    <TagPill key={tag} tag={tag} accentColor={accentColor} />
                  ))}
              </div>
            )}

            {/* ── Ordering section (quantity + instructions) ── */}
            {orderingEnabled && item.available && (
              <div className="mt-6 border-t border-stone-100 pt-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-black text-stone-700">Quantity</p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setPanelQty((q) => Math.max(1, q - 1))}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 text-lg font-black text-stone-700 active:bg-stone-200"
                      aria-label="Decrease quantity"
                    >
                      −
                    </button>
                    <span className="w-6 text-center text-base font-black text-stone-900">
                      {panelQty}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPanelQty((q) => Math.min(99, q + 1))}
                      className="flex h-9 w-9 items-center justify-center rounded-full text-white text-lg font-black active:opacity-80"
                      style={{ backgroundColor: brandColor }}
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>
                </div>

                <textarea
                  value={panelInstructions}
                  onChange={(e) => setPanelInstructions(e.target.value)}
                  placeholder="Special instructions — e.g. no onions, extra sauce"
                  maxLength={200}
                  rows={2}
                  className="mt-3 w-full resize-none rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700 placeholder:text-stone-400 focus:outline-none focus:ring-1"
                  style={{ '--tw-ring-color': brandColor } as React.CSSProperties}
                />
              </div>
            )}
          </div>
        </div>

        {/* ── Sticky ordering CTA ── */}
        {orderingEnabled && (
          <div
            className="shrink-0 border-t border-stone-100 bg-white px-5 py-4"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
          >
            {item.available ? (
              <button
                type="button"
                onClick={handleAddToCart}
                className="w-full rounded-2xl py-4 text-base font-black text-white shadow-lg active:opacity-80"
                style={{ backgroundColor: brandColor }}
              >
                Add to Order — ${(displayPrice * panelQty).toFixed(2)}
              </button>
            ) : (
              <div className="flex items-center justify-center rounded-2xl bg-stone-100 py-4">
                <span className="text-sm font-black text-stone-400">Currently unavailable</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Floating Reward Widget ───────────────────────────────────────────────────

function RewardWidget({
  promotion,
  playUrl,
  accentColor,
}: {
  promotion: PublicPromotion;
  playUrl: string;
  accentColor: string;
}) {
  const pool = useMemo(
    () => (promotion.game_types.length > 0 ? promotion.game_types : [promotion.game_type ?? 'spin_wheel']),
    [promotion.game_types, promotion.game_type],
  );
  const [displayType, setDisplayType] = useState<string>(
    () => pool[Math.floor(Math.random() * pool.length)],
  );
  const [expanded, setExpanded] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [launching, setLaunching] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const launchBtnRef = useRef<HTMLButtonElement>(null);

  if (!promotion.game_type) {
    console.error('[RewardWidget] promotion.game_type is null — is_primary assignment may be missing for this promotion.');
  }
  const buttonVisual = getGameVisual(promotion.game_type ?? 'spin_wheel', 28);
  const panelData = getGameVisual(displayType, 88);
  const gameMeta = getGameMeta(displayType);

  function handlePlay() {
    if (launching) return;
    setLaunching(true);
    if (launchBtnRef.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      fireButtonConfetti(launchBtnRef.current.getBoundingClientRect());
    }
    setTimeout(() => { window.location.href = playUrl; }, 500);
  }

  useEffect(() => {
    if (sheetVisible) closeBtnRef.current?.focus();
  }, [sheetVisible]);

  useEffect(() => {
    if (!expanded) return;
    const scrollY = window.scrollY;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, scrollY);
    };
  }, [expanded]);

  function openSheet() {
    setDisplayType(pool[Math.floor(Math.random() * pool.length)]);
    setExpanded(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setSheetVisible(true));
    });
  }

  function closeSheet() {
    setSheetVisible(false);
    setTimeout(() => setExpanded(false), 300);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') { e.preventDefault(); closeSheet(); return; }
    if (e.key !== 'Tab') return;
    const focusable = e.currentTarget.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  return (
    <>
      {/* Collapsed floating button */}
      <button
        type="button"
        onClick={openSheet}
        aria-label="View today's promotion"
        className="fixed right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full shadow-xl"
        style={{
          backgroundColor: accentColor,
          bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {buttonVisual.visual}
      </button>

      {/* Bottom sheet */}
      {expanded && (
        <div
          className="fixed inset-0 z-50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="widget-sheet-title"
          onKeyDown={handleKeyDown}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            style={{ opacity: sheetVisible ? 1 : 0, transition: 'opacity 300ms ease-out' }}
            onClick={closeSheet}
          />

          {/* Sheet */}
          <div
            className="absolute bottom-0 left-0 right-0 overflow-hidden rounded-t-3xl bg-white"
            style={{
              transform: sheetVisible ? 'translateY(0)' : 'translateY(100%)',
              transition: 'transform 300ms ease-out',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3">
              <div className="h-1 w-10 rounded-full bg-stone-300" />
            </div>

            {/* Close button */}
            <div className="flex justify-end px-4 pt-2">
              <button
                ref={closeBtnRef}
                type="button"
                onClick={closeSheet}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-stone-600"
                aria-label="Close"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>

            {/* Game visual header */}
            <div
              className="mx-4 rounded-3xl px-6 pb-8 pt-6 text-center"
              style={{ background: `linear-gradient(160deg, ${accentColor} 0%, ${darken(accentColor, 35)} 100%)` }}
            >
              <div
                className="flex justify-center"
                style={{ filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.45))' }}
              >
                {panelData.visual}
              </div>
              <p
                className="mt-4 text-xs font-black uppercase tracking-widest"
                style={{ color: 'rgba(255,255,255,0.7)' }}
              >
                {gameMeta.label}
              </p>
            </div>

            {/* Headline + CTA */}
            <div className="px-6 pb-8 pt-6 text-center">
              <h2 id="widget-sheet-title" className="text-2xl font-black text-stone-900">
                {panelData.headline}
              </h2>
              <p className="mt-2 text-sm text-stone-500">{panelData.subline}</p>
              <button
                ref={launchBtnRef}
                type="button"
                onClick={handlePlay}
                disabled={launching}
                className="mt-6 block w-full rounded-2xl py-4 text-center text-sm font-black text-white shadow-md active:scale-95 disabled:opacity-70"
                style={{ backgroundColor: accentColor, transition: 'transform 150ms, opacity 150ms' }}
              >
                {launching ? 'Launching…' : 'Play Now'}
              </button>
              <p className="mt-4 text-xs text-stone-400">
                No purchase necessary • takes less than 10 seconds
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Brand icons ─────────────────────────────────────────────────────────────

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

// ─── Confetti ─────────────────────────────────────────────────────────────────
// Full-screen celebration: 170+ particles from top, falls ~1.2–1.8 s.

function fireButtonConfetti(rect: DOMRect) {
  const colors = ['#FF6B00', '#FFD166', '#00C853', '#E63939', '#2DD4BF', '#FFFFFF', '#F97316'];
  const x = (rect.left + rect.width / 2) / window.innerWidth;
  const y = (rect.top + rect.height / 2) / window.innerHeight;
  confetti({ particleCount: 30, spread: 55, origin: { x, y }, colors, scalar: 0.7, ticks: 60, startVelocity: 18, gravity: 1.2 });
}

function fireFullScreenConfetti() {
  const colors = ['#FF6B00', '#FFD166', '#00C853', '#E63939', '#2DD4BF', '#FFFFFF', '#F97316'];
  // Volley 1 — left, immediate
  confetti({ particleCount: 45, spread: 85, origin: { x: 0.2, y: 0 }, colors, gravity: 1.2, scalar: 1.2, ticks: 90, startVelocity: 35 });
  // Volley 2 — right, +100 ms stagger
  setTimeout(() => {
    confetti({ particleCount: 45, spread: 85, origin: { x: 0.8, y: 0 }, colors, gravity: 1.2, scalar: 1.2, ticks: 90, startVelocity: 35 });
  }, 100);
  // Volley 3 — centre, +200 ms fills the gap
  setTimeout(() => {
    confetti({ particleCount: 40, spread: 110, origin: { x: 0.5, y: 0 }, colors, gravity: 1.0, scalar: 1.0, ticks: 90, startVelocity: 30 });
  }, 200);
  // Volley 4 — quarter points, +350 ms extra coverage
  setTimeout(() => {
    confetti({ particleCount: 20, spread: 70, origin: { x: 0.35, y: 0 }, colors, gravity: 1.3, scalar: 1.1, ticks: 80, startVelocity: 32 });
    confetti({ particleCount: 20, spread: 70, origin: { x: 0.65, y: 0 }, colors, gravity: 1.3, scalar: 1.1, ticks: 80, startVelocity: 32 });
  }, 350);
}

// ─── Game Entry Modal ─────────────────────────────────────────────────────────
// Compact first-load popup. Shows once per promotion per browser SESSION via sessionStorage.
// Closing tab / browser clears the session → modal reappears on next visit.

function GameEntryModal({
  promotion,
  playUrl,
  accentColor,
  onClose,
}: {
  promotion: PublicPromotion;
  playUrl: string;
  accentColor: string;
  onClose: () => void;
}) {
  const reducedMotionRef = useRef(false);
  const [boosted, setBoosted] = useState(false);
  const [visible, setVisible] = useState(false);
  const notNowRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    reducedMotionRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => { requestAnimationFrame(() => setVisible(true)); });
  }, []);

  useEffect(() => {
    if (visible) notNowRef.current?.focus();
  }, [visible]);

  // iOS-safe scroll lock
  useEffect(() => {
    const scrollY = window.scrollY;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, scrollY);
    };
  }, []);

  function dismiss() {
    setVisible(false);
    const trigger = triggerRef.current;
    setTimeout(() => { onClose(); trigger?.focus(); triggerRef.current = null; }, 300);
  }

  function handlePlay(e: React.MouseEvent<HTMLAnchorElement>) {
    if (reducedMotionRef.current) return;
    e.preventDefault();
    setBoosted(true);
    fireFullScreenConfetti();
    const delay = 700 + Math.floor(Math.random() * 200);
    setTimeout(() => { window.location.href = playUrl; }, delay);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') { e.preventDefault(); dismiss(); return; }
    if (e.key !== 'Tab') return;
    const focusable = e.currentTarget.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  // 72px — clear without dominating the modal
  const { visual: gameVisual } = getGameVisual(promotion.game_type, 72, boosted);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-modal-title"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        style={{ opacity: visible ? 1 : 0, transition: 'opacity 300ms ease-out' }}
        onClick={dismiss}
        aria-hidden="true"
      />

      {/* Modal card */}
      <div
        className="relative w-full max-w-xs overflow-hidden rounded-3xl bg-white shadow-2xl"
        style={{
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(32px) scale(0.95)',
          opacity: visible ? 1 : 0,
          transition: 'transform 300ms ease-out, opacity 300ms ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Gradient header */}
        <div
          className="px-6 pb-6 pt-6 text-center"
          style={{ background: `linear-gradient(160deg, ${accentColor} 0%, ${darken(accentColor, 35)} 100%)` }}
        >
          <span className="inline-block rounded-full bg-white/25 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-white">
            Winner !!
          </span>
          <div
            className="mt-4 flex justify-center"
            style={{ filter: 'drop-shadow(0 6px 20px rgba(0,0,0,0.45))' }}
          >
            {gameVisual}
          </div>
        </div>

        {/* Body */}
        <div className="px-6 pb-6 pt-5 text-center">
          <h2 id="game-modal-title" className="text-2xl font-black text-stone-900">
            Play To Win
          </h2>
          <p className="mt-1.5 text-sm text-stone-500">No Purchase Necessary</p>

          <a
            href={playUrl}
            onClick={handlePlay}
            className="mt-5 flex min-h-[44px] items-center justify-center rounded-2xl text-sm font-black text-white shadow-md active:scale-95"
            style={{ backgroundColor: accentColor, transition: 'transform 150ms' }}
          >
            Play Now
          </a>

          <button
            ref={notNowRef}
            type="button"
            onClick={dismiss}
            className="mt-3 flex min-h-[44px] w-full items-center justify-center rounded-2xl text-sm font-semibold text-stone-500 active:scale-95"
            style={{ transition: 'transform 150ms' }}
          >
            Not Now
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function RestaurantPublicPage({
  restaurant,
  sections,
  promotion,
  promotionRewards,
  orderingEnabled = false,
  visitSessionId = null,
  touchpointName = null,
  onItemViewed,
  onOrderPlaced,
  sessionOrderCount = 0,
  onMyOrdersClick,
}: {
  restaurant: PublicRestaurant;
  sections: PublicSection[];
  promotion?: PublicPromotion | null;
  promotionRewards?: PublicReward[];
  orderingEnabled?: boolean;
  visitSessionId?: string | null;
  touchpointName?: string | null;
  onItemViewed?: (itemId?: string) => void;
  onOrderPlaced?: () => void;
  sessionOrderCount?: number;
  onMyOrdersClick?: () => void;
}) {
  const brandColor = brandPrimary(restaurant);
  const accentColor = restaurant.accent_color || restaurant.brand_color || '#f59e0b';
  const heroFallbackGradient = `linear-gradient(135deg, ${brandColor} 0%, ${darken(brandColor, 40)} 100%)`;

  const hasPromotion = !!promotion;
  // Append vsid to play URL when in a session context so promotion interactions are attributed
  const playUrlBase = promotion ? `/play/${restaurant.slug}/${promotion.slug}` : '';
  const playUrl = playUrlBase && visitSessionId
    ? `${playUrlBase}?vsid=${visitSessionId}`
    : playUrlBase;

  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());

  const filteredSections = useMemo(() => {
    if (activeFilters.size === 0) return sections;
    return sections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => {
          if (activeFilters.has('available') && !item.available) return false;
          if (activeFilters.has('featured') && !item.is_featured) return false;
          if (activeFilters.has('chef_special') && !(item.tags || []).includes('chef_special')) return false;
          if (activeFilters.has('popular') && !(item.tags || []).includes('popular')) return false;
          if (activeFilters.has('on_special') && !item.special_active) return false;
          return true;
        }),
      }))
      .filter((section) => section.items.length > 0);
  }, [sections, activeFilters]);

  function toggleFilter(filterId: FilterId) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(filterId)) next.delete(filterId);
      else next.add(filterId);
      return next;
    });
  }

  function resetFilters() {
    setActiveFilters(new Set());
  }

  const cart = useCart();
  const [cartSheetOpen, setCartSheetOpen] = useState(false);

  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());
  const stickyRef = useRef<HTMLDivElement>(null);
  const [activeSection, setActiveSection] = useState<string>(sections[0]?.id ?? '');
  const [selectedItem, setSelectedItem] = useState<PublicMenuItem | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);

  // null = not yet checked (avoids hydration flash), false = show modal, true = dismissed
  const [modalDismissed, setModalDismissed] = useState<boolean | null>(null);
  // true once the 700–900 ms appearance delay has elapsed; prevents instant pop-in
  const [modalReady, setModalReady] = useState(false);
  const promotionId = promotion?.id;

  // Step 1: check sessionStorage (per-session, not per-browser)
  useEffect(() => {
    if (!promotionId) { setModalDismissed(true); return; }
    const key = `game-entry-modal-dismissed-${promotionId}`;
    setModalDismissed(!!sessionStorage.getItem(key));
  }, [promotionId]);

  // Step 2: once storage resolves to "show", wait 700–900 ms so customer sees page first
  useEffect(() => {
    if (modalDismissed !== false) return;
    const delay = 700 + Math.floor(Math.random() * 200);
    const timer = setTimeout(() => setModalReady(true), delay);
    return () => clearTimeout(timer);
  }, [modalDismissed]);

  function handleModalClose() {
    if (promotionId) {
      sessionStorage.setItem(`game-entry-modal-dismissed-${promotionId}`, '1');
    }
    setModalDismissed(true);
    setModalReady(false);
  }

  // C1: remember which element triggered the sheet so focus returns on close
  const triggerRef = useRef<HTMLElement | null>(null);

  // Scroll to section — offset derived from live sticky bar height to handle any sticky bar height.
  const scrollToSection = useCallback((sectionId: string) => {
    const el = sectionRefs.current.get(sectionId);
    if (!el) return;
    const stickyHeight = stickyRef.current?.offsetHeight ?? 120;
    const y = el.getBoundingClientRect().top + window.scrollY - stickyHeight - 8;
    window.scrollTo({ top: y, behavior: 'smooth' });
  }, []);

  // Reset active section to first visible section when filters change.
  useEffect(() => {
    setActiveSection(filteredSections[0]?.id ?? '');
  }, [filteredSections]);

  // IntersectionObserver for active section tracking.
  // Re-registers whenever filteredSections changes so only rendered sections are observed.
  useEffect(() => {
    if (filteredSections.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute('data-section-id');
            if (id) setActiveSection(id);
          }
        }
      },
      { rootMargin: '-10% 0% -60% 0%', threshold: 0 }
    );
    sectionRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [filteredSections]);

  // Scroll active nav pill into view
  const navRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!navRef.current || !activeSection) return;
    const pill = navRef.current.querySelector(`[data-nav-id="${activeSection}"]`) as HTMLElement | null;
    pill?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeSection]);

  function openSheet(item: PublicMenuItem) {
    // C1: capture trigger element before mounting sheet
    triggerRef.current = document.activeElement as HTMLElement ?? null;
    setSelectedItem(item);
    // Notify session layer for menu_items_viewed analytics (Task 9)
    onItemViewed?.(item.id);
    // Double rAF: ensure DOM is painted before CSS transition triggers
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setSheetVisible(true));
    });
  }

  function closeSheet() {
    setSheetVisible(false);
    // C1: restore focus to trigger after close animation (300ms)
    const trigger = triggerRef.current;
    setTimeout(() => {
      setSelectedItem(null);
      trigger?.focus();
      triggerRef.current = null;
    }, 300);
  }

  const hasHours = !!restaurant.hours;
  const parsedHours = hasHours ? parseWeekHours(restaurant.hours) : null;
  const allDaysClosed = parsedHours ? DAY_KEYS.every((k) => parsedHours[k].closed) : true;

  const address = [restaurant.address_line1, restaurant.city, restaurant.province_state]
    .filter(Boolean)
    .join(', ');

  const hasContactLinks =
    restaurant.website_url ||
    restaurant.google_maps_url ||
    restaurant.instagram_url ||
    restaurant.facebook_url;

  return (
    // D1: secondary_color provides a per-restaurant page background tint at ~4% opacity
    <div
      className="min-h-screen"
      style={{
        backgroundColor: restaurant.secondary_color
          ? `${restaurant.secondary_color}0a`
          : '#fafaf9',
      }}
    >

      {/* ── Hero ── */}
      <div className="relative">
        {restaurant.hero_image_url ? (
          // A1: fetchPriority (was priority-hint which is silently ignored)
          <img
            src={restaurant.hero_image_url}
            alt={`${restaurant.name} hero`}
            className="h-64 w-full object-cover"
            fetchPriority="high"
          />
        ) : (
          <div className="h-56 w-full" style={{ background: heroFallbackGradient }} />
        )}
        {/* A4: gradient overlay only when a real hero image exists — avoids gradient-on-gradient */}
        {restaurant.hero_image_url && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        )}
      </div>

      {/* ── Info card ── */}
      {/* A2: logo straddles hero/card boundary via absolute -top-10 */}
      {/* Change 5: pb-3 (was pb-6) — game card overlaps this bottom edge by ~16px */}
      <div className="relative -mt-8 rounded-t-3xl bg-white px-5 pb-3 pt-5 shadow-xl">
        {restaurant.logo_url && (
          <div className="absolute -top-10 left-5 h-20 w-20 overflow-hidden rounded-2xl bg-white p-1.5 shadow-xl ring-1 ring-stone-100">
            <img
              src={restaurant.logo_url}
              alt={`${restaurant.name} logo`}
              className="h-full w-full object-contain"
            />
          </div>
        )}

        {/* A3: logo is above the name, not beside it */}
        <h1
          className={`text-3xl font-black leading-tight${restaurant.logo_url ? ' mt-12' : ''}`}
          style={{ color: brandColor }}
        >
          {restaurant.name}
        </h1>

        {restaurant.description && (
          <p className="mt-3 text-sm leading-relaxed text-stone-600">{restaurant.description}</p>
        )}

        <div className="mt-3 space-y-1.5">
          {address && (
            <p className="text-sm font-semibold text-stone-500">
              <span className="mr-1.5">📍</span>
              {address}
            </p>
          )}
          {restaurant.phone && (
            <a
              href={`tel:${restaurant.phone}`}
              className="block text-sm font-semibold text-stone-500"
            >
              <span className="mr-1.5">📞</span>
              {restaurant.phone}
            </a>
          )}
        </div>

        {/* ── Contact quick actions ── */}
        {hasContactLinks && (
          <div className="mt-3 flex gap-2.5">
            {restaurant.instagram_url && (
              <a
                href={restaurant.instagram_url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Follow us on Instagram (opens in new tab)"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-stone-100 active:scale-95"
                style={{ color: '#C13584', transition: 'transform 150ms' }}
              >
                <InstagramIcon className="h-5 w-5" />
              </a>
            )}
            {restaurant.facebook_url && (
              <a
                href={restaurant.facebook_url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Visit us on Facebook (opens in new tab)"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-stone-100 active:scale-95"
                style={{ color: '#1877F2', transition: 'transform 150ms' }}
              >
                <FacebookIcon className="h-5 w-5" />
              </a>
            )}
            {restaurant.website_url && (
              <a
                href={restaurant.website_url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Visit our website (opens in new tab)"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-stone-600 shadow-sm ring-1 ring-stone-100 active:scale-95"
                style={{ transition: 'transform 150ms' }}
              >
                <Globe className="h-5 w-5" aria-hidden="true" />
              </a>
            )}
            {restaurant.google_maps_url && (
              <a
                href={restaurant.google_maps_url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Get directions (opens in new tab)"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-stone-600 shadow-sm ring-1 ring-stone-100 active:scale-95"
                style={{ transition: 'transform 150ms' }}
              >
                <Navigation2 className="h-5 w-5" aria-hidden="true" />
              </a>
            )}
          </div>
        )}
      </div>

      {/* ── Hours ── */}
      {parsedHours && !allDaysClosed && (
        <div className="mx-4 mt-4 rounded-3xl bg-white px-5 py-4 shadow-md">
          {/* C7: stone-500 (4.6:1) replaces stone-400 (2.4:1 — fails WCAG AA) */}
          <h2 className="text-xs font-black uppercase tracking-widest text-stone-500">Hours</h2>
          <div className="mt-3 space-y-1.5">
            {DAY_KEYS.map((key) => {
              const d = parsedHours[key];
              return (
                <div key={key} className="flex items-center justify-between text-sm">
                  <span className="w-10 shrink-0 font-bold text-stone-500">{DAY_SHORT[key]}</span>
                  {d.closed ? (
                    // C7: stone-500 replaces stone-400
                    <span className="text-stone-500">Closed</span>
                  ) : (
                    <span className="text-stone-700">
                      {fmt12(d.open)} – {fmt12(d.close)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Menu ── */}
      <div className="mt-8" style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}>

        {/* Empty state — no menu at all */}
        {sections.length === 0 && (
          <div className="mx-4 rounded-3xl bg-white p-8 text-center shadow-md">
            <p className="text-4xl">🍽️</p>
            <p className="mt-3 text-xl font-black text-stone-700">Menu coming soon</p>
            <p className="mt-2 text-sm text-stone-500">
              We&apos;re putting the finishing touches on our menu. Check back soon!
            </p>
          </div>
        )}

        {/* ── Sticky action bar + category nav ── */}
        {sections.length > 0 && (
          <div
            ref={stickyRef}
            className="sticky top-0 z-30 bg-stone-50"
            style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
          >
            {/* Action bar: My Orders + Filter */}
            <div className="flex items-center justify-end gap-2 px-4 pb-2 pt-3">
              {sessionOrderCount > 0 && onMyOrdersClick && (
                <button
                  type="button"
                  onClick={onMyOrdersClick}
                  aria-label={`My Orders, ${sessionOrderCount} order${sessionOrderCount !== 1 ? 's' : ''}`}
                  className="flex h-11 items-center gap-2 rounded-full px-4 active:scale-95"
                  style={{
                    transition: 'transform 150ms',
                    backgroundColor: '#fff',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    border: '1px solid #e7e5e4',
                  }}
                >
                  <ShoppingCart className="h-4 w-4 text-stone-600" aria-hidden="true" />
                  <span className="text-sm font-semibold text-stone-700">
                    My Orders ({sessionOrderCount})
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setFilterDrawerOpen(true)}
                aria-label={`Filter menu${activeFilters.size > 0 ? `, ${activeFilters.size} active` : ''}`}
                className="flex h-11 items-center gap-2 rounded-full px-4 active:scale-95"
                style={{
                  transition: 'transform 150ms, background-color 150ms',
                  backgroundColor: activeFilters.size > 0 ? brandColor : '#fff',
                  boxShadow: activeFilters.size > 0
                    ? `0 2px 8px ${brandColor}44`
                    : '0 1px 3px rgba(0,0,0,0.08)',
                  border: activeFilters.size > 0 ? 'none' : '1px solid #e7e5e4',
                }}
              >
                <SlidersHorizontal
                  className="h-4 w-4"
                  style={{ color: activeFilters.size > 0 ? '#fff' : '#57534e' }}
                  aria-hidden="true"
                />
                <span
                  className="text-sm font-semibold"
                  style={{ color: activeFilters.size > 0 ? '#fff' : '#57534e' }}
                >
                  {activeFilters.size > 0 ? `Filter (${activeFilters.size})` : 'Filter'}
                </span>
              </button>
            </div>

            {/* Category nav — shows filtered sections; gradient fade signals scroll affordance */}
            {filteredSections.length > 1 && (
              <div className="relative">
                <div
                  ref={navRef}
                  className="flex gap-2 overflow-x-auto px-4 pb-3"
                  style={{ scrollbarWidth: 'none' } as React.CSSProperties}
                >
                  {filteredSections.map((section) => {
                    const isActive = activeSection === section.id;
                    return (
                      <button
                        key={section.id}
                        type="button"
                        data-nav-id={section.id}
                        onClick={() => scrollToSection(section.id)}
                        className="shrink-0 rounded-full px-4 py-3 text-sm font-black shadow-sm active:scale-95"
                        aria-current={isActive ? 'true' : undefined}
                        style={{
                          transition: 'transform 150ms, background-color 150ms, color 150ms',
                          ...(isActive
                            ? { backgroundColor: brandColor, color: '#fff' }
                            : { backgroundColor: '#fff', color: '#57534e' }),
                        }}
                      >
                        {section.name}
                      </button>
                    );
                  })}
                  {/* Trailing spacer — keeps last chip partially under the gradient fade */}
                  <div className="w-8 shrink-0" aria-hidden="true" />
                </div>
                {/* Gradient overlay — right edge fade signals horizontal scroll affordance */}
                <div
                  className="pointer-events-none absolute inset-y-0 right-0 w-12"
                  style={{ background: 'linear-gradient(to left, #fafaf9, transparent)' }}
                  aria-hidden="true"
                />
              </div>
            )}
          </div>
        )}

        {/* Empty state — active filters matched nothing */}
        {sections.length > 0 && filteredSections.length === 0 && (
          <div className="mx-4 mt-6 rounded-3xl bg-white p-8 text-center shadow-md">
            <p className="text-3xl">🔍</p>
            <p className="mt-3 text-lg font-black text-stone-700">No items match your filters</p>
            <button
              type="button"
              onClick={resetFilters}
              className="mt-4 rounded-2xl px-6 py-2.5 text-sm font-black text-white active:scale-95"
              style={{ backgroundColor: brandColor, transition: 'transform 150ms' }}
            >
              Clear Filters
            </button>
          </div>
        )}

        {/* Section list */}
        <div className="mt-6 space-y-10 px-4">
          {filteredSections.map((section) => (
            <div
              key={section.id}
              data-section-id={section.id}
              ref={(el) => {
                if (el) sectionRefs.current.set(section.id, el);
                else sectionRefs.current.delete(section.id);
              }}
            >
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-black" style={{ color: brandColor }}>
                  {section.name}
                </h2>
                <div
                  className="h-px flex-1 rounded-full"
                  style={{ backgroundColor: brandColor, opacity: 0.2 }}
                />
              </div>

              {section.items.length === 0 ? (
                <p className="mt-3 text-sm text-stone-500">
                  No items available in this category right now.
                </p>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {section.items.map((item) => (
                    <MenuItemCard
                      key={item.id}
                      item={item}
                      brandColor={brandColor}
                      accentColor={accentColor}
                      onTap={() => openSheet(item)}
                      onAddToCart={orderingEnabled ? () => cart.addItem(
                        {
                          menu_item_id: item.id,
                          name: item.name,
                          price: item.price ?? 0,
                          effective_price: item.effective_price ?? item.price ?? 0,
                          special_active: item.special_active,
                        },
                        restaurant.id,
                      ) : undefined}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Item detail bottom sheet ── */}
      {selectedItem && (
        <ItemDetailSheet
          item={selectedItem}
          visible={sheetVisible}
          brandColor={brandColor}
          accentColor={accentColor}
          onClose={closeSheet}
          orderingEnabled={orderingEnabled}
          cart={cart}
          restaurantId={restaurant.id}
        />
      )}

      {/* ── Floating Reward Widget ── */}
      {/* Widget is always present for re-engagement; modal sits above it (z-50 vs z-40) */}
      {hasPromotion && (
        <RewardWidget
          promotion={promotion!}
          playUrl={playUrl}
          accentColor={accentColor}
        />
      )}

      {/* ── Game Entry Modal ── */}
      {/* modalDismissed===false + modalReady===true: sessionStorage confirmed unseen and delay elapsed */}
      {hasPromotion && modalDismissed === false && modalReady && (
        <GameEntryModal
          promotion={promotion!}
          playUrl={playUrl}
          accentColor={accentColor}
          onClose={handleModalClose}
        />
      )}

      {/* ── Filter Drawer ── */}
      <MenuFilterDrawer
        open={filterDrawerOpen}
        accentColor={accentColor}
        activeFilters={activeFilters}
        onToggle={toggleFilter}
        onReset={resetFilters}
        onClose={() => setFilterDrawerOpen(false)}
      />

      {/* ── Cart Bar + Sheet (ordering only) ── */}
      {orderingEnabled && cart.itemCount > 0 && (
        <CartBar
          itemCount={cart.itemCount}
          subtotal={cart.subtotal}
          brandColor={brandColor}
          onOpen={() => setCartSheetOpen(true)}
        />
      )}
      {orderingEnabled && (
        <CartSheet
          open={cartSheetOpen}
          cart={cart}
          restaurantId={restaurant.id}
          brandColor={brandColor}
          onClose={() => setCartSheetOpen(false)}
          visitSessionId={visitSessionId}
          tableLabel={touchpointName}
          onOrderPlaced={onOrderPlaced}
        />
      )}
    </div>
  );
}
