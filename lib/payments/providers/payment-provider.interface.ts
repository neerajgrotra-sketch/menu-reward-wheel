export type PaymentAmount = {
  amount: number;   // major currency unit, e.g. 24.99
  currency: string; // ISO 4217 lowercase, e.g. 'usd'
};

export type CreateCheckoutRequest = {
  restaurantId: string;
  amount: PaymentAmount;
  idempotencyKey: string;
  metadata: Record<string, unknown>;
};

export type CreateCheckoutResult = {
  paymentId: string;
  transactionId: string;
  status: 'pending' | 'requires_action';
};

export type AuthorizePaymentRequest = {
  transactionId: string;
  // Real providers: a client-side tokenized payment method reference.
  // The mock provider never uses this — it exists only to keep the
  // interface shape provider-agnostic for a future real integration.
  paymentMethodToken?: string;
};

export type AuthorizePaymentResult = {
  transactionId: string;
  status: 'succeeded' | 'requires_action' | 'failed';
  failureReason?: string;
};

export type CapturePaymentRequest = {
  transactionId: string;
  amount: PaymentAmount;
};

export type CapturePaymentResult = {
  transactionId: string;
  status: 'succeeded' | 'failed';
  failureReason?: string;
};

export type RefundPaymentRequest = {
  transactionId: string;
  amount: PaymentAmount;
  reason?: string;
};

export type RefundPaymentResult = {
  transactionId: string;
  status: 'refunded' | 'failed';
};

export type VerifyWebhookRequest = {
  rawBody: string;
  signatureHeader: string | null;
};

export type VerifyWebhookResult = {
  valid: boolean;
  eventType?: string;
  payload?: unknown;
};

// Provider-agnostic payment interface. lib/payments/payment-orchestrator.ts is the
// only caller — it never branches on which provider is active. A future
// StripeProvider implements this same interface with no change to the
// orchestrator or the checkout UI (createCheckout -> PaymentIntent create,
// authorizePayment/capturePayment -> confirm/capture, verifyWebhook ->
// stripe.webhooks.constructEvent).
export interface PaymentProvider {
  createCheckout(req: CreateCheckoutRequest): Promise<CreateCheckoutResult>;
  authorizePayment(req: AuthorizePaymentRequest): Promise<AuthorizePaymentResult>;
  capturePayment(req: CapturePaymentRequest): Promise<CapturePaymentResult>;
  refundPayment(req: RefundPaymentRequest): Promise<RefundPaymentResult>;
  verifyWebhook(req: VerifyWebhookRequest): Promise<VerifyWebhookResult>;
}
