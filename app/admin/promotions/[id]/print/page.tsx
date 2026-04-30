'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Restaurant = { id: string; name: string; slug: string; address_line1?: string | null; city?: string | null; phone?: string | null };
type Promotion = { id: string; name: string; slug: string; status: string; restaurant_id: string; starts_at?: string | null; ends_at?: string | null };

function restaurantAddress(restaurant?: Restaurant | null) {
  return [restaurant?.address_line1, restaurant?.city].filter(Boolean).join(', ') || '';
}

function qrUrl(value: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=420x420&margin=16&data=${encodeURIComponent(value)}`;
}

function formatDate(value?: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function WheelGraphic() {
  return (
    <div className="relative mx-auto flex h-[2.05in] w-[2.05in] items-center justify-center">
      <div className="absolute -left-4 -top-3 text-[0.24in]">✨</div>
      <div className="absolute -right-5 top-2 text-[0.22in]">🎉</div>
      <div className="absolute bottom-0 left-0 text-[0.18in]">⭐</div>
      <div className="absolute bottom-2 right-0 text-[0.18in]">✨</div>
      <div className="absolute -right-1 top-1/2 z-20 -translate-y-1/2 text-[0.32in] text-[#1F1F1F]">◀</div>
      <div
        className="h-[1.85in] w-[1.85in] rounded-full border-[0.08in] border-white shadow-2xl"
        style={{ background: 'conic-gradient(#FF6B00 0deg 60deg,#FFD166 60deg 120deg,#00C853 120deg 180deg,#E63939 180deg 240deg,#FFF0C2 240deg 300deg,#2DD4BF 300deg 360deg)' }}
      />
      <div className="absolute flex h-[0.62in] w-[0.62in] items-center justify-center rounded-full bg-[#1F1F1F] text-[0.12in] font-black text-white shadow-xl">SPIN</div>
    </div>
  );
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

      const promotionResult = await supabase
        .from('promotions')
        .select('id,name,slug,status,restaurant_id,starts_at,ends_at')
        .eq('id', params.id)
        .single();

      if (promotionResult.error || !promotionResult.data) {
        setError('Promotion not found.');
        setLoading(false);
        return;
      }

      const currentPromotion = promotionResult.data as Promotion;
      const restaurantResult = await supabase
        .from('restaurants')
        .select('id,name,slug,address_line1,city,phone')
        .eq('id', currentPromotion.restaurant_id)
        .eq('owner_id', user.id)
        .single();

      if (restaurantResult.error || !restaurantResult.data) {
        setError('Restaurant not found or access denied.');
        setLoading(false);
        return;
      }

      const currentRestaurant = restaurantResult.data as Restaurant;
      setPromotion(currentPromotion);
      setRestaurant(currentRestaurant);
      setPlayUrl(`${window.location.origin}/play/${currentRestaurant.slug}/${currentPromotion.slug}`);
      setLoading(false);
    }

    load();
  }, [params.id, supabase]);

  if (loading) return <main className="min-h-screen bg-[#FFF8F0] p-6 font-bold">Loading print kit...</main>;
  if (error || !promotion || !restaurant) return <main className="min-h-screen bg-[#FFF8F0] p-6 font-bold text-red-700">{error || 'Print kit unavailable.'}</main>;

  const address = restaurantAddress(restaurant);
  const expiry = formatDate(promotion.ends_at);

  return (
    <main className="min-h-screen bg-stone-200 px-4 py-6 text-[#1F1F1F] print:bg-white print:p-0">
      <style jsx global>{`
        @page { size: Letter portrait; margin: 0.2in; }
        @media print {
          .no-print { display: none !important; }
          html, body { width: 8.5in; background: white !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>

      <div className="no-print mx-auto mb-5 flex max-w-[8.5in] items-center justify-between gap-3 rounded-3xl bg-white p-4 shadow-xl">
        <div>
          <p className="text-sm font-black uppercase text-[#FF6B00]">Print Kit Preview</p>
          <p className="text-xs font-bold text-stone-500">Designed to fit on one letter-size page. Use Print / Save as PDF.</p>
        </div>
        <div className="flex gap-2">
          <a href="/admin/promotions?mode=manage" className="rounded-full bg-stone-100 px-4 py-3 text-sm font-black text-stone-700">Back</a>
          <button onClick={() => window.print()} className="rounded-full bg-green-600 px-5 py-3 text-sm font-black text-white shadow-lg">Print / Save PDF</button>
        </div>
      </div>

      <section className="mx-auto flex h-[10.15in] w-full max-w-[7.75in] flex-col overflow-hidden rounded-[0.18in] bg-[#FFF8F0] shadow-2xl print:h-[10.15in] print:w-[7.75in] print:max-w-none print:rounded-none print:shadow-none">
        <div className="relative flex h-full flex-col bg-gradient-to-b from-[#FF6B00] via-[#FF8A00] to-[#FFF8F0] px-[0.42in] py-[0.32in] text-center">
          <div className="absolute left-[-0.7in] top-[1.2in] h-[2.2in] w-[2.2in] rounded-full bg-white/20 blur-2xl" />
          <div className="absolute right-[-0.6in] top-[3.1in] h-[1.8in] w-[1.8in] rounded-full bg-green-300/30 blur-2xl" />

          <div className="relative z-10">
            <p className="text-[0.25in] font-black uppercase tracking-[0.18em] text-white/90">{restaurant.name}</p>
            {address && <p className="mt-1 text-[0.15in] font-bold text-white/85">{address}</p>}
            <h1 className="mt-5 text-[0.72in] font-black leading-[0.88] tracking-tight text-white drop-shadow-md">Scan to<br />Spin & Win</h1>
            <p className="mx-auto mt-3 max-w-[6.3in] text-[0.18in] font-black leading-tight text-white">Unlock a reward before you order. No app download required.</p>
          </div>

          <div className="relative z-10 mt-4 rounded-[0.35in] bg-white/95 p-[0.23in] shadow-2xl">
            <div className="grid grid-cols-[2.3in_1fr] items-center gap-[0.28in]">
              <div className="rounded-[0.28in] bg-orange-50 px-2 py-3">
                <p className="mb-1 text-[0.1in] font-black uppercase tracking-[0.12em] text-[#E63939]">Game Preview</p>
                <WheelGraphic />
                <p className="mt-1 text-[0.12in] font-black text-[#FF6B00]">Confetti, rewards, and instant coupon reveal</p>
              </div>
              <div className="text-left">
                <p className="text-[0.11in] font-black uppercase tracking-[0.16em] text-[#E63939]">Today’s Game</p>
                <h2 className="mt-1 text-[0.3in] font-black leading-tight text-[#1F1F1F]">{promotion.name}</h2>
                <div className="mt-3 rounded-[0.2in] bg-[#FFF8F0] p-4">
                  <p className="text-[0.15in] font-black text-[#FF6B00]">How it works</p>
                  <ol className="mt-1 space-y-1 text-[0.13in] font-bold leading-snug text-stone-700">
                    <li>1. Scan the QR code</li>
                    <li>2. Spin the reward wheel</li>
                    <li>3. Show your coupon to staff</li>
                  </ol>
                </div>
                {expiry && <p className="mt-3 text-[0.115in] font-bold text-stone-500">Promotion ends: {expiry}</p>}
              </div>
            </div>
          </div>

          <div className="relative z-10 mt-4 grid grid-cols-[1fr_2.1in] items-center gap-5 rounded-[0.32in] bg-[#1F1F1F] p-[0.25in] text-white shadow-2xl">
            <div className="text-left">
              <p className="text-[0.34in] font-black leading-tight">Play instantly on your phone</p>
              <p className="mt-2 text-[0.14in] font-bold text-white/70">Point your camera at the QR code and tap the link to play.</p>
            </div>
            <div className="rounded-[0.22in] bg-white p-3 shadow-lg">
              <img src={qrUrl(playUrl)} alt="Promotion QR code" className="h-[1.72in] w-[1.72in]" />
            </div>
          </div>

          <div className="relative z-10 mt-auto flex items-center justify-center gap-2 pt-4 text-[0.12in] font-black text-stone-700">
            <span>Powered by</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-[#FF6B00] shadow-sm"><span>🎯</span><span>SpinBite</span></span>
          </div>
        </div>
      </section>
    </main>
  );
}
