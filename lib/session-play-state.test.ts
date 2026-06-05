import { describe, it, expect } from 'vitest';
import { resolveSessionPlayState } from './session-play-state';

describe('resolveSessionPlayState', () => {
  // Scenario 1: customer loaded the page, got a session, then closed the tab —
  // no coupon was ever issued. They should be allowed to play on return.
  it('refresh before first play — session exists, no coupons issued', () => {
    const result = resolveSessionPlayState([], 1);
    expect(result).toEqual({ alreadyPlayed: false, playsUsed: 0, playsRemaining: 1 });
  });

  // Scenario 2: promotion allows 3 spins; customer spun once, then left.
  // On return they should see 1 play used and 2 remaining.
  it('refresh after one of multiple plays — 1 coupon issued, max_spins 3', () => {
    const result = resolveSessionPlayState([{ status: 'issued' }], 3);
    expect(result).toEqual({ alreadyPlayed: false, playsUsed: 1, playsRemaining: 2 });
  });

  // Scenario 3: customer used all 3 of their spins. Session is complete —
  // they should be blocked from playing again.
  it('refresh after all plays used — coupons match max_spins', () => {
    const result = resolveSessionPlayState(
      [{ status: 'issued' }, { status: 'issued' }, { status: 'issued' }],
      3,
    );
    expect(result).toEqual({ alreadyPlayed: true, playsUsed: 3, playsRemaining: 0 });
  });

  // Scenario 4: customer played once (max_spins 1) and the coupon was already
  // redeemed at the counter. Session is complete; redeemed status does not
  // reduce the issued count or grant extra plays.
  it('reload with redeemed coupon — fully played and redeemed', () => {
    const result = resolveSessionPlayState([{ status: 'redeemed' }], 1);
    expect(result).toEqual({ alreadyPlayed: true, playsUsed: 1, playsRemaining: 0 });
  });

  // Edge: max_spins of 0 or negative is clamped to 1 by the implementation.
  it('clamps max_spins < 1 to 1', () => {
    const result = resolveSessionPlayState([], 0);
    expect(result).toEqual({ alreadyPlayed: false, playsUsed: 0, playsRemaining: 1 });
  });
});
