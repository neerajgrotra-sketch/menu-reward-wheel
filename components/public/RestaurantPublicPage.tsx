'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Globe, Navigation2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import type { PublicRestaurant, PublicSection, PublicMenuItem, PublicPromotion, PublicReward } from '@/app/r/[restaurantSlug]/page';
import { getGameVisual, type GameType } from '@/components/game-visuals/GameVisual';

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

function PriceBadge({ price, color }: { price: number | null; color: string }) {
  if (price == null) return null;
  return (
    <span className="text-sm font-black" style={{ color }}>
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
function MenuItemCard({
  item,
  brandColor,
  accentColor,
  isRewardItem,
  onTap,
}: {
  item: PublicMenuItem;
  brandColor: string;
  accentColor: string;
  isRewardItem?: boolean;
  onTap: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      className="overflow-hidden rounded-2xl bg-white text-left shadow-md active:scale-95"
      style={{
        transition: 'transform 150ms',
        // D3: colored top border replaces the near-invisible outline treatment
        borderTop: item.is_featured ? `3px solid ${accentColor}` : undefined,
      }}
    >
      <div className="relative h-28 w-full overflow-hidden bg-stone-100">
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
        {item.is_featured && (
          // D2/D3: accent_color badge with legible text label
          <span
            className="absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-black text-white shadow-sm"
            style={{ backgroundColor: accentColor }}
          >
            ★ Featured
          </span>
        )}
        {isRewardItem && (
          <span
            className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-black text-white shadow-sm"
            style={{ backgroundColor: accentColor }}
          >
            🎁 Win This
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="line-clamp-2 text-sm font-black leading-tight text-stone-800">{item.name}</p>
        {item.description && (
          // C7: stone-500 replaces stone-400
          <p className="mt-1 line-clamp-2 text-xs text-stone-500">{item.description}</p>
        )}
        <div className="mt-2">
          <PriceBadge price={item.price} color={brandColor} />
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
}: {
  item: PublicMenuItem;
  visible: boolean;
  brandColor: string;
  accentColor: string;
  onClose: () => void;
}) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // C1: Focus close button when sheet opens so keyboard users land in the dialog
  useEffect(() => {
    if (visible) closeBtnRef.current?.focus();
  }, [visible]);

  // B1: iOS-safe scroll lock — position:fixed preserves scroll on Mobile Safari
  // document.body.overflow = 'hidden' alone does not block scrolling on iOS Safari
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

      {/* Sheet */}
      <div
        className="absolute bottom-0 left-0 right-0 max-h-[88vh] overflow-y-auto rounded-t-3xl bg-white overscroll-contain"
        style={{
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 300ms ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
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
        <div className="px-5 pb-10 pt-5">
          {/* C3: id matches aria-labelledby on the dialog */}
          <h2 id="item-sheet-title" className="text-2xl font-black leading-tight text-stone-900">
            {item.name}
          </h2>

          {item.price != null && (
            <p className="mt-2 text-2xl font-black" style={{ color: brandColor }}>
              ${Number(item.price).toFixed(2)}
            </p>
          )}

          {item.description && (
            <p className="mt-3 text-sm leading-relaxed text-stone-600">{item.description}</p>
          )}

          {item.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {item.tags.map((tag) => (
                // D2: accent-tinted tag pills
                <TagPill key={tag} tag={tag} accentColor={accentColor} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Floating Reward Widget ───────────────────────────────────────────────────

function RewardWidget({
  promotion,
  rewards,
  playUrl,
  accentColor,
}: {
  promotion: PublicPromotion;
  rewards: PublicReward[];
  playUrl: string;
  accentColor: string;
}) {
  const widgetVisual = getGameVisual(promotion.game_type, 28);
  const [expanded, setExpanded] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

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
        aria-label="View today's reward"
        className="fixed right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full shadow-xl"
        style={{
          backgroundColor: accentColor,
          bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {widgetVisual.visual}
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
            className="absolute bottom-0 left-0 right-0 max-h-[80vh] overflow-y-auto rounded-t-3xl bg-white overscroll-contain"
            style={{
              transform: sheetVisible ? 'translateY(0)' : 'translateY(100%)',
              transition: 'transform 300ms ease-out',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-stone-300" />
            </div>

            <div className="flex items-center justify-between px-5 pt-2">
              <h2 id="widget-sheet-title" className="text-lg font-black text-stone-900">
                Today&apos;s Rewards
              </h2>
              <button
                ref={closeBtnRef}
                type="button"
                onClick={closeSheet}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-stone-100 text-stone-600"
                aria-label="Close"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>

            <div className="px-5 pb-8 pt-3">
              <p className="font-black text-stone-900">{promotion.name}</p>

              {rewards.length > 0 && (
                <ul className="mt-3 space-y-2" aria-label="Available rewards">
                  {rewards.map((r) => (
                    <li key={r.id} className="flex items-center gap-2 text-sm font-semibold text-stone-700">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: accentColor }} aria-hidden="true" />
                      {r.label}
                    </li>
                  ))}
                </ul>
              )}

              <p className="mt-3 text-sm text-stone-500">
                Play today&apos;s game and you could win a free item or discount.
              </p>

              <a
                href={playUrl}
                className="mt-5 block rounded-2xl py-4 text-center text-sm font-black text-white shadow-md active:scale-95"
                style={{ backgroundColor: accentColor, transition: 'transform 150ms' }}
              >
                Play Now
              </a>
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

// ─── Game Entry Card ──────────────────────────────────────────────────────────
// The wheel IS the CTA. The entire card is one tap target. No separate button.

function fireFullScreenConfetti() {
  const colors = ['#FF6B00', '#FFD166', '#00C853', '#E63939', '#2DD4BF', '#FFF0C2', '#F97316'];
  // Left volley
  confetti({
    particleCount: 90,
    spread: 80,
    origin: { x: 0.2, y: 0 },
    colors,
    gravity: 1.3,
    scalar: 1.1,
    ticks: 220,
  });
  // Right volley — slight stagger so confetti cascades across the screen
  setTimeout(() => {
    confetti({
      particleCount: 90,
      spread: 80,
      origin: { x: 0.8, y: 0 },
      colors,
      gravity: 1.3,
      scalar: 1.1,
      ticks: 220,
    });
  }, 80);
  // Centre volley — fills the gap
  setTimeout(() => {
    confetti({
      particleCount: 60,
      spread: 100,
      origin: { x: 0.5, y: 0 },
      colors,
      gravity: 1.1,
      scalar: 0.9,
      ticks: 200,
    });
  }, 180);
}

function getEntryHeadline(gameType: GameType): string {
  if (gameType === 'mystery_box') return 'Open for a Reward';
  if (gameType === 'scratch_card') return 'Scratch to Win';
  if (gameType === 'open_the_door') return 'Pick Your Prize';
  return 'Win Free Food';
}

function getEntrySubline(gameType: GameType): string {
  if (gameType === 'mystery_box') return 'Tap to reveal your mystery prize';
  if (gameType === 'scratch_card') return 'Tap to scratch your card';
  if (gameType === 'open_the_door') return 'Tap to choose your door';
  return 'Tap anywhere to play';
}

function GameEntryCard({
  promotion,
  rewards,
  playUrl,
  accentColor,
}: {
  promotion: PublicPromotion;
  rewards: PublicReward[];
  playUrl: string;
  accentColor: string;
}) {
  const reducedMotionRef = useRef(false);
  const [boosted, setBoosted] = useState(false);

  useEffect(() => {
    reducedMotionRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const { visual: gameVisual } = getGameVisual(promotion.game_type, 100, boosted);
  const headline = getEntryHeadline(promotion.game_type);
  const subline = getEntrySubline(promotion.game_type);
  const previewRewards = rewards.slice(0, 3);

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (reducedMotionRef.current) return;
    e.preventDefault();
    setBoosted(true);
    fireFullScreenConfetti();
    // Navigate after confetti reaches peak spread (~500ms)
    const delay = 480 + Math.floor(Math.random() * 120);
    setTimeout(() => {
      window.location.href = playUrl;
    }, delay);
  }

  return (
    <a
      href={playUrl}
      onClick={handleClick}
      className="mx-4 mt-5 block overflow-hidden rounded-3xl shadow-xl active:scale-[0.98]"
      style={{
        background: `linear-gradient(135deg, ${accentColor} 0%, ${darken(accentColor, 28)} 100%)`,
        transition: 'transform 150ms',
      }}
      aria-label={`${headline} — ${subline}`}
    >
      <div className="flex items-center gap-5 p-5">
        {/* 100px game visual — the dominant hero element */}
        <div
          className="shrink-0"
          style={{ filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.30))' }}
        >
          {gameVisual}
        </div>

        {/* Text column */}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-white/70">
            Today&apos;s Game
          </p>
          <h3 className="mt-0.5 text-[1.35rem] font-black leading-tight text-white">
            {headline}
          </h3>
          <p className="mt-1 text-sm font-semibold text-white/80">
            {subline}
          </p>
          {previewRewards.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {previewRewards.map((r) => (
                <span
                  key={r.id}
                  className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold text-white"
                >
                  {r.label}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Chevron — visual affordance that card is tappable */}
        <div className="shrink-0 text-white/50" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </div>
    </a>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function RestaurantPublicPage({
  restaurant,
  sections,
  promotion,
  promotionRewards,
  rewardItemIds,
}: {
  restaurant: PublicRestaurant;
  sections: PublicSection[];
  promotion?: PublicPromotion | null;
  promotionRewards?: PublicReward[];
  rewardItemIds?: Set<string>;
}) {
  const brandColor = brandPrimary(restaurant);
  // D2: accent_color for badges/featured treatment; falls back to brand_color then amber
  const accentColor = restaurant.accent_color || restaurant.brand_color || '#f59e0b';
  const heroFallbackGradient = `linear-gradient(135deg, ${brandColor} 0%, ${darken(brandColor, 40)} 100%)`;

  const hasPromotion = !!promotion;
  const playUrl = promotion ? `/play/${restaurant.slug}/${promotion.slug}` : '';
  const cappedRewardItemIds = rewardItemIds
    ? new Set(Array.from(rewardItemIds).slice(0, 3))
    : undefined;

  const featuredItems = sections
    .flatMap((s) => s.items)
    .filter((item) => item.is_featured)
    .slice(0, 3);

  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [activeSection, setActiveSection] = useState<string>(sections[0]?.id ?? '');
  const [selectedItem, setSelectedItem] = useState<PublicMenuItem | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);

  // C1: remember which element triggered the sheet so focus returns on close
  const triggerRef = useRef<HTMLElement | null>(null);

  // Scroll to section (accounts for sticky nav height ~56px)
  const scrollToSection = useCallback((sectionId: string) => {
    const el = sectionRefs.current.get(sectionId);
    if (!el) return;
    const offset = 64;
    const y = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: y, behavior: 'smooth' });
  }, []);

  // IntersectionObserver for active section tracking
  useEffect(() => {
    if (sections.length === 0) return;
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
  }, [sections]);

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
      <div className="relative -mt-8 rounded-t-3xl bg-white px-5 pb-6 pt-5 shadow-xl">
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

      {/* ── Game Entry Card ── */}
      {hasPromotion && (
        <GameEntryCard
          promotion={promotion!}
          rewards={promotionRewards ?? []}
          playUrl={playUrl}
          accentColor={accentColor}
        />
      )}

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

      {/* ── Featured items ── */}
      {featuredItems.length > 0 && (
        <div className="mt-8 px-4">
          <h2 className="text-xl font-black" style={{ color: brandColor }}>
            <span className="mr-2" aria-hidden="true">⭐</span>Featured Dishes
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {featuredItems.map((item) => (
              <MenuItemCard
                key={item.id}
                item={item}
                brandColor={brandColor}
                accentColor={accentColor}
                isRewardItem={cappedRewardItemIds?.has(item.id)}
                onTap={() => openSheet(item)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Menu ── */}
      <div className="mt-8 pb-24">

        {/* Empty state */}
        {sections.length === 0 && (
          <div className="mx-4 rounded-3xl bg-white p-8 text-center shadow-md">
            <p className="text-4xl">🍽️</p>
            <p className="mt-3 text-xl font-black text-stone-700">Menu coming soon</p>
            {/* C7: stone-500 replaces stone-400 */}
            <p className="mt-2 text-sm text-stone-500">
              We&apos;re putting the finishing touches on our menu. Check back soon!
            </p>
          </div>
        )}

        {/* Sticky section navigation */}
        {sections.length > 1 && (
          <div
            className="sticky top-0 z-30 bg-stone-50 pb-3 pt-3"
            style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
          >
            <div ref={navRef} className="flex gap-2 overflow-x-auto px-4">
              {sections.map((section) => {
                const isActive = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    type="button"
                    data-nav-id={section.id}
                    onClick={() => scrollToSection(section.id)}
                    className="shrink-0 rounded-full px-4 py-2 text-sm font-black shadow-sm transition-colors"
                    // C4: aria-current exposes active state to screen readers
                    aria-current={isActive ? 'true' : undefined}
                    style={
                      isActive
                        ? { backgroundColor: brandColor, color: '#fff' }
                        : { backgroundColor: '#fff', color: '#57534e' }
                    }
                  >
                    {section.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Section list */}
        <div className="mt-6 space-y-10 px-4">
          {sections.map((section) => (
            <div
              key={section.id}
              data-section-id={section.id}
              ref={(el) => {
                if (el) sectionRefs.current.set(section.id, el);
              }}
            >
              {/* D4: brand-colored heading with subtle divider line */}
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
                // C7: stone-500 replaces stone-400
                <p className="mt-3 text-sm text-stone-500">
                  No items available in this section right now.
                </p>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {section.items.map((item) => (
                    <MenuItemCard
                      key={item.id}
                      item={item}
                      brandColor={brandColor}
                      accentColor={accentColor}
                      isRewardItem={cappedRewardItemIds?.has(item.id)}
                      onTap={() => openSheet(item)}
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
        />
      )}

      {/* ── Floating Reward Widget ── */}
      {hasPromotion && (
        <RewardWidget
          promotion={promotion!}
          rewards={promotionRewards ?? []}
          playUrl={playUrl}
          accentColor={accentColor}
        />
      )}
    </div>
  );
}
