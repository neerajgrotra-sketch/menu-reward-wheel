'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Restaurant = {
  id: string;
  name: string;
  slug: string;
  phone?: string | null;
  address_line1?: string | null;
  city?: string | null;
  cuisine_type?: string | null;
  logo_url?: string | null;
};

const LOGO_BUCKET = 'restaurant-logos';

function sanitizeFileName(value: string) {
  const parts = value.split('.');
  const extension = parts.length > 1 ? parts.pop()?.toLowerCase() : 'png';
  const base = parts.join('.').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'logo';
  return `${base}.${extension || 'png'}`;
}

function objectPathFromPublicUrl(url?: string | null) {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${LOGO_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index === -1) return null;
  return decodeURIComponent(url.slice(index + marker.length));
}

export default function RestaurantsPage() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [removingLogoId, setRemovingLogoId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const supabase = createClient();

  async function loadRestaurants() {
    const { data: sessionData } = await supabase.auth.getUser();
    const user = sessionData.user;

    if (!user) {
      window.location.href = '/auth';
      return;
    }

    const { data, error: loadError } = await supabase
      .from('restaurants')
      .select('id,name,slug,phone,address_line1,city,cuisine_type,logo_url')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false });

    if (loadError) setError(loadError.message);
    setRestaurants((data || []) as Restaurant[]);
    setLoading(false);
  }

  useEffect(() => {
    loadRestaurants();
  }, []);

  async function copyLink(restaurant: Restaurant) {
    const link = `${window.location.origin}/admin/promotions?slug=${restaurant.slug}`;
    await navigator.clipboard.writeText(link);
    setCopiedId(restaurant.id);
    setTimeout(() => setCopiedId(null), 1600);
  }

  async function uploadLogo(restaurant: Restaurant, file?: File | null) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file for the restaurant logo.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Logo file is too large. Please upload an image smaller than 2 MB.');
      return;
    }

    setUploadingId(restaurant.id);
    setError('');
    setNotice('');

    const { data: sessionData } = await supabase.auth.getUser();
    const user = sessionData.user;
    if (!user) {
      window.location.href = '/auth';
      return;
    }

    const previousPath = objectPathFromPublicUrl(restaurant.logo_url);
    const storagePath = `${user.id}/${restaurant.id}/${Date.now()}-${sanitizeFileName(file.name)}`;
    const uploadResult = await supabase.storage.from(LOGO_BUCKET).upload(storagePath, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type,
    });

    if (uploadResult.error) {
      setError(uploadResult.error.message);
      setUploadingId(null);
      return;
    }

    const { data: publicUrlData } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(storagePath);
    const updateResult = await supabase
      .from('restaurants')
      .update({ logo_url: publicUrlData.publicUrl })
      .eq('id', restaurant.id)
      .eq('owner_id', user.id);

    if (updateResult.error) {
      setError(updateResult.error.message);
      setUploadingId(null);
      return;
    }

    if (previousPath) await supabase.storage.from(LOGO_BUCKET).remove([previousPath]);
    await loadRestaurants();
    setNotice(`Logo saved for ${restaurant.name}. It will now appear on print kits.`);
    setTimeout(() => setNotice(''), 2400);
    setUploadingId(null);
  }

  async function removeLogo(restaurant: Restaurant) {
    const confirmed = window.confirm(`Remove the logo for ${restaurant.name}? Print kits will fall back to the restaurant name.`);
    if (!confirmed) return;

    setRemovingLogoId(restaurant.id);
    setError('');
    setNotice('');

    const { data: sessionData } = await supabase.auth.getUser();
    const user = sessionData.user;
    if (!user) {
      window.location.href = '/auth';
      return;
    }

    const updateResult = await supabase
      .from('restaurants')
      .update({ logo_url: null })
      .eq('id', restaurant.id)
      .eq('owner_id', user.id);

    if (updateResult.error) {
      setError(updateResult.error.message);
      setRemovingLogoId(null);
      return;
    }

    const path = objectPathFromPublicUrl(restaurant.logo_url);
    if (path) await supabase.storage.from(LOGO_BUCKET).remove([path]);

    await loadRestaurants();
    setNotice(`Logo removed for ${restaurant.name}.`);
    setTimeout(() => setNotice(''), 2200);
    setRemovingLogoId(null);
  }

  async function deleteRestaurant(restaurant: Restaurant) {
    const confirmed = window.confirm(`Delete ${restaurant.name}? This will remove this restaurant and its related menus/promotions.`);
    if (!confirmed) return;

    setDeletingId(restaurant.id);
    setError('');

    const logoPath = objectPathFromPublicUrl(restaurant.logo_url);
    const { error } = await supabase.rpc('delete_restaurant_cascade', {
      target_restaurant_id: restaurant.id,
    });

    if (error) {
      setError(error.message);
      setDeletingId(null);
      return;
    }

    if (logoPath) await supabase.storage.from(LOGO_BUCKET).remove([logoPath]);
    await loadRestaurants();
    setDeletingId(null);
  }

  if (loading) return <main className="min-h-screen bg-[#FFF8F0] p-6">Loading restaurants...</main>;

  return (
    <main className="min-h-screen bg-[#FFF8F0] px-4 py-6 text-[#1F1F1F]">
      <section className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-[#FF6B00]">🎯 SpinBite</h1>
            <p className="mt-1 text-sm font-bold text-stone-500">Restaurant locations</p>
          </div>
          <a href="/admin" className="rounded-full bg-white px-4 py-3 text-sm font-black text-[#FF6B00] shadow">Dashboard</a>
        </div>

        <div className="mt-6 rounded-[2rem] bg-gradient-to-br from-[#FF6B00] to-[#E63939] p-6 text-white shadow-2xl shadow-orange-200">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-white/80">Manage Restaurants</p>
          <h2 className="mt-3 text-4xl font-black leading-tight">Add and manage your restaurant locations.</h2>
          <p className="mt-3 text-sm font-semibold text-white/85">
            Each restaurant can have its own menus, promotions, QR links, reward wheels, and branded print-kit logo. Start by adding a restaurant, then build menus and promotions for that location.
          </p>
        </div>

        <a href="/setup" className="mt-5 block rounded-3xl bg-green-600 p-5 text-center text-xl font-black text-white shadow-xl">
          + Add Restaurant
        </a>

        {notice && <p className="mt-5 rounded-2xl bg-green-50 p-4 text-sm font-bold text-green-700">{notice}</p>}
        {error && <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p>}

        <div className="mt-5 space-y-4">
          {restaurants.length === 0 && (
            <div className="rounded-3xl bg-white p-6 shadow-xl">
              <p className="text-2xl font-black">No restaurants yet</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-stone-600">
                Add your first restaurant to begin creating menus, promotions, QR campaigns, customer reward wheels, and branded print kits.
              </p>
            </div>
          )}

          {restaurants.map((restaurant, index) => {
            const address = [restaurant.address_line1, restaurant.city].filter(Boolean).join(', ');
            const promotionLink = `/admin/promotions?slug=${restaurant.slug}`;
            const isUploading = uploadingId === restaurant.id;
            const isRemovingLogo = removingLogoId === restaurant.id;

            return (
              <article key={restaurant.id} className="overflow-hidden rounded-3xl bg-white shadow-xl">
                <div className="h-32 bg-gradient-to-br from-orange-200 via-amber-100 to-red-100 px-5 py-4">
                  <div className="flex h-full items-start justify-between">
                    <div className="rounded-2xl bg-white/80 px-3 py-2 text-sm font-black text-[#FF6B00] shadow">
                      Location #{index + 1}
                    </div>
                    {restaurant.logo_url ? (
                      <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-3xl bg-white p-2 shadow-lg">
                        <img src={restaurant.logo_url} alt={`${restaurant.name} logo`} className="max-h-full max-w-full object-contain" />
                      </div>
                    ) : (
                      <div className="text-4xl">🍽️</div>
                    )}
                  </div>
                </div>

                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-3xl font-black">{restaurant.name}</h3>
                      <p className="mt-1 break-all text-sm font-bold text-stone-500">/{restaurant.slug}</p>
                    </div>
                    <button onClick={() => deleteRestaurant(restaurant)} disabled={deletingId === restaurant.id} className="rounded-full bg-red-50 px-3 py-2 text-xs font-black text-red-600 disabled:opacity-50">
                      {deletingId === restaurant.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>

                  <div className="mt-4 grid gap-2 text-sm font-semibold text-stone-600">
                    <p>📍 {address || 'Address not added yet'}</p>
                    <p>☎️ {restaurant.phone || 'Phone not added yet'}</p>
                    <p>🍛 {restaurant.cuisine_type || 'Cuisine not added yet'}</p>
                  </div>

                  <div className="mt-4 rounded-2xl bg-orange-50 p-4">
                    <p className="text-xs font-black uppercase tracking-wide text-[#FF6B00]">Restaurant Branding</p>
                    <div className="mt-3 flex items-center gap-4">
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-orange-100 bg-white p-2 shadow-sm">
                        {restaurant.logo_url ? (
                          <img src={restaurant.logo_url} alt={`${restaurant.name} logo preview`} className="max-h-full max-w-full object-contain" />
                        ) : (
                          <span className="text-center text-xs font-black text-stone-400">No logo</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold leading-5 text-stone-600">Upload a PNG, JPG, SVG, or WebP logo. This logo will appear automatically on reusable QR print kits.</p>
                        <label className="mt-3 inline-flex cursor-pointer rounded-2xl bg-[#FF6B00] px-4 py-3 text-sm font-black text-white shadow-sm">
                          {isUploading ? 'Uploading...' : restaurant.logo_url ? 'Replace Logo' : 'Upload Logo'}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/svg+xml"
                            disabled={isUploading}
                            onChange={(event) => uploadLogo(restaurant, event.target.files?.[0])}
                            className="hidden"
                          />
                        </label>
                        {restaurant.logo_url && (
                          <button onClick={() => removeLogo(restaurant)} disabled={isRemovingLogo} className="ml-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-red-600 shadow-sm disabled:opacity-50">
                            {isRemovingLogo ? 'Removing...' : 'Remove'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl bg-stone-50 p-4">
                    <p className="text-xs font-black uppercase tracking-wide text-stone-500">Current promotion workspace link</p>
                    <p className="mt-1 break-all text-sm font-black text-[#FF6B00]">{promotionLink}</p>
                    <button onClick={() => copyLink(restaurant)} className="mt-3 w-full rounded-2xl bg-[#FF6B00] px-4 py-3 font-black text-white">
                      {copiedId === restaurant.id ? 'Copied!' : 'Copy Link'}
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <a href={`/admin?slug=${restaurant.slug}`} className="rounded-2xl bg-stone-200 px-4 py-3 text-center font-black">Open</a>
                    <a href={`/admin/promotions?slug=${restaurant.slug}`} className="rounded-2xl bg-green-600 px-4 py-3 text-center font-black text-white">Promotions</a>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
