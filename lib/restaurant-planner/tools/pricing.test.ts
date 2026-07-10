import { describe, it, expect } from 'vitest';
import { calculateDiscount, validateDiscount, estimatePromotionImpact, estimateMargin, detectConflictingPromotion, validateProposal } from './pricing';
import { calculateSpecialPrice, isSpecialOfferActive, type SpecialOfferItem } from '@/lib/menu/special-offer';
import { estimateDiscountImpact, revalidateProposal } from '../capabilities/menu-pricing';
import type { ResolvableAction, ResolvedDiscountItem } from '@/lib/menu-discount-actions/resolve';
import type { ToolContext } from './types';

// None of these tools touch ctx — a fake object with the right shape but no
// real client is enough to prove that (if they did, these calls would throw).
const fakeCtx = { supabase: {}, serviceClient: {}, restaurantId: 'r1', ownerId: 'o1' } as unknown as ToolContext;

function resolvedItem(overrides: Partial<ResolvedDiscountItem>): ResolvedDiscountItem {
  return {
    id: 'item-id',
    name: 'Cardamom Chai',
    categoryName: 'Breakfast',
    price: 3,
    before: { specialEnabled: false, specialType: null, specialPercent: null, specialPrice: null },
    after: {
      specialEnabled: true,
      specialType: 'percentage',
      specialPercent: 20,
      specialPrice: null,
      specialStartAt: null,
      specialEndAt: null,
      specialNoExpiry: true,
    },
    ...overrides,
  };
}

describe('calculateDiscount (pass-through fidelity)', () => {
  it('matches calculateSpecialPrice for a percentage discount', async () => {
    const input = { originalPrice: 10, discountType: 'percentage', percent: 20, specialPrice: null };
    const outcome = await calculateDiscount.execute(input, fakeCtx);
    expect(outcome).toEqual({ ok: true, data: calculateSpecialPrice(10, 'percentage', 20, null) });
  });

  it('matches calculateSpecialPrice for a fixed_price discount', async () => {
    const input = { originalPrice: 10, discountType: 'fixed_price', percent: null, specialPrice: 6.5 };
    const outcome = await calculateDiscount.execute(input, fakeCtx);
    expect(outcome).toEqual({ ok: true, data: 6.5 });
  });
});

describe('validateDiscount', () => {
  it('rejects a percentage at or above 100', async () => {
    const outcome = await validateDiscount.execute({ discount: { discountType: 'percentage', value: 100 } }, fakeCtx);
    expect(outcome).toEqual({ ok: true, data: { valid: false, reason: 'Discount is outside the allowed bounds.' } });
  });

  it('rejects a fixed price that is not lower than the current price', async () => {
    const outcome = await validateDiscount.execute(
      { discount: { discountType: 'fixed_price', value: 10 }, currentPrice: 10 },
      fakeCtx,
    );
    expect(outcome).toEqual({ ok: true, data: { valid: false, reason: 'The fixed price is not lower than the current price.' } });
  });

  it('accepts a well-formed percentage discount', async () => {
    const outcome = await validateDiscount.execute({ discount: { discountType: 'percentage', value: 20 } }, fakeCtx);
    expect(outcome).toEqual({ ok: true, data: { valid: true } });
  });
});

describe('estimatePromotionImpact (pass-through fidelity)', () => {
  it('matches estimateDiscountImpact exactly', async () => {
    const action: ResolvableAction = {
      type: 'set_discount',
      target: { scope: 'item', name: 'Cardamom Chai' },
      discount: { discountType: 'percentage', value: 20, specialStartAt: null, specialEndAt: null, specialNoExpiry: true },
    };
    const items = [resolvedItem({})];
    const outcome = await estimatePromotionImpact.execute({ action, items }, fakeCtx);
    expect(outcome).toEqual({ ok: true, data: estimateDiscountImpact(action, items) });
  });
});

describe('estimateMargin (stub)', () => {
  it('always returns margin: null and never fabricates a number', async () => {
    const outcome = await estimateMargin.execute({}, fakeCtx);
    expect(outcome).toEqual({ ok: true, data: { margin: null, reason: 'No cost data is configured for these items.' } });
  });
});

describe('detectConflictingPromotion (pass-through fidelity)', () => {
  const activeItem: SpecialOfferItem = {
    special_enabled: true,
    special_type: 'percentage',
    special_percent: 10,
    special_price: null,
    special_start_at: null,
    special_end_at: null,
    special_no_expiry: true,
  };
  const inactiveItem: SpecialOfferItem = { ...activeItem, special_enabled: false };

  it('matches isSpecialOfferActive for an item with an active special', async () => {
    const outcome = await detectConflictingPromotion.execute({ item: activeItem }, fakeCtx);
    expect(outcome).toEqual({ ok: true, data: { hasActiveSpecial: isSpecialOfferActive(activeItem) } });
    expect(outcome).toEqual({ ok: true, data: { hasActiveSpecial: true } });
  });

  it('matches isSpecialOfferActive for an item with no active special', async () => {
    const outcome = await detectConflictingPromotion.execute({ item: inactiveItem }, fakeCtx);
    expect(outcome).toEqual({ ok: true, data: { hasActiveSpecial: false } });
  });
});

describe('validateProposal (pass-through fidelity, also registered as revalidateProposal)', () => {
  it('matches revalidateProposal when live state has drifted from the snapshot', async () => {
    const snap = [resolvedItem({ price: 3 })];
    const live = [resolvedItem({ price: 4 })];
    const outcome = await validateProposal.execute({ snapshot: snap, liveItems: live }, fakeCtx);
    const direct = revalidateProposal(snap, live);
    expect(outcome).toEqual({ ok: true, data: { valid: false, reason: direct.ok ? undefined : direct.reason } });
  });

  it('matches revalidateProposal when nothing has drifted', async () => {
    const snap = [resolvedItem({})];
    const outcome = await validateProposal.execute({ snapshot: snap, liveItems: snap }, fakeCtx);
    expect(outcome).toEqual({ ok: true, data: { valid: true } });
  });
});
