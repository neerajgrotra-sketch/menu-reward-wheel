# SpinBite Phase 3 Product Strategy

**Date:** 2026-06-09  
**Status:** Planning  
**Branch:** feature/phase-3-planning  
**Baseline:** v0.3.0-restaurant-experience

---

## Context

SpinBite has shipped:

- **v0.1:** Core spin-wheel promotion engine (play session, coupon, QR)
- **v0.2:** Restaurant profile, admin experience, multi-tab management
- **v0.3:** Public menu experience, permanent restaurant QR, 6 print-ready formats

The product can now acquire restaurants, let them build menus, and send customers to a branded landing page that either shows the menu, launches a promotion, or both. The foundation is solid enough to layer monetisation and growth features.

Phase 3 must decide: what do we build next to (a) retain the restaurants we have, (b) close new accounts faster, and (c) create a story investors and acquirers find compelling.

---

## Capability Evaluations

---

### 1. Analytics

**What it is:** Restaurant-owner dashboard showing scans, plays, coupon redemptions, top items viewed, peak hours, and funnel drop-off.

| Dimension | Assessment |
|---|---|
| Business value | **Very high.** Without analytics, restaurants cannot prove ROI. No proof of ROI = churn. |
| Restaurant demand | **Highest of all candidates.** Every pilot restaurant will ask "how many people scanned this week?" before month 2. |
| Investor value | **High.** Engagement and retention metrics become visible; the pitch story moves from "we built it" to "restaurants that use it see X scans/week." |
| Technical complexity | **Low–medium.** Scan events are already implied (every `/r/[slug]` hit, every `/play/…` load). Adding an `events` table and a simple aggregation API is a few days of work. A React dashboard with weekly/monthly charts is another week. No ML required. |
| Dependencies | Needs `events` table and server-side logging middleware on `/r/[slug]` and `/play/…`. No external service required. |
| Revenue potential | Analytics is typically a tier-gate feature (basic free, detailed paid). Creates the first natural upsell moment. |

**Risk:** Restaurants will use analytics to benchmark against their own expectations. If numbers look low because the restaurant hasn't promoted their QR code yet, it can generate support overhead. Needs framing guidance.

---

### 2. AI Menu Import

**What it is:** Restaurant owner pastes a URL or uploads a PDF/image of their existing menu. AI extracts items (name, description, price, category) and populates the SpinBite menu database in one step, replacing the current manual row-by-row entry.

| Dimension | Assessment |
|---|---|
| Business value | **Very high.** The single biggest friction point in onboarding is menu data entry. A restaurant with 80 items will not enter them by hand. AI import turns a 4-hour task into a 4-minute one. |
| Restaurant demand | **Very high.** Reduces time-to-first-QR-deployed from days to minutes. |
| Investor value | **High.** Demonstrates AI-native positioning; dramatically improves activation rate, which is the SaaS metric most investors ask about after MRR. |
| Technical complexity | **Medium.** Claude API with vision (for PDFs/photos) or tool use (structured extraction). Requires: a review/edit step before saving (restaurants will always have corrections), error handling for ambiguous items, and storage for extracted images. The API cost per import is small (a single multi-turn conversation). |
| Dependencies | Claude API access (already on the platform). Needs an import staging UI — show extracted items for review before committing. |
| Revenue potential | Could be a paid add-on ("AI Onboarding") or included in all paid tiers as an activation hook. If it converts trials to paid accounts faster, the indirect revenue impact exceeds any direct pricing. |

**Risk:** Extraction accuracy varies with menu format quality. A "one-click import" promise that produces 30% errors destroys trust. Must include a clean review/confirm step.

---

### 3. AI Description Generation

**What it is:** For any menu item with a name (and optionally a price/category), generate a short, appetising description in the restaurant's voice. The admin sees a "Generate" button next to each empty description field.

| Dimension | Assessment |
|---|---|
| Business value | **High.** Most restaurants have items with no descriptions. Good descriptions increase menu item engagement and perceived quality. |
| Restaurant demand | **Medium–high.** Restaurants know they should write descriptions; they don't have time. An AI that does it in one click is immediately useful. |
| Investor value | **Medium.** A nice story but table-stakes AI for 2026; not a differentiator on its own. |
| Technical complexity | **Very low.** Single Claude API call per item. UI is one button per description field. Can share the same API infrastructure as AI Menu Import. |
| Dependencies | Claude API. Menu item model already has `description` field (Phase 2A). |
| Revenue potential | Could be metered (X free generations/month, then paid) or bundled into all paid tiers. Low direct revenue but high activation value. |

**Risk:** Minimal. Worst case is the restaurant ignores the suggestion and types their own. Unlike AI Menu Import, no data integrity risk.

---

### 4. AI Image Enhancement

**What it is:** Restaurant uploads a phone photo of a dish. AI removes background, improves lighting, and generates a clean product-style image suitable for the menu card.

| Dimension | Assessment |
|---|---|
| Business value | **Medium.** Better images increase item click-through. But a restaurant with no images still functions; this is polish. |
| Restaurant demand | **Medium.** Restaurants want good photos but many will not use this feature unless it's extremely simple. |
| Investor value | **Medium.** Good demo moment but not a business-model differentiator. |
| Technical complexity | **High.** Background removal + image enhancement requires a specialised vision API (e.g. fal.ai, Replicate). Not a simple Claude call. Adds a new external vendor dependency, storage costs, and latency. |
| Dependencies | External image AI API, Supabase Storage (already exists), significant new backend work. |
| Revenue potential | A premium feature; could justify a higher tier. But the market for "AI food photography" is crowded. |

**Risk:** Quality variance is high. A bad AI-enhanced food photo is worse than the original. Requires significant prompt engineering and quality gates.

---

### 5. Loyalty

**What it is:** Track repeat customer visits and reward them (free item, discount, VIP status) after N visits or X points. Customers identify via the phone number captured in Phase 2C (Customer Identity Foundation).

| Dimension | Assessment |
|---|---|
| Business value | **Very high.** Loyalty is the #1 reason restaurants pay for technology. It converts one-time visitors to regulars and provides the clearest ROI story. |
| Restaurant demand | **Highest long-term demand.** Every QSR and casual dining operator wants a loyalty programme. |
| Investor value | **Very high.** Loyalty programmes create network effects (customers return), recurring engagement data, and a strong moat. This is the "Shopify Loyalty" play. |
| Technical complexity | **High.** Requires: visit/point ledger, reward tier configuration, customer-facing progress UI, staff redemption flow, and integration with the phone identity system. Not insurmountable but meaningful scope. |
| Dependencies | Customer Identity Foundation (Phase 2C — phone + consent capture). Must be shipped before Loyalty is useful. Customer Identity must be validated in production first. |
| Revenue potential | **Highest of all candidates.** Loyalty programmes are sticky; restaurants pay monthly for them ($50–$300/mo in the market). Creates the most defensible pricing tier. |

**Risk:** Loyalty requires customers to opt in and return. In the early market (few restaurants, limited customer base), the network effect is small. It's the right long-term investment but slower to show ROI than analytics.

---

### 6. Wallet Passes

**What it is:** After a customer plays and wins, they receive an Apple Wallet or Google Wallet pass containing their coupon. The pass shows on their lock screen near the restaurant's GPS coordinates.

| Dimension | Assessment |
|---|---|
| Business value | **High.** Lock-screen presence is the highest-value notification channel that doesn't require an app. Dramatically increases coupon redemption rate. |
| Restaurant demand | **Medium.** Restaurants understand this is valuable but may not ask for it unprompted. |
| Investor value | **High.** "No app required — but customers still get wallet passes" is a powerful demo moment. Differentiates from simple QR coupon tools. |
| Technical complexity | **Medium.** Apple PassKit + Google Pay Passes APIs are well-documented. Requires a signing key setup, a pass template, and a Supabase Edge Function to issue signed passes. Libraries exist. |
| Dependencies | Coupon system (already exists). Optionally integrates with Loyalty (pass updates as points accumulate). |
| Revenue potential | Wallet pass issuance could be a paid feature or part of a Pro tier. Low incremental cost per pass after setup. |

**Risk:** Pass update/invalidation is important — if a coupon expires, the pass must update. This adds real-time webhook complexity.

---

### 7. CRM

**What it is:** A restaurant-facing view of their customer list: phone numbers, visit frequency, last visit, total plays, coupons redeemed, and the ability to segment customers (e.g. "visited 3+ times, no visit in 30 days").

| Dimension | Assessment |
|---|---|
| Business value | **High.** Without a CRM, the phone number database collected via Customer Identity is inert. The CRM is what makes that data actionable. |
| Restaurant demand | **Medium.** Independent restaurants rarely ask for CRM by name, but they do ask "can I see who my regulars are?" — which is the same thing. |
| Investor value | **Medium–high.** CRM data demonstrates network effects: SpinBite knows which customers visit which restaurants, enabling cross-restaurant insights. |
| Technical complexity | **Medium.** Primarily a read-heavy data display layer over existing tables. No new data models needed beyond what Loyalty will create. A filterable/sortable table with export is the core deliverable. |
| Dependencies | Customer Identity Foundation (phone capture). Most valuable after Loyalty creates visit records. Can ship a basic version before Loyalty. |
| Revenue potential | CRM is a natural tier-gate feature. "See your full customer list" is an obvious paid upgrade from a free tier that only shows aggregate stats. |

**Risk:** Data privacy and consent management. Restaurants must only see customers who have consented. Consent provenance must be airtight before presenting customer-level data in the UI.

---

### 8. SMS Marketing

**What it is:** Restaurant can compose a text message and send it to segmented customer lists (e.g. "customers who haven't visited in 30 days"). Messages include a link back to the restaurant's /r/[slug] page.

| Dimension | Assessment |
|---|---|
| Business value | **Very high for retention.** SMS open rates are 95%+. A "we miss you" message with a promotion link drives immediate foot traffic. |
| Restaurant demand | **High.** This is the most commonly requested marketing feature after analytics in the SMB restaurant market. |
| Investor value | **High.** SMS marketing creates a recurring, measurable revenue event (messages sent = platform usage). |
| Technical complexity | **High.** Requires: Twilio (or equivalent) integration, opt-in/opt-out compliance (TCPA/CASL), unsubscribe handling, message templates, send scheduling, and delivery reporting. Compliance is the hard part. |
| Dependencies | Customer Identity with explicit SMS consent, CRM for segmentation, Twilio API. CASL/TCPA compliance work is non-trivial. |
| Revenue potential | SMS can be billed per message or as a monthly send-volume tier. High direct revenue potential but also high ongoing cost (Twilio charges per SMS). Margin depends on pricing. |

**Risk:** Regulatory compliance (opt-in, opt-out, frequency) is serious. One SPAM complaint from a restaurant mis-using the tool creates platform liability. Must build consent management and suppression lists before launch.

---

### 9. Email Marketing

**What it is:** Similar to SMS but via email: restaurant sends branded HTML emails to their customer list with promotions, new menu items, or loyalty updates.

| Dimension | Assessment |
|---|---|
| Business value | **Medium.** Email is powerful at scale but restaurants typically don't have customer email addresses — they have phone numbers (captured at play time). Email requires a separate opt-in flow. |
| Restaurant demand | **Medium.** Restaurants want email marketing in principle but the data problem (no emails) makes it a weaker short-term tool than SMS. |
| Investor value | **Medium.** Expected in a full marketing platform but not differentiating. |
| Technical complexity | **Medium.** SendGrid/Resend integration is straightforward. The constraint is email address collection, not the sending infrastructure. |
| Dependencies | Email address capture (not currently in the Customer Identity flow), CRM. |
| Revenue potential | Similar to SMS but lower cost-per-message. Standard SaaS pricing for email tier. |

**Risk:** Lower than SMS from a compliance standpoint (CAN-SPAM is less strict than TCPA), but the data acquisition problem reduces near-term impact.

---

### 10. Multi-location Enterprise Features

**What it is:** Features to support restaurant groups with 5–50+ locations: centralized menu management, cross-location analytics, franchise brand controls, bulk QR deployment, and a different admin hierarchy (corporate vs. location manager accounts).

| Dimension | Assessment |
|---|---|
| Business value | **Very high, but narrow.** One enterprise customer can be worth 20 independent restaurants in revenue. This opens the B2B mid-market. |
| Restaurant demand | **Low in the current customer base.** Independent operators don't need this. Enterprise chains have longer sales cycles and demand pilots. |
| Investor value | **Very high.** Enterprise features multiply ACV, demonstrate scalability, and signal TAM expansion beyond indie restaurants. |
| Technical complexity | **Very high.** Requires org hierarchy data model, role-based access (corporate vs. location), inherited vs. overridden settings per location, cross-location reporting, and a completely different admin UX. |
| Dependencies | Stable single-location product. Enterprise customers will surface edge cases in every existing feature. Premature enterprise work creates technical debt across the codebase. |
| Revenue potential | **Highest per-account** of any candidate. Enterprise contracts in restaurant tech are $500–$5,000/mo for mid-size chains. |

**Risk:** Building enterprise features before the product is stable at a single location is a classic startup trap. Every enterprise customer becomes a custom engagement. Recommend deferring until v0.5 or later.

---

## Recommended Roadmap

### Phase 3: Activation & Retention Foundation

**Theme:** Make every restaurant successful in their first 30 days.

**Sequence and rationale:**

```
Phase 3A — Analytics (2–3 weeks)
Phase 3B — AI Description Generation (1 week, runs parallel with 3A)
Phase 3C — AI Menu Import (2–3 weeks)
Phase 3D — Wallet Passes (2 weeks)
```

**3A — Analytics first because:**
Churn happens before month 2 when restaurants can't answer "is this working?" Analytics is the lowest complexity, highest impact item. Build the events table and a weekly scans/plays/redemptions dashboard. This also generates the data storytelling needed for investor updates and sales calls.

**3B — AI Description Generation alongside 3A because:**
One-week scope. Single Claude API call per item. The Phase 2A menu edit UI already has description fields — this is a "Generate" button drop-in. Ships quickly and makes the product feel AI-native without the complexity of Menu Import. Improves menu quality immediately for existing restaurants.

**3C — AI Menu Import because:**
The single biggest onboarding blocker. After Analytics gives us retention, this improves activation. A restaurant that imports their 80-item menu in 5 minutes instead of 4 hours has a fundamentally different first impression of the product. Also unlocks the "show at investor demo" moment.

**3D — Wallet Passes because:**
After the menu experience is strong and analytics prove usage, wallet passes increase coupon redemption rates — which is the metric restaurant owners talk about to other restaurant owners. Word-of-mouth is the primary growth channel for SMB restaurant tech. A higher redemption rate = better word-of-mouth = organic growth.

---

### Phase 4: Loyalty & CRM (after Phase 3)

```
Phase 4A — Customer Identity hardening (confirm Phase 2C is production-solid)
Phase 4B — Loyalty programme (visit tracking, point ledger, reward tiers)
Phase 4C — CRM (customer list, segmentation, export)
```

Loyalty is the highest long-term revenue and retention play. It requires Customer Identity to be rock-solid first. CRM follows Loyalty naturally because it needs the visit/point data to be meaningful.

---

### Phase 5: Marketing & Growth (after Phase 4)

```
Phase 5A — SMS Marketing (with full compliance infrastructure)
Phase 5B — Email Marketing (add email capture to identity flow)
```

SMS and Email are powerful but have regulatory overhead that warrants a dedicated compliance sprint. Building them after Loyalty means the customer segments they operate on actually have data.

---

### Phase 6: Enterprise (after v0.5)

```
Phase 6 — Multi-location / Enterprise Features
```

Defer until the product is stable, the team has operational capacity for enterprise sales cycles, and at least one anchor enterprise customer has been identified to scope requirements against.

---

## Priority Matrix Summary

| Capability | Phase | Why This Order |
|---|---|---|
| Analytics | 3A | Prevents churn; lowest complexity; unblocks investor narrative |
| AI Description Generation | 3B | 1-week drop-in; activates menus immediately |
| AI Menu Import | 3C | Biggest onboarding unlocker; needs Analytics shipped first for context |
| Wallet Passes | 3D | Increases redemption rate → word-of-mouth growth |
| Loyalty | 4B | Highest revenue potential; requires Customer Identity stable |
| CRM | 4C | Follows Loyalty data |
| SMS Marketing | 5A | High value but compliance-heavy; needs CRM for segmentation |
| Email Marketing | 5B | Needs email capture addition to identity flow |
| AI Image Enhancement | Backlog | High complexity; moderate demand; revisit when image quality is a sales blocker |
| Enterprise Features | 6 | Deferred until product stability and identified enterprise prospect |

---

## Open Questions for Phase 3 Kickoff

1. **Analytics storage:** Append-only `events` table in Supabase or a purpose-built analytics sink (PostHog, Plausible)? Self-hosted keeps all data in the existing stack; third-party is faster to ship.

2. **Claude API budget for AI features:** Menu Import + Description Generation will incur per-call costs. What is the per-restaurant monthly budget tolerance? This determines whether AI features are tier-gated or included for all plans.

3. **Wallet Pass signing keys:** Apple PassKit requires a registered Apple Developer account and certificate provisioning. Is this already in place?

4. **Customer Identity status:** Phase 2C (phone + consent capture) is described in memory as the schema and API existing. Has it been deployed to production and validated with real scans? Loyalty in Phase 4 cannot start until this is confirmed.

5. **Pricing model:** Phase 3 features (especially Analytics) are natural tier-gate candidates. Should Phase 3 ship with a paid tier in place, or continue building toward a pricing gate at v0.4/v0.5?
