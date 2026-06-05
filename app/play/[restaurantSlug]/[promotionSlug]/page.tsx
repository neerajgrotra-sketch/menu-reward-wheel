'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import confetti from 'canvas-confetti';
import BrandedUnavailablePage from '@/components/BrandedUnavailablePage';
import { getGameDefinition } from '@/lib/games/registry';
import { createCouponCode, pickWeightedReward } from '@/lib/rewards';
import { formatCouponTimeRemaining, formatCouponValidUntil } from '@/lib/coupon-expiry';
import type { Reward } from '@/types/reward';

type Restaurant = { id: string; name: string; slug: string; address_line1?: string | null; city?: string | null; logo_url?: string | null };
type Promotion = { id: string; name: string; slug: string; game_type?: string | null; status: string; coupon_expiry_minutes?: number | null; starts_at?: string | null; ends_at?: string | null; max_spins?: number | null };
type WonCoupon = { id: string; redemptionId?: string | null; reward: Reward; code: string; issuedAt: number };
type SessionCoupon = { id: string; code: string; status: string; issuedAt: string; expiresAt: string; rewardLabel: string };

function CouponExpiryBlock({ expiresAtMs, now }: { expiresAtMs: number; now: number }) {
  const ms = expiresAtMs - now;
  if (ms <= 0) return null;
  const timeStr = formatCouponTimeRemaining(ms);
  const validUntil = formatCouponValidUntil(expiresAtMs, ms);
  return (
    <>
      <p className="mt-3 text-sm font-bold text-green-700">⏰ Expires in {timeStr}</p>
      {validUntil && <p className="mt-1 text-xs font-bold text-stone-500">📅 Valid until {validUntil}</p>}
    </>
  );
}

function couponQrUrl(code: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(code)}`;
}

function getCustomerSessionId() {
  const key = 'spinbite_customer_session_id';
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const next = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  window.localStorage.setItem(key, next);
  return next;
}

function getPlaySessionToken(restaurantSlug: string, promotionSlug: string) {
  const key = `spinbite_play_session_${restaurantSlug}_${promotionSlug}`;

  const existing = window.localStorage.getItem(key);

  if (existing) {
    return existing;
  }

  const next = crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

  window.localStorage.setItem(key, next);

  return next;
}

async function issueCoupon(params: {
  promotion_id: string;
  promotion_reward_id: string;
  restaurant_id: string;
  coupon_code: string;
  customer_session_id: string;
  play_session_id: string;
}) {
  const response = await fetch('/api/coupons/issue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || 'Could not issue coupon.');
  return payload?.coupon || null;
}

// ---------------------------------------------------------------------------
// Already-played recovery view
// ---------------------------------------------------------------------------

function AlreadyPlayedView({
  restaurant,
  promotion,
  coupons,
  now,
}: {
  restaurant: Restaurant | null;
  promotion: Promotion | null;
  coupons: SessionCoupon[];
  now: number;
}) {
  if (!restaurant || !promotion) {
    return <BrandedUnavailablePage message="Promotion unavailable." />;
  }

  const address = [restaurant.address_line1, restaurant.city].filter(Boolean).join(', ');

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-amber-100 px-4 py-6 text-stone-950">
      <section className="mx-auto max-w-md pb-12">
        <div className="rounded-3xl bg-white/85 p-5 text-center shadow-xl">
          {restaurant.logo_url ? (
            <img src={restaurant.logo_url} alt={restaurant.name} className="mx-auto mb-3 h-16 w-16 rounded-full object-cover shadow" />
          ) : (
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[#FF6B00] text-2xl font-black text-white shadow">
              {restaurant.name.charAt(0).toUpperCase()}
            </div>
          )}
          <p className="text-sm font-black uppercase tracking-wide text-[#FF6B00]">{restaurant.name}</p>
          {address && <p className="mt-1 text-xs font-black uppercase tracking-wide text-stone-500">{address}</p>}
        </div>

        <div className="mt-5 rounded-3xl bg-white p-5 shadow-xl text-center">
          <p className="text-4xl">🎮</p>
          <h2 className="mt-2 text-2xl font-black text-[#FF6B00]">You already played this promotion.</h2>
          {coupons.length > 0 ? (
            <p className="mt-2 text-sm font-bold text-stone-600">
              Here {coupons.length === 1 ? 'is your reward' : `are your ${coupons.length} rewards`} from this session. Show the code to staff when ordering.
            </p>
          ) : (
            <p className="mt-2 text-sm font-bold text-stone-600">
              You have already participated in this promotion. If you believe this is an error, please ask a staff member for help.
            </p>
          )}
        </div>

        {coupons.map((coupon) => {
          const isRedeemed = coupon.status === 'redeemed';
          const isExpired = now >= new Date(coupon.expiresAt).getTime();

          return (
            <div key={coupon.id} className="mt-5 rounded-3xl bg-white p-5 shadow-xl">
              <p className="text-sm font-black uppercase tracking-wide text-[#FF6B00]">Your Reward</p>
              <p className="mt-1 text-2xl font-black">{coupon.rewardLabel}</p>

              {isRedeemed ? (
                <div className="mt-4 rounded-2xl border-2 border-blue-200 bg-blue-50 p-4 text-center">
                  <p className="text-lg font-black text-blue-700">✅ Coupon already redeemed.</p>
                  <p className="mt-1 text-sm font-bold text-stone-600">This coupon has already been used. Thank you for visiting!</p>
                  <p className="mt-2 text-sm font-bold text-stone-500">Code: {coupon.code}</p>
                </div>
              ) : isExpired ? (
                <div className="mt-4 rounded-2xl border-2 border-red-200 bg-red-50 p-4 text-center">
                  <p className="text-lg font-black text-red-600">⏰ Coupon has expired.</p>
                  <p className="mt-1 text-sm font-bold text-stone-600">This coupon expired. Please ask a staff member if you need assistance.</p>
                  <p className="mt-2 text-sm font-bold text-stone-500">Code: {coupon.code}</p>
                </div>
              ) : (
                <>
                  <div className="mt-4 rounded-2xl border-2 border-dashed border-stone-300 bg-stone-50 p-4">
                    <p className="text-xs font-bold uppercase text-stone-500">Coupon Code</p>
                    <p className="mt-1 break-all text-3xl font-black tracking-wider">{coupon.code}</p>
                  </div>
                  <CouponExpiryBlock expiresAtMs={new Date(coupon.expiresAt).getTime()} now={now} />
                  <div className="mt-4 rounded-3xl bg-stone-50 p-4 text-center">
                    <p className="text-xs font-black uppercase tracking-wide text-stone-500">Scan to Redeem</p>
                    <img
                      src={couponQrUrl(coupon.code)}
                      alt="Coupon QR code"
                      className="mx-auto mt-3 h-44 w-44 rounded-2xl bg-white p-2 shadow"
                    />
                  </div>
                  <p className="mt-3 text-xs text-stone-500">
                    Show this code to staff before ordering. One reward per customer/session. Standard restaurant terms apply.
                  </p>
                </>
              )}
            </div>
          );
        })}
      </section>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Main play page
// ---------------------------------------------------------------------------

export default function PromotionPlayPage() {
  const { restaurantSlug, promotionSlug } = useParams() as { restaurantSlug: string; promotionSlug: string };
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [promotion, setPromotion] = useState<Promotion | null>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [winningReward, setWinningReward] = useState<Reward | null>(null);
  const [rotation, setRotation] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [wonCoupons, setWonCoupons] = useState<WonCoupon[]>([]);
  const [activeCouponId, setActiveCouponId] = useState<string | null>(null);
  const [showReveal, setShowReveal] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [playsUsed, setPlaysUsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [couponIssueError, setCouponIssueError] = useState('');
  const [alreadyPlayed, setAlreadyPlayed] = useState(false);
  const [existingCoupons, setExistingCoupons] = useState<SessionCoupon[]>([]);
  // UUID of the play_sessions row — forwarded to the coupon issue route so it
  // can store the proper play_session_id FK on coupon_redemptions.
  const [playSessionId, setPlaySessionId] = useState<string>('');

  const game = useMemo(() => getGameDefinition(promotion?.game_type), [promotion?.game_type]);
  const PlayComponent = game.PlayComponent;
  const segmentAngle = useMemo(() => (rewards.length ? 360 / rewards.length : 0), [rewards.length]);
  const maxPlays = Math.max(1, promotion?.max_spins || 1);
  const playsRemaining = Math.max(0, maxPlays - playsUsed);
  const canPlay = !playing && rewards.length > 0 && playsRemaining > 0;
  const expiryMinutes = promotion?.coupon_expiry_minutes || 20;
  const activeCoupon = wonCoupons.find((item) => item.id === activeCouponId) || wonCoupons[0] || null;
  const activeExpiresAt = activeCoupon ? activeCoupon.issuedAt + expiryMinutes * 60 * 1000 : null;
  const activeExpired = Boolean(activeExpiresAt && now >= activeExpiresAt);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');

      const sessionToken = getPlaySessionToken(
        restaurantSlug,
        promotionSlug,
      );

      const response = await fetch(`/api/public/promotion-play?restaurantSlug=${encodeURIComponent(restaurantSlug)}&promotionSlug=${encodeURIComponent(promotionSlug)}&sessionToken=${encodeURIComponent(sessionToken)}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setRestaurant(payload?.restaurant || null);
        setPromotion(payload?.promotion || null);
        setError(payload?.error || 'Promotion unavailable.');
        setLoading(false);
        return;
      }

      setRestaurant(payload.restaurant || null);
      setPromotion(payload.promotion || null);
      setPlaySessionId(payload.playSessionId || '');

      if (payload.alreadyPlayed) {
        setAlreadyPlayed(true);
        setExistingCoupons(payload.existingCoupons || []);
        setLoading(false);
        return;
      }

      setRewards(payload.rewards || []);
      setLoading(false);
    }

    load();
  }, [restaurantSlug, promotionSlug]);

  function playGame() {
    if (!canPlay || !promotion || !restaurant) return;
    const selected = pickWeightedReward(rewards);
    setWinningReward(selected);
    const selectedIndex = rewards.findIndex((item) => item.id === selected.id);
    const finalRotation = game.getTargetRotation?.({ currentRotation: rotation, selectedIndex, segmentAngle });

    setCouponIssueError('');
    setPlaying(true);
    setShowReveal(false);
    if (typeof finalRotation === 'number') setRotation(finalRotation);

    setTimeout(async () => {
      const code = createCouponCode();
      const issuedAt = Date.now();
      let redemptionId: string | null = null;

      try {
        const issued = await issueCoupon({
          promotion_id: promotion.id,
          promotion_reward_id: selected.id,
          restaurant_id: restaurant.id,
          coupon_code: code,
          customer_session_id: getCustomerSessionId(),
          play_session_id: playSessionId,
        });
        redemptionId = issued?.id || null;
      } catch (err: any) {
        setCouponIssueError(err?.message || 'Coupon was shown, but audit record could not be saved.');
      }

      const nextCoupon: WonCoupon = { id: `${issuedAt}-${Math.random()}`, redemptionId, reward: selected, code, issuedAt };
      setWonCoupons((current) => [nextCoupon, ...current]);
      setActiveCouponId(nextCoupon.id);
      setPlaysUsed((current) => current + 1);
      setPlaying(false);
      setShowReveal(true);
      confetti(game.confetti);
    }, game.resultDelayMs);
  }

  if (loading) return <div className="min-h-screen bg-[#FFF8F0] p-6 text-lg font-bold">Loading promotion...</div>;
  if (error) return <BrandedUnavailablePage message={error} restaurant={restaurant} />;
  if (alreadyPlayed) return <AlreadyPlayedView restaurant={restaurant} promotion={promotion} coupons={existingCoupons} now={now} />;
  if (!restaurant || !promotion) return <BrandedUnavailablePage message="Promotion unavailable." />;
  if (rewards.length < 2) return <BrandedUnavailablePage message="This promotion needs at least 2 active rewards before customers can play." restaurant={restaurant} />;

  const address = [restaurant.address_line1, restaurant.city].filter(Boolean).join(', ');

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-amber-100 px-4 py-6 text-stone-950">
      <section className="mx-auto max-w-md pb-12">
        <div className="rounded-3xl bg-white/85 p-5 text-center shadow-xl">
          {restaurant.logo_url ? (
            <img src={restaurant.logo_url} alt={restaurant.name} className="mx-auto mb-3 h-16 w-16 rounded-full object-cover shadow" />
          ) : (
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[#FF6B00] text-2xl font-black text-white shadow">
              {restaurant.name.charAt(0).toUpperCase()}
            </div>
          )}
          <p className="text-sm font-black uppercase tracking-wide text-[#FF6B00]">{restaurant.name}</p>
          {address && <p className="mt-1 text-xs font-black uppercase tracking-wide text-stone-500">{address}</p>}
          <h1 className="mt-2 text-3xl font-black">{game.labels.title}</h1>
          <p className="mt-2 text-sm text-stone-600">{game.labels.instruction}</p>
        </div>

        <div className="mt-5 rounded-3xl bg-white/80 p-4 text-center shadow-lg">
          <p className="text-lg font-black text-[#FF6B00]">
            {playsRemaining > 0
              ? `You have ${playsRemaining} ${playsRemaining === 1 ? 'play' : game.labels.playsAvailableSuffix}`
              : game.labels.noPlaysText}
          </p>
          <p className="mt-1 text-sm font-bold text-stone-600">{playsUsed} of {maxPlays} used</p>
        </div>

        <PlayComponent
          rewards={rewards}
          winningReward={winningReward ?? undefined}
          canPlay={canPlay}
          playing={playing}
          playsRemaining={playsRemaining}
          playsUsed={playsUsed}
          maxPlays={maxPlays}
          onPlay={playGame}
          rotation={rotation}
        />

        {couponIssueError && <div className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-black text-red-700">{couponIssueError}</div>}

        {wonCoupons.length > 0 && <section className="mt-6 rounded-3xl bg-white p-5 shadow-xl"><p className="text-sm font-black uppercase tracking-wide text-[#FF6B00]">Your Rewards</p><div className="mt-4 space-y-4">{wonCoupons.map((item, index) => { const expiresAt = item.issuedAt + expiryMinutes * 60 * 1000; const expired = now >= expiresAt; return <button key={item.id} onClick={() => { setActiveCouponId(item.id); setShowReveal(true); }} className="relative w-full rounded-2xl border border-stone-200 bg-stone-50 p-4 text-left shadow-sm">{expired && <span className="absolute right-3 top-3 rotate-[-8deg] rounded-lg border-2 border-red-600 px-2 py-1 text-xs font-black uppercase text-red-600">Expired</span>}<p className="text-xs font-black uppercase tracking-wide text-stone-500">Reward {wonCoupons.length - index}</p><p className="mt-1 pr-20 text-xl font-black">{item.reward.description}</p><p className="mt-2 text-sm font-bold text-stone-500">Code: {item.code}</p>{expired ? <p className="mt-1 text-sm font-black text-red-600">Expired</p> : <CouponExpiryBlock expiresAtMs={expiresAt} now={now} />}</button>; })}</div></section>}
      </section>

      {showReveal && activeCoupon && <div className="fixed inset-0 z-50 flex items-end bg-black/40 px-3 pb-3 backdrop-blur-sm"><section className="mx-auto w-full max-w-md rounded-[2rem] bg-white p-5 text-center shadow-2xl"><div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-stone-200" /><p className="text-sm font-black uppercase tracking-wide text-[#FF6B00]">🎉 You won</p><h2 className="mt-2 text-4xl font-black leading-tight">{activeCoupon.reward.description}</h2><div className="relative mt-5 rounded-2xl border-2 border-dashed border-stone-300 bg-stone-50 p-4">{activeExpired && <div className="absolute right-3 top-3 rotate-[-10deg] rounded-xl border-4 border-red-600 px-3 py-1 text-lg font-black uppercase text-red-600 opacity-90">Expired</div>}<p className="text-xs font-bold uppercase text-stone-500">Coupon Code</p><p className="mt-1 break-all text-3xl font-black tracking-wider">{activeCoupon.code}</p></div>{activeExpired ? <p className="mt-4 text-lg font-black text-red-600">Coupon expired</p> : <CouponExpiryBlock expiresAtMs={activeExpiresAt || 0} now={now} />}<div className="relative mt-4 rounded-3xl bg-stone-50 p-4">{activeExpired && <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rotate-[-12deg] rounded-xl border-4 border-red-600 bg-white/85 px-5 py-2 text-2xl font-black uppercase text-red-600 shadow-lg">Expired</div>}{activeExpired && <div className="absolute inset-4 z-10 rounded-3xl bg-white/65" />}<p className="text-xs font-black uppercase tracking-wide text-stone-500">Scan Coupon</p><img src={couponQrUrl(activeCoupon.code)} alt="Coupon QR code" className={activeExpired ? 'mx-auto mt-3 h-44 w-44 rounded-2xl bg-white p-2 opacity-35 shadow' : 'mx-auto mt-3 h-44 w-44 rounded-2xl bg-white p-2 shadow'} /></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><button onClick={() => setShowReveal(false)} className="rounded-2xl bg-stone-100 px-5 py-4 text-sm font-black text-stone-800">Close</button><button onClick={playGame} disabled={!canPlay} className="rounded-2xl bg-green-600 px-5 py-4 text-sm font-black text-white disabled:bg-stone-300">{playsRemaining > 0 ? game.labels.playAgainText : 'No Plays Left'}</button></div><p className="mt-3 text-xs text-stone-500">{activeCoupon.reward.terms}</p></section></div>}
    </main>
  );
}
