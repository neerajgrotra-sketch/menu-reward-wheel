'use client';

import { useEffect } from 'react';

type Restaurant = {
  name?: string | null;
  address_line1?: string | null;
  city?: string | null;
};

export default function BrandedUnavailablePage({
  message,
  restaurant,
}: {
  message: string;
  restaurant?: Restaurant | null;
}) {
  const lower = message.toLowerCase();
  const isEnded = lower.includes('ended');
  const isNotStarted = lower.includes('not started');
  const title = isEnded ? 'This promotion has ended' : isNotStarted ? 'This promotion starts soon' : 'Promotion unavailable';
  const copy = isEnded
    ? 'Thanks for checking in. This SpinBite reward campaign is no longer active.'
    : isNotStarted
      ? 'This reward campaign is scheduled, but it is not open yet.'
      : message;
  const address = [restaurant?.address_line1, restaurant?.city].filter(Boolean).join(', ');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.location.href = '/';
    }, 9000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 via-[#FFF8F0] to-amber-100 px-4 py-8 text-[#1F1F1F]">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center">
        <div className="rounded-[2rem] bg-gradient-to-br from-[#FF6B00] to-[#E63939] p-6 text-white shadow-2xl shadow-orange-200">
          <div className="flex items-center gap-2 text-3xl font-black">
            <span>🎯</span>
            <span>SpinBite</span>
          </div>
          <p className="mt-3 text-xs font-black uppercase tracking-[0.22em] text-white/75">Powered reward experience</p>
          {restaurant?.name && (
            <div className="mt-5 rounded-3xl bg-white/15 p-4 backdrop-blur">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-white/70">Restaurant</p>
              <p className="mt-1 text-2xl font-black">{restaurant.name}</p>
              {address && <p className="mt-1 text-sm font-bold text-white/80">{address}</p>}
            </div>
          )}
        </div>

        <div className="-mt-6 rounded-[2rem] bg-white p-6 text-center shadow-2xl">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-orange-50 text-4xl">⏳</div>
          <h1 className="mt-5 text-4xl font-black leading-tight">{title}</h1>
          <p className="mt-3 text-base font-bold leading-7 text-stone-600">{copy}</p>
          <p className="mt-3 rounded-2xl bg-orange-50 p-3 text-sm font-black text-[#FF6B00]">Redirecting to the SpinBite home page shortly.</p>
          <a href="/" className="mt-5 block w-full rounded-3xl bg-[#1F1F1F] px-6 py-5 text-lg font-black text-white shadow-xl">Go to Home</a>
        </div>

        <p className="mt-6 text-center text-sm font-black uppercase tracking-[0.18em] text-stone-400">Powered by 🎯 SpinBite</p>
      </section>
    </main>
  );
}
