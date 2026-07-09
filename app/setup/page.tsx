'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export default function SetupPage() {
  const router = useRouter();
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [cuisineType, setCuisineType] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [brandColor, setBrandColor] = useState('#FF6B00');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadForEdit() {
      const supabase = createClient();
      const params = new URLSearchParams(window.location.search);
      const id = params.get('id');
      setRestaurantId(id);

      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        router.push('/auth');
        return;
      }

      if (!id) {
        setLoading(false);
        return;
      }

      const { data, error: loadError } = await supabase
        .from('restaurants')
        .select('id,name,address_line1,city,phone,cuisine_type,image_url,brand_color')
        .eq('id', id)
        .eq('owner_id', user.id)
        .is('deleted_at', null)
        .single();

      if (loadError || !data) {
        setError('Restaurant not found or you do not have access.');
        setLoading(false);
        return;
      }

      setName(data.name || '');
      setAddress(data.address_line1 || '');
      setCity(data.city || '');
      setPhone(data.phone || '');
      setCuisineType(data.cuisine_type || '');
      setImageUrl(data.image_url || '');
      setBrandColor(data.brand_color || '#FF6B00');
      setLoading(false);
    }

    loadForEdit();
  }, [router]);

  async function saveRestaurant() {
    if (saving) return;

    const restaurantName = name.trim();
    if (!restaurantName) {
      setError('Restaurant name is required.');
      return;
    }

    setSaving(true);
    setError('');

    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;

    if (!user) {
      setSaving(false);
      router.push('/auth');
      return;
    }

    const payload = {
      name: restaurantName,
      address_line1: address.trim() || null,
      city: city.trim() || null,
      phone: phone.trim() || null,
      cuisine_type: cuisineType.trim() || null,
      image_url: imageUrl.trim() || null,
      brand_color: brandColor,
    };

    if (restaurantId) {
      const { error: updateError } = await supabase
        .from('restaurants')
        .update(payload)
        .eq('id', restaurantId)
        .eq('owner_id', user.id);

      setSaving(false);
      if (updateError) {
        setError(updateError.message);
        return;
      }
      router.push('/admin/restaurants');
      return;
    }

    // Guard: block duplicate names under the same owner
    const { data: existing } = await supabase
      .from('restaurants')
      .select('id, name')
      .eq('owner_id', user.id)
      .is('deleted_at', null);

    const normalizedNew = restaurantName.toLowerCase().trim();
    const duplicate = (existing ?? []).find(
      (r) => r.name.toLowerCase().trim() === normalizedNew,
    );

    if (duplicate) {
      setError('A restaurant with this name already exists. Use a distinct name for each location (e.g. "Punjabi By Nature Oakville").');
      setSaving(false);
      return;
    }

    const baseSlug = slugify(restaurantName);
    const slug = `${baseSlug}-${Date.now().toString().slice(-5)}`;

    const { error: insertError } = await supabase.from('restaurants').insert({
      owner_id: user.id,
      slug,
      ...payload,
    });

    setSaving(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    router.push('/admin/restaurants');
  }

  if (loading) return <main className="min-h-screen bg-[#FFF8F0] p-6">Loading restaurant form...</main>;

  return (
    <main className="min-h-screen bg-[#FFF8F0] px-4 py-10 text-[#1F1F1F]">
      <section className="mx-auto max-w-md rounded-3xl bg-white p-6 shadow-xl">
        <a href="/admin/restaurants" className="text-sm font-black text-[#FF6B00]">← Back to restaurants</a>
        <h1 className="mt-6 text-4xl font-black text-[#FF6B00]">🎯 {restaurantId ? 'Edit Restaurant' : 'Add Restaurant'}</h1>
        <p className="mt-2 text-sm font-semibold text-stone-600">
          Add the location details restaurants need before building menus, promotions, and customer QR games.
        </p>

        <label className="mt-6 block text-sm font-bold text-stone-700">Restaurant name</label>
        <input value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full rounded-2xl border border-stone-200 px-4 py-3 font-semibold outline-none focus:border-[#FF6B00]" placeholder="Example: Punjabi Kitchen Oakville" />

        <label className="mt-4 block text-sm font-bold text-stone-700">Address</label>
        <input value={address} onChange={(event) => setAddress(event.target.value)} className="mt-2 w-full rounded-2xl border border-stone-200 px-4 py-3 font-semibold outline-none focus:border-[#FF6B00]" placeholder="Street address" />

        <label className="mt-4 block text-sm font-bold text-stone-700">City</label>
        <input value={city} onChange={(event) => setCity(event.target.value)} className="mt-2 w-full rounded-2xl border border-stone-200 px-4 py-3 font-semibold outline-none focus:border-[#FF6B00]" placeholder="City" />

        <label className="mt-4 block text-sm font-bold text-stone-700">Phone number</label>
        <input value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-2 w-full rounded-2xl border border-stone-200 px-4 py-3 font-semibold outline-none focus:border-[#FF6B00]" placeholder="Restaurant phone" />

        <label className="mt-4 block text-sm font-bold text-stone-700">Cuisine type</label>
        <input value={cuisineType} onChange={(event) => setCuisineType(event.target.value)} className="mt-2 w-full rounded-2xl border border-stone-200 px-4 py-3 font-semibold outline-none focus:border-[#FF6B00]" placeholder="Indian, Italian, Cafe, etc." />

        <label className="mt-4 block text-sm font-bold text-stone-700">Restaurant image URL</label>
        <input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} className="mt-2 w-full rounded-2xl border border-stone-200 px-4 py-3 font-semibold outline-none focus:border-[#FF6B00]" placeholder="Paste image URL for now" />
        <p className="mt-2 text-xs font-semibold text-stone-500">File upload can be added later with Supabase Storage. URL keeps the MVP fast.</p>

        <label className="mt-4 block text-sm font-bold text-stone-700">Brand color</label>
        <input type="color" value={brandColor} onChange={(event) => setBrandColor(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-stone-200 bg-white p-2" />

        <div className="mt-5 rounded-2xl bg-orange-50 p-4 text-sm font-semibold text-stone-700">
          Menus will be assigned after this restaurant is created from the Menus page.
        </div>

        {error && <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}

        <button onClick={saveRestaurant} disabled={saving} className="mt-6 w-full rounded-3xl bg-green-600 px-6 py-4 text-lg font-black uppercase text-white shadow-xl disabled:bg-stone-400">
          {saving ? 'Saving...' : restaurantId ? 'Update Restaurant' : 'Create Restaurant'}
        </button>
      </section>
    </main>
  );
}
