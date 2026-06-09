'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Restaurant, ProfileForm, ContactForm, WeekHours, DayHours, ConfirmOptions } from '@/components/admin/restaurants/types';
import { parseHours } from '@/components/admin/restaurants/types';
import { ConfirmModal } from '@/components/admin/restaurants/ConfirmModal';
import { RestaurantProfileTab } from '@/components/admin/restaurants/RestaurantProfileTab';
import { RestaurantContactTab } from '@/components/admin/restaurants/RestaurantContactTab';
import { RestaurantSettingsTab } from '@/components/admin/restaurants/RestaurantSettingsTab';
import { RestaurantQrTab } from '@/components/admin/restaurants/RestaurantQrTab';

// ─── Types ────────────────────────────────────────────────────────────────────

type TabId = 'profile' | 'contact' | 'settings' | 'qr';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function modeLabel(mode: string | null | undefined) {
  if (mode === 'menu_and_promotion') return 'Menu + Promotion';
  if (mode === 'menu_only') return 'Menu Only';
  return 'Promotion Only';
}

function modeBadgeColor(mode: string | null | undefined) {
  if (mode === 'menu_and_promotion') return 'bg-green-100 text-green-700';
  if (mode === 'menu_only') return 'bg-blue-100 text-blue-700';
  return 'bg-orange-100 text-orange-700';
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

  // Copy link feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);

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

    // Initialise form state for new restaurants only — don't overwrite in-progress edits.
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

  async function copyLink(r: Restaurant) {
    await navigator.clipboard.writeText(`${window.location.origin}/admin/promotions?slug=${r.slug}`);
    setCopiedId(r.id);
    setTimeout(() => setCopiedId(null), 1600);
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

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading || !ownerId) {
    return <main className="min-h-screen bg-[#FFF8F0] p-6 text-stone-600">Loading restaurants…</main>;
  }

  const TABS: { id: TabId; label: string }[] = [
    { id: 'profile',  label: 'Profile'  },
    { id: 'contact',  label: 'Contact'  },
    { id: 'settings', label: 'Settings' },
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

            {restaurants.map((r, index) => {
              const tab = getTab(r.id);
              const pf = profileForms[r.id];
              const cf = contactForms[r.id];

              return (
                <article key={r.id} className="overflow-hidden rounded-3xl bg-white shadow-xl">

                  {/* Hero banner */}
                  <div className="relative h-32 overflow-hidden bg-gradient-to-br from-orange-200 via-amber-100 to-red-100">
                    {r.hero_image_url && (
                      <img src={r.hero_image_url} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" />
                    )}
                    <div className="relative flex h-full items-start justify-between px-5 py-4">
                      <span className="rounded-2xl bg-white/80 px-3 py-1.5 text-xs font-black text-[#FF6B00] shadow backdrop-blur-sm">
                        #{index + 1}
                      </span>
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-white/90 p-2 shadow-lg backdrop-blur-sm">
                        {r.logo_url
                          ? <img src={r.logo_url} alt={`${r.name} logo`} className="max-h-full max-w-full object-contain" />
                          : <span className="text-2xl">🍽️</span>
                        }
                      </div>
                    </div>
                  </div>

                  {/* Name + actions row */}
                  <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
                    <div>
                      <h3 className="text-2xl font-black">{r.name}</h3>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-stone-400">/{r.slug}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-black ${modeBadgeColor(r.experience_mode)}`}>
                          {modeLabel(r.experience_mode)}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <a href={`/admin/promotions?slug=${r.slug}`} className="rounded-full bg-green-600 px-3 py-1.5 text-xs font-black text-white">
                        Promotions
                      </a>
                      <a
                        href={`/r/${r.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700"
                      >
                        Preview
                      </a>
                      <button
                        type="button"
                        onClick={() => copyLink(r)}
                        className="rounded-full bg-stone-100 px-3 py-1.5 text-xs font-black text-stone-700"
                      >
                        {copiedId === r.id ? 'Copied!' : 'Copy Link'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRequest(r)}
                        className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-black text-red-600"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Tab strip */}
                  <div className="mt-4 flex gap-1 border-b border-stone-100 px-5">
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
