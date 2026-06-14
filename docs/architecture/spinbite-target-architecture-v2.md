# SpinBite Target Architecture v2

**Document version:** 2.0  
**Date:** 2026-06-14  
**Status:** Living reference — update as product decisions evolve  
**Audience:** Engineering, product, and future AI coding sessions

---

## 1. Executive Summary

SpinBite is evolving into an **AI-first Restaurant Revenue Operating System**.

The platform combines multiple product surfaces into a unified growth engine for restaurants:

| Surface | Purpose |
|---|---|
| QR Menu | Customer-facing digital menu and discovery |
| Merchant Menu Operations | Admin menu builder for restaurant operators |
| Commerce Promotions | Sales-lift discounts and promotional overlays |
| Game-Based Engagement | Dopamine-driven customer capture and retention |
| Coupon / Wallet Redemption | Reward delivery and claim tracking |
| Customer Identity | Phone-based identity and profile building |
| Communication Campaigns | SMS, push, email, wallet pass campaigns |
| POS / Order Attribution | Long-term transaction and kitchen integration |
| AI Revenue Optimization | Autonomous or assisted revenue goal execution |

The near-term product must stay simple and operationally clean. The long-term architecture must remain AI-controllable at every layer. The highest priority is to make the foundational primitives — menu, item, promotion, reward, coupon, customer, campaign — clean and consistent before introducing AI automation.

---

## 2. Product Evolution

SpinBite's platform has evolved in distinct phases. Each phase builds on the previous without replacing it.

### Phase 0 — QR Game → Coupon → Redemption
The original product. Customers scan a QR code, play a spin wheel game, win a coupon, and redeem it at the counter.

### Phase 1 — QR Menu + Promotion Modal
A browsable digital menu was added alongside the game. A promotion modal introduced the ability to show promotional context on the QR menu experience.

### Phase 2 — Merchant OS Menu Builder
A full restaurant admin panel was built: restaurant profiles, menu management, category management, item management, featured/chef special/popular/sold-out merchandising states. This is the Merchant OS.

### Phase 3 — Commerce Promotion Engine
A structured promotion system that decouples discount logic from menu item data. Promotions can target items, categories, or the whole restaurant. Display modes include direct discount, badge-only, and tap-to-reveal.

### Phase 4 — Engagement Engine with Visible Reward Pool
The spin wheel game is redesigned around a visible reward pool card. The customer can see the possible prizes before playing. The exact reward remains a surprise. Game promotions are separated from commerce promotions.

### Phase 5 — Customer Identity + Communication Layer
Phone number capture enables persistent customer profiles. SpinBite becomes the communication layer between restaurant and customer via SMS, push, email, and wallet passes.

### Phase 6 — POS / Order Attribution
SpinBite integrates with the restaurant's POS to attribute transactions to customer profiles and promotion interactions.

### Phase 7 — AI Revenue Optimization Engine
The north-star phase. Restaurants define revenue goals in natural language. AI proposes and executes changes across menu, promotions, games, and campaigns.

---

## 3. Core Architecture Principles

These principles guide all platform design decisions. When in doubt, return to these.

1. **Menu is catalog, not promotion logic.** The menu system defines what exists and how it is structured. Promotion logic lives in a separate engine.

2. **Promotions are overlays, not columns on menu_items.** Never add `discount_price`, `is_promoted`, or similar columns directly to the `menu_items` table. Promotions are computed and applied at display time.

3. **Merchandising tags are different from commerce promotions.** Tags like "Chef Special", "Popular", and "Featured" are editorial signals for customer discovery. They are not discount mechanisms.

4. **Commerce promotions are different from engagement game promotions.** Commerce promotions produce immediate sales lift through discounts. Game promotions produce engagement, customer capture, and retention. They share infrastructure but serve distinct goals.

5. **Games are used for dopamine, entertainment, customer capture, and retention.** Do not conflate games with a discount delivery mechanism. The game experience must be intrinsically rewarding regardless of the prize.

6. **Normal promotions are used for immediate sales lift.** They are operational tools for the restaurant, not engagement experiences.

7. **Restaurant owns the customer relationship, but SpinBite owns communication infrastructure.** Restaurants have the right to communicate with their customers. SpinBite is the channel. Campaigns must flow through SpinBite to preserve data integrity and compliance.

8. **Build every subsystem so AI can control it later.** Every engine should have clean, structured inputs and outputs that an AI agent can read and modify without human intervention.

9. **Do not build AI automation before the operational primitives are stable.** AI on top of broken primitives produces broken AI. Fix the foundation first.

---

## 4. Platform Engines

### A. Merchant OS

The admin-facing restaurant management system.

- Restaurant groups (multi-location support)
- Locations (individual restaurant instances)
- Menus (multiple menus per location)
- Categories (within menus)
- Menu items (within categories)
- Item merchandising states:
  - Featured
  - Chef Special
  - Popular
  - Sold Out
- *(Future)* AI menu import from PDF, photo, or URL

### B. Commerce Engine

The promotion system for direct sales lift. Operates independently from the game engine.

**Promotion targets:**
- Item-level promotions
- Category-level promotions
- Restaurant-wide promotions

**Display modes:**
- **Direct discount** — shows old price with strikethrough and new promotional price
- **Badge only** — shows a badge label without revealing the price change until checkout
- **Tap to reveal** — customer taps an item to reveal the promotional price

**Priority system:**
- Multiple active promotions can exist simultaneously
- At display time, the highest-priority active promotion wins per item
- Future: stackable promotions may be supported, but this is explicitly not MVP

### C. Engagement Engine

The game-based customer capture and retention system.

**Game types:**
- Spin wheel (current)
- Scratch card (future)
- Additional game formats (future)

**Reward types:**
- Menu items
- Percentage or fixed discounts
- Custom free-form rewards

**Modified C model (current UX decision):**
- The game appears separately from the menu as a distinct widget or section
- The reward pool is visible before playing (customer can see what is possible)
- The exact reward remains a surprise until the game resolves
- Do **not** place "Play to Win This" badges on individual menu items

**Claim flow:**
- Phone number is required to **claim** a reward
- Phone number is **not** required to **play** the game
- This maximizes play engagement while capturing identity at the moment of value exchange

**Future:**
- Wallet pass delivery
- Coupon expiry and pass management

### D. Customer Experience Layer

The QR-accessed, customer-facing product surface.

- QR menu (browsable, filterable)
- Filter chips (dietary, category, badge filters)
- Promotion badges (applied by commerce engine at render time)
- Game widget (engagement engine entry point)
- *(Future)* Direct ordering from menu

### E. Customer Intelligence Engine

The identity and behavior tracking layer.

- Phone number as primary identity anchor
- Anonymous session first — identity is progressive
- *(Future)* Progressive identity enrichment
- Coupon redemption history
- *(Future)* Order attribution linkage
- *(Future)* Purchase behavior profiling
- *(Future)* Personalization signals

### F. Communication Engine

The restaurant-to-customer communication infrastructure.

- Restaurant owns the customer relationship
- All campaigns must route through SpinBite
- SpinBite is the channel, not the data exporter
- No unrestricted raw customer export as a default capability
- **Supported channels (future roadmap):** SMS, wallet pass, email, push notification

### G. POS / Ordering Layer

Long-term integration with restaurant point-of-sale and ordering systems.

- SpinBite augments POS; it does not replace it immediately
- POS remains the system of record for transaction, payment, and kitchen operations
- SpinBite owns customer experience, engagement, attribution, and intelligence
- *(Long-term)* Direct ordering through QR menu
- *(Long-term)* SpinBite as the ordering frontend with POS as the fulfillment backend

### H. AI Revenue Optimization Engine

The long-term north star of the platform.

**Goal input:** Restaurant operator states a revenue goal in natural language.
> *Example: "Increase pasta sales by 20% today."*

**AI proposes and eventually executes:**
- Merchandising changes (reordering, featuring, tagging)
- Commerce promotion creation and adjustment
- Game reward pool adjustments
- Customer communication campaigns
- Pricing experiments and promotional testing

**Maturity stages:**
1. **AI assistant** — surfaces insights and recommendations, human executes
2. **AI copilot** — proposes full action plans, human approves each step
3. **Autonomous revenue agent** — executes with post-hoc human review

Human approval is required in early phases. Autonomous execution is a long-term milestone, not an immediate build target.

---

## 5. Target Data Model Concepts

These are conceptual table definitions. Do not treat these as final migrations. They document intent for schema design.

### Core Catalog

| Table | Purpose |
|---|---|
| `restaurant_groups` | Multi-location organization entity |
| `restaurants` / `locations` | Individual restaurant or location record |
| `menus` | Menu instance per location |
| `categories` | Category within a menu |
| `menu_items` | Individual item within a category |
| `item_merchandising_state` | Editorial flags: featured, chef special, popular, sold out |

### Commerce Promotion System

| Table | Purpose |
|---|---|
| `commerce_promotions` | Promotion record with type, value, date range, priority |
| `commerce_promotion_targets` | Links promotion to restaurant, category, or item |

**`commerce_promotion_targets` key fields:**
```
target_type  — enum: 'restaurant' | 'category' | 'item'
target_id    — FK to the appropriate table
priority     — integer, higher wins
display_mode — enum: 'direct_discount' | 'badge_only' | 'tap_to_reveal'
```

### Engagement System

| Table | Purpose |
|---|---|
| `engagement_promotions` | Game promotion record |
| `engagement_reward_pool` | Possible rewards visible to the customer before play |
| `coupons` | Issued coupon/reward after game resolution |

### Customer System

| Table | Purpose |
|---|---|
| `customer_profiles` | Persistent customer record |
| `customer_identities` | Identity linkage (phone, device, email) |

### Communication System

| Table | Purpose |
|---|---|
| `communication_campaigns` | Campaign definition, audience, channel, content |

### Attribution and AI

| Table | Purpose |
|---|---|
| `order_attributions` | Links POS transaction to customer, coupon, or promotion |
| `ai_revenue_goals` | Operator-stated revenue goal in natural language |
| `ai_action_plans` | AI-proposed set of actions to achieve a goal |
| `ai_action_executions` | Record of each AI action taken, with approval state |

---

## 6. Key Product Decisions Already Made

These decisions are locked. Do not re-litigate them without explicit product review.

| Decision | Detail |
|---|---|
| Commerce and game promotions coexist | Both systems must operate independently and simultaneously |
| Commerce promotion targets | Item, category, or restaurant — all three must be supported |
| Hybrid display behavior | A promotion can have different display modes per target |
| Direct discount display | Must show old price with strikethrough and new price |
| Game promotions use Modified C | Separate game widget, visible reward pool, no per-item "Play to Win This" badges |
| Promotion priority | Multiple promotions can exist; highest priority active promotion wins per item |
| POS integration is long-term | Not a near-term build target |
| Direct ordering is long-term | Not a near-term build target |
| Multi-location support required | Restaurant groups and multi-location menus must be fully supported |
| Phone number at claim, not play | Customer plays anonymously; identity captured at reward claim |
| Campaigns run through SpinBite | Restaurant owns relationship; SpinBite is the channel |
| AI is north star, basics first | AI optimization is the long-term goal; operational primitives must be stable first |

---

## 7. Recommended Build Sequence

### Immediate
- Stabilize the menu builder (Merchant OS)
- Stabilize the QR menu (Customer Experience Layer)
- Remove UX friction from both surfaces
- Clean up copy and admin terminology for clarity

### Next
- **Commerce Promotion Engine v1**
  - Item, category, and restaurant-level targets
  - Direct discount and badge-only display modes
  - Priority engine (highest priority active promotion wins)

### Then
- **Engagement Engine redesign**
  - Visible reward pool card (Modified C)
  - Wallet pass and coupon polish

### Then
- **Customer Identity + Communication Campaigns**
  - Phone number identity
  - Campaign creation and delivery infrastructure

### Later
- POS integration and order attribution

### Much Later
- Direct ordering and payment
- AI copilot (proposal + human approval)
- Autonomous revenue agent

---

## 8. Explicit Non-Goals For Now

The following are **explicitly out of scope** for current build cycles. Do not design toward them, and do not let them influence near-term architecture decisions.

| Non-Goal | Reason |
|---|---|
| Full POS integration | Long-term strategic; premature complexity now |
| Full direct ordering and payment | Long-term strategic; POS is system of record |
| Autonomous AI | Requires stable primitives first |
| Complex promotion stacking rules | Priority winner is sufficient for MVP |
| Unrestricted customer data export | Conflicts with campaign integrity and compliance model |
| Multi-POS certification | Premature until POS integration is proven |
| AI image/video generation as core dependency | Fragile dependency for a core operational feature |
| Promotion rule engine beyond priority winner | Overengineered for current scale and use cases |

---

## 9. Architecture Risks

| Risk | Description |
|---|---|
| Platform scope creep | Adding too many features before the core primitives are stable |
| Building AI too early | AI on top of broken primitives produces broken AI |
| Mixing menu and promotion data | Discount columns on `menu_items` create long-term coupling debt |
| Promotion columns on menu_items | Specifically: adding `discount_price`, `is_promoted`, etc. directly to the item table |
| Building POS integration too early | Creates integration complexity before the product is proven |
| Building ordering and payment too early | Payment infrastructure and POS competition are high-risk diversions |
| Confusing merchandising badges with promotions | "Chef Special" is editorial; "20% off" is commerce — conflating them breaks both systems |
| Overcomplicating promotion stacking | Stacking rules add exponential edge cases; defer until priority-winner model is proven |

---

## 10. Final CTO Summary

SpinBite should be built as a **Restaurant Revenue Operating System**.

The near-term product must stay simple. The long-term architecture must remain AI-controllable.

The highest priority is to make the operational primitives clean:

> **menu → item → promotion → reward → coupon → customer → campaign**

AI comes after these primitives are stable, observable, and reliable. Every subsystem should be designed with clean structured inputs and outputs so that an AI agent can read and act on it later — but the AI agent itself should not be built until the foundation it would operate on is solid.

The platform wins by giving restaurants a complete, integrated revenue operating system — not by being the most technically complex platform in the market.

---

*This document is the source of truth for SpinBite's target architecture. Future Claude and Codex sessions should treat it as the primary architectural reference before making product or schema decisions.*
