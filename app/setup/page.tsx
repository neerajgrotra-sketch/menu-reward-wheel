'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export default function SetupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [brandColor, setBrandColor] = useState('#FF6B00');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function createRestaurant() {
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;

    if (!user) {
      router.push('/auth');
      return;
    }

    const restaurantName = name.trim();
    if (!restaurantName) {
      setError('Restaurant name is required.');
      return;
    }

    const baseSlug = slugify(restaurantName);
    const slug = `${baseSlug}-${Date.now().toString().slice(-5)}`;

    setSaving(true);
    setError('');

    const { error: insertError } = await supabase.from('restaurants').insert({
      owner_id: user.id,
      name: restaurantName,
      slug,
      brand_color: brandColor,
    });

    setSaving(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    router.push('/admin?slug=' + slug);
  }

  return (
    <main className="min-h-screen bg-[#FFF8F0] px-4 py-10 text-[#1F1F1F]">
      <section className="mx-auto max-w-md rounded-3xl bg-white p-6 shadow-xl">
        <a href="/admin/restaurants" className="text-sm font-black text-[#FF6B00]">← Back to restaurants</a>
        <h1 className="mt-6 text-3xl font-black text-[#FF6B00]">🎯 Add Restaurant</h1>
        <p className="mt-2 text-sm font-semibold text-stone-600">Create a restaurant profile for menus, promotions, and customer QR games.</p>

        <label className="mt-6 block text-sm font-bold text-stone-700">Restaurant name</label>
        <input value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full rounded-2xl border border-stone-200 px-4 py-3 font-semibold outline-none focus:border-[#FF6B00]" placeholder="Example: Punjabi Kitchen Oakville" />

        <label className="mt-4 block text-sm font-bold text-stone-700">Brand color</label>
        <input type="color" value={brandColor} onChange={(event) => setBrandColor(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-stone-200 bg-white p-2" />

        {error && <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}

        <button onClick={createRestaurant} disabled={saving} className="mt-6 w-full rounded-3xl bg-green-600 px-6 py-4 text-lg font-black uppercase text-white shadow-xl disabled:bg-stone-400">
          {saving ? 'Saving...' : 'Create Restaurant'}
        </button>
      </section>
    </main>
  );
}
