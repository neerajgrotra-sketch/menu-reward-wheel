'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

type RestaurantPrint = {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  address_line1?: string | null;
  city?: string | null;
  experience_mode?: string | null;
};

type Format =
  | 'table-tent'
  | 'table-sticker'
  | 'counter-poster'
  | 'window-decal'
  | 'takeout-insert'
  | 'social-graphic';

const FORMATS: { id: Format; label: string; size: string; pageSize: string }[] = [
  { id: 'table-tent',     label: 'Table Tent',     size: '3.5" × 5.5"',   pageSize: '3.5in 5.5in'   },
  { id: 'table-sticker',  label: 'Table Sticker',  size: '3.5" × 3.5"',   pageSize: '3.5in 3.5in'   },
  { id: 'counter-poster', label: 'Counter Poster',  size: '5.5" × 8.5"',   pageSize: '5.5in 8.5in'   },
  { id: 'window-decal',   label: 'Window Decal',    size: '4" × 6"',       pageSize: '4in 6in'       },
  { id: 'takeout-insert', label: 'Takeout Insert',  size: '4.25" × 2.75"', pageSize: '4.25in 2.75in' },
  { id: 'social-graphic', label: 'Social Graphic',  size: '5" × 5"',       pageSize: '5in 5in'       },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function qrTagline(mode: string | null | undefined): string {
  if (mode === 'menu_only') return 'Scan To View Menu';
  if (mode === 'menu_and_promotion') return 'Scan Menu & Win Rewards';
  return "Play Today's Game";
}

function qrTaglineShort(mode: string | null | undefined): string {
  if (mode === 'menu_only') return 'View Menu';
  if (mode === 'menu_and_promotion') return 'Scan & Win';
  return 'Play Today';
}

const qrUrl = (value: string, size = 420) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=16&data=${encodeURIComponent(value)}`;

function addr(r: RestaurantPrint) {
  return [r.address_line1, r.city].filter(Boolean).join(', ');
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function SpinBiteMark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center justify-center rounded-full bg-[#FF6B00] text-white ${className}`}>
      &#x1F3AF;
    </span>
  );
}

function RestaurantBrand({ r, imgClass = '', nameClass = '' }: { r: RestaurantPrint; imgClass?: string; nameClass?: string }) {
  if (r.logo_url) {
    return (
      <div className={`flex items-center justify-center overflow-hidden rounded-[0.15in] bg-white/95 px-[0.12in] py-[0.08in] shadow-lg ${imgClass}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={r.logo_url} alt={`${r.name} logo`} className="max-h-[0.5in] max-w-[2.5in] object-contain" />
      </div>
    );
  }
  return <p className={`font-black uppercase tracking-wide text-white ${nameClass}`}>{r.name}</p>;
}

// ─── Format layouts ───────────────────────────────────────────────────────────

function TableTentLayout({ r, playUrl }: { r: RestaurantPrint; playUrl: string }) {
  const tagline = qrTagline(r.experience_mode);
  const location = addr(r);
  return (
    <div className="mx-auto flex h-[5.5in] w-[3.5in] flex-col overflow-hidden rounded-[0.15in] shadow-2xl print:rounded-none print:shadow-none">
      {/* Top: orange gradient */}
      <div className="flex flex-1 flex-col items-center justify-center bg-gradient-to-b from-[#FF6B00] to-[#FF8A00] px-[0.28in] pt-[0.28in] pb-[0.18in] text-center">
        <RestaurantBrand r={r} imgClass="mx-auto" />
        {r.logo_url && (
          <p className="mt-1 text-[0.11in] font-black uppercase tracking-[0.1em] text-white/80">{r.name}</p>
        )}
        {location && <p className="mt-0.5 text-[0.09in] font-semibold text-white/70">{location}</p>}
        <h1 className="mt-3 text-[0.52in] font-black leading-[0.95] text-white drop-shadow-md">{tagline}</h1>
        <p className="mt-2 text-[0.115in] font-bold text-white/90">No app required.</p>
      </div>
      {/* Bottom: white */}
      <div className="flex shrink-0 flex-col items-center justify-center bg-white px-[0.22in] py-[0.2in] text-center">
        <div className="rounded-[0.18in] bg-[#1F1F1F] p-[0.14in] shadow-xl">
          <div className="rounded-[0.12in] bg-white p-[0.07in]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrUrl(playUrl, 280)} alt="Restaurant QR code" className="h-[1.55in] w-[1.55in]" />
          </div>
          <p className="mt-1.5 break-all text-[0.07in] font-bold text-white/60">/r/{r.slug}</p>
        </div>
        <div className="mt-2.5 flex items-center justify-center gap-1.5 text-[0.095in] font-black text-stone-600">
          <SpinBiteMark className="h-[0.17in] w-[0.17in] text-[0.09in]" />
          <span>Powered by SpinBite</span>
        </div>
      </div>
    </div>
  );
}

function TableStickerLayout({ r, playUrl }: { r: RestaurantPrint; playUrl: string }) {
  const tagline = qrTaglineShort(r.experience_mode);
  return (
    <div className="mx-auto flex h-[3.5in] w-[3.5in] flex-col items-center justify-center overflow-hidden rounded-[0.18in] bg-white shadow-2xl print:rounded-none print:shadow-none" style={{ border: '0.06in solid #FF6B00' }}>
      <div className="flex flex-col items-center px-[0.18in] py-[0.15in] text-center">
        <p className="text-[0.09in] font-black uppercase tracking-[0.16em] text-[#FF6B00]">{tagline}</p>
        <div className="mt-1.5 rounded-[0.14in] bg-[#1F1F1F] p-[0.11in]">
          <div className="rounded-[0.1in] bg-white p-[0.06in]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrUrl(playUrl, 240)} alt="QR code" className="h-[1.42in] w-[1.42in]" />
          </div>
        </div>
        <p className="mt-2 text-[0.115in] font-black text-stone-800">{r.name}</p>
        <p className="mt-0.5 text-[0.07in] font-bold text-stone-400">/r/{r.slug}</p>
        <div className="mt-1.5 flex items-center gap-1 text-[0.08in] font-bold text-stone-400">
          <SpinBiteMark className="h-[0.13in] w-[0.13in] text-[0.075in]" />
          <span>SpinBite</span>
        </div>
      </div>
    </div>
  );
}

function CounterPosterLayout({ r, playUrl }: { r: RestaurantPrint; playUrl: string }) {
  const tagline = qrTagline(r.experience_mode);
  const words = tagline.split(' ');
  const firstLine = words.slice(0, -1).join(' ');
  const lastWord = words[words.length - 1];
  const location = addr(r);
  return (
    <div className="mx-auto flex h-[8.5in] w-[5.5in] flex-col overflow-hidden rounded-[0.18in] bg-gradient-to-b from-[#FF6B00] via-[#FF8A00] to-[#FFF8F0] shadow-2xl print:rounded-none print:shadow-none">
      <div className="relative flex flex-1 flex-col px-[0.42in] py-[0.35in] text-center">
        <div className="absolute left-[-0.6in] top-[1in] h-[2in] w-[2in] rounded-full bg-white/20 blur-2xl" />
        <div className="absolute right-[-0.5in] top-[3in] h-[1.8in] w-[1.8in] rounded-full bg-green-300/25 blur-2xl" />
        <div className="relative z-10">
          <RestaurantBrand r={r} imgClass="mx-auto" />
          {r.logo_url && (
            <p className="mt-2 text-[0.13in] font-black uppercase tracking-[0.1em] text-white/85">{r.name}</p>
          )}
          {location && <p className="mt-1 text-[0.11in] font-semibold text-white/75">{location}</p>}
          <h1 className="mt-5 text-[0.78in] font-black leading-[0.9] tracking-tight text-white drop-shadow-md">
            {firstLine}<br /><span className="text-[#FFD166]">{lastWord}</span>
          </h1>
          <p className="mx-auto mt-3 max-w-[4.5in] text-[0.16in] font-bold leading-snug text-white/90">
            No app download required — scan with your phone&apos;s camera.
          </p>
        </div>
        <div className="relative z-10 mx-auto mt-5 rounded-[0.28in] bg-white/95 p-[0.2in] shadow-2xl">
          <div className="rounded-[0.2in] bg-[#1F1F1F] p-[0.16in]">
            <div className="rounded-[0.14in] bg-white p-[0.09in]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrUrl(playUrl, 380)} alt="Restaurant QR code" className="h-[2.35in] w-[2.35in]" />
            </div>
            <p className="mt-2 break-all text-center text-[0.08in] font-bold text-white/65">/r/{r.slug}</p>
          </div>
        </div>
        <div className="relative z-10 mt-auto pt-4 flex items-center justify-center gap-2 text-[0.11in] font-black text-stone-600">
          <SpinBiteMark className="h-[0.2in] w-[0.2in] text-[0.1in]" />
          <span>Powered by SpinBite</span>
        </div>
      </div>
    </div>
  );
}

function WindowDecalLayout({ r, playUrl }: { r: RestaurantPrint; playUrl: string }) {
  const tagline = qrTagline(r.experience_mode);
  return (
    <div className="mx-auto flex h-[6in] w-[4in] flex-col overflow-hidden rounded-[0.18in] bg-white shadow-2xl print:rounded-none print:shadow-none">
      {/* Orange header */}
      <div className="bg-[#FF6B00] px-[0.25in] py-[0.2in] text-center">
        <RestaurantBrand r={r} imgClass="mx-auto" />
        {r.logo_url && (
          <p className="mt-1 text-[0.12in] font-black uppercase tracking-wide text-white/85">{r.name}</p>
        )}
      </div>
      {/* Body */}
      <div className="flex flex-1 flex-col items-center justify-center px-[0.28in] py-[0.22in] text-center">
        <h2 className="text-[0.38in] font-black leading-tight text-[#1F1F1F]">{tagline}</h2>
        <p className="mt-2 text-[0.12in] font-semibold text-stone-500">
          Scan with your camera — no app needed.
        </p>
        <div className="mt-4 rounded-[0.22in] bg-[#1F1F1F] p-[0.17in] shadow-xl">
          <div className="rounded-[0.16in] bg-white p-[0.09in]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrUrl(playUrl, 300)} alt="QR code" className="h-[1.95in] w-[1.95in]" />
          </div>
          <p className="mt-1.5 break-all text-center text-[0.08in] font-bold text-white/60">/r/{r.slug}</p>
        </div>
      </div>
      {/* Footer */}
      <div className="border-t border-stone-100 px-[0.22in] py-[0.16in]">
        <div className="flex items-center justify-center gap-1.5 text-[0.095in] font-black text-stone-500">
          <SpinBiteMark className="h-[0.16in] w-[0.16in] text-[0.085in]" />
          <span>Powered by SpinBite</span>
        </div>
      </div>
    </div>
  );
}

function TakeoutInsertLayout({ r, playUrl }: { r: RestaurantPrint; playUrl: string }) {
  const tagline = qrTagline(r.experience_mode);
  return (
    <div className="mx-auto flex h-[2.75in] w-[4.25in] overflow-hidden rounded-[0.12in] bg-white shadow-2xl print:rounded-none print:shadow-none" style={{ border: '0.04in solid #FF6B00' }}>
      {/* QR side */}
      <div className="flex shrink-0 items-center justify-center bg-[#1F1F1F] px-[0.14in] py-[0.14in]">
        <div>
          <div className="rounded-[0.1in] bg-white p-[0.06in]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrUrl(playUrl, 200)} alt="QR code" className="h-[1.38in] w-[1.38in]" />
          </div>
          <p className="mt-0.5 break-all text-center text-[0.065in] font-bold text-white/50">/r/{r.slug}</p>
        </div>
      </div>
      {/* Text side */}
      <div className="flex flex-1 flex-col justify-center px-[0.18in] py-[0.14in]">
        {r.logo_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={r.logo_url} alt={r.name} className="max-h-[0.42in] max-w-[1.7in] object-contain" />
        ) : (
          <p className="text-[0.15in] font-black text-[#1F1F1F]">{r.name}</p>
        )}
        <h3 className="mt-1.5 text-[0.2in] font-black leading-tight text-[#FF6B00]">{tagline}</h3>
        <p className="mt-1 text-[0.095in] font-semibold leading-snug text-stone-500">
          Scan the QR code with your phone camera.
        </p>
        <div className="mt-1.5 flex items-center gap-1 text-[0.08in] font-black text-stone-400">
          <SpinBiteMark className="h-[0.13in] w-[0.13in] text-[0.07in]" />
          <span>Powered by SpinBite</span>
        </div>
      </div>
    </div>
  );
}

function SocialGraphicLayout({ r, playUrl }: { r: RestaurantPrint; playUrl: string }) {
  const tagline = qrTagline(r.experience_mode);
  const subCopy = r.experience_mode === 'menu_only'
    ? 'Scan to view our full menu — no app needed'
    : 'Scan to play & win a reward — no app needed';
  return (
    <div
      className="relative mx-auto flex h-[5in] w-[5in] flex-col items-center justify-center overflow-hidden rounded-[0.2in] shadow-2xl print:rounded-none print:shadow-none"
      style={{ background: 'linear-gradient(135deg, #FF6B00 0%, #FF8A00 45%, #E63939 100%)' }}
    >
      {/* Decorative blobs */}
      <div style={{ position: 'absolute', top: '-0.4in', right: '-0.3in', width: '2in', height: '2in', borderRadius: '50%', background: 'rgba(255,209,102,0.28)', filter: 'blur(0.4in)' }} />
      <div style={{ position: 'absolute', bottom: '-0.35in', left: '-0.25in', width: '1.6in', height: '1.6in', borderRadius: '50%', background: 'rgba(255,255,255,0.18)', filter: 'blur(0.3in)' }} />

      <div className="relative z-10 flex flex-col items-center px-[0.44in] text-center">
        {r.logo_url ? (
          <div className="flex h-[0.68in] items-center justify-center rounded-[0.15in] bg-white/95 px-[0.18in] py-[0.1in] shadow-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r.logo_url} alt={r.name} className="max-h-[0.52in] max-w-[2.4in] object-contain" />
          </div>
        ) : null}
        <p className="mt-2 text-[0.15in] font-black uppercase tracking-[0.12em] text-white/90">{r.name}</p>

        <h2 className="mt-3 text-[0.62in] font-black leading-[0.92] text-white drop-shadow-lg">{tagline}</h2>

        <div className="mt-4 rounded-[0.22in] bg-white/95 p-[0.14in] shadow-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrUrl(playUrl, 300)} alt="QR code" className="h-[1.8in] w-[1.8in] rounded-[0.1in]" />
        </div>

        <p className="mt-3 text-[0.12in] font-bold text-white/88">{subCopy}</p>

        <div className="mt-3 flex items-center gap-1.5 text-[0.1in] font-black text-white/70">
          <SpinBiteMark className="h-[0.17in] w-[0.17in] text-[0.09in]" />
          <span>SpinBite</span>
        </div>
      </div>
    </div>
  );
}

// ─── Inner (uses useSearchParams) ─────────────────────────────────────────────

function PrintKitContent() {
  const params       = useParams<{ restaurantId: string }>();
  const searchParams = useSearchParams();
  const supabase     = useMemo(() => createClient(), []);

  const format = ((searchParams.get('format') ?? 'table-tent') as Format);
  const currentFmt = FORMATS.find(f => f.id === format) ?? FORMATS[0];

  const [restaurant, setRestaurant] = useState<RestaurantPrint | null>(null);
  const [playUrl,    setPlayUrl]    = useState('');
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');

  useEffect(() => {
    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) { window.location.href = '/auth'; return; }

      const { data, error: err } = await supabase
        .from('restaurants')
        .select('id,name,slug,logo_url,address_line1,city,experience_mode')
        .eq('id', params.restaurantId)
        .eq('owner_id', userData.user.id)
        .is('deleted_at', null)
        .single();

      if (err || !data) { setError('Restaurant not found or access denied.'); setLoading(false); return; }

      setRestaurant(data as RestaurantPrint);
      setPlayUrl(`${window.location.origin}/r/${data.slug}`);
      setLoading(false);
    }
    load();
  }, [params.restaurantId, supabase]);

  if (loading) return <main className="min-h-screen bg-[#FFF8F0] p-6 font-bold text-stone-600">Loading print kit…</main>;
  if (error || !restaurant) return <main className="min-h-screen bg-[#FFF8F0] p-6 font-bold text-red-700">{error || 'Print kit unavailable.'}</main>;

  const printCss = `
    @page { size: ${currentFmt.pageSize}; margin: 0; }
    @media print {
      .no-print { display: none !important; }
      html, body { background: white !important; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    }
  `;

  return (
    <main className="min-h-screen bg-stone-200 px-4 py-6 text-[#1F1F1F] print:bg-white print:p-0">
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: printCss }} />

      {/* Toolbar */}
      <div className="no-print mx-auto mb-5 max-w-4xl space-y-3">
        <div className="flex items-center justify-between gap-3 rounded-3xl bg-white p-4 shadow-xl">
          <div>
            <p className="text-sm font-black uppercase text-[#FF6B00]">Restaurant QR Kit</p>
            <p className="text-xs font-bold text-stone-500">
              Permanent QR — not tied to any single promotion. Update menu or promotions without reprinting.
            </p>
          </div>
          <div className="flex gap-2">
            <a href="/admin/restaurants" className="rounded-full bg-stone-100 px-4 py-3 text-sm font-black text-stone-700">
              Back
            </a>
            <button
              onClick={() => window.print()}
              className="rounded-full bg-green-600 px-5 py-3 text-sm font-black text-white shadow-lg"
            >
              Print / Save PDF
            </button>
          </div>
        </div>

        {/* Format selector */}
        <div className="flex flex-wrap gap-2 rounded-2xl bg-white p-3 shadow">
          {FORMATS.map(f => (
            <a
              key={f.id}
              href={`?format=${f.id}`}
              className={`rounded-xl px-4 py-2 text-sm font-black transition-colors ${
                f.id === format
                  ? 'bg-[#FF6B00] text-white'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              {f.label}
              <span className="ml-1.5 text-xs font-semibold opacity-70">{f.size}</span>
            </a>
          ))}
        </div>
      </div>

      {/* Print layout */}
      <div className="print:m-0 print:flex print:h-screen print:items-center print:justify-center">
        {format === 'table-tent'     && <TableTentLayout     r={restaurant} playUrl={playUrl} />}
        {format === 'table-sticker'  && <TableStickerLayout  r={restaurant} playUrl={playUrl} />}
        {format === 'counter-poster' && <CounterPosterLayout r={restaurant} playUrl={playUrl} />}
        {format === 'window-decal'   && <WindowDecalLayout   r={restaurant} playUrl={playUrl} />}
        {format === 'takeout-insert' && <TakeoutInsertLayout r={restaurant} playUrl={playUrl} />}
        {format === 'social-graphic' && <SocialGraphicLayout r={restaurant} playUrl={playUrl} />}
      </div>
    </main>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RestaurantQrPrintPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#FFF8F0] p-6 font-bold text-stone-600">Loading…</main>}>
      <PrintKitContent />
    </Suspense>
  );
}
