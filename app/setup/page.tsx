'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createDefaultWorkspace, saveWorkspace } from '@/lib/rewards';

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function SetupPage() {
  const router = useRouter();
  const [name, setName] = useState('Demo Restaurant');
  const [brandColor, setBrandColor] = useState('#f97316');

  function createRestaurant() {
    const workspace = createDefaultWorkspace();
    workspace.restaurant.name = name.trim() || 'Demo Restaurant';
    workspace.restaurant.slug = slugify(name) || 'demo-restaurant';
    workspace.restaurant.brandColor = brandColor;
    saveWorkspace(workspace);
    router.push('/dashboard');
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-amber-100 px-4 py-8 text-stone-950">
      <section className="mx-auto max-w-md rounded-3xl bg-white p-6 shadow-xl">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-orange-700">Restaurant Setup</p>
        <h1 className="mt-2 text-3xl font-black">Create your reward wheel</h1>
        <p className="mt-2 text-sm text-stone-600">Set up the restaurant profile that will power your QR reward link.</p>

        <label className="mt-6 block text-sm font-bold text-stone-700">Restaurant name</label>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="mt-2 w-full rounded-2xl border border-stone-200 px-4 py-3 font-semibold outline-none focus:border-orange-500"
          placeholder="Example: Punjabi Kitchen Oakville"
        />

        <label className="mt-4 block text-sm font-bold text-stone-700">Brand color</label>
        <input
          type="color"
          value={brandColor}
          onChange={(event) => setBrandColor(event.target.value)}
          className="mt-2 h-12 w-full rounded-2xl border border-stone-200 bg-white p-2"
        />

        <div className="mt-5 rounded-2xl bg-stone-50 p-4 text-sm text-stone-700">
          Public QR link preview:
          <div className="mt-1 break-all font-black text-stone-950">/play/{slugify(name) || 'demo-restaurant'}</div>
        </div>

        <button onClick={createRestaurant} className="mt-6 w-full rounded-3xl bg-green-600 px-6 py-4 text-lg font-black uppercase text-white shadow-xl">
          Create Dashboard
        </button>
      </section>
    </main>
  );
}
