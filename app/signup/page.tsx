'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function SignupPage() {
  const router = useRouter();
  const [restaurantName, setRestaurantName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [brandColor, setBrandColor] = useState('#f97316');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function signup() {
    const name = restaurantName.trim();
    if (!name) {
      setError('Restaurant name is required.');
      return;
    }

    const slug = slugify(name);
    const supabase = createClient();
    setSaving(true);
    setError('');

    const { error: insertError } = await supabase.from('restaurants').insert({
      name,
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
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-amber-100 px-4 py-8 text-stone-950">
      <section className="mx-auto max-w-lg rounded-3xl bg-white p-6 shadow-xl">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-orange-700">Restaurant Signup</p>
        <h1 className="mt-2 text-3xl font-black">Create your restaurant reward account</h1>
        <p className="mt-2 text-sm text-stone-600">Set up your restaurant, create menu items, build promotions, and publish a QR reward wheel.</p>

        <label className="mt-6 block text-sm font-bold">Restaurant name</label>
        <input value={restaurantName} onChange={(event) => setRestaurantName(event.target.value)} className="mt-2 w-full rounded-2xl border px-4 py-3 font-semibold" placeholder="Example: Punjabi Kitchen Oakville" />

        <label className="mt-4 block text-sm font-bold">Owner / manager name</label>
        <input value={ownerName} onChange={(event) => setOwnerName(event.target.value)} className="mt-2 w-full rounded-2xl border px-4 py-3 font-semibold" placeholder="Optional for MVP" />

        <label className="mt-4 block text-sm font-bold">Email</label>
        <input value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-2xl border px-4 py-3 font-semibold" placeholder="Optional until auth is enabled" />

        <label className="mt-4 block text-sm font-bold">Brand color</label>
        <input type="color" value={brandColor} onChange={(event) => setBrandColor(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border bg-white p-2" />

        <div className="mt-5 rounded-2xl bg-stone-50 p-4 text-sm">
          QR link preview:
          <div className="mt-1 break-all font-black">/play/{slugify(restaurantName) || 'restaurant-name'}</div>
        </div>

        {error && <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}

        <button onClick={signup} disabled={saving} className="mt-6 w-full rounded-3xl bg-green-600 px-6 py-4 text-lg font-black uppercase text-white shadow-xl disabled:bg-stone-400">
          {saving ? 'Creating...' : 'Create Restaurant Account'}
        </button>
      </section>
    </main>
  );
}
