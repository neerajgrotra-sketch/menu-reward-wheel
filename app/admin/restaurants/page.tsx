'use client';

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Restaurant, ProfileForm, ContactForm, WeekHours, DayHours, ConfirmOptions } from '@/components/admin/restaurants/types';
import { parseHours, sanitizeFileName, pathFromPublicUrl } from '@/components/admin/restaurants/types';
import { ConfirmModal } from '@/components/admin/restaurants/ConfirmModal';
import { RestaurantProfileTab } from '@/components/admin/restaurants/RestaurantProfileTab';
import { RestaurantContactTab } from '@/components/admin/restaurants/RestaurantContactTab';
import { RestaurantSettingsTab } from '@/components/admin/restaurants/RestaurantSettingsTab';
import { RestaurantQrTab } from '@/components/admin/restaurants/RestaurantQrTab';
import { RestaurantTablesTab } from '@/components/admin/restaurants/RestaurantTablesTab';
import { HeroImageUploader } from '@/components/admin/restaurants/HeroImageUploader';

// ─── Types ────────────────────────────────────────────────────────────────────

type TabId = 'profile' | 'contact' | 'settings' | 'tables' | 'qr';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function modeBadgeColor(mode: string | null | undefined) {
  if (mode === 'menu_and_promotion') return 'bg-green-100 text-green-700';
  if (mode === 'menu_only') return 'bg-blue-100 text-blue-700';
  return 'bg-orange-100 text-orange-700';
}

function modeLabel(mode: string | null | undefined) {
  if (mode === 'menu_and_promotion') return 'Menu + Promotion';
  if (mode === 'menu_only') return 'Menu Only';
  return 'Promotion Only';
}

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

const LOGO_BUCKET = 'restaurant-logos';
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

// ─── Component ───────────────────────────────────────────────────────────────

export default function RestaurantsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');

  // Per-restaurant tab state
  const [activeTabs, setActiveTabs] = useState<Record<string, TabId>>({});

  // Per-restaurant form state (kept in parent so switching tabs doesn't discard edits)
  const [profileForms, setProfileForms] = useState<Record<string, ProfileForm>>({});
  const [contactForms, setContactForms] = useState<Record<string, ContactForm>>({});

  // Confirm modal
  const [confirm, setConfirm] = useState<(ConfirmOptions & { open: boolean }) | null>(null);

  // ── Auth + data loading ────────────────────────────────────────────────────

  const loadRestaurants = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from('restaurants')
      .select('*')
      .eq('owner_id', uid)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) { setPageError(error.message); setLoading(false); return; }

    const list = data ?? [];
    setRestaurants(list);

    setProfileForms(prev => {
      const next = { ...prev };
      for (const r of list) { if (!next[r.id]) next[r.id] = initProfileForm(r); }
      return next;
    });
    setContactForms(prev => {
      const next = { ...prev };
      for (const r of list) { if (!next[r.id]) next[r.id] = initContactForm(r); }
      return next;
    });

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { window.location.href = '/auth'; return; }
      setOwnerId(data.user.id);
      loadRestaurants(data.user.id);
    });
  }, [supabase, loadRestaurants]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const getTab = (id: string): TabId => activeTabs[id] ?? 'profile';
  const setTab = (id: string, tab: TabId) => setActiveTabs(c => ({ ...c, [id]: tab }));

  const patchProfile = (id: string, patch: Partial<ProfileForm>) =>
    setProfileForms(c => ({ ...c, [id]: { ...c[id], ...patch } }));

  const patchContact = (id: string, patch: Partial<ContactForm>) =>
    setContactForms(c => ({ ...c, [id]: { ...c[id], ...patch } }));

  const patchHours = (id: string, day: keyof WeekHours, patch: Partial<DayHours>) =>
    setContactForms(c => ({
      ...c,
      [id]: { ...c[id], hours: { ...c[id].hours, [day]: { ...c[id].hours[day], ...patch } } },
    }));

  function requestConfirm(opts: ConfirmOptions) {
    setConfirm({ ...opts, open: true });
  }

  function handleDeleteRequest(r: Restaurant) {
    requestConfirm({
      title: `Delete ${r.name}?`,
      message: 'This permanently removes the restaurant and all related data. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        const { error } = await supabase.rpc('delete_restaurant_cascade', { target_restaurant_id: r.id });
        if (error) { setPageError(error.message); return; }
        if (ownerId) loadRestaurants(ownerId);
      },
    });
  }

  // Lightweight logo upload from the card header edit badge.
  // Full logo management (remove, local preview) remains in the Profile tab.
  async function handleHeaderLogoUpload(restaurantId: string, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !ownerId) return;
    if (!file.type.startsWith('image/')) { setPageError('Please choose an image file.'); return; }
    if (file.size > MAX_LOGO_BYTES) { setPageError(`Logo is ${(file.size / 1024 / 1024).toFixed(2)} MB — max 2 MB.`); return; }

    const storagePath = `${ownerId}/${restaurantId}/${Date.now()}-${sanitizeFileName(file.name || 'logo.png')}`;
    const { error: uploadErr } = await supabase.storage.from(LOGO_BUCKET).upload(storagePath, file, { upsert: true, contentType: file.type });
    if (uploadErr) { setPageError(uploadErr.message); return; }

    const { data: urlData } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(storagePath);

    // Clean up old logo file (best-effort)
    const existing = restaurants.find(r => r.id === restaurantId);
    if (existing?.logo_url) {
      const oldPath = pathFromPublicUrl(existing.logo_url, LOGO_BUCKET);
      if (oldPath) await supabase.storage.from(LOGO_BUCKET).remove([oldPath]);
    }

    const { error: updateErr } = await supabase.from('restaurants').update({ logo_url: urlData.publicUrl }).eq('id', restaurantId);
    if (updateErr) { setPageError(updateErr.message); return; }
    loadRestaurants(ownerId);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading || !ownerId) {
    return <main className="min-h-screen bg-[#FFF8F0] p-6 text-stone-600">Loading restaurants…</main>;
  }

  const TABS: { id: TabId; label: string }[] = [
    { id: 'profile',  label: 'Profile'  },
    { id: 'contact',  label: 'Contact'  },
    { id: 'settings', label: 'Settings' },
    { id: 'tables',   label: 'Tables'   },
    { id: 'qr',       label: 'QR'       },
  ];

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

          {/* Page header */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black text-[#FF6B00]">SpinBite</h1>
              <p className="mt-1 text-sm font-bold text-stone-500">Restaurant locations</p>
            </div>
            <a href="/admin" className="rounded-full bg-white px-4 py-3 text-sm font-black text-[#FF6B00] shadow">Dashboard</a>
          </div>

          <a href="/setup" className="mt-5 block rounded-3xl bg-green-600 p-5 text-center text-xl font-black text-white shadow-xl">
            + Add Restaurant
          </a>

          {pageError && <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{pageError}</p>}

          <div className="mt-5 space-y-4">
            {restaurants.length === 0 && (
              <div className="rounded-3xl bg-white p-6 shadow-xl">
                <p className="text-2xl font-black">No restaurants yet</p>
                <p className="mt-2 text-sm font-semibold leading-6 text-stone-600">
                  Add your first restaurant to begin creating menus, promotions, QR campaigns, and branded experiences.
                </p>
              </div>
            )}

            {restaurants.map((r) => {
              const tab = getTab(r.id);
              const pf = profileForms[r.id];
              const cf = contactForms[r.id];
              const address = [r.address_line1, r.city].filter(Boolean).join(', ');

              return (
                <article key={r.id} className="overflow-hidden rounded-3xl bg-white shadow-xl">

                  {/* ── Live preview header — mirrors public menu page geometry ── */}

                  {/* Hero zone — full h-64, clicking opens cover photo upload */}
                  <HeroImageUploader
                    currentUrl={r.hero_image_url}
                    restaurantId={r.id}
                    ownerId={ownerId}
                    supabase={supabase}
                    requestConfirm={requestConfirm}
                    onSaved={() => loadRestaurants(ownerId)}
                  />

                  {/* Info card — matches public page: -mt-8, rounded-t-3xl, white, shadow */}
                  <div className="relative -mt-8 rounded-t-3xl bg-white px-5 pb-0 pt-5 shadow-xl">

                    {/* Logo — straddles hero/card boundary, matching public page position */}
                    <div className="absolute -top-10 left-5">
                      <div className="relative h-20 w-20 overflow-hidden rounded-2xl bg-white p-1.5 shadow-xl ring-1 ring-stone-100">
                        {r.logo_url
                          ? <img src={r.logo_url} alt={`${r.name} logo`} className="h-full w-full object-contain" />
                          : <span className="flex h-full w-full items-center justify-center text-2xl">🍽️</span>
                        }
                      </div>
                      {/* Edit badge — opens logo file picker */}
                      <label
                        className="absolute -bottom-1 -right-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-white text-sm shadow-md ring-1 ring-stone-200"
                        title="Change logo"
                      >
                        ✏️
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleHeaderLogoUpload(r.id, e)}
                        />
                      </label>
                    </div>

                    {/* Restaurant name + address — replaces slug + number badge */}
                    <div className={r.logo_url ? 'mt-12' : 'mt-2'}>
                      <h3 className="text-2xl font-black text-[#1F1F1F]">{r.name}</h3>
                      {address && (
                        <p className="mt-1 text-sm font-semibold text-stone-500">
                          <span className="mr-1">📍</span>{address}
                        </p>
                      )}
                      <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-black ${modeBadgeColor(r.experience_mode)}`}>
                        {modeLabel(r.experience_mode)}
                      </span>
                    </div>

                    {/* Action bar — Promotions + View Menu only (Delete moved to Settings tab) */}
                    <div className="mt-4 flex flex-wrap gap-2 pb-4">
                      <a
                        href={`/admin/promotions?slug=${r.slug}`}
                        className="rounded-full bg-green-600 px-4 py-2 text-sm font-black text-white"
                      >
                        Promotions
                      </a>
                      <a
                        href={`/r/${r.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-full bg-blue-50 px-4 py-2 text-sm font-black text-blue-700"
                      >
                        View Menu
                      </a>
                    </div>
                  </div>

                  {/* Tab strip */}
                  <div className="flex gap-1 border-b border-stone-100 px-5">
                    {TABS.map(({ id, label }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setTab(r.id, id)}
                        className={`rounded-t-xl px-4 py-2 text-sm font-black transition-colors ${
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
                    {tab === 'profile' && pf && (
                      <RestaurantProfileTab
                        restaurant={r}
                        form={pf}
                        onChange={(patch) => patchProfile(r.id, patch)}
                        supabase={supabase}
                        ownerId={ownerId}
                        requestConfirm={requestConfirm}
                        onSaved={() => loadRestaurants(ownerId)}
                      />
                    )}
                    {tab === 'contact' && cf && (
                      <RestaurantContactTab
                        restaurant={r}
                        form={cf}
                        onChange={(patch) => patchContact(r.id, patch)}
                        onHoursChange={(day, patch) => patchHours(r.id, day, patch)}
                        supabase={supabase}
                        ownerId={ownerId}
                        onSaved={() => loadRestaurants(ownerId)}
                      />
                    )}
                    {tab === 'settings' && (
                      <RestaurantSettingsTab
                        restaurantId={r.id}
                        restaurantName={r.name}
                        supabase={supabase}
                        onDeleteRequest={() => handleDeleteRequest(r)}
                      />
                    )}
                    {tab === 'tables' && (
                      <RestaurantTablesTab
                        restaurantId={r.id}
                        supabase={supabase}
                      />
                    )}
                    {tab === 'qr' && (
                      <RestaurantQrTab
                        restaurant={r}
                        supabase={supabase}
                      />
                    )}
                  </div>

                </article>
              );
            })}
          </div>
        </section>
      </main>
    </>
  );
}
