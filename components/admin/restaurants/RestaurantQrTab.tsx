'use client';

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Restaurant } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

type QrStatus =
  | 'loading'
  | 'ready'
  | 'missing_hero'
  | 'missing_description'
  | 'missing_menu'
  | 'incomplete_setup';

// ─── Constants ────────────────────────────────────────────────────────────────

const PRINT_FORMATS: { id: string; label: string; size: string }[] = [
  { id: 'table-tent',     label: 'Table Tent',     size: '3.5" × 5.5"'   },
  { id: 'table-sticker',  label: 'Table Sticker',  size: '3.5" × 3.5"'   },
  { id: 'counter-poster', label: 'Counter Poster',  size: '5.5" × 8.5"'   },
  { id: 'window-decal',   label: 'Window Decal',    size: '4" × 6"'       },
  { id: 'takeout-insert', label: 'Takeout Insert',  size: '4.25" × 2.75"' },
  { id: 'social-graphic', label: 'Social Graphic',  size: '1080 × 1080 px' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function qrTagline(mode: string | null | undefined): string {
  if (mode === 'menu_only') return 'Scan To View Menu';
  if (mode === 'menu_and_promotion') return 'Scan Menu & Win Rewards';
  return "Play Today's Game";
}

function statusBadge(s: QrStatus): { label: string; color: string } {
  if (s === 'loading')             return { label: 'Checking…',           color: 'bg-stone-100 text-stone-500' };
  if (s === 'ready')               return { label: 'Ready',               color: 'bg-green-100 text-green-700' };
  if (s === 'missing_hero')        return { label: 'Missing Hero Image',   color: 'bg-amber-100 text-amber-700' };
  if (s === 'missing_description') return { label: 'Missing Description',  color: 'bg-amber-100 text-amber-700' };
  if (s === 'missing_menu')        return { label: 'Missing Menu',         color: 'bg-red-100 text-red-700'     };
  return                                  { label: 'Incomplete Setup',     color: 'bg-amber-100 text-amber-700' };
}

function statusHint(s: QrStatus): string | null {
  if (s === 'missing_menu')        return 'Add at least one menu before sharing this QR code.';
  if (s === 'missing_hero')        return 'Upload a hero image in the Profile tab for the best customer experience.';
  if (s === 'missing_description') return 'Add a restaurant description in the Profile tab.';
  if (s === 'incomplete_setup')    return 'Complete your restaurant profile (hero image, description, and menus) before sharing.';
  return null;
}

const qrPreviewUrl = (url: string, size: number) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=16&data=${encodeURIComponent(url)}`;

async function triggerDownload(apiUrl: string, filename: string) {
  const res = await fetch(apiUrl);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  restaurant: Restaurant;
  supabase: SupabaseClient;
}

export function RestaurantQrTab({ restaurant, supabase }: Props) {
  const [status, setStatus]       = useState<QrStatus>('loading');
  const [copied, setCopied]       = useState(false);
  const [dlState, setDlState]     = useState<'png' | 'svg' | null>(null);

  const origin        = typeof window !== 'undefined' ? window.location.origin : '';
  const restaurantUrl = `${origin}/r/${restaurant.slug}`;
  const tagline       = qrTagline(restaurant.experience_mode);
  const badge         = statusBadge(status);
  const hint          = statusHint(status);
  const printBase     = `/admin/restaurants/${restaurant.id}/qr/print`;

  // ── Status check ──────────────────────────────────────────────────────────

  useEffect(() => {
    async function check() {
      const missing: string[] = [];

      if (!restaurant.hero_image_url) missing.push('hero');
      if (!restaurant.description)    missing.push('description');

      const mode = restaurant.experience_mode;
      if (mode === 'menu_only' || mode === 'menu_and_promotion') {
        const { count } = await supabase
          .from('menus')
          .select('id', { count: 'exact', head: true })
          .eq('restaurant_id', restaurant.id);

        if (!count || count === 0) missing.push('menu');
      }

      if (missing.length === 0)                           setStatus('ready');
      else if (missing.length === 1 && missing[0] === 'menu')        setStatus('missing_menu');
      else if (missing.length === 1 && missing[0] === 'hero')        setStatus('missing_hero');
      else if (missing.length === 1 && missing[0] === 'description') setStatus('missing_description');
      else                                                            setStatus('incomplete_setup');
    }
    check();
  }, [restaurant, supabase]);

  // ── Actions ───────────────────────────────────────────────────────────────

  async function copyUrl() {
    await navigator.clipboard.writeText(restaurantUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  async function handleDownload(format: 'png' | 'svg') {
    setDlState(format);
    try {
      const apiUrl = format === 'svg'
        ? `https://api.qrserver.com/v1/create-qr-code/?format=svg&margin=20&data=${encodeURIComponent(restaurantUrl)}`
        : `https://api.qrserver.com/v1/create-qr-code/?size=1000x1000&margin=20&data=${encodeURIComponent(restaurantUrl)}`;
      await triggerDownload(apiUrl, `spinbite-qr-${restaurant.slug}.${format}`);
    } finally {
      setDlState(null);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* QR Center */}
      <div className="rounded-2xl border border-stone-100 bg-stone-50 p-5">
        <div className="flex flex-wrap items-start gap-5">

          {/* URL + status */}
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-stone-400">Restaurant URL</p>
              <div className="mt-1.5 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-xl bg-white px-3 py-2.5 text-sm font-bold text-stone-700 ring-1 ring-stone-200">
                  {restaurantUrl}
                </code>
                <button
                  type="button"
                  onClick={copyUrl}
                  className="shrink-0 rounded-xl bg-white px-3 py-2.5 text-sm font-black text-[#FF6B00] ring-1 ring-stone-200"
                  style={{ transition: 'transform 120ms' }}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-black ${badge.color}`}>
                {badge.label}
              </span>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-stone-500 ring-1 ring-stone-200">
                {tagline}
              </span>
            </div>

            {hint && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                {hint}
              </p>
            )}

            {/* Download row */}
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleDownload('png')}
                disabled={dlState === 'png'}
                className="rounded-xl bg-white px-4 py-2.5 text-sm font-black text-stone-700 ring-1 ring-stone-200 disabled:opacity-60"
                style={{ transition: 'transform 120ms' }}
              >
                {dlState === 'png' ? 'Downloading…' : 'Download PNG'}
              </button>
              <button
                type="button"
                onClick={() => handleDownload('svg')}
                disabled={dlState === 'svg'}
                className="rounded-xl bg-white px-4 py-2.5 text-sm font-black text-stone-700 ring-1 ring-stone-200 disabled:opacity-60"
                style={{ transition: 'transform 120ms' }}
              >
                {dlState === 'svg' ? 'Downloading…' : 'Download SVG'}
              </button>
              <a
                href={printBase}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl bg-[#FF6B00] px-4 py-2.5 text-sm font-black text-white shadow-sm"
                style={{ transition: 'transform 120ms' }}
              >
                Print Kit / PDF
              </a>
            </div>
          </div>

          {/* QR preview */}
          <div className="shrink-0">
            <div className="rounded-2xl bg-[#1F1F1F] p-3 shadow-lg">
              <div className="rounded-xl bg-white p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrPreviewUrl(restaurantUrl, 200)}
                  alt="Restaurant QR code preview"
                  className="h-[120px] w-[120px]"
                />
              </div>
              <p className="mt-2 max-w-[120px] truncate text-center text-[10px] font-bold text-white/60">
                /r/{restaurant.slug}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Restaurant QR Kit */}
      <div>
        <p className="text-xs font-black uppercase tracking-wider text-stone-400">Restaurant QR Kit</p>
        <p className="mt-1 text-sm font-semibold text-stone-500">
          Print-ready formats — opens in a new tab, ready to save as PDF.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PRINT_FORMATS.map(({ id, label, size }) => (
            <a
              key={id}
              href={`${printBase}?format=${id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col rounded-2xl border border-stone-100 bg-white px-4 py-3 shadow-sm transition-all hover:border-[#FF6B00]/30 hover:shadow-md"
              style={{ transition: 'all 120ms' }}
            >
              <span className="text-sm font-black text-stone-800">{label}</span>
              <span className="text-xs font-semibold text-stone-400">{size}</span>
            </a>
          ))}
        </div>
        <p className="mt-3 text-xs font-semibold leading-relaxed text-stone-400">
          This QR code is permanent for this location — not tied to any specific promotion.
          Update your menu or active promotion at any time without reprinting.
        </p>
      </div>

    </div>
  );
}
