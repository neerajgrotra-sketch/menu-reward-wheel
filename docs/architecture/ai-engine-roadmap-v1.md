# SpinBite AI Revenue Engine Roadmap v1

_Concept document — no implementation planned until operational primitives are stable_  
_Audit date: 2026-06-15_

**Update 2026-07-09:** the first real (narrow) implementation of this doc's core pattern — structured intent, human-approval gate, no autonomous execution — shipped as "Ask SpinBite" menu discount actions. See [`ask-spinbite-ai-agent-v1.md`](./ask-spinbite-ai-agent-v1.md), which also flags an unresolved tension with this doc's Constraint #1 ("No price manipulation") that needs product review — that feature changes `menu_items.special_*` fields, which this constraint didn't anticipate since it predates the columns it would apply to.

---

## Vision

A restaurant owner types one sentence:

> "Increase pasta sales by 20% this week."

SpinBite's AI Revenue Engine reads this, reasons about the menu and customer data, and automatically:

1. Identifies which pasta items to target
2. Designs an appropriate reward (free pasta sauce? 20% off pasta entrée?)
3. Creates and configures a game promotion
4. Selects the most engaging game type based on past performance
5. Schedules the promotion for peak traffic hours
6. Sends a notification to past customers who ordered Italian
7. Reports back with real-time progress toward the 20% goal

The restaurant owner's only job is to approve the proposal or adjust it.

---

## Pre-Conditions (Must Be Stable First)

Per ADR-013, AI automation cannot be built until these primitives are clean and reliable:

| Primitive | Status (2026-06-15) |
|-----------|-------------------|
| Menu catalog (`menus`, `menu_sections`, `menu_items`) | Stable |
| Promotion engine (`promotions`, `promotion_rewards`) | Stable |
| Game engine (contract registry, runtime dispatch) | Stable |
| Coupon generation (`coupon_redemptions`) | Stable |
| Customer identity (`customer_profiles`) | Stable, early |
| Analytics pipeline | NOT YET BUILT |
| Communication engine (SMS/push/email) | NOT YET BUILT |
| POS integration (order attribution) | NOT YET BUILT |

AI automation requires at minimum: analytics pipeline + communication engine. Without these, the AI has no signal to optimize and no channel to act on.

---

## Architecture Concept

### Layer 1 — Structured Input API ("Intent API")

The AI engine speaks to SpinBite through the same structured APIs a human admin uses, but programmatically. Every action the AI takes must be expressible as a structured API call.

```
AI Intent: "increase pasta sales"
         ↓
Intent Parser
         ↓
Structured Plan:
{
  "target_items": ["uuid-pasta-1", "uuid-pasta-2", "uuid-pasta-3"],
  "reward_type": "free",
  "reward_item": "uuid-pasta-sauce",
  "game_type": "mystery_box",
  "weight_configuration": { "spin_wheel": 0.4, "mystery_box": 0.6 },
  "schedule": { "starts_at": "2026-06-16T11:00:00Z", "ends_at": "2026-06-22T23:00:00Z" },
  "max_spins": 1,
  "coupon_expiry_minutes": 30
}
```

**Key principle:** The AI proposes; the human approves. No autonomous execution without a confirmation gate.

---

### Layer 2 — Goal Parser

Converts natural language revenue goals into structured optimization targets.

**Input:** Natural language from restaurant owner  
**Output:** Structured goal object

```
{
  "type": "revenue_lift",
  "target_metric": "item_orders",
  "target_items": [...],
  "lift_percent": 20,
  "timeframe_days": 7,
  "current_baseline": { "avg_daily_pasta_orders": 45 }
}
```

**Required signals:**
- Menu catalog (which items are "pasta")
- Historical order data (current baseline) — requires POS integration or manual entry
- Customer segment data (who has ordered pasta before)

---

### Layer 3 — Strategy Engine

Maps a goal + current data → a promotion strategy recommendation.

**Reasoning process:**

1. **What should the reward be?** — Select reward type (free item, discount, bonus) based on historical redemption rates for similar promotions
2. **Which game type?** — Based on analytics: which game type has historically driven the most conversions for this restaurant type / cuisine
3. **What weight?** — If multiple games, weight toward higher performers
4. **When to schedule?** — Based on historical peak traffic hours (requires play_sessions timestamps and QR scan data)
5. **Who to notify?** — Customers who have eaten at this restaurant, consented to marketing, and match the pasta category

**Data inputs required:**
- `play_sessions` aggregate by time-of-day / day-of-week
- `coupon_redemptions` by `promotion_reward_id` (which rewards convert)
- `customer_profiles` with order history (requires POS integration)
- Previous promotion performance data

---

### Layer 4 — Proposal UI

The AI presents a human-readable proposal before any action is taken.

```
SpinBite AI suggests:

Goal: Increase pasta sales +20% this week

Promotion Plan:
  • Game: Mystery Box (your best-performing game — 34% avg conversion)
  • Reward: FREE Pasta Sauce ($4 value) — low cost, high perceived value
  • Schedule: Mon–Fri, 11am–2pm and 5pm–9pm (your peak hours)
  • Notify: 127 past customers who've ordered Italian

Estimated Impact: ~54 coupons issued, ~12 additional pasta orders

[Approve & Launch]  [Modify]  [Decline]
```

---

### Layer 5 — Execution Engine

On human approval, the AI executes the plan by calling existing SpinBite APIs:

1. `POST /api/admin/promotions` — create promotion
2. `POST /api/admin/promotions/{id}/rewards` — add reward pool
3. `POST /api/admin/promotions/{id}/game-assignments` — configure game pool
4. `POST /api/communication/campaigns` — trigger notification
5. `PATCH /api/admin/promotions/{id}` — set status to `active`

**All actions are auditable.** The AI's choices are stored as a `campaign_plan` object linked to the promotion, so the owner can see exactly what the AI decided and why.

---

### Layer 6 — Outcome Tracking

After launch, the AI monitors progress toward the goal.

- Every 24 hours, compare actual redemptions to projection
- If conversion rate is below projection at 48h, propose an adjustment (different game type, higher reward value, broader notification list)
- At campaign end, produce a performance report and feed results back into the strategy engine's training data

**Required:** Real-time analytics pipeline reading `coupon_redemptions` and `play_sessions`.

---

## Future Data Model Extensions

These tables do not exist yet. They are concepts for the AI engine phase.

### `campaign_plans`

```sql
CREATE TABLE campaign_plans (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id),
  promotion_id  uuid REFERENCES promotions(id),
  goal_text     text,         -- original NL input from owner
  goal_parsed   jsonb,        -- structured goal object
  strategy      jsonb,        -- AI-selected strategy
  outcome       jsonb,        -- post-campaign performance
  ai_model      text,         -- model version used
  created_at    timestamptz DEFAULT now(),
  approved_at   timestamptz,  -- when human approved
  approved_by   uuid          -- auth.users.id
);
```

### `analytics_events`

```sql
CREATE TABLE analytics_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  promotion_id  uuid,
  event_type    text NOT NULL, -- 'qr_scan', 'widget_view', 'play_start', 'play_complete', 'reward_claimed', 'coupon_issued', 'coupon_redeemed'
  session_token text,
  game_type     text,
  reward_id     uuid,
  meta          jsonb,
  created_at    timestamptz DEFAULT now()
);
```

---

## Constraints and Guardrails

The AI engine must operate within explicit business constraints:

1. **No price manipulation** — The AI cannot change `menu_items.price`. It can only set `reward_value` on `promotion_rewards`.
2. **Budget cap** — Each AI campaign has a `max_coupon_budget` ceiling. Once issued coupons hit the budget, the promotion is paused automatically.
3. **Human approval gate** — No promotion launches without explicit human approval.
4. **SpinBite as channel** — Customer data stays in SpinBite. The AI cannot export raw customer lists to external systems.
5. **Reversibility** — Every AI action can be reversed: promotions can be ended, notifications cannot be unsent (requires pre-approval gate on notifications).
6. **Transparency** — Every AI decision must be readable by the restaurant owner in plain language.

---

## Build Sequence for AI Engine

| Phase | What | Prerequisite |
|-------|------|-------------|
| AI-0 | Analytics pipeline (event tracking) | Current systems stable |
| AI-1 | Goal Parser (NL → structured goal) | Analytics pipeline |
| AI-2 | Strategy Engine v1 (rule-based, not ML) | Analytics data available |
| AI-3 | Proposal UI in admin dashboard | Strategy Engine |
| AI-4 | Execution Engine (auto-create promotions) | Proposal UI + approval flow |
| AI-5 | Communication integration (SMS campaigns) | Communication Engine built |
| AI-6 | Outcome Tracking + feedback loop | Execution Engine + Analytics |
| AI-7 | ML-based strategy (replaces rules) | 6+ months of outcome data |

---

## Connection to Existing Architecture

The AI engine is an orchestration layer above existing primitives. It does not replace them.

```
Restaurant Owner → Goal Parser
                        ↓
                 Strategy Engine
                        ↓
                   Proposal UI ← Human Approval Gate
                        ↓
              [Approved]
                        ↓
              Promotion API  →  promotions table
              Rewards API    →  promotion_rewards table
              Game API       →  promotion_game_assignments table
              Comms API      →  customer_profiles table (target list)
                        ↓
              Analytics      ←  coupon_redemptions table
                             ←  play_sessions table
                             ←  analytics_events table (future)
```

Every input and output is a structured SpinBite entity. The AI does not have special access — it uses the same API surface as the human admin UI.
