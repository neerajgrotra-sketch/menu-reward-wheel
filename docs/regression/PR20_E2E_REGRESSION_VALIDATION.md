# PR 20 — End-to-End Regression Validation

This document defines the regression validation required after the game-contract, state-machine, runtime, builder-shell, and admin-shell refactor.

The repository currently does not include an automated E2E framework such as Playwright or Cypress. This PR therefore adds a production-safe validation plan that can be executed manually before release and later converted into automated E2E tests.

## Validation Scope

Validate the following flows:

1. Spin Wheel gameplay
2. Scratch Card gameplay
3. Mystery Box gameplay
4. Promotion creation
5. Promotion publishing
6. Coupon issuance
7. Coupon redemption
8. Metrics tracking

## Environments

Run these checks in at least one deployed preview environment and one local development environment when possible.

Recommended environments:

- Local: `npm run dev`
- Build validation: `npm run build`
- Preview deployment: Vercel preview URL
- Production smoke test: production URL after merge

## Required Build Validation

Run:

```bash
npm install
npm run build
```

Expected result:

- Build completes successfully
- No TypeScript errors
- No missing imports
- No invalid React component props
- No server/client component boundary errors

## Test Data Required

Create or identify:

- One test restaurant location
- One draft Spin Wheel promotion
- One draft Scratch Card promotion
- One draft Mystery Box promotion
- At least three rewards per promotion
- At least one staff/admin user capable of redeeming coupons
- At least one mobile device for scan/play testing

## Promotion Creation Regression

### Steps

1. Open `/admin/promotions?mode=create`.
2. Select a restaurant location.
3. Enter a promotion name.
4. Select Spin Wheel.
5. Click Create Promotion.
6. Confirm redirect to the promotion builder.
7. Repeat for Scratch Card.
8. Repeat for Mystery Box.

### Expected Results

- Create flow renders through the new builder shell.
- Restaurant selection works.
- Promotion name persists into created draft.
- Selected game type is saved on the promotion.
- Redirect goes to `/admin/promotions/[promotionId]/builder`.
- No console errors.

## Promotion Publishing Regression

### Steps

1. Open a draft promotion builder.
2. Add rewards.
3. Configure campaign timing if available.
4. Publish or activate the promotion.
5. Return to `/admin/promotions?mode=manage`.

### Expected Results

- Promotion moves from draft to active or pending depending on schedule.
- Published promotion appears in Manage Promotions.
- Active promotion exposes play link.
- Pending promotion is clearly marked as pending.
- Ended promotion is clearly marked as ended.

## Spin Wheel Gameplay Regression

### Steps

1. Open an active Spin Wheel play link.
2. Confirm the wheel renders.
3. Click Spin Now.
4. Wait for the spin to settle.
5. Confirm a reward/coupon is displayed.
6. Attempt a second play if the promotion allows it.

### Expected Results

- Wheel renders with configured rewards.
- Spin button disables while spinning.
- Wheel animation completes.
- Reward is selected.
- Coupon is issued once per play.
- No duplicate coupon is created for one spin.
- Plays remaining decreases correctly.

## Scratch Card Gameplay Regression

### Steps

1. Open an active Scratch Card play link on desktop.
2. Drag over the card using mouse pointer.
3. Confirm scratch percentage increases.
4. Confirm reward does not reveal on first tap.
5. Continue scratching until threshold is reached.
6. Confirm reveal sequence starts.
7. Confirm reward/coupon appears.
8. Repeat on a mobile device using touch.

### Expected Results

- Scratch Card renders.
- Pointer/touch dragging works.
- Scratch percentage increases visibly.
- First tap does not instantly reveal the reward.
- Reward reveals only after threshold.
- `onPlay()` behavior fires once per play.
- Revealing state appears.
- Completed state appears.
- Coupon is issued once.
- Mobile touch interaction works.

## Mystery Box Gameplay Regression

### Steps

1. Open an active Mystery Box play link.
2. Confirm three boxes render.
3. Select one box.
4. Confirm selected box animation starts.
5. Confirm reveal completes.
6. Confirm reward/coupon appears.

### Expected Results

- Three boxes render.
- Only one box can be selected per play.
- Selected box enters opening state.
- Sparkle/opening animation appears.
- Coupon is issued once per play.
- Plays remaining decreases correctly.

## Coupon Issuance Regression

### Steps

1. Complete one play for each game type.
2. Capture the coupon code displayed to the customer.
3. Confirm coupon exists in admin metrics/performance view.
4. Confirm coupon has an expiry timestamp if configured.

### Expected Results

- Coupon code is generated.
- Coupon is tied to the correct promotion.
- Coupon is tied to the correct reward.
- Coupon status initially appears active.
- Expiry timestamp is correct.

## Coupon Redemption Regression

### Steps

1. Open staff coupon validation/redeem flow.
2. Enter or scan a valid coupon code.
3. Redeem the coupon.
4. Attempt to redeem the same coupon again.
5. Attempt to redeem an expired coupon if test data allows.

### Expected Results

- Valid coupon can be redeemed once.
- Redeemed coupon changes status to redeemed.
- Duplicate redemption is blocked.
- Expired coupon is blocked or clearly marked expired.
- Admin metrics update after redemption.

## Metrics Tracking Regression

### Steps

1. Open `/admin/promotions?mode=manage`.
2. Click Refresh Metrics.
3. Open promotion performance details for each test promotion.
4. Compare issued/redeemed counts with the coupon ledger.
5. Verify reward breakdown totals.

### Expected Results

- Issued count equals number of issued coupons.
- Redeemed count equals number of redeemed coupons.
- Redemption rate is mathematically correct.
- Reward breakdown totals equal issued count.
- Coupon ledger displays latest coupons.
- Active, expired, and redeemed statuses are accurate.

## Regression Matrix

| Area | Spin Wheel | Scratch Card | Mystery Box | Expected |
|---|---:|---:|---:|---|
| Promotion can be created | Yes | Yes | Yes | Draft created |
| Promotion can be published | Yes | Yes | Yes | Active/pending campaign |
| Game renders on play page | Yes | Yes | Yes | No runtime errors |
| Game completes a play | Yes | Yes | Yes | Reward selected |
| Coupon issued once | Yes | Yes | Yes | One coupon per play |
| Coupon redemption works | Yes | Yes | Yes | Redeem once only |
| Metrics update | Yes | Yes | Yes | Counts accurate |
| Mobile usable | Yes | Yes | Yes | No blocked interaction |

## Release Gate

Do not merge or deploy this refactor unless all of the following are true:

- `npm run build` passes
- Create promotion works for all three games
- Published play links work for all three games
- Coupon issuance works for all three games
- Coupon redemption works
- Metrics and performance details update correctly
- Scratch Card works on mobile touch
- No critical console errors appear during play

## Future Automation Recommendation

A future PR should add Playwright and automate these flows:

- Create draft promotion
- Publish promotion
- Play each game
- Validate coupon issuance through admin/API
- Redeem coupon
- Validate metrics changed

Recommended future package additions:

```bash
npm install -D @playwright/test
npx playwright install
```

This PR intentionally does not introduce Playwright to avoid expanding dependency and CI scope during architecture stabilization.
