import { randomUUID } from 'crypto';
import type {
  PaymentProvider,
  CreateCheckoutRequest,
  CreateCheckoutResult,
  AuthorizePaymentRequest,
  AuthorizePaymentResult,
  CapturePaymentRequest,
  CapturePaymentResult,
  RefundPaymentRequest,
  RefundPaymentResult,
  VerifyWebhookRequest,
  VerifyWebhookResult,
} from './payment-provider.interface';

// Simulation only — no real payment processing, no external API calls, no real
// card data ever passes through this class. Always succeeds, per product spec.
// The orchestrator's failure branch exists structurally for a future real
// provider; this class deliberately never triggers it.
export class MockPaymentProvider implements PaymentProvider {
  async createCheckout(_req: CreateCheckoutRequest): Promise<CreateCheckoutResult> {
    const transactionId = `mock_txn_${randomUUID()}`;
    return { paymentId: transactionId, transactionId, status: 'pending' };
  }

  async authorizePayment(req: AuthorizePaymentRequest): Promise<AuthorizePaymentResult> {
    return { transactionId: req.transactionId, status: 'succeeded' };
  }

  async capturePayment(req: CapturePaymentRequest): Promise<CapturePaymentResult> {
    return { transactionId: req.transactionId, status: 'succeeded' };
  }

  async refundPayment(req: RefundPaymentRequest): Promise<RefundPaymentResult> {
    return { transactionId: req.transactionId, status: 'refunded' };
  }

  async verifyWebhook(_req: VerifyWebhookRequest): Promise<VerifyWebhookResult> {
    // The mock never receives real provider webhooks.
    return { valid: true };
  }
}
