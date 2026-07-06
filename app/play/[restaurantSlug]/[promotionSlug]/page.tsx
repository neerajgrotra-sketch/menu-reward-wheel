'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import confetti from 'canvas-confetti';
import BrandedUnavailablePage from '@/components/BrandedUnavailablePage';
import SaveRewardPanel, { shouldShowIdentityPanel } from '@/components/CustomerIdentityScreen';
import { getGameDefinition } from '@/lib/games/registry';
import { createCouponCode, pickWeightedReward } from '@/lib/rewards';
import { formatCouponTimeRemaining, formatCouponValidUntil } from '@/lib/coupon-expiry';
import type { Reward } from '@/types/reward';

type Restaurant = { id: string; name: string; slug: string; address_line1?: string | null; city?: string | null; logo_url?: string | null; experience_mode?: string | null };
type Promotion = { id: string; name: string; slug: string; game_type?: string | null; status: string; coupon_expiry_minutes?: number | null; starts_at?: string | null; ends_at?: string | null; max_spins?: number | null };

// promotion_rewards fields needed to offer automatic redemption at checkout.
// Kept separate from Reward's own `rewardType`/`menuItemId` (game-runtime enum
// values like 'PERCENT_OFF_ITEM') to avoid colliding with that shared type.
type RedeemableReward = Reward & {
  couponMenuItemId?: string | null;
  couponRewardType?: 'free' | 'discount' | 'custom' | null;
  couponRewardValue?: number | null;
};

type WonCoupon = { id: string; redemptionId?: string | null; reward: RedeemableReward; code: string; issuedAt: number };
type SessionCoupon = {
  id: string;
  code: string;
  status: string;
  issuedAt: string;
  expiresAt: string;
  rewardLabel: string;
  menuItemId: string | null;
  rewardType: string | null;
  rewardValue: number | null;
};

function isAutoRedeemable(
  coupon: WonCoupon | null,
  expired: boolean,
  orderingEnabled: boolean,
  paymentSimulationEnabled: boolean,
) {
  if (!coupon || expired || !coupon.redemptionId) return false;
  if (!orderingEnabled || !paymentSimulationEnabled) return false;
  if (!coupon.reward.couponMenuItemId) return false;
  return coupon.reward.couponRewardType === 'discount' || coupon.reward.couponRewardType === 'free';
}

function WalletButtons({ code }: { code: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="mt-4 space-y-3">
      {/* Apple Wallet badge */}
      <button
        onClick={() => setMsg(`Apple Wallet integration coming soon. Your coupon code is ${code}.`)}
        className="flex h-[52px] w-full items-center justify-center gap-3 rounded-2xl bg-black px-5 shadow-sm active:opacity-75"
      >
        <svg viewBox="0 0 814 1000" width="18" height="22" fill="white" className="shrink-0" aria-hidden="true">
          <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-57.8-155.5-127.4C46 376.7 0 228.1 0 188.3c0-73.9 41-113.9 98.3-113.9 56.6 0 95.7 37 127.4 37 30.1 0 77.2-39.5 138.4-39.5 21.7 0 108.2 1.9 169.4 76.5zm-164-150.5c28.9-34.8 49.3-83.3 49.3-131.8 0-6.5-.6-13-1.9-18.8-46.5 1.9-101.3 31.2-134.8 73.9-27 30.7-51.6 79.9-51.6 130.5 0 6.9.6 13.6 1.9 19.7 3.8.6 8.4.9 12.3.9 42.1 0 94.3-28.3 124.8-74.4z" />
        </svg>
        <div className="text-left">
          <div className="text-[10px] leading-none tracking-wide text-white/75">Add to</div>
          <div className="mt-0.5 text-[15px] font-semibold leading-none text-white">Apple Wallet</div>
        </div>
      </button>

      {/* Google Wallet badge */}
      <button
        onClick={() => setMsg(`Google Wallet integration coming soon. Your coupon code is ${code}.`)}
        className="flex h-[52px] w-full items-center justify-center gap-3 rounded-2xl bg-white px-5 shadow-sm ring-1 ring-stone-200 active:opacity-75"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" className="shrink-0" aria-hidden="true">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        <span className="text-[14px] font-medium text-stone-800">Add to Google Wallet</span>
      </button>

      {msg && (
        <div className="flex items-start gap-2 rounded-2xl bg-blue-50 p-3 text-sm font-bold text-blue-700">
          <span className="flex-1">{msg}</span>
          <button onClick={() => setMsg(null)} className="shrink-0 font-black">✕</button>
        </div>
      )}
      <p className="text-center text-xs font-bold text-stone-400">Wallet passes coming soon.</p>
    </div>
  );
}

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

// Previously this token never expired, so once a browser played a promotion once,
// every later visit resumed straight to the old result — indefinitely, even after
// the won coupon itself had long expired. Reissue a fresh token after this TTL so
// a returning visit is treated as a new play instead of resuming forever.
const PLAY_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function getPlaySessionToken(restaurantSlug: string, promotionSlug: string) {
  const key = `spinbite_play_session_${restaurantSlug}_${promotionSlug}`;
  const raw = window.localStorage.getItem(key);

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { token: string; createdAt: number };
      if (parsed.token && Date.now() - parsed.createdAt < PLAY_SESSION_TTL_MS) {
        return parsed.token;
      }
    } catch {
      // Pre-TTL clients stored a bare string token; fall through and reissue in the new format.
    }
  }

  const next = crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

  window.localStorage.setItem(key, JSON.stringify({ token: next, createdAt: Date.now() }));

  return next;
}

async function issueCoupon(params: {
  promotion_id: string;
  promotion_reward_id: string;
  restaurant_id: string;
  coupon_code: string;
  customer_session_id: string;
  play_session_id: string;
  visit_session_id: string | null;
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
            <img src={restaurant.logo_url} alt={restaurant.name} className="mx-auto mb-3 max-h-16 max-w-[9rem] rounded-2xl bg-white object-contain p-1 shadow" />
          ) : (
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FF6B00] text-2xl font-black text-white shadow">
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
                  <WalletButtons code={coupon.code} />
                  <p className="mt-3 text-xs text-stone-500">
                    Show this code to staff before ordering. One reward per customer/session. Standard restaurant terms apply.
                  </p>
                </>
              )}
            </div>
          );
        })}

        {restaurant.experience_mode === 'menu_and_promotion' && (
          <a
            href={`/r/${restaurant.slug}`}
            className="mt-5 block rounded-3xl bg-white px-5 py-4 text-center text-sm font-black text-stone-800 shadow-xl"
          >
            ← Return to Menu
          </a>
        )}
      </section>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Main play page
// ---------------------------------------------------------------------------

export default function PromotionPlayPage() {
  const { restaurantSlug, promotionSlug } = useParams() as { restaurantSlug: string; promotionSlug: string };
  const searchParams = useSearchParams();
  const visitSessionId = searchParams.get('vsid');
  const touchpointCode = searchParams.get('tc');
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [promotion, setPromotion] = useState<Promotion | null>(null);
  const [rewards, setRewards] = useState<RedeemableReward[]>([]);
  const [winningReward, setWinningReward] = useState<RedeemableReward | null>(null);
  const [orderingEnabled, setOrderingEnabled] = useState(false);
  const [paymentSimulationEnabled, setPaymentSimulationEnabled] = useState(false);
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
  // Identity screen: true once the customer has interacted (saved or skipped).
  const [identityDone, setIdentityDone] = useState(false);

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

      const playUrl = new URL('/api/public/promotion-play', window.location.origin);
      playUrl.searchParams.set('restaurantSlug', restaurantSlug);
      playUrl.searchParams.set('promotionSlug', promotionSlug);
      playUrl.searchParams.set('sessionToken', sessionToken);
      if (visitSessionId) playUrl.searchParams.set('vsid', visitSessionId);

      const response = await fetch(playUrl.toString(), {
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
      setOrderingEnabled(Boolean(payload.orderingEnabled));
      setPaymentSimulationEnabled(Boolean(payload.paymentSimulationEnabled));

      if (payload.alreadyPlayed) {
        setAlreadyPlayed(true);
        setExistingCoupons(payload.existingCoupons || []);
        setLoading(false);
        return;
      }

      // Seed plays already consumed this session (unplayed = 0, partial = N).
      // Source of truth is coupon issuance from the server, not local state.
      if (typeof payload.playsUsed === 'number' && payload.playsUsed > 0) {
        setPlaysUsed(payload.playsUsed);

        // Restore previously-won coupons into the play view so the customer can
        // see their existing rewards alongside their remaining plays.
        const prior = (payload.existingCoupons || []) as SessionCoupon[];
        if (prior.length > 0) {
          const restored: WonCoupon[] = prior.map((c) => ({
            id: c.id,
            redemptionId: c.id,
            reward: {
              id: c.id,
              label: c.rewardLabel,
              description: c.rewardLabel,
              weight: 1,
              terms: 'Show this code to staff before ordering.',
              couponMenuItemId: c.menuItemId,
              couponRewardType: c.rewardType as RedeemableReward['couponRewardType'],
              couponRewardValue: c.rewardValue,
            },
            code: c.code,
            issuedAt: new Date(c.issuedAt).getTime(),
          }));
          setWonCoupons(restored);
        }
      }

      setRewards(
        (payload.rewards || []).map((r: any) => ({
          ...r,
          couponMenuItemId: r.menu_item_id ?? null,
          couponRewardType: r.reward_type ?? null,
          couponRewardValue: r.reward_value ?? null,
        })),
      );

      // Determine whether the Save Reward panel should appear after the first win.
      // Skipped promotions are tracked by UUID — re-prompts on new promotions.
      if (!shouldShowIdentityPanel(payload.promotion?.id ?? '')) setIdentityDone(true);

      setLoading(false);
    }

    load();
  }, [restaurantSlug, promotionSlug, visitSessionId]);

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
          visit_session_id: visitSessionId,
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
            <img src={restaurant.logo_url} alt={restaurant.name} className="mx-auto mb-3 max-h-16 max-w-[9rem] rounded-2xl bg-white object-contain p-1 shadow" />
          ) : (
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FF6B00] text-2xl font-black text-white shadow">
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

        {wonCoupons.length > 0 && <section className="mt-6 rounded-3xl bg-white p-5 shadow-xl"><p className="text-sm font-black uppercase tracking-wide text-[#FF6B00]">Your Rewards</p><div className="mt-4 space-y-4">{wonCoupons.map((item, index) => { const expiresAt = item.issuedAt + expiryMinutes * 60 * 1000; const expired = now >= expiresAt; return <div key={item.id} className="relative w-full rounded-2xl border border-stone-200 bg-stone-50 p-4 text-left shadow-sm"><div onClick={() => { setActiveCouponId(item.id); setShowReveal(true); }} className="cursor-pointer">{expired && <span className="absolute right-3 top-3 rotate-[-8deg] rounded-lg border-2 border-red-600 px-2 py-1 text-xs font-black uppercase text-red-600">Expired</span>}<p className="text-xs font-black uppercase tracking-wide text-stone-500">Reward {wonCoupons.length - index}</p><p className="mt-1 pr-20 text-xl font-black">{item.reward.description}</p><p className="mt-2 text-sm font-bold text-stone-500">Code: {item.code}</p>{expired ? <p className="mt-1 text-sm font-black text-red-600">Expired</p> : <CouponExpiryBlock expiresAtMs={expiresAt} now={now} />}</div>{!expired && <WalletButtons code={item.code} />}</div>; })}</div></section>}
      </section>

      {showReveal && activeCoupon && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 px-3 pb-3 backdrop-blur-sm">
          <section className="mx-auto flex w-full max-w-md flex-col rounded-[2rem] bg-white text-center shadow-2xl max-h-[90vh]">

            {/* ── Pinned header — always visible ── */}
            <div className="shrink-0 px-5 pt-5 pb-3">
              <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-stone-200" />
              <p className="text-sm font-black uppercase tracking-wide text-[#FF6B00]">🎉 You won</p>
              <h2 className="mt-2 text-4xl font-black leading-tight">{activeCoupon.reward.description}</h2>
              {/* Coupon code pinned so it's always visible regardless of scroll position */}
              <div className="relative mt-3 rounded-2xl border-2 border-dashed border-stone-300 bg-stone-50 p-4 text-left">
                {activeExpired && (
                  <div className="absolute right-3 top-3 rotate-[-10deg] rounded-xl border-4 border-red-600 px-3 py-1 text-lg font-black uppercase text-red-600 opacity-90">
                    Expired
                  </div>
                )}
                <p className="text-xs font-bold uppercase text-stone-500">Coupon Code</p>
                <p className="mt-1 break-all text-3xl font-black tracking-wider">{activeCoupon.code}</p>
              </div>
              {activeExpired
                ? <p className="mt-2 text-lg font-black text-red-600">Coupon expired</p>
                : <CouponExpiryBlock expiresAtMs={activeExpiresAt || 0} now={now} />
              }
            </div>

            {/* ── Scrollable body ── */}
            <div className="overflow-y-auto px-5 pb-5 pt-1">
              {!identityDone ? (
                /* Save Reward panel — shown after first win until saved or dismissed */
                <SaveRewardPanel
                  restaurant={restaurant}
                  playSessionId={playSessionId}
                  promotionId={promotion.id}
                  onDone={() => setIdentityDone(true)}
                />
              ) : (
                /* Normal coupon view — QR, wallet, actions */
                <>
                  <div className="relative mt-4 rounded-3xl bg-stone-50 p-4">
                    {activeExpired && (
                      <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rotate-[-12deg] rounded-xl border-4 border-red-600 bg-white/85 px-5 py-2 text-2xl font-black uppercase text-red-600 shadow-lg">
                        Expired
                      </div>
                    )}
                    {activeExpired && <div className="absolute inset-4 z-10 rounded-3xl bg-white/65" />}
                    <p className="text-xs font-black uppercase tracking-wide text-stone-500">Scan Coupon</p>
                    <img
                      src={couponQrUrl(activeCoupon.code)}
                      alt="Coupon QR code"
                      className={activeExpired ? 'mx-auto mt-3 h-36 w-36 rounded-2xl bg-white p-2 opacity-35 shadow' : 'mx-auto mt-3 h-36 w-36 rounded-2xl bg-white p-2 shadow'}
                    />
                  </div>
                  {!activeExpired && <WalletButtons code={activeCoupon.code} />}
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <button onClick={() => setShowReveal(false)} className="rounded-2xl bg-stone-100 px-5 py-4 text-sm font-black text-stone-800">Close</button>
                    <button onClick={playGame} disabled={!canPlay} className="rounded-2xl bg-green-600 px-5 py-4 text-sm font-black text-white disabled:bg-stone-300">{playsRemaining > 0 ? game.labels.playAgainText : 'No Plays Left'}</button>
                  </div>
                  {restaurant?.experience_mode === 'menu_and_promotion' && (
                    isAutoRedeemable(activeCoupon, activeExpired, orderingEnabled, paymentSimulationEnabled) ? (
                      <a
                        href={(() => {
                          const dest = `/r/${restaurant.slug}${touchpointCode ? `/${touchpointCode}` : ''}`;
                          const qs = new URLSearchParams({
                            redeem_id: activeCoupon!.redemptionId!,
                            redeem_item: activeCoupon!.reward.couponMenuItemId!,
                            redeem_type: activeCoupon!.reward.couponRewardType!,
                            redeem_value: String(activeCoupon!.reward.couponRewardValue ?? ''),
                            redeem_code: activeCoupon!.code,
                            redeem_exp: String(activeExpiresAt),
                          });
                          return `${dest}?${qs}`;
                        })()}
                        className="mt-3 block rounded-2xl bg-green-600 py-4 text-center text-sm font-black text-white active:scale-95"
                        style={{ transition: 'transform 150ms' }}
                      >
                        Redeem Now
                      </a>
                    ) : (
                      <a
                        href={`/r/${restaurant.slug}${touchpointCode ? `/${touchpointCode}` : ''}`}
                        className="mt-3 block rounded-2xl bg-white py-4 text-center text-sm font-black text-stone-700 ring-1 ring-stone-200 active:scale-95"
                        style={{ transition: 'transform 150ms' }}
                      >
                        Browse Menu
                      </a>
                    )
                  )}
                  <p className="mt-3 text-xs text-stone-500">{activeCoupon.reward.terms}</p>
                </>
              )}
            </div>

          </section>
        </div>
      )}
    </main>
  );
}
