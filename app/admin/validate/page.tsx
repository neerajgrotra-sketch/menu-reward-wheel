'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { createClient } from '@/lib/supabase/client';
import { UI_LAYERS } from '@/lib/ui-layers';

type ValidationStatus = 'idle' | 'valid' | 'redeemed' | 'expired' | 'wrong_restaurant' | 'not_found' | 'error';

type CouponRecord = {
  id: string;
  promotion_id: string;
  promotion_reward_id: string;
  restaurant_id: string;
  coupon_code: string;
  status: string;
  issued_at: string;
  redeemed_at?: string | null;
  redeemed_confirmation_code?: string | null;
  redemption_confirmation_code?: string | null;
  promotion?: { id: string; name: string; coupon_expiry_minutes?: number | null } | null;
  restaurant?: { id: string; name: string; address_line1?: string | null; city?: string | null } | null;
  promotion_reward?: { id: string; custom_name?: string | null; reward_type?: 'free' | 'discount' | 'custom' | null; reward_value?: number | null; menu_item_id?: string | null } | null;
};

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

function extractCouponCode(value: string) {
  const raw = value.trim();
  try {
    const url = new URL(raw);
    const fromQuery = url.searchParams.get('code') || url.searchParams.get('coupon');
    if (fromQuery) return normalizeCode(fromQuery);
  } catch {
    // QR may contain only the plain coupon code.
  }

  const match = raw.toUpperCase().match(/SPIN-[A-Z0-9-]+/);
  return normalizeCode(match?.[0] || raw);
}

function generateConfirmationCode() {
  return `RDM-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function rewardLabel(record: CouponRecord | null) {
  if (!record?.promotion_reward) return 'Reward';
  const reward = record.promotion_reward;
  const baseName = reward.custom_name || 'Menu reward';
  if (reward.reward_type === 'free') return `FREE ${baseName}`;
  if (reward.reward_type === 'discount') return `${reward.reward_value || 0}% OFF ${baseName}`;
  return baseName;
}

function expiryDate(record: CouponRecord | null) {
  if (!record) return null;
  const minutes = record.promotion?.coupon_expiry_minutes || 20;
  return new Date(new Date(record.issued_at).getTime() + minutes * 60 * 1000);
}

function isExpired(record: CouponRecord | null) {
  const expires = expiryDate(record);
  return Boolean(expires && Date.now() > expires.getTime());
}

export default function ValidateCouponPage() {
  const supabase = useMemo(() => createClient(), []);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const qrScannerRef = useRef<any>(null);

  const [code, setCode] = useState('');
  const [record, setRecord] = useState<CouponRecord | null>(null);
  const [status, setStatus] = useState<ValidationStatus>('idle');
  const [message, setMessage] = useState('Enter or scan a coupon code to validate it.');
  const [loading, setLoading] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [confirmationCode, setConfirmationCode] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerMessage, setScannerMessage] = useState('Tap camera to scan the customer QR code.');

  useEffect(() => {
    return () => stopScanner();
  }, []);

  async function validateCoupon(inputCode?: string) {
    const couponCode = normalizeCode(inputCode || code);
    if (!couponCode) return;

    stopScanner();
    setLoading(true);
    setRecord(null);
    setConfirmationCode('');
    setStatus('idle');
    setMessage('Checking coupon...');

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) {
      window.location.href = '/auth';
      return;
    }

    const couponResult = await supabase
      .from('coupon_redemptions')
      .select(`
        id,
        promotion_id,
        promotion_reward_id,
        restaurant_id,
        coupon_code,
        status,
        issued_at,
        redeemed_at,
        redeemed_confirmation_code,
        redemption_confirmation_code,
        promotion:promotions(id,name,coupon_expiry_minutes),
        restaurant:restaurants(id,name,address_line1,city),
        promotion_reward:promotion_rewards(id,custom_name,reward_type,reward_value,menu_item_id)
      `)
      .eq('coupon_code', couponCode)
      .maybeSingle();

    if (couponResult.error) {
      setStatus('error');
      setMessage(couponResult.error.message);
      setLoading(false);
      return;
    }

    if (!couponResult.data) {
      setStatus('not_found');
      setMessage('Coupon not found. Check the code and try again.');
      setLoading(false);
      return;
    }

    const coupon = couponResult.data as unknown as CouponRecord;
    setRecord(coupon);

    const ownerCheck = await supabase.from('restaurants').select('id').eq('id', coupon.restaurant_id).eq('owner_id', user.id).maybeSingle();

    if (ownerCheck.error || !ownerCheck.data) {
      setStatus('wrong_restaurant');
      setMessage('Wrong restaurant/location. This coupon does not belong to one of your restaurant locations.');
      setLoading(false);
      return;
    }

    if (coupon.status === 'redeemed') {
      setStatus('redeemed');
      setConfirmationCode(coupon.redemption_confirmation_code || coupon.redeemed_confirmation_code || 'Already redeemed');
      setMessage('This coupon was already redeemed. Do not accept it again.');
      setLoading(false);
      return;
    }

    if (isExpired(coupon)) {
      setStatus('expired');
      setMessage(`Expired coupon. It expired at ${formatDate(expiryDate(coupon)?.toISOString())}.`);
      setLoading(false);
      return;
    }

    setStatus('valid');
    setMessage('Valid coupon. Apply the reward in the POS, then tap Redeem Coupon.');
    setLoading(false);
  }

  async function startScanner() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerOpen(true);
      setScannerMessage('Camera is not available in this browser. Enter the code manually.');
      return;
    }

    setScannerOpen(true);
    setScannerMessage('Starting camera...');

    window.setTimeout(async () => {
      try {
        const videoElement = videoRef.current;
        if (!videoElement) {
          setScannerMessage('Scanner could not start. Enter the code manually.');
          return;
        }

        const QrScannerModule = await import('qr-scanner');
        const QrScanner = QrScannerModule.default;

        qrScannerRef.current?.stop?.();
        qrScannerRef.current?.destroy?.();

        qrScannerRef.current = new QrScanner(
          videoElement,
          async (result: any) => {
            const rawValue = typeof result === 'string' ? result : result?.data || '';
            if (!rawValue) return;
            const scannedCode = extractCouponCode(rawValue);
            setCode(scannedCode);
            setScannerMessage(`Found ${scannedCode}. Validating...`);
            await validateCoupon(scannedCode);
          },
          {
            preferredCamera: 'environment',
            highlightScanRegion: true,
            highlightCodeOutline: true,
            returnDetailedScanResult: true,
          }
        );

        await qrScannerRef.current.start();
        setScannerMessage('Point the camera at the coupon QR code.');
      } catch (error) {
        console.error('QR scanner failed', error);
        setScannerMessage('Camera permission was blocked or scanning failed. Enter the code manually.');
      }
    }, 100);
  }

  function stopScanner() {
    if (qrScannerRef.current) {
      try {
        qrScannerRef.current.stop?.();
        qrScannerRef.current.destroy?.();
      } catch {
        // Ignore cleanup errors.
      }
      qrScannerRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setScannerOpen(false);
  }

  async function redeemCoupon() {
    if (!record || status !== 'valid') return;
    setRedeeming(true);
    setMessage('Redeeming coupon...');
    const nextConfirmation = generateConfirmationCode();
    const redeemedAt = new Date().toISOString();

    let updateResult = await supabase
      .from('coupon_redemptions')
      .update({ status: 'redeemed', redeemed_at: redeemedAt })
      .eq('id', record.id)
      .eq('status', 'issued')
      .select('id,status,redeemed_at')
      .maybeSingle();

    if (updateResult.error) {
      updateResult = await supabase
        .from('coupon_redemptions')
        .update({ status: 'redeemed', redeemed_at: redeemedAt })
        .eq('id', record.id)
        .eq('status', 'issued')
        .select('id,status,redeemed_at')
        .maybeSingle();
    }

    if (updateResult.error) {
      setStatus('error');
      setMessage(updateResult.error.message);
      setRedeeming(false);
      return;
    }

    if (!updateResult.data) {
      setStatus('redeemed');
      setMessage('This coupon was already redeemed or is no longer available.');
      setRedeeming(false);
      return;
    }

    setRecord({ ...record, status: 'redeemed', redeemed_at: redeemedAt, redemption_confirmation_code: nextConfirmation });
    setConfirmationCode(nextConfirmation);
    setStatus('redeemed');
    setMessage('Redeemed successfully.');
    setRedeeming(false);
    confetti({ particleCount: 220, spread: 110, origin: { y: 0.58 } });
  }

  const restaurantAddress = [record?.restaurant?.address_line1, record?.restaurant?.city].filter(Boolean).join(', ');

  return (
    <main className="min-h-screen bg-[#FFF8F0] px-4 py-6 text-[#1F1F1F]">
      <section className="mx-auto max-w-3xl space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-[#FF6B00]">Coupon Validator</h1>
            <p className="mt-1 text-sm font-bold text-stone-500">Scan, verify, then redeem at the counter.</p>
          </div>
          <a href="/admin" className="rounded-full bg-white px-5 py-3 text-sm font-black text-[#FF6B00] shadow">Dashboard</a>
        </div>

        <div className="rounded-[2rem] bg-gradient-to-br from-[#FF6B00] to-[#E63939] p-5 text-white shadow-2xl shadow-orange-200">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-white/80">Staff mode</p>
          <h2 className="mt-2 text-4xl font-black leading-tight">Validate before redeeming.</h2>
          <p className="mt-2 text-sm font-semibold text-white/85">Tap Scan QR Code, point the camera at the customer coupon, confirm validity, then redeem only after applying the reward in the POS.</p>
        </div>

        <div className="rounded-[2rem] bg-white p-5 shadow-xl">
          <button onClick={startScanner} className="w-full rounded-3xl bg-gradient-to-r from-[#FF6B00] to-[#E63939] px-6 py-5 text-xl font-black text-white shadow-xl">📷 Scan QR Code</button>
          <div className="my-4 flex items-center gap-3 text-xs font-black uppercase tracking-wide text-stone-400"><div className="h-px flex-1 bg-stone-200" />Or enter manually<div className="h-px flex-1 bg-stone-200" /></div>
          <label className="text-sm font-black uppercase text-[#FF6B00]">Coupon Code</label>
          <input value={code} onChange={(event) => setCode(normalizeCode(event.target.value))} onKeyDown={(event) => { if (event.key === 'Enter') validateCoupon(); }} placeholder="SPIN-ABC123" className="mt-3 w-full rounded-2xl border border-stone-200 px-4 py-4 text-2xl font-black uppercase tracking-wider outline-none focus:border-[#FF6B00]" />
          <button onClick={() => validateCoupon()} disabled={loading || !code.trim()} className="mt-4 w-full rounded-3xl bg-[#1F1F1F] px-6 py-5 text-xl font-black text-white disabled:bg-stone-300">{loading ? 'Checking...' : 'Validate Coupon'}</button>
        </div>

        <div className={`rounded-[2rem] p-5 shadow-xl ${status === 'valid' ? 'bg-green-50' : status === 'redeemed' ? 'bg-blue-50' : status === 'expired' || status === 'wrong_restaurant' || status === 'not_found' || status === 'error' ? 'bg-red-50' : 'bg-white'}`}>
          <p className="text-sm font-black uppercase tracking-wide text-stone-500">Status</p>
          <h3 className="mt-1 text-3xl font-black">
            {status === 'valid' && 'Valid Coupon ✅'}{status === 'redeemed' && 'Already Redeemed ✅'}{status === 'expired' && 'Expired Coupon ❌'}{status === 'wrong_restaurant' && 'Wrong Location ❌'}{status === 'not_found' && 'Not Found ❌'}{status === 'error' && 'Validation Error ❌'}{status === 'idle' && 'Ready to Validate'}
          </h3>
          <p className="mt-2 text-sm font-bold text-stone-700">{message}</p>

          {record && <div className="mt-5 grid gap-3 text-left sm:grid-cols-2">
            <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs font-black uppercase text-stone-400">Reward</p><p className="mt-1 text-xl font-black">{rewardLabel(record)}</p></div>
            <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs font-black uppercase text-stone-400">Coupon</p><p className="mt-1 text-xl font-black">{record.coupon_code}</p></div>
            <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs font-black uppercase text-stone-400">Restaurant</p><p className="mt-1 text-lg font-black">{record.restaurant?.name || '—'}</p><p className="text-xs font-bold text-stone-500">{restaurantAddress}</p></div>
            <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs font-black uppercase text-stone-400">Promotion</p><p className="mt-1 text-lg font-black">{record.promotion?.name || '—'}</p></div>
            <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs font-black uppercase text-stone-400">Issued</p><p className="mt-1 text-sm font-black">{formatDate(record.issued_at)}</p></div>
            <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs font-black uppercase text-stone-400">Expires</p><p className="mt-1 text-sm font-black">{formatDate(expiryDate(record)?.toISOString())}</p></div>
          </div>}

          {status === 'valid' && <button onClick={redeemCoupon} disabled={redeeming} className="mt-5 w-full rounded-3xl bg-green-600 px-6 py-5 text-xl font-black text-white shadow-xl disabled:bg-stone-300">{redeeming ? 'Redeeming...' : 'Redeem Coupon'}</button>}
          {confirmationCode && <div className="mt-5 rounded-3xl bg-white p-5 text-center shadow-sm"><p className="text-xs font-black uppercase tracking-wide text-stone-500">Confirmation Code</p><p className="mt-1 text-4xl font-black text-green-700">{confirmationCode}</p></div>}
        </div>
      </section>

      {scannerOpen && <div style={{ zIndex: UI_LAYERS.bottomSheet }} className="fixed inset-0 flex items-end bg-black/50 px-3 pb-3 backdrop-blur-sm">
        <section className="mx-auto w-full max-w-md rounded-[2rem] bg-white p-5 shadow-2xl">
          <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-stone-200" />
          <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-black uppercase tracking-wide text-[#FF6B00]">Camera Scanner</p><h2 className="mt-1 text-2xl font-black">Scan coupon QR</h2></div><button onClick={stopScanner} className="rounded-full bg-stone-100 px-4 py-2 text-sm font-black text-stone-800">Close</button></div>
          <div className="relative mt-4 overflow-hidden rounded-3xl bg-stone-950"><video ref={videoRef} className="h-72 w-full object-cover" muted playsInline /><div className="pointer-events-none absolute inset-8 rounded-3xl border-4 border-white/80 shadow-[0_0_0_999px_rgba(0,0,0,.28)]" /></div>
          <p className="mt-4 rounded-2xl bg-orange-50 p-3 text-center text-sm font-black text-[#FF6B00]">{scannerMessage}</p>
          <p className="mt-2 text-center text-xs font-bold text-stone-500">On iPhone, allow camera access when prompted and hold the QR code steady inside the box.</p>
        </section>
      </div>}
    </main>
  );
}
