'use client';

import { useEffect, useRef, useState } from 'react';
import type { useCart } from '@/hooks/useCart';
import { PaymentCheckoutScreen } from './PaymentCheckoutScreen';

export type PlacedOrder = {
  id: string;
  order_number: number;
  status: string;
  customer_name: string | null;
  subtotal: number;
  created_at: string;
  session_orders_count: number;
  session_total_spend: number;
  // Only set for the payment-simulation flow (PaymentCheckoutScreen) — null
  // for the direct-order flow, which has no payments row to reference.
  payment_confirmation_number?: string | null;
  order_items: Array<{
    id: string;
    name_snapshot: string;
    quantity: number;
    effective_price_snapshot: number;
    line_total: number;
    special_instructions: string | null;
  }>;
};

type CartSheetProps = {
  open: boolean;
  cart: ReturnType<typeof useCart>;
  restaurantId: string;
  brandColor: string;
  onClose: () => void;
  confirmedSessionId?: string | null;
  guestId?: string | null;
  guestName?: string | null;
  tableLabel?: string | null;
  onOrderPlaced?: (placedOrder: PlacedOrder) => void;
  onSessionEnded?: () => void;
  sessionConnecting?: boolean;
  onItemRemovedFromCart?: (itemId: string, itemName: string, quantityRemoved: number, previousQuantity: number, cartSubtotalBefore: number, cartSubtotalAfter: number) => void;
  // Payment simulation — opt-in per restaurant (restaurant_capabilities.payment_simulation).
  // When false (every restaurant not explicitly enabled), CartSheet behaves exactly as
  // it does today: no payment step, direct order submission via handlePlaceOrder().
  paymentSimulationEnabled?: boolean;
  restaurantName?: string;
  taxRatePercent?: number;
  serviceFeePercent?: number;
};

type OrderState = 'idle' | 'submitting' | 'success' | 'error';
type Screen = 'cart' | 'checkout';

function generateIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function CartSheet({ open, cart, restaurantId, brandColor, onClose, confirmedSessionId, guestId = null, guestName = null, tableLabel, onOrderPlaced, onSessionEnded, sessionConnecting = false, onItemRemovedFromCart, paymentSimulationEnabled = false, restaurantName = '', taxRatePercent = 0, serviceFeePercent = 0 }: CartSheetProps) {
  const [customerName, setCustomerName] = useState(guestName ?? '');
  const [screen, setScreen] = useState<Screen>('cart');

  // The guest already gave their name once (GuestNameModal, on session join) — never
  // ask again. This only back-fills while the field is still untouched/empty, so it
  // covers guestName arriving after this component's first mount (e.g. the cart is
  // opened before the identity modal resolves) without clobbering anything the guest
  // deliberately typed or cleared.
  useEffect(() => {
    if (guestName && !customerName) setCustomerName(guestName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guestName]);
  const [tableIdentifier, setTableIdentifier] = useState('');
  const [orderState, setOrderState] = useState<OrderState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [confirmedOrderNumber, setConfirmedOrderNumber] = useState<number | null>(null);
  const [confirmedOrderId, setConfirmedOrderId] = useState<string | null>(null);
  const [confirmedPaymentConfirmation, setConfirmedPaymentConfirmation] = useState<string | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const idempotencyKeyRef = useRef<string>(generateIdempotencyKey());

  // iOS-safe scroll lock
  useEffect(() => {
    if (!open) return;
    const scrollY = window.scrollY;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  // Reset idempotency key and checkout screen each time the sheet opens fresh (not after success)
  useEffect(() => {
    if (open && orderState === 'idle') {
      idempotencyKeyRef.current = generateIdempotencyKey();
      setScreen('cart');
    }
  }, [open, orderState]);

  async function handlePlaceOrder() {
    if (cart.items.length === 0) return;
    setOrderState('submitting');
    setErrorMessage('');

    try {
      const resolvedTableIdentifier = confirmedSessionId
        ? (tableLabel ?? null)
        : (tableIdentifier.trim() || null);

      const res = await fetch('/api/public/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          items: cart.items.map((i) => ({
            menu_item_id: i.menu_item_id,
            quantity: i.quantity,
          })),
          customer_name: customerName.trim() || null,
          table_identifier: resolvedTableIdentifier,
          visit_session_id: confirmedSessionId ?? null,
          guest_id: guestId ?? null,
          idempotency_key: idempotencyKeyRef.current,
        }),
      });

      // Rule 4: 409 SESSION_INVALID means the session ended between confirmation and order placement
      if (res.status === 409) {
        const errData = await res.json().catch(() => ({})) as { error?: string };
        if (errData.error === 'SESSION_INVALID') {
          setOrderState('error');
          setErrorMessage('Your table session has ended. Please rescan the QR code to continue ordering.');
          onSessionEnded?.();
          return;
        }
      }

      const data = await res.json();

      if (!res.ok) {
        setOrderState('error');
        setErrorMessage(data.error || 'Order failed. Please try again.');
        return;
      }

      console.log('[STEP_1_ORDER_SUCCESS]');
      console.log('[ORDER_SUCCESS]', data);
      setConfirmedOrderNumber(data.order.order_number);
      setConfirmedOrderId(data.order.id);
      setOrderState('success');

      const placedOrder: PlacedOrder = {
        id: data.order.id,
        order_number: data.order.order_number,
        status: data.order.status,
        customer_name: customerName.trim() || null,
        subtotal: data.order.subtotal,
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
      onOrderPlaced?.(placedOrder);
    } catch {
      setOrderState('error');
      setErrorMessage('Network error. Please try again.');
    }
  }

  // Called by PaymentCheckoutScreen once the mock payment succeeds and the order
  // has been created. Mirrors handlePlaceOrder's success tail so both paths show
  // the exact same inline success screen below.
  function handlePaymentSuccess(placedOrder: PlacedOrder) {
    setConfirmedOrderNumber(placedOrder.order_number);
    setConfirmedOrderId(placedOrder.id);
    setConfirmedPaymentConfirmation(placedOrder.payment_confirmation_number ?? null);
    setOrderState('success');
    setScreen('cart');
    onOrderPlaced?.(placedOrder);
  }

  function handleClose() {
    if (orderState === 'submitting') return;
    if (orderState === 'success') {
      setOrderState('idle');
      setConfirmedOrderNumber(null);
      setConfirmedOrderId(null);
      setConfirmedPaymentConfirmation(null);
      setCustomerName('');
      setTableIdentifier('');
    }
    setScreen('cart');
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={handleClose}
        aria-hidden
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="relative z-10 flex max-h-[90dvh] flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl"
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-stone-300" />
        </div>

        {/* Header — suppressed while PaymentCheckoutScreen renders its own header */}
        {screen !== 'checkout' && (
          <div className="flex items-center justify-between px-5 py-3 border-b border-stone-100">
            <div>
              <h2 className="text-lg font-black text-stone-800">Your Order</h2>
              {confirmedSessionId && tableLabel && (
                <p className="text-xs font-semibold text-stone-400">{tableLabel}</p>
              )}
            </div>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close cart"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-100 text-stone-600 active:bg-stone-200"
            >
              ✕
            </button>
          </div>
        )}

        {orderState === 'success' ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <div className="text-5xl">🎉</div>
            <p className="text-xl font-black text-stone-800">Order Placed!</p>
            <p className="text-sm text-stone-500">
              Order #{confirmedOrderNumber} has been sent to the kitchen.
            </p>
            {confirmedPaymentConfirmation && (
              <p className="rounded-xl bg-stone-50 px-3 py-2 text-xs text-stone-500">
                Payment confirmation
                <span className="ml-1.5 font-mono font-semibold text-stone-700">
                  {confirmedPaymentConfirmation}
                </span>
              </p>
            )}
            {confirmedOrderId && (
              <a
                href={`/r/order/${confirmedOrderId}`}
                className="mt-1 rounded-xl border border-stone-200 px-5 py-2.5 text-sm font-bold text-stone-700 active:bg-stone-50"
              >
                Track your order →
              </a>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="mt-2 rounded-2xl px-8 py-3 text-sm font-black text-white shadow-md active:opacity-80"
              style={{ backgroundColor: brandColor }}
            >
              Back to Menu
            </button>
          </div>
        ) : screen === 'checkout' ? (
          <PaymentCheckoutScreen
            cart={cart}
            restaurantId={restaurantId}
            restaurantName={restaurantName}
            brandColor={brandColor}
            tableLabel={confirmedSessionId ? (tableLabel ?? null) : (tableIdentifier.trim() || null)}
            customerName={customerName}
            confirmedSessionId={confirmedSessionId}
            guestId={guestId}
            taxRatePercent={taxRatePercent}
            serviceFeePercent={serviceFeePercent}
            onBack={() => setScreen('cart')}
            onSuccess={handlePaymentSuccess}
            onSessionEnded={onSessionEnded}
          />
        ) : (
          <>
            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {cart.items.length === 0 ? (
                <p className="py-8 text-center text-sm text-stone-400">Your cart is empty.</p>
              ) : (
                <ul className="divide-y divide-stone-100">
                  {cart.items.map((item) => (
                    <li key={item.menu_item_id} className="py-3">
                      <div className="flex items-start gap-3">
                        {/* Quantity controls */}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const newQty = item.quantity - 1;
                              if (newQty < 1) {
                                // Full removal — fire with total quantity removed
                                const subtotalAfter = Math.round((cart.subtotal - item.effective_price * item.quantity) * 100) / 100;
                                onItemRemovedFromCart?.(item.menu_item_id, item.name, item.quantity, item.quantity, cart.subtotal, subtotalAfter);
                              } else {
                                // Partial decrement — 1 unit removed, item stays in cart
                                const subtotalAfter = Math.round((cart.subtotal - item.effective_price) * 100) / 100;
                                onItemRemovedFromCart?.(item.menu_item_id, item.name, 1, item.quantity, cart.subtotal, subtotalAfter);
                              }
                              cart.updateQuantity(item.menu_item_id, newQty);
                            }}
                            aria-label="Decrease quantity"
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-stone-100 text-sm font-black text-stone-700 active:bg-stone-200"
                          >
                            −
                          </button>
                          <span className="w-4 text-center text-sm font-black text-stone-800">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => cart.updateQuantity(item.menu_item_id, item.quantity + 1)}
                            aria-label="Increase quantity"
                            className="flex h-7 w-7 items-center justify-center rounded-full text-white text-sm font-black active:opacity-80"
                            style={{ backgroundColor: brandColor }}
                          >
                            +
                          </button>
                        </div>

                        {/* Item details */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-stone-800 truncate">{item.name}</p>
                          <p className="text-xs text-stone-500">
                            ${Number(item.effective_price).toFixed(2)} each
                          </p>
                          {/* Special instructions */}
                          <input
                            type="text"
                            value={item.special_instructions}
                            onChange={(e) =>
                              cart.updateInstructions(item.menu_item_id, e.target.value)
                            }
                            placeholder="Special instructions…"
                            maxLength={200}
                            className="mt-1 w-full rounded-lg border border-stone-200 bg-stone-50 px-2 py-1 text-xs text-stone-700 placeholder:text-stone-400 focus:outline-none focus:ring-1"
                            style={{ '--tw-ring-color': brandColor } as React.CSSProperties}
                          />
                        </div>

                        {/* Line total */}
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-black text-stone-800">
                            ${Number(item.effective_price * item.quantity).toFixed(2)}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              const subtotalAfter = Math.round((cart.subtotal - item.effective_price * item.quantity) * 100) / 100;
                              onItemRemovedFromCart?.(item.menu_item_id, item.name, item.quantity, item.quantity, cart.subtotal, subtotalAfter);
                              cart.removeItem(item.menu_item_id);
                            }}
                            aria-label={`Remove ${item.name}`}
                            className="mt-1 text-xs text-stone-400 active:text-red-500"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {/* Customer info */}
              {cart.items.length > 0 && (
                <div className="mt-4 space-y-3 border-t border-stone-100 pt-4">
                  <div>
                    <label className="block text-xs font-semibold text-stone-500 mb-1">
                      Your Name (optional)
                    </label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="e.g. Alex"
                      maxLength={80}
                      className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-1"
                      style={{ '--tw-ring-color': brandColor } as React.CSSProperties}
                    />
                  </div>
                  {/* Hide manual table input when in a confirmed session — table is known */}
                  {!confirmedSessionId && (
                    <div>
                      <label className="block text-xs font-semibold text-stone-500 mb-1">
                        Table / Location (optional)
                      </label>
                      <input
                        type="text"
                        value={tableIdentifier}
                        onChange={(e) => setTableIdentifier(e.target.value)}
                        placeholder="e.g. Table 5, Patio, Counter"
                        maxLength={80}
                        className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-1"
                        style={{ '--tw-ring-color': brandColor } as React.CSSProperties}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            {cart.items.length > 0 && (
              <div className="border-t border-stone-100 px-5 py-4 safe-area-bottom">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm font-semibold text-stone-600">Subtotal</span>
                  <span className="text-lg font-black text-stone-800">
                    ${Number(cart.subtotal).toFixed(2)}
                  </span>
                </div>
                <p className="mb-3 text-[10px] text-stone-400">
                  Prices are confirmed at the time you place your order.
                </p>

                {orderState === 'error' && (
                  <p className="mb-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">
                    {errorMessage}
                  </p>
                )}

                <button
                  type="button"
                  onClick={paymentSimulationEnabled ? () => setScreen('checkout') : handlePlaceOrder}
                  disabled={orderState === 'submitting' || sessionConnecting}
                  className="w-full rounded-2xl py-4 text-base font-black text-white shadow-lg active:opacity-80 disabled:opacity-60"
                  style={{ backgroundColor: brandColor }}
                >
                  {orderState === 'submitting'
                    ? 'Placing Order…'
                    : sessionConnecting
                      ? `Connecting to ${tableLabel ?? 'table'}…`
                      : paymentSimulationEnabled
                        ? 'Pay & Place Order'
                        : 'Place Order'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
