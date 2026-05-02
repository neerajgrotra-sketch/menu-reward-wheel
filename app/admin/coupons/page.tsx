'use client';

import { useEffect, useState } from 'react';

type CouponRow = {
  id: string;
  coupon_code: string;
  issued_at: string | null;
  redeemed_at: string | null;
  expires_at: string | null;
  raw_status: string;
  display_status: 'active' | 'expired' | 'redeemed';
  restaurant_name: string;
  restaurant_slug: string;
  restaurant_address: string;
  promotion_name: string;
  promotion_slug: string;
  item_won: string;
  discount_type: string;
};

function fmt(value?: string | null) {
  if (!value) return 'Not available';
  return new Intl.DateTimeFormat('en-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function statusClass(status: string) {
  if (status === 'redeemed') return 'bg-green-50 text-green-700';
  if (status === 'expired') return 'bg-red-50 text-red-700';
  return 'bg-orange-50 text-[#FF6B00]';
}

function statusLabel(status: string) {
  if (status === 'redeemed') return 'Redeemed';
  if (status === 'expired') return 'Expired';
  return 'Active';
}

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadCoupons() {
    setLoading(true);
    setError('');

    const response = await fetch('/api/admin/coupons', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(payload?.error || 'Could not load issued coupons.');
      setLoading(false);
      return;
    }

    setCoupons(payload.coupons || []);
    setLoading(false);
  }

  useEffect(() => {
    loadCoupons();
  }, []);

  return (
    <main className="min-h-screen bg-[#FFF8F0] px-4 py-6 text-[#1F1F1F]">
      <section className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-[#FF6B00]">🎯 SpinBite</h1>
            <p className="mt-1 text-sm font-bold text-stone-500">Coupon activity</p>
          </div>
          <a href="/admin" className="rounded-full bg-white px-4 py-3 text-sm font-black text-[#FF6B00] shadow">Dashboard</a>
        </div>

        <div className="mt-6 rounded-[2rem] bg-gradient-to-br from-[#FF6B00] to-[#E63939] p-6 text-white shadow-2xl shadow-orange-200">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-white/80">Issued coupons</p>
          <h2 className="mt-3 text-4xl font-black leading-tight">Latest 50 coupon issues.</h2>
          <p className="mt-3 text-sm font-semibold text-white/85">Review issued coupons, reward details, expiry state, and redemption status across your restaurant locations.</p>
        </div>

        <div className="mt-5 rounded-3xl bg-white p-4 shadow-xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-[#FF6B00]">Operational ledger</p>
              <p className="mt-1 text-sm font-bold text-stone-500">Showing the most recent 50 issued coupons. Date filters and reporting exports are backlog items.</p>
            </div>
            <button onClick={loadCoupons} className="rounded-full bg-[#1F1F1F] px-4 py-3 text-sm font-black text-white">Refresh</button>
          </div>
        </div>

        {loading && <div className="mt-5 rounded-3xl bg-white p-6 text-lg font-black shadow-xl">Loading coupons...</div>}
        {error && <div className="mt-5 rounded-3xl bg-red-50 p-6 text-sm font-black text-red-700 shadow-xl">{error}</div>}

        {!loading && !error && coupons.length === 0 && (
          <div className="mt-5 rounded-3xl bg-white p-6 shadow-xl">
            <p className="text-2xl font-black">No coupons issued yet</p>
            <p className="mt-2 text-sm font-bold text-stone-500">When customers win rewards, issued coupons will appear here.</p>
          </div>
        )}

        <div className="mt-5 space-y-4">
          {coupons.map((coupon) => (
            <article key={coupon.id} className="rounded-3xl bg-white p-5 shadow-xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-[#FF6B00]">Coupon Code</p>
                  <h3 className="mt-1 break-all text-3xl font-black">{coupon.coupon_code}</h3>
                </div>
                <span className={`rounded-full px-3 py-2 text-xs font-black uppercase ${statusClass(coupon.display_status)}`}>{statusLabel(coupon.display_status)}</span>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl bg-orange-50 p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-[#FF6B00]">Restaurant</p>
                  <p className="mt-1 text-xl font-black">{coupon.restaurant_name}</p>
                  {coupon.restaurant_address && <p className="mt-1 text-sm font-bold text-stone-600">{coupon.restaurant_address}</p>}
                </div>
                <div className="rounded-2xl bg-stone-50 p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-stone-500">Promotion</p>
                  <p className="mt-1 text-xl font-black">{coupon.promotion_name}</p>
                  <p className="mt-1 text-sm font-bold text-stone-600">/{coupon.restaurant_slug}/{coupon.promotion_slug}</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-2xl bg-stone-50 p-4">
                  <p className="text-xs font-black uppercase text-stone-500">Issued</p>
                  <p className="mt-1 text-sm font-black">{fmt(coupon.issued_at)}</p>
                </div>
                <div className="rounded-2xl bg-stone-50 p-4">
                  <p className="text-xs font-black uppercase text-stone-500">Expires</p>
                  <p className="mt-1 text-sm font-black">{fmt(coupon.expires_at)}</p>
                </div>
                <div className="rounded-2xl bg-stone-50 p-4">
                  <p className="text-xs font-black uppercase text-stone-500">Redeemed</p>
                  <p className="mt-1 text-sm font-black">{coupon.redeemed_at ? fmt(coupon.redeemed_at) : 'Not redeemed'}</p>
                </div>
                <div className="rounded-2xl bg-stone-50 p-4">
                  <p className="text-xs font-black uppercase text-stone-500">Raw Status</p>
                  <p className="mt-1 text-sm font-black capitalize">{coupon.raw_status || 'issued'}</p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl bg-green-50 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-green-700">Reward won</p>
                <p className="mt-1 text-xl font-black">{coupon.item_won}</p>
                <p className="mt-1 text-sm font-bold text-green-800">{coupon.discount_type}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
