'use client';

import { useRef, useState } from 'react';
import type { useCart } from '@/hooks/useCart';
import type { PlacedOrder } from './CartSheet';
import { TIP_PERCENT_OPTIONS, type TipPercentOption } from '@/lib/payments/pricing-defaults';

type ChargeBreakdown = {
  subtotal: number;
  tax_amount: number;
  service_fee_amount: number;
  tip_amount: number;
  total: number;
};

type PaymentCheckoutScreenProps = {
  cart: ReturnType<typeof useCart>;
  restaurantId: string;
  restaurantName: string;
  brandColor: string;
  tableLabel?: string | null;
  customerName: string;
  confirmedSessionId?: string | null;
  guestId?: string | null;
  taxRatePercent: number;
  serviceFeePercent: number;
  onBack: () => void;
  onSuccess: (placedOrder: PlacedOrder) => void;
  onSessionEnded?: () => void;
};

// 'success' has no local view — CartSheet owns and renders the success screen,
// unmounting this component in the same render pass once onSuccess fires.
type Screen = 'summary' | 'processing' | 'error';

const PROCESSING_PHRASES = [
  'Processing Payment...',
  'Authorizing Card...',
  'Contacting Bank...',
  'Verifying Security...',
];
const MIN_PROCESSING_MS = 3200;
const PHRASE_INTERVAL_MS = 800;

function generateIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatCardNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 16);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}

function formatExpiry(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

export function PaymentCheckoutScreen({
  cart,
  restaurantId,
  restaurantName,
  brandColor,
  tableLabel,
  customerName,
  confirmedSessionId,
  guestId,
  taxRatePercent,
  serviceFeePercent,
  onBack,
  onSuccess,
  onSessionEnded,
}: PaymentCheckoutScreenProps) {
  const [screen, setScreen] = useState<Screen>('summary');
  const [tipSelection, setTipSelection] = useState<TipPercentOption | 'custom' | null>(null);
  const [customTip, setCustomTip] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [cardHolderName, setCardHolderName] = useState('');
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [errorKind, setErrorKind] = useState<'session' | 'declined' | 'network'>('network');
  const [errorMessage, setErrorMessage] = useState('');
  const idempotencyKeyRef = useRef<string>(generateIdempotencyKey());

  const subtotal = Number(cart.subtotal) || 0;
  const previewTax = Math.round(subtotal * (taxRatePercent / 100) * 100) / 100;
  const previewServiceFee = Math.round(subtotal * (serviceFeePercent / 100) * 100) / 100;
  const previewTip =
    tipSelection === 'custom'
      ? Math.min(Math.max(Number(customTip) || 0, 0), subtotal)
      : tipSelection
        ? Math.round(subtotal * (tipSelection / 100) * 100) / 100
        : 0;
  const previewTotal = Math.round((subtotal + previewTax + previewServiceFee + previewTip) * 100) / 100;

  const cardComplete =
    cardNumber.replace(/\D/g, '').length >= 12 &&
    /^\d{2}\/\d{2}$/.test(expiry) &&
    cvc.length >= 3 &&
    cardHolderName.trim().length > 1;

  async function handlePay() {
    setScreen('processing');
    setPhraseIndex(0);

    const intervalId = setInterval(() => {
      setPhraseIndex((i) => Math.min(i + 1, PROCESSING_PHRASES.length - 1));
    }, PHRASE_INTERVAL_MS);
    const minimumDelay = new Promise((resolve) => setTimeout(resolve, MIN_PROCESSING_MS));

    try {
      const requestBody = {
        restaurant_id: restaurantId,
        items: cart.items.map((i) => ({ menu_item_id: i.menu_item_id, quantity: i.quantity })),
        table_identifier: tableLabel ?? null,
        customer_name: customerName.trim() || null,
        visit_session_id: confirmedSessionId ?? null,
        guest_id: guestId ?? null,
        tip_percent: tipSelection && tipSelection !== 'custom' ? tipSelection : undefined,
        tip_amount: tipSelection === 'custom' ? previewTip : undefined,
        idempotency_key: idempotencyKeyRef.current,
      };

      const [res] = await Promise.all([
        fetch('/api/public/payments/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        }),
        minimumDelay,
      ]);

      clearInterval(intervalId);

      if (res.status === 409) {
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        if (errData.error === 'SESSION_INVALID') {
          setErrorKind('session');
          setErrorMessage('Your table session has ended. Please rescan the QR code to continue ordering.');
          setScreen('error');
          onSessionEnded?.();
          return;
        }
      }

      if (res.status === 402) {
        const errData = (await res.json().catch(() => ({}))) as { message?: string };
        setErrorKind('declined');
        setErrorMessage(errData.message || 'Your payment was declined. Please try again.');
        setScreen('error');
        return;
      }

      const data = await res.json();

      if (!res.ok) {
        setErrorKind('network');
        setErrorMessage(data.error || 'Payment failed. Please try again.');
        setScreen('error');
        return;
      }

      setPhraseIndex(PROCESSING_PHRASES.length); // "Approved." — only after the real response lands
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Card fields exist only in frontend state — clear immediately on success.
      setCardNumber('');
      setExpiry('');
      setCvc('');
      setCardHolderName('');

      const breakdown = data.charge_breakdown as ChargeBreakdown;
      const placedOrder: PlacedOrder = {
        id: data.order.id,
        order_number: data.order.order_number,
        status: data.order.status,
        customer_name: customerName.trim() || null,
        subtotal: breakdown.subtotal,
        created_at: new Date().toISOString(),
        session_orders_count: data.session_orders_count ?? 0,
        session_total_spend: data.session_total_spend ?? 0,
        order_items: cart.items.map((item) => ({
          id: item.menu_item_id,
          name_snapshot: item.name,
          quantity: item.quantity,
          effective_price_snapshot: Number(item.effective_price),
          line_total: Math.round(Number(item.effective_price) * item.quantity * 100) / 100,
          special_instructions: item.special_instructions || null,
        })),
      };

      cart.clearCart();
      // Parent (CartSheet) owns the success view and unmounts this component
      // in the same render pass — no local 'success' screen needed here.
      onSuccess(placedOrder);
    } catch {
      clearInterval(intervalId);
      setErrorKind('network');
      setErrorMessage('Network error. Please try again.');
      setScreen('error');
    }
  }

  const currentPhrase =
    phraseIndex >= PROCESSING_PHRASES.length ? 'Approved.' : PROCESSING_PHRASES[phraseIndex];

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {screen === 'processing' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-stone-200" style={{ borderTopColor: brandColor }} />
          <p className="text-base font-black text-stone-800">{currentPhrase}</p>
        </div>
      )}

      {screen === 'error' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="text-5xl">{errorKind === 'declined' ? '💳' : '⚠️'}</div>
          <p className="text-lg font-black text-stone-800">
            {errorKind === 'session' ? 'Session Ended' : errorKind === 'declined' ? 'Payment Declined' : 'Something Went Wrong'}
          </p>
          <p className="text-sm text-stone-500">{errorMessage}</p>
          {errorKind !== 'session' && (
            <button
              type="button"
              onClick={() => setScreen('summary')}
              className="mt-2 rounded-2xl px-8 py-3 text-sm font-black text-white shadow-md active:opacity-80"
              style={{ backgroundColor: brandColor }}
            >
              Try Again
            </button>
          )}
        </div>
      )}

      {(screen === 'summary') && (
        <>
          <div className="flex-1 overflow-y-auto px-5 py-3">
            {/* Header */}
            <div className="flex items-center gap-2 pb-3">
              <span className="text-lg">🔒</span>
              <div>
                <p className="text-sm font-black text-stone-800">Secure Checkout</p>
                <p className="text-[11px] text-stone-400">Your payment is encrypted and protected.</p>
              </div>
            </div>
            <p className="mb-3 text-xs font-semibold text-stone-500">
              {restaurantName}
              {tableLabel ? ` · ${tableLabel}` : ''}
            </p>

            {/* Order summary */}
            <div className="rounded-2xl bg-stone-50 p-3">
              <ul className="divide-y divide-stone-200">
                {cart.items.map((item) => (
                  <li key={item.menu_item_id} className="flex items-center justify-between py-1.5 text-xs">
                    <span className="text-stone-600">
                      {item.quantity}× {item.name}
                    </span>
                    <span className="font-bold text-stone-800">
                      ${(Number(item.effective_price) * item.quantity).toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 space-y-1 border-t border-stone-200 pt-2 text-xs">
                <div className="flex justify-between text-stone-500">
                  <span>Subtotal</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                {taxRatePercent > 0 && (
                  <div className="flex justify-between text-stone-500">
                    <span>Tax</span>
                    <span>${previewTax.toFixed(2)}</span>
                  </div>
                )}
                {serviceFeePercent > 0 && (
                  <div className="flex justify-between text-stone-500">
                    <span>Service Fee</span>
                    <span>${previewServiceFee.toFixed(2)}</span>
                  </div>
                )}
                {previewTip > 0 && (
                  <div className="flex justify-between text-stone-500">
                    <span>Tip</span>
                    <span>${previewTip.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-1 text-sm font-black text-stone-800">
                  <span>Total</span>
                  <span>${previewTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Tip selector */}
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold text-stone-500">Add a tip</p>
              <div className="grid grid-cols-4 gap-2">
                {TIP_PERCENT_OPTIONS.map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setTipSelection(pct)}
                    className="rounded-xl border py-2 text-xs font-bold"
                    style={
                      tipSelection === pct
                        ? { backgroundColor: brandColor, color: '#fff', borderColor: brandColor }
                        : { borderColor: '#e7e5e4', color: '#57534e' }
                    }
                  >
                    {pct}%
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setTipSelection('custom')}
                  className="rounded-xl border py-2 text-xs font-bold"
                  style={
                    tipSelection === 'custom'
                      ? { backgroundColor: brandColor, color: '#fff', borderColor: brandColor }
                      : { borderColor: '#e7e5e4', color: '#57534e' }
                  }
                >
                  Custom
                </button>
              </div>
              {tipSelection === 'custom' && (
                <input
                  type="text"
                  inputMode="decimal"
                  value={customTip}
                  onChange={(e) => setCustomTip(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="$0.00"
                  className="mt-2 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-1"
                  style={{ '--tw-ring-color': brandColor } as React.CSSProperties}
                />
              )}
            </div>

            {/* Card fields */}
            <div className="mt-4 space-y-3">
              <p className="text-xs font-semibold text-stone-500">Card details</p>
              <input
                type="text"
                inputMode="numeric"
                value={cardNumber}
                onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                placeholder="1234 5678 9012 3456"
                maxLength={19}
                autoComplete="off"
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-800 tracking-wide placeholder:text-stone-400 focus:outline-none focus:ring-1"
                style={{ '--tw-ring-color': brandColor } as React.CSSProperties}
              />
              <div className="flex gap-3">
                <input
                  type="text"
                  inputMode="numeric"
                  value={expiry}
                  onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                  placeholder="MM/YY"
                  maxLength={5}
                  autoComplete="off"
                  className="w-1/2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-1"
                  style={{ '--tw-ring-color': brandColor } as React.CSSProperties}
                />
                <input
                  type="password"
                  inputMode="numeric"
                  value={cvc}
                  onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="CVC"
                  maxLength={4}
                  autoComplete="off"
                  className="w-1/2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-1"
                  style={{ '--tw-ring-color': brandColor } as React.CSSProperties}
                />
              </div>
              <input
                type="text"
                value={cardHolderName}
                onChange={(e) => setCardHolderName(e.target.value)}
                placeholder="Name on card"
                maxLength={80}
                autoComplete="off"
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-1"
                style={{ '--tw-ring-color': brandColor } as React.CSSProperties}
              />
            </div>

            {/* Trust badges */}
            <div className="mt-4 flex items-center justify-center gap-3 text-[10px] font-semibold text-stone-400">
              <span>🔒 Encrypted</span>
              <span>·</span>
              <span>Simulated Secure Checkout</span>
              <span>·</span>
              <span>No card data stored</span>
            </div>

            <button
              type="button"
              onClick={onBack}
              className="mt-4 w-full text-center text-xs font-semibold text-stone-400 active:text-stone-600"
            >
              ← Back to cart
            </button>
          </div>

          {/* Sticky CTA */}
          <div className="border-t border-stone-100 px-5 py-4 safe-area-bottom">
            <button
              type="button"
              onClick={handlePay}
              disabled={!cardComplete}
              className="w-full rounded-2xl py-4 text-base font-black text-white shadow-lg active:opacity-80 disabled:opacity-40"
              style={{ backgroundColor: brandColor }}
            >
              Pay ${previewTotal.toFixed(2)} & Place Order
            </button>
          </div>
        </>
      )}
    </div>
  );
}
