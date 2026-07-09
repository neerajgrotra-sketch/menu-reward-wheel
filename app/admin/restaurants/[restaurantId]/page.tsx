'use client';

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Restaurant, ProfileForm, ContactForm, WeekHours, DayHours, ConfirmOptions } from '@/components/admin/restaurants/types';
import { parseHours, sanitizeFileName, pathFromPublicUrl } from '@/components/admin/restaurants/types';
import { ConfirmModal } from '@/components/admin/restaurants/ConfirmModal';
import { HeroImageUploader } from '@/components/admin/restaurants/HeroImageUploader';
import { RestaurantOverviewTab } from '@/components/admin/restaurants/RestaurantOverviewTab';
import { RestaurantBrandingTab } from '@/components/admin/restaurants/RestaurantBrandingTab';
import { RestaurantMenusTab } from '@/components/admin/restaurants/RestaurantMenusTab';
import { RestaurantPromotionsTab } from '@/components/admin/restaurants/RestaurantPromotionsTab';
import { RestaurantTablesTab } from '@/components/admin/restaurants/RestaurantTablesTab';
import { RestaurantQrTab } from '@/components/admin/restaurants/RestaurantQrTab';
import { RestaurantPaymentsTab } from '@/components/admin/restaurants/RestaurantPaymentsTab';
import { RestaurantSettingsTab } from '@/components/admin/restaurants/RestaurantSettingsTab';

type TabId = 'overview' | 'branding' | 'menus' | 'promotions' | 'tables' | 'qr' | 'payments' | 'settings';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview',   label: 'Overview'   },
  { id: 'branding',   label: 'Branding'   },
  { id: 'menus',      label: 'Menus'      },
  { id: 'promotions', label: 'Promotions' },
  { id: 'tables',     label: 'Tables'     },
  { id: 'qr',         label: 'QR Codes'   },
  { id: 'payments',   label: 'Payments'   },
  { id: 'settings',   label: 'Settings'   },
];

const LOGO_BUCKET = 'restaurant-logos';
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

function initProfileForm(r: Restaurant): ProfileForm {
  return {
    experience_mode: r.experience_mode ?? 'promotion_only',
    description:     r.description     ?? '',
    secondary_color: r.secondary_color ?? '',
    accent_color:    r.accent_color    ?? '',
  };
}

function initContactForm(r: Restaurant): ContactForm {
  return {
    phone:           r.phone           ?? '',
    address_line1:   r.address_line1   ?? '',
    city:            r.city            ?? '',
    province_state:  r.province_state  ?? '',
    postal_code:     r.postal_code     ?? '',
    country:         r.country         ?? 'Canada',
    website_url:     r.website_url     ?? '',
    instagram_url:   r.instagram_url   ?? '',
    facebook_url:    r.facebook_url    ?? '',
    google_maps_url: r.google_maps_url ?? '',
    hours:           parseHours(r.hours),
  };
}

function address(r: Restaurant | null): string {
  if (!r) return '';
  return [r.address_line1, r.city, r.province_state].filter(Boolean).join(', ') || 'Address not added';
}

export default function RestaurantWorkspacePage({ params }: { params: { restaurantId: string } }) {
  const { restaurantId } = params;
  const supabase = useMemo(() => createClient(), []);

  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');

  const [tab, setTab] = useState<TabId>('overview');
  const [profileForm, setProfileForm] = useState<ProfileForm | null>(null);
  const [contactForm, setContactForm] = useState<ContactForm | null>(null);
  const [confirm, setConfirm] = useState<(ConfirmOptions & { open: boolean }) | null>(null);

  const loadRestaurant = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from('restaurants')
      .select('*')
      .eq('id', restaurantId)
      .eq('owner_id', uid)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) { setPageError(error.message); setLoading(false); return; }
    if (!data) { setNotFound(true); setLoading(false); return; }

    setRestaurant(data as Restaurant);
    setProfileForm((prev) => prev ?? initProfileForm(data as Restaurant));
    setContactForm((prev) => prev ?? initContactForm(data as Restaurant));
    setLoading(false);
  }, [restaurantId, supabase]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { window.location.href = '/auth'; return; }
      setOwnerId(data.user.id);
      loadRestaurant(data.user.id);
    });
  }, [supabase, loadRestaurant]);

  useEffect(() => {
    if (notFound) window.location.href = '/admin/restaurants';
  }, [notFound]);

  function requestConfirm(opts: ConfirmOptions) {
    setConfirm({ ...opts, open: true });
  }

  function handleDeleteRequest() {
    if (!restaurant) return;
    // Release 1, PR-008: restaurant deletion is now a real, safe soft-delete
    // (archival) — see PR-007 (database-level hard-delete trigger) and PR-009
    // (deleted_at filter audit across every read path). This calls
    // soft_delete_restaurant, never a hard DELETE.
    requestConfirm({
      title: `Archive ${restaurant.name}?`,
      message:
        'This archives the restaurant — it will no longer appear in your dashboard or any restaurant list, ' +
        'but all historical data (orders, payments, menus, promotions) is preserved. Contact support if you need it restored.',
      confirmLabel: 'Archive',
      danger: true,
      onConfirm: async () => {
        const { error } = await supabase.rpc('soft_delete_restaurant', { target_restaurant_id: restaurant.id });
        if (error) { setPageError(error.message); return; }
        window.location.href = '/admin/restaurants';
      },
    });
  }

  async function handleHeaderLogoUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !ownerId || !restaurant) return;
    if (!file.type.startsWith('image/')) { setPageError('Please choose an image file.'); return; }
    if (file.size > MAX_LOGO_BYTES) { setPageError(`Logo is ${(file.size / 1024 / 1024).toFixed(2)} MB — max 2 MB.`); return; }

    const storagePath = `${ownerId}/${restaurant.id}/${Date.now()}-${sanitizeFileName(file.name || 'logo.png')}`;
    const { error: uploadErr } = await supabase.storage.from(LOGO_BUCKET).upload(storagePath, file, { upsert: true, contentType: file.type });
    if (uploadErr) { setPageError(uploadErr.message); return; }

    const { data: urlData } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(storagePath);

    if (restaurant.logo_url) {
      const oldPath = pathFromPublicUrl(restaurant.logo_url, LOGO_BUCKET);
      if (oldPath) await supabase.storage.from(LOGO_BUCKET).remove([oldPath]);
    }

    const { error: updateErr } = await supabase.from('restaurants').update({ logo_url: urlData.publicUrl }).eq('id', restaurant.id);
    if (updateErr) { setPageError(updateErr.message); return; }
    if (ownerId) loadRestaurant(ownerId);
  }

  if (notFound) return null;

  if (loading || !ownerId || !restaurant || !profileForm || !contactForm) {
    return <main className="min-h-screen bg-[#FFF8F0] p-6 text-stone-600">Loading workspace…</main>;
  }

  return (
    <>
      {confirm && (
        <ConfirmModal
          open={confirm.open}
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          danger={confirm.danger}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}

      <main className="min-h-screen bg-[#FFF8F0] px-4 py-6 text-[#1F1F1F]">
        <section className="mx-auto max-w-5xl">

          <a href="/admin/restaurants" className="text-sm font-black text-[#FF6B00]">
            ← Back to Restaurant Directory
          </a>

          {pageError && <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{pageError}</p>}

          <article className="mt-4 overflow-hidden rounded-3xl bg-white shadow-xl">

            {/* Header — cover photo, logo, name, address */}
            <HeroImageUploader
              currentUrl={restaurant.hero_image_url}
              restaurantId={restaurant.id}
              ownerId={ownerId}
              supabase={supabase}
              requestConfirm={requestConfirm}
              onSaved={() => loadRestaurant(ownerId)}
            />

            <div className="relative -mt-8 rounded-t-3xl bg-white px-5 pb-5 pt-5 shadow-xl">
              <div className="absolute -top-10 left-5">
                <div className="relative h-20 w-20 overflow-hidden rounded-2xl bg-white p-1.5 shadow-xl ring-1 ring-stone-100">
                  {restaurant.logo_url
                    ? <img src={restaurant.logo_url} alt={`${restaurant.name} logo`} className="h-full w-full object-contain" />
                    : <span className="flex h-full w-full items-center justify-center text-2xl">🍽️</span>
                  }
                </div>
                <label
                  className="absolute -bottom-1 -right-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-white text-sm shadow-md ring-1 ring-stone-200"
                  title="Change logo"
                >
                  ✏️
                  <input type="file" accept="image/*" className="hidden" onChange={handleHeaderLogoUpload} />
                </label>
              </div>

              <div className={restaurant.logo_url ? 'mt-12' : 'mt-2'}>
                <h1 className="text-3xl font-black text-[#1F1F1F]">{restaurant.name}</h1>
                <p className="mt-1 text-sm font-semibold text-stone-500">📍 {address(restaurant)}</p>
              </div>
            </div>

            {/* Tab strip */}
            <div className="flex gap-1 overflow-x-auto border-b border-stone-100 px-5">
              {TABS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`shrink-0 rounded-t-xl px-4 py-2 text-sm font-black transition-colors ${
                    tab === id
                      ? 'border-b-2 border-[#FF6B00] text-[#FF6B00]'
                      : 'text-stone-500 hover:text-stone-800'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="p-5">
              {tab === 'overview' && (
                <RestaurantOverviewTab restaurantId={restaurant.id} supabase={supabase} />
              )}
              {tab === 'branding' && (
                <RestaurantBrandingTab
                  restaurant={restaurant}
                  profileForm={profileForm}
                  onProfileChange={(patch) => setProfileForm((f) => (f ? { ...f, ...patch } : f))}
                  contactForm={contactForm}
                  onContactChange={(patch) => setContactForm((f) => (f ? { ...f, ...patch } : f))}
                  onHoursChange={(day: keyof WeekHours, patch: Partial<DayHours>) =>
                    setContactForm((f) => (f ? { ...f, hours: { ...f.hours, [day]: { ...f.hours[day], ...patch } } } : f))
                  }
                  supabase={supabase}
                  ownerId={ownerId}
                  requestConfirm={requestConfirm}
                  onSaved={() => loadRestaurant(ownerId)}
                />
              )}
              {tab === 'menus' && (
                <RestaurantMenusTab restaurantId={restaurant.id} supabase={supabase} />
              )}
              {tab === 'promotions' && (
                <RestaurantPromotionsTab restaurantId={restaurant.id} restaurantSlug={restaurant.slug} supabase={supabase} />
              )}
              {tab === 'tables' && (
                <RestaurantTablesTab restaurantId={restaurant.id} restaurantSlug={restaurant.slug} supabase={supabase} />
              )}
              {tab === 'qr' && (
                <RestaurantQrTab restaurant={restaurant} supabase={supabase} />
              )}
              {tab === 'payments' && (
                <RestaurantPaymentsTab restaurantId={restaurant.id} supabase={supabase} />
              )}
              {tab === 'settings' && (
                <RestaurantSettingsTab
                  restaurantId={restaurant.id}
                  restaurantName={restaurant.name}
                  supabase={supabase}
                  onDeleteRequest={handleDeleteRequest}
                />
              )}
            </div>
          </article>
        </section>
      </main>
    </>
  );
}
