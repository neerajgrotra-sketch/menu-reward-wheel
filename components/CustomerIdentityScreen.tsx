'use client';

import { useState } from 'react';

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

type Restaurant = {
  id: string;
  name: string;
  slug: string;
  address_line1?: string | null;
  city?: string | null;
  logo_url?: string | null;
};

interface SaveRewardPanelProps {
  restaurant: Restaurant;
  playSessionId: string;
  promotionId: string;
  onDone: () => void;
}

// -----------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------

const COUNTRY_CODES = [
  { code: '+1',   label: '+1  Canada / US' },
  { code: '+44',  label: '+44  United Kingdom' },
  { code: '+91',  label: '+91  India' },
  { code: '+52',  label: '+52  Mexico' },
  { code: '+57',  label: '+57  Colombia' },
  { code: '+971', label: '+971  UAE' },
  { code: '+61',  label: '+61  Australia' },
  { code: '+33',  label: '+33  France' },
  { code: '+49',  label: '+49  Germany' },
];

const BENEFITS = [
  'Recover coupons if lost',
  'Save rewards across visits',
  'Receive exclusive restaurant offers',
  'Access future SpinBite promotions',
];

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function SpinBiteLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill="#FF6B00" />
      <path d="M10 22 L16 10 L22 22 Z" fill="white" />
      <circle cx="16" cy="20" r="2.5" fill="white" />
    </svg>
  );
}

function sanitizePhoneInput(value: string) {
  return value.replace(/[^\d\s()\-+]/g, '');
}

// -----------------------------------------------------------------------
// SaveRewardPanel — embedded in the coupon reveal modal after a win
// -----------------------------------------------------------------------

export default function SaveRewardPanel({
  restaurant,
  playSessionId,
  promotionId,
  onDone,
}: SaveRewardPanelProps) {
  const [countryCode, setCountryCode] = useState('+1');
  const [phoneRaw, setPhoneRaw] = useState('');
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const address = [restaurant.address_line1, restaurant.city].filter(Boolean).join(', ');

  async function handleSave() {
    setError(null);
    const trimmedPhone = phoneRaw.trim();

    if (!trimmedPhone) {
      // No phone entered — treat the same as Maybe Later.
      dismissPromotion(promotionId);
      onDone();
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/public/customer-identity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          play_session_id: playSessionId,
          phone_country_code: countryCode,
          phone_number_raw: trimmedPhone,
          marketing_consent: consent,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data?.error || 'Please enter a valid phone number or tap Maybe Later.');
        setSubmitting(false);
        return;
      }

      persistIdentity(data.customer_profile_id ?? null);
      onDone();
    } catch {
      setError('Something went wrong. Please try again or tap Maybe Later.');
      setSubmitting(false);
    }
  }

  function handleMaybeLater() {
    dismissPromotion(promotionId);
    onDone();
  }

  return (
    <div className="pt-1 text-left">

      {/* Restaurant branding — compact strip */}
      <div className="flex items-center gap-3 rounded-2xl bg-stone-50 px-3 py-2.5">
        {restaurant.logo_url ? (
          <img
            src={restaurant.logo_url}
            alt={restaurant.name}
            className="h-9 w-9 shrink-0 rounded-xl bg-white object-contain p-0.5 shadow-sm"
          />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FF6B00] text-sm font-black text-white">
            {restaurant.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <p className="text-sm font-black text-[#FF6B00]">{restaurant.name}</p>
          {address && <p className="text-xs font-bold text-stone-500">{address}</p>}
        </div>
      </div>

      {/* Headline */}
      <p className="mt-4 text-xl font-black text-stone-900">Save Your Reward</p>
      <p className="mt-1 text-sm font-bold leading-relaxed text-stone-600">
        Add your phone number to recover your rewards, receive exclusive offers,
        and access future promotions.
      </p>

      {/* Benefits */}
      <ul className="mt-3 space-y-1.5">
        {BENEFITS.map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm font-bold text-stone-700">
            <span className="mt-0.5 shrink-0 text-[#FF6B00]">✓</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>

      {/* Phone input */}
      <div className="mt-4">
        <label className="block text-sm font-black text-stone-800">
          Phone Number <span className="font-bold text-stone-400">(optional)</span>
        </label>
        <div className="mt-2 flex gap-2">
          <select
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value)}
            className="w-36 shrink-0 rounded-2xl border border-stone-200 bg-stone-50 px-3 py-3 text-sm font-bold text-stone-800 focus:border-[#FF6B00] focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/30"
            aria-label="Country code"
          >
            {COUNTRY_CODES.map(({ code, label }) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </select>
          <input
            type="tel"
            inputMode="tel"
            placeholder="Phone number"
            value={phoneRaw}
            onChange={(e) => {
              setError(null);
              setPhoneRaw(sanitizePhoneInput(e.target.value));
            }}
            className="min-w-0 flex-1 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm font-bold text-stone-800 placeholder:font-normal placeholder:text-stone-400 focus:border-[#FF6B00] focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/30"
            aria-label="Phone number"
            autoComplete="tel-national"
          />
        </div>
        {error && (
          <p role="alert" className="mt-2 text-sm font-bold text-red-600">{error}</p>
        )}
      </div>

      {/* Consent */}
      <label className="mt-4 flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-stone-300 accent-[#FF6B00]"
          aria-label="Opt in to SMS marketing"
        />
        <span className="text-sm font-bold leading-relaxed text-stone-700">
          I would like to receive promotional offers, new game launches, special rewards,
          and restaurant updates via SMS.
        </span>
      </label>

      {/* Legal */}
      <div className="mt-4 rounded-2xl bg-stone-50 px-4 py-3 text-[11px] leading-relaxed text-stone-500">
        <p>
          You can opt out of promotional messages at any time. We do not sell your personal
          information. We take reasonable measures to protect your information. Consent is not
          a condition of purchase. Message and data rates may apply. No purchase necessary.
          Void where prohibited.
        </p>
        <p className="mt-1.5">
          <a href="/terms" className="underline hover:text-stone-700">Terms of Service</a>
          {' · '}
          <a href="/privacy" className="underline hover:text-stone-700">Privacy Policy</a>
        </p>
      </div>

      {/* CTAs */}
      <div className="mt-4 space-y-3">
        <button
          onClick={handleSave}
          disabled={submitting}
          className="w-full rounded-2xl bg-[#FF6B00] px-5 py-4 text-base font-black text-white shadow-md active:opacity-80 disabled:opacity-60"
        >
          {submitting ? 'Saving…' : 'Save & Continue'}
        </button>
        <button
          onClick={handleMaybeLater}
          disabled={submitting}
          className="w-full rounded-2xl bg-white px-5 py-4 text-base font-black text-stone-600 shadow active:opacity-75 disabled:opacity-60"
        >
          Maybe Later
        </button>
      </div>

      {/* SpinBite footer */}
      <div className="mt-6 mb-1 flex items-center justify-center gap-1.5 text-xs font-bold text-stone-400">
        <SpinBiteLogo />
        <span>Powered by SpinBite</span>
      </div>

    </div>
  );
}

// -----------------------------------------------------------------------
// localStorage identity model
// -----------------------------------------------------------------------

const IDENTITY_KEY = 'spinbite_identity_v1';

type StoredIdentity = {
  profileId: string | null;
  timestamp: number;
  dismissedPromotions: string[]; // array of promotion UUIDs
};

export function getStoredIdentity(): StoredIdentity | null {
  try {
    const raw = window.localStorage.getItem(IDENTITY_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredIdentity;
  } catch {
    return null;
  }
}

/**
 * Returns true if the identity panel should be shown for this promotion.
 *
 * Rules:
 *   - No stored identity → show (first-time visitor)
 *   - profileId is set → never show (customer already saved their phone)
 *   - promotionId is in dismissedPromotions → hide (already dismissed for this promo)
 *   - promotionId NOT in dismissedPromotions → show (new promotion, re-prompt)
 *
 * Backwards-compatible: old records with `skipped: true` but no
 * dismissedPromotions array will re-prompt (correct — they were using the
 * old permanent-skip model and deserve a fresh chance on new promotions).
 */
export function shouldShowIdentityPanel(promotionId: string): boolean {
  if (!promotionId) return false;
  const stored = getStoredIdentity();
  if (!stored) return true;
  if (stored.profileId) return false;
  const dismissed = stored.dismissedPromotions ?? [];
  return !dismissed.includes(promotionId);
}

/** Persist a saved customer profile — stops all future prompts in this browser. */
export function persistIdentity(profileId: string | null) {
  try {
    const existing = getStoredIdentity();
    const value: StoredIdentity = {
      profileId,
      timestamp: Date.now(),
      dismissedPromotions: existing?.dismissedPromotions ?? [],
    };
    window.localStorage.setItem(IDENTITY_KEY, JSON.stringify(value));
  } catch {
    // localStorage unavailable — continue silently
  }
}

/** Add a promotion UUID to the dismissed list — re-prompts on the next new promotion. */
export function dismissPromotion(promotionId: string) {
  try {
    const existing = getStoredIdentity();
    const dismissed = existing?.dismissedPromotions ?? [];
    if (!dismissed.includes(promotionId)) dismissed.push(promotionId);
    const value: StoredIdentity = {
      profileId: existing?.profileId ?? null,
      timestamp: Date.now(),
      dismissedPromotions: dismissed,
    };
    window.localStorage.setItem(IDENTITY_KEY, JSON.stringify(value));
  } catch {
    // localStorage unavailable — continue silently
  }
}
