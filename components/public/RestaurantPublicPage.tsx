'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicRestaurant, PublicSection, PublicMenuItem } from '@/app/r/[restaurantSlug]/page';

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

function TagPill({ tag }: { tag: string }) {
  return (
    <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-bold text-stone-600">
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

// Featured card — used in horizontal scroll strip
function FeaturedCard({
  item,
  brandColor,
  onTap,
}: {
  item: PublicMenuItem;
  brandColor: string;
  onTap: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      className="w-40 shrink-0 overflow-hidden rounded-2xl bg-white shadow-md active:scale-95"
      style={{ transition: 'transform 150ms' }}
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
          <span className="absolute left-2 top-2 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-black text-white shadow">
            ⭐
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="line-clamp-2 text-left text-sm font-black leading-tight text-stone-800">
          {item.name}
        </p>
        {item.description && (
          <p className="mt-1 line-clamp-2 text-left text-xs text-stone-400">{item.description}</p>
        )}
        <div className="mt-2">
          <PriceBadge price={item.price} color={brandColor} />
        </div>
      </div>
    </button>
  );
}

// Menu item card — used in 2-column grid
function MenuItemCard({
  item,
  brandColor,
  onTap,
}: {
  item: PublicMenuItem;
  brandColor: string;
  onTap: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      className="overflow-hidden rounded-2xl bg-white text-left shadow-md active:scale-95"
      style={{
        transition: 'transform 150ms',
        outline: item.is_featured ? `2px solid ${brandColor}22` : undefined,
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
          <span className="absolute right-2 top-2 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-black text-white shadow">
            ⭐
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="line-clamp-2 text-sm font-black leading-tight text-stone-800">{item.name}</p>
        {item.description && (
          <p className="mt-1 line-clamp-2 text-xs text-stone-400">{item.description}</p>
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
  onClose,
}: {
  item: PublicMenuItem;
  visible: boolean;
  brandColor: string;
  onClose: () => void;
}) {
  // Prevent body scroll while sheet is open
  useEffect(() => {
    if (visible) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [visible]);

  return (
    <div className="fixed inset-0 z-50" aria-modal="true" role="dialog">
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

        {/* Close button */}
        <div className="flex items-center justify-between px-5 pt-1">
          <div />
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 text-stone-600"
            aria-label="Close"
          >
            ✕
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
          <h2 className="text-2xl font-black leading-tight text-stone-900">{item.name}</h2>

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
                <TagPill key={tag} tag={tag} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function RestaurantPublicPage({
  restaurant,
  sections,
}: {
  restaurant: PublicRestaurant;
  sections: PublicSection[];
}) {
  const brandColor = brandPrimary(restaurant);
  const heroFallbackGradient = `linear-gradient(135deg, ${brandColor} 0%, ${darken(brandColor, 40)} 100%)`;

  const featuredItems = sections
    .flatMap((s) => s.items)
    .filter((item) => item.is_featured)
    .slice(0, 6);

  const menuRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [activeSection, setActiveSection] = useState<string>(sections[0]?.id ?? '');
  const [selectedItem, setSelectedItem] = useState<PublicMenuItem | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);

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
    setSelectedItem(item);
    // Double rAF: ensure DOM is painted before transition triggers
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setSheetVisible(true));
    });
  }

  function closeSheet() {
    setSheetVisible(false);
    setTimeout(() => setSelectedItem(null), 300);
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
    <div className="min-h-screen bg-stone-50">

      {/* ── Hero ── */}
      <div className="relative">
        {restaurant.hero_image_url ? (
          <img
            src={restaurant.hero_image_url}
            alt={`${restaurant.name} hero`}
            className="h-64 w-full object-cover"
            priority-hint="high"
          />
        ) : (
          <div className="h-56 w-full" style={{ background: heroFallbackGradient }} />
        )}
        {/* Gradient overlay for text legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

        {/* Logo — bottom-left */}
        {restaurant.logo_url && (
          <div className="absolute bottom-4 left-4 h-16 w-16 overflow-hidden rounded-2xl bg-white p-1.5 shadow-xl">
            <img
              src={restaurant.logo_url}
              alt={`${restaurant.name} logo`}
              className="h-full w-full object-contain"
            />
          </div>
        )}
      </div>

      {/* ── Info card ── */}
      <div className="-mt-6 rounded-t-3xl bg-white px-5 pb-6 pt-5 shadow-xl">
        {/* Name */}
        <h1
          className="text-3xl font-black leading-tight"
          style={{ color: brandColor, paddingLeft: restaurant.logo_url ? '4.5rem' : undefined }}
        >
          {restaurant.name}
        </h1>

        {/* Description */}
        {restaurant.description && (
          <p className="mt-3 text-sm leading-relaxed text-stone-600">{restaurant.description}</p>
        )}

        {/* Address + phone */}
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
      </div>

      {/* ── Hours ── */}
      {parsedHours && !allDaysClosed && (
        <div className="mx-4 mt-4 rounded-3xl bg-white px-5 py-4 shadow-md">
          <h2 className="text-xs font-black uppercase tracking-widest text-stone-400">Hours</h2>
          <div className="mt-3 space-y-1.5">
            {DAY_KEYS.map((key) => {
              const d = parsedHours[key];
              return (
                <div key={key} className="flex items-center justify-between text-sm">
                  <span className="w-10 shrink-0 font-bold text-stone-500">{DAY_SHORT[key]}</span>
                  {d.closed ? (
                    <span className="text-stone-400">Closed</span>
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

      {/* ── Contact links ── */}
      {hasContactLinks && (
        <div className="mt-4 flex gap-3 overflow-x-auto px-4 pb-1">
          {restaurant.website_url && (
            <a
              href={restaurant.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-2xl bg-white px-4 py-3 text-sm font-black text-stone-700 shadow-md"
            >
              🌐 Website
            </a>
          )}
          {restaurant.google_maps_url && (
            <a
              href={restaurant.google_maps_url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-2xl bg-white px-4 py-3 text-sm font-black text-stone-700 shadow-md"
            >
              🗺️ Directions
            </a>
          )}
          {restaurant.instagram_url && (
            <a
              href={restaurant.instagram_url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-2xl bg-white px-4 py-3 text-sm font-black text-stone-700 shadow-md"
            >
              📸 Instagram
            </a>
          )}
          {restaurant.facebook_url && (
            <a
              href={restaurant.facebook_url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-2xl bg-white px-4 py-3 text-sm font-black text-stone-700 shadow-md"
            >
              👥 Facebook
            </a>
          )}
        </div>
      )}

      {/* ── Featured items ── */}
      {featuredItems.length > 0 && (
        <div className="mt-8">
          <h2 className="px-4 text-xl font-black text-stone-800">
            <span className="mr-2">⭐</span>Featured Dishes
          </h2>
          <div className="mt-3 flex gap-4 overflow-x-auto px-4 pb-4">
            {featuredItems.map((item) => (
              <FeaturedCard
                key={item.id}
                item={item}
                brandColor={brandColor}
                onTap={() => openSheet(item)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Browse Menu CTA ── */}
      {sections.length > 0 && (
        <div className="mx-4 mt-6">
          <button
            type="button"
            onClick={() => menuRef.current?.scrollIntoView({ behavior: 'smooth' })}
            className="w-full rounded-2xl py-4 text-lg font-black text-white shadow-lg active:scale-95"
            style={{ backgroundColor: brandColor, transition: 'transform 150ms' }}
          >
            Browse Menu ↓
          </button>
        </div>
      )}

      {/* ── Menu ── */}
      <div ref={menuRef} className="mt-8 pb-24">

        {/* Empty state: no sections at all */}
        {sections.length === 0 && (
          <div className="mx-4 rounded-3xl bg-white p-8 text-center shadow-md">
            <p className="text-4xl">🍽️</p>
            <p className="mt-3 text-xl font-black text-stone-700">Menu coming soon</p>
            <p className="mt-2 text-sm text-stone-400">
              We're putting the finishing touches on our menu. Check back soon!
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
              <h2 className="text-2xl font-black text-stone-800">{section.name}</h2>

              {section.items.length === 0 ? (
                <p className="mt-3 text-sm text-stone-400">
                  No items available in this section right now.
                </p>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {section.items.map((item) => (
                    <MenuItemCard
                      key={item.id}
                      item={item}
                      brandColor={brandColor}
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
          onClose={closeSheet}
        />
      )}
    </div>
  );
}
