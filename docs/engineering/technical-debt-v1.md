# SpinBite Technical Debt Audit v1

_Audit date: 2026-06-15_

---

## Critical Debt

### TD-C1 — Authentication Has No Email Verification

**Description:** Supabase Auth is used with email/password but there is no email verification step. A user can sign up with any email address (including fake ones) and immediately access the admin dashboard.

**Impact:** Anyone who knows the signup flow can create an account. Restaurant isolation relies entirely on `owner_id` matching — unverified email means no guaranteed identity ownership.

**Risk:** Account takeover via email guess; fake restaurant creation; spam accounts.

**Fix:** Enable email confirmation in Supabase Auth dashboard. Add verification flow to `app/auth/page.tsx` and `app/signup/page.tsx`.

---

### TD-C2 — `restaurants.owner_id` Has No FK Constraint to `auth.users`

**Description:** `restaurants.owner_id` is stored as a UUID but there is no declared foreign key to `auth.users`. Deleting a user from Supabase Auth does NOT cascade-delete their restaurant or orphan their data safely.

**Impact:** Deleting a user account leaves orphaned restaurants accessible via the service role. Potential data integrity violation.

**Fix:** Add FK constraint (requires careful migration — `auth.users` is in a different schema). Short-term: document cascade behavior in `delete_restaurant_cascade()` function.

---

### TD-C3 — Coupon Expiry Is Not Server-Enforced

**Description:** `coupon_expiry_minutes` is display-only. The server never changes a coupon's status to `expired`. Staff can accept or reject expired coupons at their discretion (see ADR-015).

**Impact:** Business risk — expired coupons can be honored without detection. No audit trail of expired-but-honored coupons.

**Fix (if desired):** Add server-side expiry check in the coupon validation endpoint. Add an `expired` status to `coupon_redemptions.status`.

---

### TD-C4 — `play_sessions.play_session_id` Nullable in `coupon_redemptions`

**Description:** Pre-migration coupons have `play_session_id = null` in `coupon_redemptions`. Session recovery logic handles this gracefully but the nullable FK creates silent gaps in the data model.

**Impact:** Session recovery queries cannot reliably link old coupons to sessions. Play count tracking is inaccurate for pre-migration data.

**Fix:** Backfill `play_session_id` where possible (match by `customer_session_id` and `promotion_id`). Long-term: make column NOT NULL after backfill.

---

## High Debt

### TD-H1 — Two Session Tables May Both Be Active

**Description:** Both `guest_sessions` and `play_sessions` tables exist in the schema. `play_sessions` is the current canonical session table. `guest_sessions` has a `played` boolean and `state` field that appear to be from an earlier architecture.

**Impact:** Unclear which table is still being written to. Any code reading `guest_sessions` may be reading stale or inactive data. Double-counting risk.

**Fix:** Audit all code paths that write to or read from `guest_sessions`. If no active writes remain, mark for deprecation.

---

### TD-H2 — `rewards` Table Is Legacy; `promotion_rewards` Is Canonical

**Description:** The `rewards` table exists in the schema (with `label`, `weight`, `active`, `discount_value`) alongside `promotion_rewards` (the active rewards table). These are different schemas for the same concept.

**Impact:** Any new engineer reading the schema will be confused about which table to use. Risk of writing to the wrong table.

**Fix:** Audit whether any code path reads `rewards`. If unused, drop the table or add a schema comment marking it deprecated.

---

### TD-H3 — `promotions.game_type` and `promotion_game_assignments` Can Drift

**Description:** `promotions.game_type` stores the primary/fallback game type. `promotion_game_assignments` stores the full multi-game pool. `resolvePromotionGame()` uses `promotions.game_type` as a fallback when no assignments exist, but if assignments exist for a different game type than `game_type`, they can diverge.

**Impact:** Unpredictable game selection. A promotion might show "Spin Wheel" in the admin UI (based on `game_type`) but serve Mystery Box to customers (from `promotion_game_assignments`).

**Fix:** When `promotion_game_assignments` rows exist, treat them as the authoritative source. Deprecate `promotions.game_type` or make it a computed field.

---

### TD-H4 — Brittle Global CSS Selectors for Hero Panel Hiding

**Description:** `globals.css` contains two CSS rules that use compound Tailwind class selectors to hide duplicated panels in the builder and menu builder:

```css
section.bg-gradient-to-br.from-[#FF6B00].to-[#E63939] .bg-white\/15.p-3 { display: none; }
section.mx-auto.max-w-5xl > .bg-gradient-to-br.from-[#FF6B00].to-[#E63939] .bg-white\/15.p-4 { display: none; }
```

**Impact:** These selectors break if any Tailwind class in the chain changes. Silent breakage — the hidden panel reappears without any error or warning.

**Fix:** Add explicit `data-hide-builder-url-panel` or similar DOM attributes to the elements being hidden, and select on those instead.

---

### TD-H5 — No Vercel Deployment Verification in CI

**Description:** There is no automated check that confirms a Vercel deployment is READY and matches the latest git SHA before a branch can be considered shipped. Rule 15 requires manual verification.

**Impact:** Engineers must manually verify SHA match after every merge. Easy to skip under deadline pressure.

**Fix:** Add a post-merge GitHub Action that polls the Vercel API for READY status and SHA match, then posts a status check.

---

### TD-H6 — `menu_items.category` Legacy Column

**Description:** `menu_items.category` is a text field from the pre-sections era. `menu_sections` is now the canonical grouping mechanism. Some items may have stale `category` values that don't match any section.

**Impact:** Querying by `category` may return inconsistent results. New code using `section_id` is correct; old code using `category` is wrong.

**Fix:** Audit all reads of `menu_items.category`. If none remain, add a migration to drop the column (after ensuring no data is needed for migration).

---

### TD-H7 — No Analytics Pipeline

**Description:** There is no event-level analytics system. The only analytics data is aggregate coupon counts in `coupon_redemptions`. There is no tracking of:
- QR scan events
- Promotion widget impression
- Game play funnel (scan → play → win → claim)
- Game type performance comparison
- Reward weight effectiveness

**Impact:** No data to optimize promotion performance. AI engine (long-term) will have no training signal.

**Fix:** Define an analytics event schema. Options: Supabase table (`analytics_events`), PostHog, Mixpanel, or custom pipeline.

---

## Medium Debt

### TD-M1 — `PromotionBuilderClient.tsx` Is a Stub

**Description:** `components/admin/PromotionBuilderClient.tsx` contains only `return <div />`. This appears to be a placeholder that was never completed or was superseded by another component.

**Impact:** If any page imports this, it renders nothing. Code confusion for new engineers.

**Fix:** Either implement or delete. Audit imports first.

---

### TD-M2 — Print Kit Visual Fragmentation

**Description:** The QR print sheet (`app/admin/restaurants/[restaurantId]/qr/print/page.tsx` and `app/admin/promotions/[id]/print/page.tsx`) may use game visuals that are not derived from `GameVisual.tsx`. Each print page is effectively an isolated document.

**Impact:** Print kit may show different game visuals than the live game selector, violating Engineering Rule 14.

**Fix:** Audit print pages for game visual rendering. Ensure they call `getGameVisual()` from `GameVisual.tsx`.

---

### TD-M3 — `campaigns` Table Is Unused

**Description:** The `campaigns` table (`id`, `name`, `restaurant_id`, `active`) exists in the schema but has no corresponding UI, API, or code references that write to it.

**Impact:** Dead schema weight. Creates false impression of a campaign feature that doesn't exist.

**Fix:** Either build the Communication Campaign Engine or drop the table.

---

### TD-M4 — `reward_reels` Game Is a Placeholder

**Description:** The `reward_reels` game type has a contract, a visual (`MiniRewardReels`), and is registered in `gameRegistry`, but has no working `PlayComponent`, `BuilderPreview`, `ConfigPanel`, or `Runtime`. The `availability` is not `active` — check contract for current status.

**Impact:** If a promotion is somehow configured for `reward_reels`, the game runtime will fail silently.

**Fix:** Either implement or ensure `availability: 'hidden'` blocks selection in all UIs.

---

### TD-M5 — `open_the_door` Game Has No Builder Integration

**Description:** `open_the_door` has a contract and runtime but the game lab card shows it as hidden from the builder. The builder preview (`lib/games/open-the-door/builderPreview.tsx`) exists but may not be wired to `GamePreviewHost`.

**Impact:** Partial implementation. Cannot be promoted via normal builder flow.

**Fix:** Either complete the builder integration or document it as future work with a clear `hidden` guard.

---

### TD-M6 — No Email Verification or Password Reset Tested in Production

**Description:** Supabase Auth provides email verification and password reset out of the box, but there is no documented or tested flow for these. The `app/auth/callback/route.ts` handles OAuth callback but password reset flow is unclear.

**Impact:** Restaurant owners who forget their password have no tested recovery path.

---

### TD-M7 — Hardcoded Reward Terms String

**Description:** In `app/api/public/promotion-play/route.ts`, reward terms are hardcoded:
```
'Show this code to staff before ordering. One reward per customer/session. Standard restaurant terms apply.'
```
**Impact:** All promotions across all restaurants use the same terms. Restaurants cannot customize terms.

**Fix:** Add a `terms_text` field to `promotions` table. Fall back to default if null.

---

## Low Debt

### TD-L1 — `scripts/seed-punjabi-by-nature.ts` Is a Hardcoded Seed Script

**Description:** A seed script for a specific test restaurant exists in `scripts/`. Contains hardcoded restaurant data.

**Impact:** Low impact but adds noise to the repo. Should not ship in production builds.

---

### TD-L2 — `console.log` / `console.warn` in Production API Routes

**Description:** `app/api/public/promotion-play/route.ts` and `lib/game-pool/resolvePromotionGame.ts` contain `console.log` and `console.warn` statements for session recovery debugging.

**Impact:** These appear in Vercel function logs in production. Low risk but adds log noise.

**Fix:** Replace with structured logging or remove after session recovery is stable.

---

### TD-L3 — No TypeScript Strict Mode

**Description:** The project does not appear to have `strict: true` in `tsconfig.json` (not verified — check tsconfig). Strict mode catches many classes of null/undefined bugs at compile time.

**Fix:** Enable `strict: true` and resolve resulting type errors.

---

### TD-L4 — `MENU_REALITY_CHECK.md` Appears in `.gitignore` Untracked

**Description:** Git status shows `MENU_REALITY_CHECK.md` as untracked. This appears to be a debugging document that was never committed. If it contains architecture decisions, it should be committed to `docs/` or deleted.

---

## Debt Priority Matrix

| ID | Severity | Effort | Priority |
|----|----------|--------|----------|
| TD-C1 | Critical | Low | Fix first |
| TD-C2 | Critical | Medium | Fix second |
| TD-C3 | Critical | Medium | Fix when stakeholders agree on model |
| TD-C4 | Critical | Low | Fix with backfill migration |
| TD-H1 | High | Low | Audit + deprecate |
| TD-H2 | High | Low | Audit + deprecate |
| TD-H3 | High | Medium | Design fix needed |
| TD-H4 | High | Low | Replace CSS selectors |
| TD-H5 | High | Medium | CI/CD improvement |
| TD-H6 | High | Low | Audit + drop column |
| TD-H7 | High | High | Long-term: analytics pipeline |
| TD-M1–M7 | Medium | Low–Medium | Next engineering cycle |
| TD-L1–L4 | Low | Low | Cleanup sprint |
