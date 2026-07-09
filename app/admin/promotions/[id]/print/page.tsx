'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Restaurant = { id: string; name: string; slug: string; address_line1?: string | null; city?: string | null; phone?: string | null; logo_url?: string | null };
type Promotion = { id: string; name: string; slug: string; status: string; restaurant_id: string; starts_at?: string | null; ends_at?: string | null; coupon_expiry_minutes?: number | null };

const address = (r?: Restaurant | null) => [r?.address_line1, r?.city].filter(Boolean).join(', ');
const qrUrl = (value: string) => `https://api.qrserver.com/v1/create-qr-code/?size=420x420&margin=16&data=${encodeURIComponent(value)}`;

function SpinBiteMark({ className = '' }: { className?: string }) {
  return <span className={`inline-flex items-center justify-center rounded-full bg-[#FF6B00] text-white shadow-sm ${className}`}>🎯</span>;
}

function RestaurantBrand({ restaurant }: { restaurant: Restaurant }) {
  if (restaurant.logo_url) {
    return <div className="mx-auto flex min-h-[0.78in] max-w-[3in] items-center justify-center rounded-[0.2in] bg-white/95 px-[0.18in] py-[0.1in] shadow-xl">
      <img src={restaurant.logo_url} alt={`${restaurant.name} logo`} className="max-h-[0.62in] max-w-[2.65in] object-contain" />
    </div>;
  }
  return <p className="text-[0.25in] font-black uppercase tracking-[0.18em] text-white/90">{restaurant.name}</p>;
}

function WheelGraphic() {
  return <div className="relative mx-auto flex h-[1.95in] w-[1.95in] items-center justify-center">
    <div className="absolute -left-5 -top-3 rotate-[-15deg] text-[0.24in]">✨</div>
    <div className="absolute -right-5 -top-2 rotate-[18deg] text-[0.22in]">🎉</div>
    <div className="absolute -left-4 bottom-2 rotate-[12deg] text-[0.2in]">⭐</div>
    <div className="absolute -right-3 bottom-0 rotate-[-12deg] text-[0.2in]">🥳</div>
    <div className="absolute left-1 top-1/2 rotate-[20deg] text-[0.16in]">🎊</div>
    <div className="absolute right-3 top-[0.42in] rotate-[-18deg] text-[0.15in]">✦</div>
    <div className="absolute left-[0.22in] top-[0.35in] rotate-[20deg] text-[0.13in] text-[#FF6B00]">✦</div>
    <div className="absolute bottom-[0.34in] right-[0.27in] rotate-[-20deg] text-[0.13in] text-[#E63939]">✦</div>
    <div className="absolute -right-1 top-1/2 z-20 -translate-y-1/2 text-[0.32in] text-[#1F1F1F]">◀</div>
    <div className="absolute h-[2.02in] w-[2.02in] rounded-full bg-[#FFD166]/30 blur-[0.12in]" />
    <div className="relative h-[1.78in] w-[1.78in] rounded-full border-[0.08in] border-white shadow-2xl" style={{ background: 'conic-gradient(#FF6B00 0deg 60deg,#FFD166 60deg 120deg,#00C853 120deg 180deg,#E63939 180deg 240deg,#FFF0C2 240deg 300deg,#2DD4BF 300deg 360deg)' }} />
    <div className="absolute flex h-[0.58in] w-[0.58in] items-center justify-center rounded-full bg-[#1F1F1F] text-[0.11in] font-black text-white shadow-xl">SPIN</div>
  </div>;
}

export default function PromotionPrintKitPage() {
  const params = useParams() as { id: string };
  const supabase = useMemo(() => createClient(), []);
  const [promotion, setPromotion] = useState<Promotion | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [playUrl, setPlayUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) { window.location.href = '/auth'; return; }
      const promotionResult = await supabase.from('promotions').select('id,name,slug,status,restaurant_id,starts_at,ends_at,coupon_expiry_minutes').eq('id', params.id).single();
      if (promotionResult.error || !promotionResult.data) { setError('Promotion not found.'); setLoading(false); return; }
      const currentPromotion = promotionResult.data as Promotion;
      const restaurantResult = await supabase.from('restaurants').select('id,name,slug,address_line1,city,phone,logo_url').eq('id', currentPromotion.restaurant_id).eq('owner_id', user.id).is('deleted_at', null).single();
      if (restaurantResult.error || !restaurantResult.data) { setError('Restaurant not found or access denied.'); setLoading(false); return; }
      const currentRestaurant = restaurantResult.data as Restaurant;
      setPromotion(currentPromotion); setRestaurant(currentRestaurant); setPlayUrl(`${window.location.origin}/r/${currentRestaurant.slug}`); setLoading(false);
    }
    load();
  }, [params.id, supabase]);

  if (loading) return <main className="min-h-screen bg-[#FFF8F0] p-6 font-bold">Loading print kit...</main>;
  if (error || !promotion || !restaurant) return <main className="min-h-screen bg-[#FFF8F0] p-6 font-bold text-red-700">{error || 'Print kit unavailable.'}</main>;

  const restaurantAddress = address(restaurant);
  const couponMinutes = promotion.coupon_expiry_minutes || 20;

  return <main className="min-h-screen bg-stone-200 px-4 py-6 text-[#1F1F1F] print:bg-white print:p-0">
    <style jsx global>{`@page{size:Letter portrait;margin:.2in}@media print{.no-print{display:none!important}html,body{width:8.5in;background:white!important}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}}`}</style>
    <div className="no-print mx-auto mb-5 flex max-w-[8.5in] items-center justify-between gap-3 rounded-3xl bg-white p-4 shadow-xl"><div><p className="text-sm font-black uppercase text-[#FF6B00]">Reusable QR Print Kit</p><p className="text-xs font-bold text-stone-500">This QR is permanent for this restaurant location. It is not tied to one promotion.</p></div><div className="flex gap-2"><a href="/admin/promotions?mode=manage" className="rounded-full bg-stone-100 px-4 py-3 text-sm font-black text-stone-700">Back</a><button onClick={() => window.print()} className="rounded-full bg-green-600 px-5 py-3 text-sm font-black text-white shadow-lg">Print / Save PDF</button></div></div>
    <section className="mx-auto flex h-[10.15in] w-full max-w-[7.75in] flex-col overflow-hidden rounded-[0.18in] bg-[#FFF8F0] shadow-2xl print:h-[10.15in] print:w-[7.75in] print:max-w-none print:rounded-none print:shadow-none">
      <div className="relative flex h-full flex-col bg-gradient-to-b from-[#FF6B00] via-[#FF8A00] to-[#FFF8F0] px-[0.42in] py-[0.32in] text-center">
        <div className="absolute left-[-0.7in] top-[1.2in] h-[2.2in] w-[2.2in] rounded-full bg-white/20 blur-2xl" /><div className="absolute right-[-0.6in] top-[3.1in] h-[1.8in] w-[1.8in] rounded-full bg-green-300/30 blur-2xl" />
        <div className="relative z-10"><RestaurantBrand restaurant={restaurant} />{restaurant.logo_url && <p className="mt-2 text-[0.13in] font-black uppercase tracking-[0.12em] text-white/85">{restaurant.name}</p>}{restaurantAddress && <p className="mt-1 text-[0.15in] font-bold text-white/85">{restaurantAddress}</p>}<h1 className="mt-4 text-[0.72in] font-black leading-[0.88] tracking-tight text-white drop-shadow-md">Scan to<br />Spin & Win</h1><p className="mx-auto mt-3 max-w-[6.3in] text-[0.18in] font-black leading-tight text-white">Unlock today’s surprise reward before you order. No app download required.</p></div>
        <div className="relative z-10 mt-4 rounded-[0.35in] bg-white/95 p-[0.23in] shadow-2xl"><div className="grid grid-cols-[2.2in_1fr_1.95in] items-center gap-[0.2in]">
          <div className="rounded-[0.28in] bg-orange-50 px-2 py-3"><p className="mb-1 text-[0.11in] font-black uppercase tracking-[0.12em] text-[#E63939]">Spin & Win</p><WheelGraphic /><p className="mt-1 text-[0.115in] font-black text-[#FF6B00]">Play for discounts, free items, and surprise rewards.</p></div>
          <div className="text-left"><p className="text-[0.105in] font-black uppercase tracking-[0.14em] text-[#E63939]">Play & Win</p><h2 className="mt-1 text-[0.3in] font-black leading-tight text-[#1F1F1F]">Today’s active reward</h2><p className="mt-2 text-[0.135in] font-bold leading-snug text-stone-600">Scan once, spin the wheel, and reveal the current reward available at this location.</p><p className="mt-2 rounded-[0.12in] bg-orange-50 p-2 text-[0.095in] font-black leading-snug text-[#E63939]">Reusable QR: this code always opens the current SpinBite promotion for this location.</p></div>
          <div className="rounded-[0.24in] bg-[#1F1F1F] p-3 text-center text-white shadow-xl"><p className="mb-2 text-[0.13in] font-black uppercase tracking-[0.1em] text-white">Scan to Play</p><div className="rounded-[0.18in] bg-white p-2"><img src={qrUrl(playUrl)} alt="Permanent restaurant QR code" className="h-[1.45in] w-[1.45in]" /></div><p className="mt-2 break-all text-[0.08in] font-bold leading-tight text-white/75">/r/{restaurant.slug}</p></div>
        </div></div>
        <div className="relative z-10 mt-4 rounded-[0.32in] bg-[#1F1F1F] p-[0.28in] text-left text-white shadow-2xl"><p className="text-[0.24in] font-black leading-tight">How it works</p><div className="mt-3 grid grid-cols-4 gap-3 text-center"><div className="rounded-[0.16in] bg-white/10 p-3"><p className="text-[0.18in] font-black text-[#FFD166]">1</p><p className="mt-1 text-[0.105in] font-black leading-tight">Scan the QR code</p></div><div className="rounded-[0.16in] bg-white/10 p-3"><p className="text-[0.18in] font-black text-[#FFD166]">2</p><p className="mt-1 text-[0.105in] font-black leading-tight">Spin the reward wheel</p></div><div className="rounded-[0.16in] bg-white/10 p-3"><p className="text-[0.18in] font-black text-[#FFD166]">3</p><p className="mt-1 text-[0.105in] font-black leading-tight">Show coupon to staff</p></div><div className="rounded-[0.16in] bg-white/10 p-3"><p className="text-[0.18in] font-black text-[#FFD166]">4</p><p className="mt-1 text-[0.105in] font-black leading-tight">Redeem before coupon expires</p></div></div><p className="mt-3 text-center text-[0.115in] font-bold text-white/70">Each coupon is valid for {couponMinutes} minutes after it is issued.</p><p className="mt-1 text-center text-[0.105in] font-bold text-white/50">Restaurant staff can update the live promotion without reprinting this QR.</p></div>
        <div className="relative z-10 mt-auto flex items-center justify-center gap-2 pt-4 text-[0.12in] font-black text-stone-700"><span>Powered by</span><span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[#FF6B00] shadow-sm"><SpinBiteMark className="h-[0.2in] w-[0.2in] text-[0.12in]" /><span>SpinBite</span></span></div>
      </div>
    </section>
  </main>;
}
