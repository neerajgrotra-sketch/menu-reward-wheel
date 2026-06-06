'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

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

type Restaurant = {
  id: string;
  name: string;
  slug: string;
  phone?: string | null;
  address_line1?: string | null;
  city?: string | null;
  province_state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  cuisine_type?: string | null;
  logo_url?: string | null;
  brand_color?: string | null;
  experience_mode?: string | null;
  hero_image_url?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
  description?: string | null;
  hours?: WeekHours | null;
  website_url?: string | null;
  instagram_url?: string | null;
  facebook_url?: string | null;
  google_maps_url?: string | null;
};

type TabId = 'overview' | 'profile' | 'contact';

type MessageState = { type: 'info' | 'error' | 'success'; text: string };

// ─── Constants ────────────────────────────────────────────────────────────────

const LOGO_BUCKET = 'restaurant-logos';
const HERO_BUCKET = 'restaurant-heroes';
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const MAX_HERO_BYTES = 10 * 1024 * 1024;

const DAYS: Array<{ key: keyof WeekHours; short: string }> = [
  { key: 'monday',    short: 'Mon' },
  { key: 'tuesday',   short: 'Tue' },
  { key: 'wednesday', short: 'Wed' },
  { key: 'thursday',  short: 'Thu' },
  { key: 'friday',    short: 'Fri' },
  { key: 'saturday',  short: 'Sat' },
  { key: 'sunday',    short: 'Sun' },
];

type ExperienceMode = { value: string; icon: string; label: string; flow: string; detail: string; recommended?: boolean };
const EXPERIENCE_MODES: ExperienceMode[] = [
  {
    value: 'promotion_only',
    icon: '🎯',
    label: 'Promotion Only',
    flow: 'QR → Game → Win',
    detail: 'For campaigns and promotions only',
  },
  {
    value: 'menu_only',
    icon: '🍽️',
    label: 'Menu Only',
    flow: 'QR → Menu → Browse',
    detail: 'Digital menu, no promotions',
  },
  {
    value: 'menu_and_promotion',
    icon: '✨',
    label: 'Menu + Promotion',
    flow: 'QR → Landing → Menu → Game → Win',
    detail: 'Full experience',
    recommended: true,
  },
];

function generateTimeSlots(): string[] {
  const slots: string[] = [];
  for (let h = 6; h < 24; h++) {
    slots.push(`${h.toString().padStart(2, '0')}:00`);
    slots.push(`${h.toString().padStart(2, '0')}:30`);
  }
  for (let h = 0; h <= 3; h++) {
    slots.push(`${h.toString().padStart(2, '0')}:00`);
    if (h < 3) slots.push(`${h.toString().padStart(2, '0')}:30`);
  }
  return slots;
}
const TIME_SLOTS = generateTimeSlots();

function formatTime12(t24: string): string {
  const [hStr, mStr] = t24.split(':');
  const h = parseInt(hStr, 10);
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mStr} ${period}`;
}

function defaultWeekHours(): WeekHours {
  const day: DayHours = { open: '11:00', close: '22:00', closed: false };
  return {
    monday: { ...day },
    tuesday: { ...day },
    wednesday: { ...day },
    thursday: { ...day },
    friday: { ...day },
    saturday: { open: '12:00', close: '23:00', closed: false },
    sunday: { open: '12:00', close: '21:00', closed: false },
  };
}

function parseHours(raw: unknown): WeekHours {
  const defaults = defaultWeekHours();
  if (!raw || typeof raw !== 'object') return defaults;
  const result = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof WeekHours)[]) {
    const d = (raw as Record<string, unknown>)[key];
    if (d && typeof d === 'object') {
      const day = d as Record<string, unknown>;
      result[key] = {
        open: typeof day.open === 'string' ? day.open : defaults[key].open,
        close: typeof day.close === 'string' ? day.close : defaults[key].close,
        closed: typeof day.closed === 'boolean' ? day.closed : false,
      };
    }
  }
  return result;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sanitizeFileName(name: string) {
  const parts = name.split('.');
  const ext = parts.length > 1 ? parts.pop()?.toLowerCase() : 'jpg';
  const base = parts.join('.').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'upload';
  return `${base}.${ext || 'jpg'}`;
}

function pathFromPublicUrl(url: string | null | undefined, bucket: string) {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length).split('?')[0]);
}

function mbSize(file: File) {
  return (file.size / 1024 / 1024).toFixed(2);
}

function modeLabel(mode: string | null | undefined) {
  if (mode === 'menu_and_promotion') return 'Menu + Promotion';
  if (mode === 'menu_only') return 'Menu Only';
  return 'Promotion Only';
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function RestaurantsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');

  // Per-restaurant tab
  const [activeTabs, setActiveTabs] = useState<Record<string, TabId>>({});

  // Copy / delete
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Logo upload
  const [uploadingLogoId, setUploadingLogoId] = useState<string | null>(null);
  const [removingLogoId, setRemovingLogoId] = useState<string | null>(null);
  const [localLogoPreviews, setLocalLogoPreviews] = useState<Record<string, string>>({});
  const [logoMessages, setLogoMessages] = useState<Record<string, MessageState>>({});

  // Hero upload
  const [uploadingHeroId, setUploadingHeroId] = useState<string | null>(null);
  const [removingHeroId, setRemovingHeroId] = useState<string | null>(null);
  const [localHeroPreviews, setLocalHeroPreviews] = useState<Record<string, string>>({});
  const [heroMessages, setHeroMessages] = useState<Record<string, MessageState>>({});

  // Profile form (per restaurant)
  type ProfileForm = { experience_mode: string; description: string; secondary_color: string; accent_color: string };
  const [profileForms, setProfileForms] = useState<Record<string, ProfileForm>>({});
  const [savingProfileId, setSavingProfileId] = useState<string | null>(null);
  const [profileMessages, setProfileMessages] = useState<Record<string, MessageState>>({});

  // Contact form (per restaurant)
  type ContactForm = {
    phone: string; address_line1: string; city: string; province_state: string;
    postal_code: string; country: string; website_url: string; instagram_url: string;
    facebook_url: string; google_maps_url: string; hours: WeekHours;
  };
  const [contactForms, setContactForms] = useState<Record<string, ContactForm>>({});
  const [savingContactId, setSavingContactId] = useState<string | null>(null);
  const [contactMessages, setContactMessages] = useState<Record<string, MessageState>>({});

  // ── Data loading ──────────────────────────────────────────────────────────

  async function loadRestaurants() {
    const { data: sessionData } = await supabase.auth.getUser();
    if (!sessionData.user) { window.location.href = '/auth'; return; }

    const { data, error } = await supabase
      .from('restaurants')
      .select('id,name,slug,phone,address_line1,city,province_state,postal_code,country,cuisine_type,logo_url,brand_color,experience_mode,hero_image_url,secondary_color,accent_color,description,hours,website_url,instagram_url,facebook_url,google_maps_url')
      .eq('owner_id', sessionData.user.id)
      .order('created_at', { ascending: false });

    if (error) { setPageError(error.message); setLoading(false); return; }

    const list = (data || []) as Restaurant[];
    setRestaurants(list);

    setProfileForms((prev) => {
      const next = { ...prev };
      for (const r of list) {
        if (!next[r.id]) {
          next[r.id] = {
            experience_mode: r.experience_mode || 'promotion_only',
            description: r.description || '',
            secondary_color: r.secondary_color || '',
            accent_color: r.accent_color || '',
          };
        }
      }
      return next;
    });

    setContactForms((prev) => {
      const next = { ...prev };
      for (const r of list) {
        if (!next[r.id]) {
          next[r.id] = {
            phone: r.phone || '',
            address_line1: r.address_line1 || '',
            city: r.city || '',
            province_state: r.province_state || '',
            postal_code: r.postal_code || '',
            country: r.country || 'Canada',
            website_url: r.website_url || '',
            instagram_url: r.instagram_url || '',
            facebook_url: r.facebook_url || '',
            google_maps_url: r.google_maps_url || '',
            hours: parseHours(r.hours),
          };
        }
      }
      return next;
    });

    setLoading(false);
  }

  useEffect(() => { loadRestaurants(); }, []);

  // ── UI helpers ────────────────────────────────────────────────────────────

  const getTab = (id: string): TabId => activeTabs[id] || 'overview';
  const setTab = (id: string, tab: TabId) => setActiveTabs((c) => ({ ...c, [id]: tab }));

  const setMsg = (setter: React.Dispatch<React.SetStateAction<Record<string, MessageState>>>) =>
    (id: string, type: MessageState['type'], text: string) => setter((c) => ({ ...c, [id]: { type, text } }));

  const setLogoMsg = setMsg(setLogoMessages);
  const setHeroMsg = setMsg(setHeroMessages);
  const setProfileMsg = setMsg(setProfileMessages);
  const setContactMsg = setMsg(setContactMessages);

  const patchProfile = (id: string, patch: Partial<ProfileForm>) =>
    setProfileForms((c) => ({ ...c, [id]: { ...c[id], ...patch } }));

  const patchContact = (id: string, patch: Partial<ContactForm>) =>
    setContactForms((c) => ({ ...c, [id]: { ...c[id], ...patch } }));

  const patchHours = (id: string, day: keyof WeekHours, patch: Partial<DayHours>) =>
    setContactForms((c) => ({
      ...c,
      [id]: { ...c[id], hours: { ...c[id].hours, [day]: { ...c[id].hours[day], ...patch } } },
    }));

  async function getUser() {
    const { data } = await supabase.auth.getUser();
    if (!data.user) { window.location.href = '/auth'; return null; }
    return data.user;
  }

  // ── Copy link ─────────────────────────────────────────────────────────────

  async function copyLink(r: Restaurant) {
    await navigator.clipboard.writeText(`${window.location.origin}/admin/promotions?slug=${r.slug}`);
    setCopiedId(r.id);
    setTimeout(() => setCopiedId(null), 1600);
  }

  // ── Logo upload ───────────────────────────────────────────────────────────

  async function handleLogoInput(r: Restaurant, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setLogoMsg(r.id, 'error', 'Please choose an image file.'); return; }
    if (file.size > MAX_LOGO_BYTES) { setLogoMsg(r.id, 'error', `Logo is ${mbSize(file)} MB — max 2 MB.`); return; }

    const preview = URL.createObjectURL(file);
    setLocalLogoPreviews((c) => ({ ...c, [r.id]: preview }));
    setLogoMsg(r.id, 'info', 'Uploading...');
    setUploadingLogoId(r.id);

    const user = await getUser();
    if (!user) return;

    const oldPath = pathFromPublicUrl(r.logo_url, LOGO_BUCKET);
    const storagePath = `${user.id}/${r.id}/${Date.now()}-${sanitizeFileName(file.name || 'logo.png')}`;
    const { error: uploadErr } = await supabase.storage.from(LOGO_BUCKET).upload(storagePath, file, { upsert: true, contentType: file.type });
    if (uploadErr) { setLogoMsg(r.id, 'error', uploadErr.message); setUploadingLogoId(null); return; }

    const { data: urlData } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(storagePath);
    const { error: updateErr } = await supabase.from('restaurants').update({ logo_url: urlData.publicUrl }).eq('id', r.id);
    if (updateErr) { setLogoMsg(r.id, 'error', updateErr.message); setUploadingLogoId(null); return; }

    if (oldPath) await supabase.storage.from(LOGO_BUCKET).remove([oldPath]);
    await loadRestaurants();
    setLogoMsg(r.id, 'success', 'Logo saved.');
    setUploadingLogoId(null);
    setTimeout(() => URL.revokeObjectURL(preview), 3000);
  }

  async function removeLogo(r: Restaurant) {
    if (!window.confirm(`Remove logo for ${r.name}?`)) return;
    setRemovingLogoId(r.id);
    const user = await getUser();
    if (!user) return;
    const { error } = await supabase.from('restaurants').update({ logo_url: null }).eq('id', r.id);
    if (error) { setLogoMsg(r.id, 'error', error.message); setRemovingLogoId(null); return; }
    const path = pathFromPublicUrl(r.logo_url, LOGO_BUCKET);
    if (path) await supabase.storage.from(LOGO_BUCKET).remove([path]);
    setLocalLogoPreviews((c) => { const n = { ...c }; delete n[r.id]; return n; });
    await loadRestaurants();
    setLogoMsg(r.id, 'success', 'Logo removed.');
    setRemovingLogoId(null);
  }

  // ── Hero upload ───────────────────────────────────────────────────────────

  async function handleHeroInput(r: Restaurant, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/webp', 'image/png'].includes(file.type)) {
      setHeroMsg(r.id, 'error', 'JPEG, WebP, or PNG only.');
      return;
    }
    if (file.size > MAX_HERO_BYTES) { setHeroMsg(r.id, 'error', `Image is ${mbSize(file)} MB — max 10 MB.`); return; }

    const preview = URL.createObjectURL(file);
    setLocalHeroPreviews((c) => ({ ...c, [r.id]: preview }));
    setHeroMsg(r.id, 'info', 'Uploading...');
    setUploadingHeroId(r.id);

    const user = await getUser();
    if (!user) return;

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const storagePath = `${user.id}/${r.id}/hero.${ext}`;

    const { error: uploadErr } = await supabase.storage.from(HERO_BUCKET).upload(storagePath, file, { upsert: true, contentType: file.type });
    if (uploadErr) { setHeroMsg(r.id, 'error', uploadErr.message); setUploadingHeroId(null); return; }

    const { data: urlData } = supabase.storage.from(HERO_BUCKET).getPublicUrl(storagePath);
    const heroUrl = `${urlData.publicUrl}?t=${Date.now()}`;
    const { error: updateErr } = await supabase.from('restaurants').update({ hero_image_url: heroUrl }).eq('id', r.id);
    if (updateErr) { setHeroMsg(r.id, 'error', updateErr.message); setUploadingHeroId(null); return; }

    await loadRestaurants();
    setHeroMsg(r.id, 'success', 'Hero image saved.');
    setUploadingHeroId(null);
    setTimeout(() => URL.revokeObjectURL(preview), 3000);
  }

  async function removeHero(r: Restaurant) {
    if (!window.confirm('Remove hero image?')) return;
    setRemovingHeroId(r.id);
    const user = await getUser();
    if (!user) return;
    const { error } = await supabase.from('restaurants').update({ hero_image_url: null }).eq('id', r.id);
    if (error) { setHeroMsg(r.id, 'error', error.message); setRemovingHeroId(null); return; }
    const path = pathFromPublicUrl(r.hero_image_url, HERO_BUCKET);
    if (path) await supabase.storage.from(HERO_BUCKET).remove([path]);
    setLocalHeroPreviews((c) => { const n = { ...c }; delete n[r.id]; return n; });
    await loadRestaurants();
    setHeroMsg(r.id, 'success', 'Hero image removed.');
    setRemovingHeroId(null);
  }

  // ── Profile save ──────────────────────────────────────────────────────────

  async function saveProfile(r: Restaurant) {
    const form = profileForms[r.id];
    if (!form) return;
    setSavingProfileId(r.id);
    const user = await getUser();
    if (!user) return;
    const { error } = await supabase.from('restaurants').update({
      experience_mode: form.experience_mode,
      description: form.description || null,
      secondary_color: form.secondary_color || null,
      accent_color: form.accent_color || null,
    }).eq('id', r.id).eq('owner_id', user.id);
    if (error) {
      setProfileMsg(r.id, 'error', error.message);
    } else {
      await loadRestaurants();
      setProfileMsg(r.id, 'success', 'Profile saved.');
      setTimeout(() => setProfileMessages((c) => { const n = { ...c }; delete n[r.id]; return n; }), 2500);
    }
    setSavingProfileId(null);
  }

  // ── Contact save ──────────────────────────────────────────────────────────

  async function saveContact(r: Restaurant) {
    const form = contactForms[r.id];
    if (!form) return;
    setSavingContactId(r.id);
    const user = await getUser();
    if (!user) return;
    const { error } = await supabase.from('restaurants').update({
      phone: form.phone || null,
      address_line1: form.address_line1 || null,
      city: form.city || null,
      province_state: form.province_state || null,
      postal_code: form.postal_code || null,
      country: form.country || 'Canada',
      website_url: form.website_url || null,
      instagram_url: form.instagram_url || null,
      facebook_url: form.facebook_url || null,
      google_maps_url: form.google_maps_url || null,
      hours: form.hours,
    }).eq('id', r.id).eq('owner_id', user.id);
    if (error) {
      setContactMsg(r.id, 'error', error.message);
    } else {
      await loadRestaurants();
      setContactMsg(r.id, 'success', 'Contact info saved.');
      setTimeout(() => setContactMessages((c) => { const n = { ...c }; delete n[r.id]; return n; }), 2500);
    }
    setSavingContactId(null);
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function deleteRestaurant(r: Restaurant) {
    if (!window.confirm(`Delete ${r.name}? This will remove this restaurant and all related data.`)) return;
    setDeletingId(r.id);
    const logoPath = pathFromPublicUrl(r.logo_url, LOGO_BUCKET);
    const { error } = await supabase.rpc('delete_restaurant_cascade', { target_restaurant_id: r.id });
    if (error) { setPageError(error.message); setDeletingId(null); return; }
    if (logoPath) await supabase.storage.from(LOGO_BUCKET).remove([logoPath]);
    await loadRestaurants();
    setDeletingId(null);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <main className="min-h-screen bg-[#FFF8F0] p-6 text-stone-600">Loading restaurants...</main>;

  return (
    <main className="min-h-screen bg-[#FFF8F0] px-4 py-6 text-[#1F1F1F]">
      <section className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-[#FF6B00]">🎯 SpinBite</h1>
            <p className="mt-1 text-sm font-bold text-stone-500">Restaurant locations</p>
          </div>
          <a href="/admin" className="rounded-full bg-white px-4 py-3 text-sm font-black text-[#FF6B00] shadow">Dashboard</a>
        </div>

        <div className="mt-6 rounded-[2rem] bg-gradient-to-br from-[#FF6B00] to-[#E63939] p-6 text-white shadow-2xl shadow-orange-200">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-white/80">Manage Restaurants</p>
          <h2 className="mt-3 text-4xl font-black leading-tight">Build your restaurant experience.</h2>
          <p className="mt-3 text-sm font-semibold text-white/85">
            Set your experience mode, upload a hero image, configure hours and contact info, then launch menus and promotions for each location.
          </p>
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
            const displayLogo = localLogoPreviews[r.id] || r.logo_url;
            const displayHero = localHeroPreviews[r.id] || r.hero_image_url;
            const isSavingProfile = savingProfileId === r.id;
            const isSavingContact = savingContactId === r.id;

            return (
              <article key={r.id} className="overflow-hidden rounded-3xl bg-white shadow-xl">

                {/* Hero banner */}
                <div className="relative h-36 overflow-hidden bg-gradient-to-br from-orange-200 via-amber-100 to-red-100">
                  {displayHero && (
                    <img src={displayHero} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" />
                  )}
                  <div className="relative flex h-full items-start justify-between px-5 py-4">
                    <span className="rounded-2xl bg-white/80 px-3 py-2 text-sm font-black text-[#FF6B00] shadow backdrop-blur-sm">
                      Location #{index + 1}
                    </span>
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-white/90 p-2 shadow-lg backdrop-blur-sm">
                      {displayLogo
                        ? <img src={displayLogo} alt={`${r.name} logo`} className="max-h-full max-w-full object-contain" />
                        : <span className="text-3xl">🍽️</span>
                      }
                    </div>
                  </div>
                </div>

                {/* Name + delete */}
                <div className="flex items-start justify-between gap-3 px-5 pt-4">
                  <div>
                    <h3 className="text-3xl font-black">{r.name}</h3>
                    <p className="mt-0.5 text-sm font-bold text-stone-400">/{r.slug}</p>
                  </div>
                  <button
                    onClick={() => deleteRestaurant(r)}
                    disabled={deletingId === r.id}
                    className="mt-1 rounded-full bg-red-50 px-3 py-2 text-xs font-black text-red-600 disabled:opacity-50"
                  >
                    {deletingId === r.id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>

                {/* Tab strip */}
                <div className="mt-4 flex gap-1 border-b border-stone-100 px-5">
                  {(['overview', 'profile', 'contact'] as TabId[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(r.id, t)}
                      className={`rounded-t-xl px-4 py-2 text-sm font-black capitalize transition-colors ${
                        tab === t
                          ? 'border-b-2 border-[#FF6B00] text-[#FF6B00]'
                          : 'text-stone-500 hover:text-stone-800'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                <div className="p-5">

                  {/* ── OVERVIEW ─────────────────────────────────────────────── */}
                  {tab === 'overview' && (
                    <div className="space-y-4">
                      <div className="grid gap-1.5 text-sm font-semibold text-stone-600">
                        <p>📍 {[r.address_line1, r.city].filter(Boolean).join(', ') || 'Address not set'}</p>
                        <p>☎️ {r.phone || 'Phone not set'}</p>
                        <p>🍛 {r.cuisine_type || 'Cuisine not set'}</p>
                        <p>🎯 <span className="text-stone-400">Mode:</span> {modeLabel(r.experience_mode)}</p>
                      </div>

                      {/* Logo */}
                      <div className="rounded-2xl bg-orange-50 p-4">
                        <p className="text-xs font-black uppercase tracking-wide text-[#FF6B00]">Logo</p>
                        <p className="mt-1 text-xs font-semibold text-stone-500">PNG, JPG, SVG, or WebP · Max 2 MB</p>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-orange-100 bg-white p-1.5 shadow-sm">
                            {displayLogo
                              ? <img src={displayLogo} alt="logo" className="max-h-full max-w-full object-contain" />
                              : <span className="text-xs font-black text-stone-400">No logo</span>
                            }
                          </div>
                          <label className="cursor-pointer rounded-2xl bg-[#FF6B00] px-4 py-2 text-sm font-black text-white">
                            {uploadingLogoId === r.id ? 'Uploading…' : r.logo_url ? 'Replace' : 'Upload Logo'}
                            <input type="file" accept="image/*" disabled={uploadingLogoId === r.id} onChange={(e) => handleLogoInput(r, e)} className="hidden" />
                          </label>
                          {r.logo_url && (
                            <button onClick={() => removeLogo(r)} disabled={removingLogoId === r.id} className="rounded-2xl bg-white px-4 py-2 text-sm font-black text-red-600 shadow-sm disabled:opacity-50">
                              {removingLogoId === r.id ? 'Removing…' : 'Remove'}
                            </button>
                          )}
                        </div>
                        {logoMessages[r.id] && (
                          <p className={`mt-2 rounded-xl p-2 text-sm font-bold ${logoMessages[r.id].type === 'error' ? 'bg-red-50 text-red-700' : logoMessages[r.id].type === 'success' ? 'bg-green-50 text-green-700' : 'text-stone-600'}`}>
                            {logoMessages[r.id].text}
                          </p>
                        )}
                      </div>

                      {/* Promo link */}
                      <div className="rounded-2xl bg-stone-50 p-4">
                        <p className="text-xs font-black uppercase tracking-wide text-stone-500">Promotions workspace</p>
                        <p className="mt-1 break-all text-sm font-black text-[#FF6B00]">/admin/promotions?slug={r.slug}</p>
                        <button onClick={() => copyLink(r)} className="mt-3 w-full rounded-2xl bg-[#FF6B00] px-4 py-3 font-black text-white">
                          {copiedId === r.id ? 'Copied!' : 'Copy Link'}
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <a href={`/admin?slug=${r.slug}`} className="rounded-2xl bg-stone-200 px-4 py-3 text-center font-black">Dashboard</a>
                        <a href={`/admin/promotions?slug=${r.slug}`} className="rounded-2xl bg-green-600 px-4 py-3 text-center font-black text-white">Promotions</a>
                      </div>
                    </div>
                  )}

                  {/* ── PROFILE ──────────────────────────────────────────────── */}
                  {tab === 'profile' && pf && (
                    <div className="space-y-6">

                      {/* Experience mode */}
                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-stone-500">Customer Experience Mode</p>
                        <p className="mt-1 text-sm text-stone-500">How customers experience your restaurant after scanning the QR code.</p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-3">
                          {EXPERIENCE_MODES.map((mode) => (
                            <button
                              key={mode.value}
                              onClick={() => patchProfile(r.id, { experience_mode: mode.value })}
                              className={`relative rounded-2xl border-2 p-4 text-left transition-all ${
                                pf.experience_mode === mode.value
                                  ? 'border-[#FF6B00] bg-orange-50'
                                  : 'border-stone-200 bg-white hover:border-orange-200'
                              }`}
                            >
                              {mode.recommended && (
                                <span className="absolute right-2 top-2 rounded-full bg-[#FF6B00] px-2 py-0.5 text-[10px] font-black text-white">
                                  ★ Recommended
                                </span>
                              )}
                              <p className="text-2xl">{mode.icon}</p>
                              <p className="mt-2 text-sm font-black">{mode.label}</p>
                              <p className="mt-1 text-xs font-semibold text-stone-500">{mode.flow}</p>
                              <p className="mt-0.5 text-xs text-stone-400">{mode.detail}</p>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Hero image (menu modes only) */}
                      {pf.experience_mode !== 'promotion_only' && (
                        <div>
                          <p className="text-xs font-black uppercase tracking-wide text-stone-500">Hero Image</p>
                          <p className="mt-1 text-sm text-stone-500">Full-bleed background shown on your landing page. Recommended: 1600 × 900px.</p>
                          <div className="mt-2 overflow-hidden rounded-2xl border-2 border-dashed border-stone-200">
                            {displayHero ? (
                              <div className="group relative">
                                <img src={displayHero} alt="Hero preview" className="h-40 w-full object-cover" />
                                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                                  <label className="cursor-pointer rounded-xl bg-white px-3 py-2 text-sm font-black">
                                    Replace
                                    <input type="file" accept="image/jpeg,image/webp,image/png" disabled={uploadingHeroId === r.id} onChange={(e) => handleHeroInput(r, e)} className="hidden" />
                                  </label>
                                  <button onClick={() => removeHero(r)} disabled={removingHeroId === r.id} className="rounded-xl bg-red-600 px-3 py-2 text-sm font-black text-white">
                                    Remove
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 py-10 text-stone-400 hover:bg-stone-50">
                                <span className="text-4xl">📷</span>
                                <span className="text-sm font-bold">{uploadingHeroId === r.id ? 'Uploading…' : 'Drag and drop, or tap to select'}</span>
                                <span className="text-xs">JPEG · WebP · PNG · Max 10 MB</span>
                                <input type="file" accept="image/jpeg,image/webp,image/png" disabled={uploadingHeroId === r.id} onChange={(e) => handleHeroInput(r, e)} className="hidden" />
                              </label>
                            )}
                          </div>
                          {heroMessages[r.id] && (
                            <p className={`mt-2 rounded-xl p-2 text-sm font-bold ${heroMessages[r.id].type === 'error' ? 'bg-red-50 text-red-700' : heroMessages[r.id].type === 'success' ? 'bg-green-50 text-green-700' : 'text-stone-600'}`}>
                              {heroMessages[r.id].text}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Description (menu modes only) */}
                      {pf.experience_mode !== 'promotion_only' && (
                        <div>
                          <p className="text-xs font-black uppercase tracking-wide text-stone-500">About Your Restaurant</p>
                          <p className="mt-1 text-sm text-stone-500">Shown in the About section of your landing page.</p>
                          <textarea
                            value={pf.description}
                            onChange={(e) => patchProfile(r.id, { description: e.target.value.slice(0, 300) })}
                            placeholder="Authentic cuisine serving the finest seasonal ingredients since 1998…"
                            rows={4}
                            className="mt-2 w-full rounded-2xl border border-stone-200 p-3 text-sm font-semibold focus:border-[#FF6B00] focus:outline-none"
                          />
                          <p className={`mt-1 text-right text-xs font-bold ${pf.description.length >= 280 ? 'text-red-500' : 'text-stone-400'}`}>
                            {pf.description.length} / 300
                          </p>
                        </div>
                      )}

                      {/* Colors */}
                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-stone-500">Brand Colors</p>
                        <div className="mt-3 grid grid-cols-3 gap-3">
                          <div className="rounded-2xl border border-stone-100 p-3">
                            <p className="text-xs font-bold text-stone-400">Primary</p>
                            <div className="mt-2 flex items-center gap-2">
                              <div className="h-8 w-8 rounded-xl border border-stone-200" style={{ background: r.brand_color || '#f97316' }} />
                              <p className="text-xs font-bold text-stone-600">{r.brand_color || '#f97316'}</p>
                            </div>
                            <p className="mt-1 text-[10px] text-stone-400">Set in restaurant setup</p>
                          </div>
                          <div className="rounded-2xl border border-stone-100 p-3">
                            <p className="text-xs font-bold text-stone-400">Secondary</p>
                            <div className="mt-2 flex items-center gap-2">
                              <input
                                type="color"
                                value={pf.secondary_color || '#ffffff'}
                                onChange={(e) => patchProfile(r.id, { secondary_color: e.target.value })}
                                className="h-8 w-8 cursor-pointer rounded-xl border border-stone-200 p-0.5"
                              />
                              <p className="text-xs font-bold text-stone-600">{pf.secondary_color || 'Auto'}</p>
                            </div>
                          </div>
                          <div className="rounded-2xl border border-stone-100 p-3">
                            <p className="text-xs font-bold text-stone-400">Accent</p>
                            <div className="mt-2 flex items-center gap-2">
                              <input
                                type="color"
                                value={pf.accent_color || '#ffffff'}
                                onChange={(e) => patchProfile(r.id, { accent_color: e.target.value })}
                                className="h-8 w-8 cursor-pointer rounded-xl border border-stone-200 p-0.5"
                              />
                              <p className="text-xs font-bold text-stone-600">{pf.accent_color || 'Auto'}</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {profileMessages[r.id] && (
                        <p className={`rounded-xl p-3 text-sm font-bold ${profileMessages[r.id].type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                          {profileMessages[r.id].text}
                        </p>
                      )}
                      <button onClick={() => saveProfile(r)} disabled={isSavingProfile} className="w-full rounded-2xl bg-[#FF6B00] py-3 font-black text-white disabled:opacity-60">
                        {isSavingProfile ? 'Saving…' : 'Save Profile'}
                      </button>
                    </div>
                  )}

                  {/* ── CONTACT ──────────────────────────────────────────────── */}
                  {tab === 'contact' && cf && (
                    <div className="space-y-6">

                      {/* Address */}
                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-stone-500">Address</p>
                        <div className="mt-2 space-y-2">
                          <input type="text" value={cf.address_line1} onChange={(e) => patchContact(r.id, { address_line1: e.target.value })} placeholder="Street address" className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm font-semibold focus:border-[#FF6B00] focus:outline-none" />
                          <div className="grid grid-cols-2 gap-2">
                            <input type="text" value={cf.city} onChange={(e) => patchContact(r.id, { city: e.target.value })} placeholder="City" className="rounded-2xl border border-stone-200 px-4 py-3 text-sm font-semibold focus:border-[#FF6B00] focus:outline-none" />
                            <input type="text" value={cf.province_state} onChange={(e) => patchContact(r.id, { province_state: e.target.value })} placeholder="Province / State" className="rounded-2xl border border-stone-200 px-4 py-3 text-sm font-semibold focus:border-[#FF6B00] focus:outline-none" />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <input type="text" value={cf.postal_code} onChange={(e) => patchContact(r.id, { postal_code: e.target.value })} placeholder="Postal / ZIP" className="rounded-2xl border border-stone-200 px-4 py-3 text-sm font-semibold focus:border-[#FF6B00] focus:outline-none" />
                            <input type="text" value={cf.country} onChange={(e) => patchContact(r.id, { country: e.target.value })} placeholder="Country" className="rounded-2xl border border-stone-200 px-4 py-3 text-sm font-semibold focus:border-[#FF6B00] focus:outline-none" />
                          </div>
                        </div>
                      </div>

                      {/* Phone */}
                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-stone-500">Phone</p>
                        <input type="tel" value={cf.phone} onChange={(e) => patchContact(r.id, { phone: e.target.value })} placeholder="(416) 555-1234" className="mt-2 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm font-semibold focus:border-[#FF6B00] focus:outline-none" />
                      </div>

                      {/* Online presence */}
                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-stone-500">Online Presence</p>
                        <p className="mt-1 text-xs text-stone-400">All fields are optional — only filled fields appear on your landing page.</p>
                        <div className="mt-2 space-y-2">
                          {[
                            { field: 'website_url' as const, placeholder: 'https://yourrestaurant.ca', label: '🌐 Website' },
                            { field: 'google_maps_url' as const, placeholder: 'Google Maps share link', label: '🗺️ Google Maps' },
                            { field: 'instagram_url' as const, placeholder: 'https://instagram.com/yourrestaurant', label: '📸 Instagram' },
                            { field: 'facebook_url' as const, placeholder: 'https://facebook.com/yourrestaurant', label: '👥 Facebook' },
                          ].map(({ field, placeholder, label }) => (
                            <div key={field}>
                              <p className="mb-1 text-xs font-semibold text-stone-500">{label}</p>
                              <input
                                type="url"
                                value={cf[field]}
                                onChange={(e) => patchContact(r.id, { [field]: e.target.value })}
                                placeholder={placeholder}
                                className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm font-semibold focus:border-[#FF6B00] focus:outline-none"
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Hours */}
                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-stone-500">Opening Hours</p>
                        <div className="mt-3 space-y-2">
                          {DAYS.map(({ key, short }) => {
                            const dh = cf.hours[key];
                            return (
                              <div key={key} className="flex items-center gap-2">
                                <span className="w-9 shrink-0 text-sm font-black text-stone-500">{short}</span>
                                <button
                                  onClick={() => patchHours(r.id, key, { closed: !dh.closed })}
                                  className={`w-16 shrink-0 rounded-xl py-1.5 text-xs font-black transition-colors ${dh.closed ? 'bg-stone-100 text-stone-500' : 'bg-green-100 text-green-700'}`}
                                >
                                  {dh.closed ? 'Closed' : 'Open'}
                                </button>
                                {!dh.closed && (
                                  <>
                                    <select value={dh.open} onChange={(e) => patchHours(r.id, key, { open: e.target.value })} className="min-w-0 flex-1 rounded-xl border border-stone-200 px-2 py-1.5 text-xs font-semibold focus:border-[#FF6B00] focus:outline-none">
                                      {TIME_SLOTS.map((t) => <option key={t} value={t}>{formatTime12(t)}</option>)}
                                    </select>
                                    <span className="shrink-0 text-xs text-stone-400">–</span>
                                    <select value={dh.close} onChange={(e) => patchHours(r.id, key, { close: e.target.value })} className="min-w-0 flex-1 rounded-xl border border-stone-200 px-2 py-1.5 text-xs font-semibold focus:border-[#FF6B00] focus:outline-none">
                                      {TIME_SLOTS.map((t) => <option key={t} value={t}>{formatTime12(t)}</option>)}
                                    </select>
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {contactMessages[r.id] && (
                        <p className={`rounded-xl p-3 text-sm font-bold ${contactMessages[r.id].type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                          {contactMessages[r.id].text}
                        </p>
                      )}
                      <button onClick={() => saveContact(r)} disabled={isSavingContact} className="w-full rounded-2xl bg-[#FF6B00] py-3 font-black text-white disabled:opacity-60">
                        {isSavingContact ? 'Saving…' : 'Save Contact Info'}
                      </button>
                    </div>
                  )}

                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
