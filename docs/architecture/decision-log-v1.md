# SpinBite Architecture Decision Log v1

_Audit date: 2026-06-15_  
_These decisions are permanent unless reviewed in a formal product review session._

---

## ADR-001 — Promotions Are Separate From Menu Discounts

**Decision:** Promotions exist in a dedicated `promotions` table and do not add columns to `menu_items`. There is no `discount_price`, `is_promoted`, or `promotion_id` field on `menu_items`.

**Reasoning:** Menu is catalog — it describes what the restaurant sells. Promotions are time-limited revenue tactics overlaid on top. Conflating them makes it impossible to run a promotion across multiple items, change the reward pool, or run multiple concurrent promotions without messy migrations.

**Alternatives rejected:**
- Adding `discount_price` to `menu_items` — creates permanent coupling between catalog and promotion state; migrations become dangerous
- `is_promoted` boolean — no reward pool, no scheduling, no game engine integration possible

**Long-term implication:** The AI Revenue Engine can swap, modify, and run promotions independently of menu structure. Menu stays clean; promotions are the creative layer above it.

---

## ADR-002 — Merchandising Tags Are Not Commerce Promotions

**Decision:** `Chef Special`, `Popular`, `Featured`, `New` are merchandising tags stored in `menu_items.tags`. They are UI display states, not pricing or game-linked promotions.

**Reasoning:** Tags describe the restaurant's editorial curation. They are stable, low-change metadata. Promotions are dynamic, time-bound, linked to games and rewards. They serve entirely different purposes despite both "highlighting" items.

**Alternatives rejected:**
- Using promotions to drive featured/popular badges — would require creating a promotion for every curated item, polluting the promotion engine with non-game content

**Long-term implication:** AI can curate tags (Chef Special, Popular) separately from AI-driven promotion campaigns. Two clean levers.

---

## ADR-003 — Multi-Game Promotion Pool With Weighted Assignment

**Decision:** A single promotion can offer multiple game types via `promotion_game_assignments`. On first visit, a game is randomly selected from the weighted pool and locked to `play_sessions.selected_game_type` for the session.

**Reasoning:** Enables A/B testing of game experiences within a single promotion. Restaurant owners don't need to create separate promotions per game type. The weighted pool allows gradual rollout of new games.

**Alternatives rejected:**
- One game type per promotion — limits experimentation; restaurant must run multiple promotions to test engagement
- Client-side game selection — would allow session manipulation; game type must be server-locked to prevent exploitation

**Long-term implication:** The AI engine can assign game weights based on conversion data. High-performing game types get more weight automatically.

---

## ADR-004 — Phone Captured at Claim, Not at Play

**Decision:** Customers play the game anonymously. Phone number is requested only after they see their reward and want to claim the coupon.

**Reasoning:** Friction before play kills engagement. The psychological moment of maximum motivation is immediately after winning. Capturing identity at that moment converts better and feels fairer — the customer exchanges their phone for something they already earned, not for a chance to maybe win.

**Alternatives rejected:**
- Phone gate before play — high drop-off, feels like a data grab, damages trust
- No identity capture at all — removes CRM value for restaurants; blocks communication campaigns

**Long-term implication:** `customer_profiles` are high-intent records — every profile was created by someone motivated enough to provide their phone after winning. This is a much higher quality list than blanket capture.

---

## ADR-005 — Anonymous Play Is Default; Identity Is Progressive Enrichment

**Decision:** `play_sessions` are created without customer identity. `customer_profile_id` is linked only if the customer provides their phone. "Not Now" is always available on the identity screen.

**Reasoning:** Legal (GDPR/PIPEDA/CCPA) — consent must be genuinely optional. Product — forcing identity risks abandonment before the coupon is shown, destroying conversion.

**Long-term implication:** Analytics pipelines must handle both anonymous play sessions and identified sessions. Metrics like "plays per customer" are approximations for unidentified sessions.

---

## ADR-006 — Game Visuals Centralized in GameVisual.tsx

**Decision:** All game icon/visual rendering flows through `components/game-visuals/GameVisual.tsx`. No component may define its own game visual.

**Reasoning:** Game visuals appear in 5+ locations: game selector, reward banner, admin builder, print kit, marketing tiles. If each renders independently, visual drift is inevitable. One source ensures brand consistency and allows updating all game visuals with a single change.

**Alternatives rejected:**
- Emoji per game type — emoji rendering varies across OS/browser; inconsistent on different devices; breaks brand standards
- Game contract `icon` field — the `icon` field (emoji) is for compact text-context badges, not visual tile contexts

**Long-term implication:** Adding a new game requires adding one component to `GameVisual.tsx` and one entry in `getGameVisual()`. That single change propagates everywhere.

---

## ADR-007 — One Live Promotion Per Location Enforced by DB Trigger

**Decision:** The database enforces that only one promotion can be `active` per restaurant at a time via a before-insert trigger.

**Reasoning:** Multiple concurrent active promotions per location create ambiguity about which reward a customer wins, which coupon to validate, and which QR code to print. The promotion widget on the public menu page points to `restaurants.current_promotion_id` — there is no mechanism to show multiple simultaneously.

**Alternatives rejected:**
- Application-layer enforcement — fragile; a bug or race condition allows two active promotions

**Long-term implication:** Multi-promotion support (Commerce + Game running simultaneously) requires redesigning the promotion architecture. This is a known future constraint.

---

## ADR-008 — Mobile-First Architecture Is Mandatory

**Decision:** Every customer-facing UI component is designed and tested for phone screens first. Desktop is secondary for customer flows. Admin flows are responsive but optimized for desktop.

**Reasoning:** The QR code scan experience happens entirely on a customer's phone. The entire value of SpinBite is a phone-native experience.

**Alternatives rejected:**
- Desktop-first with mobile adaptations — produces UX that works on desktop but is clunky on phones; wrong for the core use case

---

## ADR-009 — Service Role Client Used for All Public Data API Routes

**Decision:** Public API routes (`/api/public/*`, `/api/coupons/*`) use `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS, rather than relying on anonymous/public RLS policies.

**Reasoning:** Public routes need to read restaurant, promotion, and reward data without the customer being authenticated. Writing to `play_sessions` and `coupon_redemptions` also requires elevated access. RLS policies for anonymous access are notoriously easy to misconfigure; service role + server-side validation is more explicit and auditable.

**Risk:** Service role must NEVER be exposed to the browser. It is only used in server-side API routes and server components.

---

## ADR-010 — QR Menu Promotion Widget Hides Actual Reward Details

**Decision:** The public menu page shows a promotion widget that says something like "Spin to Win" or "Play Now" — it does not reveal what rewards are available before the customer plays.

**Reasoning:** Anticipation and mystery are the core engagement mechanic. If customers can see "10% off Butter Chicken" on the menu page, the game becomes a mechanical discount, not an exciting experience. The reward reveal after playing is the emotional moment that drives engagement.

**Alternatives rejected:**
- Showing reward pool on QR menu — defeats the purpose of the game; turns it into a discount display

---

## ADR-011 — SpinBite Is the Communication Channel; Restaurant Owns the Relationship

**Decision:** SMS/push/email communications to customers flow through SpinBite infrastructure. Restaurants cannot export raw customer data; they access customers through SpinBite's campaign engine.

**Reasoning:** Data quality and consent compliance are managed centrally. Restaurants focus on promotions; SpinBite manages the technical compliance and delivery infrastructure.

**Alternatives rejected:**
- Raw data export to restaurants — consent management per-restaurant is unscalable; data leakage risk; GDPR/CASL compliance becomes impossible to enforce

---

## ADR-012 — Priority Winner Model for Promotion Conflicts

**Decision:** Per menu item, only the highest-priority active promotion wins (no stacking for MVP). A badge or game widget is shown for the single winning promotion.

**Reasoning:** Simple to understand for restaurant operators, simple to implement, simple to debug. Stacking creates math problems (40% off + free item = ?) and is almost never what operators want.

**Alternatives rejected:**
- Promotion stacking — combinatorial complexity, edge cases, operator confusion
- Random selection — unpredictable behavior, hard to reason about

---

## ADR-013 — AI Is the North Star But Operational Primitives Must Stabilize First

**Decision:** All current engineering effort targets clean, AI-controllable primitives (menu, promotion, game, reward, coupon, customer). No AI automation is implemented until these primitives are stable and well-tested.

**Reasoning:** AI automation on unstable primitives amplifies bugs and creates unpredictable behavior. Every AI feature assumes clean structured I/O from the underlying systems.

**Long-term implication:** Every system built now should ask: "Can an AI call this reliably?" If not, it's not clean enough.

---

## ADR-014 — Session Token Generated Client-Side; Play Session Is Server-Locked

**Decision:** A UUID session token is generated client-side on first page load. The server creates the `play_sessions` row idempotently — concurrent requests with the same token resolve via unique constraint + race recovery.

**Reasoning:** Client-side token allows session recovery on reload without requiring a server round-trip to initialize. The server locks the `selected_game_type` and `play_session_id` — these cannot change once created.

**Risk acknowledged:** A determined user could generate a new session token and play again. This is accepted as a known trade-off; enforcing play limits by IP or device fingerprint is future work.

---

## ADR-015 — Reward Expiry Is Display-Only, Not Server-Enforced

**Decision:** Coupon expiry (`coupon_expiry_minutes`) is computed client-side and shown as a countdown. There is no server-side TTL enforcement or automatic status change to `expired`.

**Reasoning:** Staff can choose to honor or reject expired coupons at their discretion. Hard server-side expiry creates bad customer experiences (coupon disappears right at the counter). Soft expiry + staff judgment is the right MVP model.

**Risk:** A determined customer could redeem a coupon after its displayed expiry date if staff don't check.
