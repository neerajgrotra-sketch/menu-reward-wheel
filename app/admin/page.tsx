'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Restaurant = {
  id: string;
  name: string;
  slug: string;
  brand_color: string | null;
  owner_name?: string;
};

const welcomeMessages = [
  'Ready to make today’s orders more exciting?',
  'Let’s build a promotion that gets guests smiling.',
  'What promotion are we launching today?',
  'Let’s turn menu attention into real sales.',
];

export default function AdminPage() {
  const [slug, setSlug] = useState<string | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [message, setMessage] = useState(welcomeMessages[0]);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    setSlug(searchParams.get('slug'));
    setNow(new Date());
    setMessage(welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)]);
  }, []);

  useEffect(() => {
    async function load() {
      if (!slug) return;
      const supabase = createClient();
      const { data } = await supabase.from('restaurants').select('*').eq('slug', slug).single();
      setRestaurant(data as Restaurant | null);
    }

    load();
  }, [slug]);

  const gameLink = useMemo(() => {
    if (!restaurant || typeof window === 'undefined') return '';
    return `${window.location.origin}/play/${restaurant.slug}`;
  }, [restaurant]);

  async function copyGameLink() {
    if (!gameLink) return;
    await navigator.clipboard.writeText(gameLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  if (!restaurant) return <div className="p-6">Loading...</div>;

  return (
    <main className="min-h-screen bg-[#FFF8F0] px-4 py-10">
      <div className="mx-auto max-w-md rounded-3xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-black text-[#FF6B00]">🎯 SpinBite</h1>
          {now && <p className="text-right text-xs font-bold text-gray-500">{now.toLocaleDateString()}<br />{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>}
        </div>

        <h2 className="mt-4 text-xl font-black">
          Hello {restaurant.owner_name || 'there'} 👋
        </h2>

        <p className="mt-2 text-sm font-semibold text-gray-600">{message}</p>

        <div className="mt-4 rounded-xl bg-orange-50 p-3 text-sm">
          <p className="font-bold text-gray-700">Default customer game link</p>
          <p className="mt-1 text-xs text-gray-500">Use this for quick testing. Published promotions will get their own links.</p>
          <div className="mt-1 break-all font-black text-[#FF6B00]">{gameLink}</div>
          <button onClick={copyGameLink} className="mt-3 w-full rounded-xl bg-[#FF6B00] px-4 py-2 font-black text-white">
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>

        <div className="mt-6 space-y-3">
          <a href={`/admin/restaurant?slug=${restaurant.slug}`} className="block rounded-xl bg-gray-200 p-3 text-center font-bold">
            Restaurants
          </a>

          <a href={`/admin/menu?slug=${restaurant.slug}`} className="block rounded-xl bg-gray-200 p-3 text-center font-bold">
            Menus
          </a>

          <a href={`/admin/promotions?slug=${restaurant.slug}`} className="block rounded-xl bg-gray-200 p-3 text-center font-bold">
            Promotions
          </a>

          <a href={`/play/${restaurant.slug}`} className="block rounded-xl bg-green-600 p-3 text-center font-bold text-white">
            Test Promotion
          </a>
        </div>

        <button onClick={() => (window.location.href = '/')} className="mt-6 w-full rounded-xl bg-red-500 p-3 font-bold text-white">
          Logout
        </button>
      </div>
    </main>
  );
}
