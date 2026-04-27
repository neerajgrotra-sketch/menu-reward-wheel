'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export default function SignupPage() {
  const router = useRouter();

  const [restaurantName, setRestaurantName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [goal, setGoal] = useState('');
  const [brandColor, setBrandColor] = useState('#FF6B00');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function signup() {
    const name = restaurantName.trim();
    if (!name) return setError('Restaurant name required');

    const slug = slugify(name);
    const supabase = createClient();

    setSaving(true);
    setError('');

    const { error: insertError } = await supabase.from('restaurants').insert({
      name,
      slug,
      brand_color: brandColor,
      owner_name: ownerName,
      contact_email: email,
      phone,
      address_line1: address,
      city,
      cuisine_type: cuisine,
      main_goal: goal,
    });

    setSaving(false);

    if (insertError) return setError(insertError.message);

    router.push('/admin?slug=' + slug);
  }

  return (
    <main className="min-h-screen bg-[#FFF8F0] px-4 py-10">
      <div className="mx-auto max-w-xl rounded-[2rem] bg-white p-8 shadow-2xl">
        <h1 className="text-3xl font-black text-[#FF6B00]">🎯 SpinBite</h1>
        <h2 className="mt-2 text-2xl font-black">Create your restaurant</h2>

        <div className="mt-6 space-y-4">
          <input placeholder="Restaurant Name" value={restaurantName} onChange={e=>setRestaurantName(e.target.value)} className="w-full rounded-xl border px-4 py-3" />
          <input placeholder="Owner Name" value={ownerName} onChange={e=>setOwnerName(e.target.value)} className="w-full rounded-xl border px-4 py-3" />
          <input placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full rounded-xl border px-4 py-3" />
          <input placeholder="Phone Number" value={phone} onChange={e=>setPhone(e.target.value)} className="w-full rounded-xl border px-4 py-3" />
          <input placeholder="Address" value={address} onChange={e=>setAddress(e.target.value)} className="w-full rounded-xl border px-4 py-3" />
          <input placeholder="City" value={city} onChange={e=>setCity(e.target.value)} className="w-full rounded-xl border px-4 py-3" />
          <input placeholder="Cuisine Type (Indian, Italian, etc.)" value={cuisine} onChange={e=>setCuisine(e.target.value)} className="w-full rounded-xl border px-4 py-3" />
          <input placeholder="Main Goal (Increase AOV, Clear Inventory, etc.)" value={goal} onChange={e=>setGoal(e.target.value)} className="w-full rounded-xl border px-4 py-3" />

          <label className="font-bold">Brand Color</label>
          <input type="color" value={brandColor} onChange={e=>setBrandColor(e.target.value)} className="h-12 w-full" />
        </div>

        {error && <p className="mt-4 text-red-600 font-bold">{error}</p>}

        <button onClick={signup} disabled={saving} className="mt-6 w-full rounded-2xl bg-[#FF6B00] py-4 text-white font-black">
          {saving ? 'Creating...' : 'Create Restaurant'}
        </button>
      </div>
    </main>
  );
}
