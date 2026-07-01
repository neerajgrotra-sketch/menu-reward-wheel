# SpinBite Intelligence Layer Architecture V1

> **SUPERSEDED.** This doc covers only AI content generation (text/image). Behavioral/session intelligence is a separate, newer system — see [`/architecture/intelligence_engine_v3.md`](/architecture/intelligence_engine_v3.md) (root). For current AI content-generation architecture see `spinbite-platform-architecture-v4.md` §9. Kept for historical reference only.

**Document version:** 1.0  
**Date:** 2026-06-19  
**Status:** Superseded — see above  
**Audience:** Engineering, product, and future AI coding sessions

---

## Executive Summary

SpinBite is evolving from a restaurant promotion engine into an **AI-native restaurant operating system**.

The platform's original architecture centred entirely on human-configured promotions, games, and menus. With the successful production deployment of AI food image generation inside the menu builder, a new foundational layer has been introduced: the **Intelligence Layer**.

This layer is now a first-class architectural domain, sitting alongside the Merchant OS, Commerce Engine, Engagement Engine, and Customer Experience Layer. It is not an experiment. It is not a feature flag. It is a production subsystem serving real restaurant operators today.

The Intelligence Layer changes the character of SpinBite's architecture in a meaningful way. Previously, every action in the platform was initiated by a human and executed by deterministic backend logic. The Intelligence Layer introduces AI-mediated computation as a native capability — a subsystem that can reason about restaurant context and produce outputs (images, text, recommendations, plans) that no deterministic rule engine could produce.

This document records the production architecture of that layer as of its first production release.

---

## 1. Architectural Evolution

### Previous Architecture

Prior to the Intelligence Layer, SpinBite's request-response model was entirely human-driven and linear:

```
Restaurant Admin
      ↓
  Menu Builder
      ↓
Promotion Engine
      ↓
 QR Experience
      ↓
   Customer
```

Every capability required an explicit human action. AI had no place in the processing pipeline. This was appropriate for the platform's early operational phase: get the primitives right before introducing AI.

### Current Architecture

The Intelligence Layer now sits as a lateral subsystem that any other platform engine can invoke:

```
Restaurant Admin
      ↓
Intelligence Layer ←─────────────────────────────┐
      ↓                                           │
  AI Services                                     │
  ┌──────────────────────────────────────────┐    │
  │ Description Engine │ Image Engine │ ...  │    │
  └──────────────────────────────────────────┘    │
      ↓                                           │
  Menu Builder  ────────────────────────────────→─┤
      ↓                                           │
Promotion Engine ──────────────────────────────→─┤
      ↓                                           │
 QR Experience ────────────────────────────────→─┘
      ↓
   Customer
```

The Intelligence Layer does not replace any existing engine. It augments them. Any engine can call into the Intelligence Layer to request AI-mediated computation. Results flow back into the engine that requested them and are persisted through existing platform primitives.

**AI is now a first-class architecture domain.**

This is not a temporary addition. Every future engineering decision about SpinBite's capabilities must account for AI as a core infrastructure component, not an optional enhancement.

---

## 2. Intelligence Layer Overview

### Purpose

The Intelligence Layer is a centralised AI subsystem responsible for all intelligence workloads across the SpinBite platform.

It provides a consistent, provider-agnostic interface through which other platform engines can request AI-mediated operations without caring about the underlying model, provider, or infrastructure.

### Current Responsibilities

| Service | Status | Description |
|---|---|---|
| AI Food Image Generation | Production live | Generate photorealistic food images from item name and context |
| AI Description Generation | Planned | Generate menu item descriptions from item name and cuisine context |
| OCR Menu Import | Future | Extract menu structure from uploaded PDF, photo, or scan |
| Recommendation Engine | Future | Suggest merchandising and promotion decisions based on performance |
| Promotion Optimisation | Future | Evaluate and tune promotion parameters to improve conversion |
| Autonomous AI Agents | Long-term | Agentic execution of multi-step restaurant growth tasks |

### Why This Layer Exists

Without a centralised Intelligence Layer, AI capabilities would proliferate across the codebase in uncoordinated ways:

- Direct model API calls scattered across API routes
- Provider credentials embedded in business logic
- No consistent cost tracking
- No consistent failure handling
- No consistent logging or observability
- No pathway to swap providers without touching business logic

The Intelligence Layer solves all of these by acting as the single integration point between the SpinBite product domain and the AI provider ecosystem.

**Every AI workload in SpinBite must route through the Intelligence Layer.** This is a non-negotiable architectural invariant.

---

## 3. Provider Abstraction Architecture

### Motivation

AI providers are a volatile ecosystem. Models deprecate. Pricing changes. New providers achieve step-change improvements. A platform that is tightly coupled to a single provider will pay an increasing cost over time: either staying on an inferior provider, or undertaking expensive migrations.

The Intelligence Layer uses a **provider abstraction pattern** that decouples business logic entirely from provider implementation. Swapping providers must be a provider-layer concern only.

### Architecture

```
API Route (business logic)
        ↓
Intelligence Engine (domain orchestration)
        ↓
Provider Interface (typed contract)
        ↓
Provider Implementation (provider-specific code)
        ↓
Provider API (Google, OpenAI, etc.)
```

### Current Image Provider

| Component | Value |
|---|---|
| Implementation class | `GoogleImagenProvider` |
| Location | `lib/intelligence/providers/google-imagen-provider.ts` |
| Interface | `ImageIntelligenceProvider` |
| Interface location | `lib/intelligence/providers/image-provider.interface.ts` |

### Provider Interface Contract

All image generation providers must implement `ImageIntelligenceProvider`. The interface defines:

```typescript
interface ImageIntelligenceProvider {
  generateImages(request: ImageGenerationRequest): Promise<ImageGenerationResult>
}

interface ImageGenerationResult {
  images: GeneratedImage[]
  estimatedCostUsd: number
}

interface GeneratedImage {
  base64Data: string
  mimeType: string
  variantIndex: number
}
```

The `estimatedCostUsd` field is mandatory in every provider response. This is the foundation for future AI cost accounting and restaurant billing attribution.

### Supported Future Providers

The following providers are architecturally supported by the abstraction. None require changes to business logic or API routes to integrate:

- `OpenAIImageProvider` — OpenAI image generation API
- `AnthropicImageProvider` — Anthropic image generation (if/when released)
- `StabilityAIImageProvider` — Stability AI image generation
- `ReplicateImageProvider` — Replicate hosted models
- `AWSBedrockImageProvider` — AWS Bedrock image generation models

### Invariant

> **Business logic must never depend on provider implementation details.** Only the provider layer may contain provider-specific code, credentials, authentication flows, or API structures. Everything above the provider interface must be provider-agnostic.

---

## 4. AI Image Generation Architecture

### Product Surface

Restaurant operators access AI image generation directly inside the menu builder. When editing a menu item, a **Generate AI Photo** button initiates the workflow. The system generates multiple visual variants. The operator selects their preferred image, which is then persisted directly to the menu item.

### Complete Production Workflow

```
Restaurant Admin (Menu Item Editor)
              ↓
    [Generate AI Photo] button
              ↓
  POST /api/admin/intelligence/generate-image
              ↓
      Quota Validation Layer
      (check remaining credits for restaurant)
              ↓
      Image Intelligence Engine
      (domain orchestration, logging, error wrapping)
              ↓
      Prompt Construction
      (item name + cuisine context + variant suffix)
              ↓
      Provider Interface
      (ImageIntelligenceProvider.generateImages())
              ↓
      GoogleImagenProvider
      (provider-specific implementation)
              ↓
   ┌──────────────────────────────────────┐
   │    4 Parallel Vertex AI Requests     │
   │  (Promise.allSettled — independent)  │
   │  Req 1 │ Req 2 │ Req 3 │ Req 4      │
   └──────────────────────────────────────┘
              ↓
   Collect successful base64 image responses
   (partial failure tolerated — see §9)
              ↓
   Storage Pipeline
   (upload each image to Supabase Storage)
              ↓
   Asset Metadata Persistence
   (store image URLs, generation job ID, variant index in DB)
              ↓
   Job Status Update (polling endpoint)
   GET /api/admin/intelligence/generate-image/[jobId]
              ↓
   Frontend Polling Loop
   (client polls until status = complete)
              ↓
   Restaurant Operator Selects Preferred Variant
              ↓
   PATCH /api/admin/menu-items/[itemId]
   { image_url: selectedVariantUrl }
              ↓
   menu_items.image_url updated
              ↓
   Image immediately live on QR menu experience
```

### Key Design Decisions

**Async with polling, not synchronous:** Image generation takes 4–15 seconds per request. The endpoint is async — it enqueues the job and returns a job ID immediately. The frontend polls until the job completes. This avoids HTTP timeout issues and provides a responsive UX.

**Storage before selection:** All generated images are uploaded to Supabase Storage before the operator selects a variant. This prevents re-generation requests and ensures all generated images persist regardless of which variant is chosen.

**Single update at selection time:** The final `menu_items.image_url` update is a simple PATCH using the storage URL of the selected variant. No AI logic is involved in this final step.

---

## 5. Parallel Generation Strategy

### The Candidacy Problem

Gemini 2.5 Flash Image does not reliably support `candidateCount > 1`. The Google API documentation confirms that image models support a single image per API request. Requesting multiple candidates results in inconsistent or failed responses.

This creates a challenge: the product requires multiple image variants to give restaurant operators a meaningful choice. Returning a single image is insufficient.

### Architecture Decision

Rather than requesting multiple images in a single API call, the system issues **4 completely independent parallel API requests** and collects the results.

```
Image Intelligence Engine
         ↓
  [Fan-out — 4 requests]
  ↓        ↓        ↓        ↓
 Req1     Req2     Req3     Req4
  ↓        ↓        ↓        ↓
  └────────┴────────┴────────┘
                ↓
       Promise.allSettled()
                ↓
   Collect fulfilled results
                ↓
   Discard rejected results
                ↓
   If all rejected → throw ProviderError
   If ≥1 fulfilled → return images
```

### Implementation

```typescript
const results = await Promise.allSettled([
  provider.generateSingleImage(prompt + VARIANT_SUFFIXES[0]),
  provider.generateSingleImage(prompt + VARIANT_SUFFIXES[1]),
  provider.generateSingleImage(prompt + VARIANT_SUFFIXES[2]),
  provider.generateSingleImage(prompt + VARIANT_SUFFIXES[3]),
])

const images = results
  .filter(r => r.status === 'fulfilled')
  .map(r => r.value)

if (images.length === 0) {
  throw new ProviderError('All image generation requests failed')
}
```

### Rules

| Rule | Value |
|---|---|
| Maximum concurrent requests | 4 |
| Minimum acceptable images | 1 |
| Maximum acceptable images | 4 |
| Partial failure handling | Tolerated — failed slots are silently discarded |
| Complete failure handling | Throws `ProviderError` — triggers credit refund |

A single failed request must never fail the entire generation job. The operator may receive 4 images, 3 images, 2 images, or 1 image — all are successful outcomes.

---

## 6. Prompt Diversification Architecture

### Problem

Without prompt variation, 4 parallel requests to the same model with the same prompt tend to produce visually similar or identical images. This defeats the purpose of offering variants — the operator gains no meaningful choice.

### Solution

Each of the 4 parallel requests receives a slightly different prompt via the **`VARIANT_SUFFIXES`** strategy. The base prompt (derived from the menu item name and context) is held constant. A unique visual direction suffix is appended to each request.

### Current Variant Configuration

```
Variant 1: {basePrompt}
            (base prompt only — no suffix)

Variant 2: {basePrompt}, premium restaurant plating, overhead photography

Variant 3: {basePrompt}, close-up food photography, cinematic lighting

Variant 4: {basePrompt}, food delivery app hero image style, premium presentation
```

Each suffix targets a distinct photographic idiom:

| Variant | Visual Direction | Restaurant Use Case |
|---|---|---|
| 1 | Natural / unguided | General purpose, clean baseline |
| 2 | Premium overhead | Fine dining, upscale presentation |
| 3 | Close-up cinematic | Emphasis on textures, ingredients, craft |
| 4 | Delivery hero style | High-contrast, commercial, digital-first |

### Invariant

> **Prompt diversification must never be removed.** All 4 variants must use distinct visual direction suffixes. Do not generate 4 copies of the same prompt. The visual diversity of the output is a product requirement, not a nice-to-have.

### Future Extension

If the base model improves and `candidateCount > 1` becomes reliable, the architecture should be evaluated for a hybrid approach. However, prompt diversification must be preserved even if the parallelism strategy changes — it is the source of meaningful variant differentiation.

---

## 7. Google Cloud Integration Architecture

### Infrastructure Stack

| Component | Value |
|---|---|
| Provider | Google Vertex AI |
| Model | `gemini-2.5-flash-image` |
| API endpoint | `aiplatform.googleapis.com` |
| Region | `us-central1` |
| GCP project | `spinbite-ai-production` |

### Authentication Architecture

Google Vertex AI requires OAuth 2.0 bearer tokens. The Intelligence Layer uses a **Service Account JWT flow** — no user-impersonation, no interactive OAuth. The service account credentials are stored as an environment variable and never hard-coded.

```
Service Account JSON (env var: GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY)
              ↓
       JWT Construction
       (iss, sub, aud, iat, exp — signed with RSA private key)
              ↓
       JWT Signing
       (RS256 using service account private key)
              ↓
       Token Exchange Request
       POST https://oauth2.googleapis.com/token
              ↓
       OAuth Bearer Token (short-lived)
              ↓
       Vertex AI API Request
       Authorization: Bearer {token}
              ↓
       Vertex AI Response
```

### Environment Variables

| Variable | Purpose |
|---|---|
| `GOOGLE_CLOUD_PROJECT_ID` | GCP project identifier |
| `GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY` | Full service account JSON (base64 or JSON string) |
| `GOOGLE_CLOUD_LOCATION` | Vertex AI region (e.g. `us-central1`) |

These variables must be present in the production environment. The Intelligence Layer will not initialise without them.

### Critical API Requirement

The Gemini API enforces a `role` field on every entry in the `contents` array. This is mandatory — not optional.

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "Photorealistic food photograph: Butter Chicken Curry"
        }
      ]
    }
  ]
}
```

**Omitting `role` produces `400 INVALID_ARGUMENT`.** This is a hard API constraint discovered during production forensic debugging. The field must never be removed, and future prompt construction code must always include it.

Allowed values: `"user"` | `"model"`.

---

## 8. Cost Management Architecture

### The Restaurant's View

From a restaurant operator's perspective, a single **Generate AI Photo** action consumes one image generation credit. The operator sees one action, pays for one action.

### The Platform's View

Internally, one restaurant generation event triggers **4 provider API calls** to produce the 4 variants. These 4 calls are an infrastructure cost absorbed by the platform.

```
Restaurant billing:  1 credit consumed
                          ↕  (billing abstraction)
Platform infrastructure:  4 Vertex AI API calls executed
```

This abstraction is intentional and must be preserved. The platform's decision to fan out to 4 parallel requests is an architectural choice. Restaurants must not be charged per variant slot — that would penalise the quality of the UX.

### Cost Architecture Rules

| Rule | Value |
|---|---|
| Credits billed per generation event | 1 |
| Provider API calls per generation event | 4 (maximum) |
| Credit refund trigger | All 4 provider requests fail |
| Credit deduction timing | After at least 1 successful image returned |

### Provider Cost Accountability

Every provider implementation must return an `estimatedCostUsd` in its response. This is a mandatory field in the `ImageGenerationResult` interface.

```typescript
interface ImageGenerationResult {
  images: GeneratedImage[]
  estimatedCostUsd: number  // REQUIRED — must never be omitted
}
```

This field is the foundation for future AI cost accounting: tracking per-restaurant provider spend, surfacing cost attribution dashboards, and informing pricing decisions for higher-tier restaurant plans.

---

## 9. Failure Tolerance Architecture

### Design Philosophy

AI provider APIs are not perfectly reliable. Network latency, rate limiting, model loading time, and provider infrastructure issues can cause individual requests to fail. A production system that treats any single API failure as a fatal error will produce an unacceptably poor restaurant experience.

The Intelligence Layer is designed with **graduated failure tolerance**: the system succeeds as long as at least one image is returned.

### Outcome Matrix

| Images returned | Job outcome | Credit consumed | Action |
|---|---|---|---|
| 4 | Success | Yes | Return all variants to operator |
| 3 | Success | Yes | Return available variants |
| 2 | Success | Yes | Return available variants |
| 1 | Success | Yes | Return single variant |
| 0 | Provider failure | No (refund) | Throw `ProviderError`, refund credit |

### Failure Isolation

Each of the 4 parallel requests is fully independent. A failure in one request:

- Does not cancel in-flight sibling requests
- Does not throw an exception in the calling code
- Is silently filtered from the result set
- Is logged at `warn` level for observability

Only when `Promise.allSettled()` resolves and the fulfilled count is zero is a `ProviderError` thrown.

### Future: Auto-Retry for Failed Slots

The current architecture accepts whatever variants are returned. A planned future enhancement is **slot back-fill**: if fewer than 3 variants are returned on first attempt, the system automatically retries the failed slots before presenting results to the operator.

This will be implemented in the Intelligence Engine layer, not the provider layer, and will be transparent to the restaurant operator. It must not affect the 1-credit billing rule.

---

## 10. Provider Cost Accounting Architecture

### Rationale

AI inference costs are variable, provider-dependent, and likely to change over time. A platform that cannot measure its AI infrastructure spend per restaurant, per generation event, and per provider cannot make informed pricing or cost-control decisions.

The `estimatedCostUsd` field in every `ImageGenerationResult` response is the foundation of a future cost accounting system.

### Provider Contract

Every current and future provider implementation must expose cost estimates:

```typescript
interface ImageGenerationResult {
  images: GeneratedImage[]
  estimatedCostUsd: number
}
```

The value should represent the **total cost for all provider API calls made within a single generation job** — not the cost per image. For the current 4-request fan-out strategy, this is the sum of 4 individual image generation costs.

### Future Cost Accounting Data Model

The following schema extension is planned (not yet implemented):

```
ai_generation_events
├── id
├── restaurant_id
├── generation_type          -- 'image' | 'description' | 'ocr' | ...
├── provider_name            -- 'google-imagen' | 'openai-dalle' | ...
├── model_name               -- 'gemini-2.5-flash-image' | ...
├── variants_requested       -- integer
├── variants_returned        -- integer
├── estimated_cost_usd       -- from provider response
├── credit_billed            -- integer (always 1 for generation events)
├── created_at
└── restaurant_credit_log_id -- FK to billing record
```

This table does not yet exist. When implemented, every call through the Intelligence Layer must write a record here.

---

## 11. Future Intelligence Services

The Intelligence Layer is designed as a platform, not a single feature. The image generation capability is the first service. The following phases define the roadmap.

### Phase 1 — Establish (Production Now)

**AI Food Image Generation**
- Generate photorealistic food images from item name
- 4 parallel variants with prompt diversification
- Operator selects and persists preferred image
- 1 credit per generation event

**AI Description Generation** _(Planned — Phase 1 extension)_
- Generate compelling menu item descriptions from name and cuisine type
- Single-model invocation (no fan-out required)
- Integrates into same menu item editor surface

### Phase 2 — Menu Intelligence

**OCR Menu Import**
- Restaurant uploads paper menu (photo, PDF, scan)
- OCR extracts structured dish names, descriptions, prices
- AI maps extracted data to SpinBite menu schema
- Operator reviews and confirms import
- Target: reduce menu onboarding from hours to minutes

**AI Menu Categorisation**
- Automatically assign dishes to menu categories
- Identify missing categories and suggest new ones
- Detect structural inconsistencies in menus

**AI Pricing Suggestions**
- Analyse item mix, cuisine category, and regional benchmarks
- Suggest competitive pricing adjustments
- Surface underpriced high-conversion items

### Phase 3 — Promotion Intelligence

**Promotion Optimisation Engine**
- Evaluate active promotions against conversion data
- Suggest promotion adjustments (reward value, game type, schedule)
- Integrated with Commerce Engine and Engagement Engine

**Customer Behaviour Learning**
- Build item affinity models from coupon redemption patterns
- Personalise game reward pool composition by segment
- Feed into Communication Engine campaign targeting

**Menu Conversion Optimisation**
- Identify items with low QR menu engagement
- Suggest merchandising, photography, or description improvements
- A/B recommendation framework

### Phase 4 — Autonomous Agents

**Autonomous Restaurant AI Agents**
- Natural language goal input from restaurant operator
- AI proposes and executes multi-step revenue growth plans
- Human approval required (AI copilot model) — see `ai-engine-roadmap-v1.md`

**Demand Forecasting**
- Predict peak traffic periods and demand patterns
- Recommend pre-emptive promotion scheduling

**Dynamic Promotions**
- Time-aware promotion adjustment based on current restaurant conditions
- Real-time reward pool rebalancing

**Agentic Customer Simulation Engine**
- Simulate customer responses to proposed promotions before launch
- Use historical behaviour patterns to estimate conversion rates

---

## 12. Permanent Engineering Rules

These rules are non-negotiable. They define the invariants of the Intelligence Layer architecture and must not be violated in any future implementation.

---

**Rule 1 — No direct provider calls from business logic**

Business logic (API routes, engine orchestration, domain services) must never directly call AI provider APIs. All AI provider calls must go through a provider implementation class that satisfies the appropriate provider interface.

---

**Rule 2 — Provider switching affects provider layer only**

Migrating from one AI provider to another must require changes only inside the provider layer. No API routes, no engine logic, no database schema, and no UI code may change when a provider is swapped. If a proposed provider migration requires touching business logic, the abstraction is broken and must be repaired first.

---

**Rule 3 — Maximum 4 image variants per generation event**

No generation job may issue more than 4 provider API calls. This is both a cost control limit and a UX constraint — offering more than 4 variants creates decision paralysis without proportional value.

---

**Rule 4 — Restaurant billing: 1 credit per generation event**

Regardless of how many provider API calls are made internally, the restaurant is charged exactly 1 credit per generation event. Internal fan-out is a platform cost. Restaurants must not be charged per API call.

---

**Rule 5 — Tolerate partial provider failure**

A generation job that returns at least 1 image is a successful job. The system must never fail a job because some parallel requests failed. Only complete failure (0 images) is a provider error.

---

**Rule 6 — Never expose provider errors to restaurants**

Restaurant operators must never see infrastructure-level error messages. Terms such as `OAuth`, `service account`, `API quota`, `credentials`, `Vertex AI`, `INVALID_ARGUMENT`, or `rate limit` must never appear in restaurant-facing UI or API responses. Map all provider errors to user-friendly messages at the Intelligence Engine boundary.

---

**Rule 7 — Every provider must expose estimatedCostUsd**

The `estimatedCostUsd` field is mandatory in `ImageGenerationResult`. A provider implementation that omits this field does not satisfy the interface contract and must not be merged.

---

**Rule 8 — Preserve prompt diversification**

The 4-variant prompt suffix strategy must be preserved in any future implementation of image generation. Do not collapse all 4 requests to the same prompt. Visual diversity is a product requirement.

---

**Rule 9 — AI services are strategic infrastructure**

The Intelligence Layer is not a feature. It is a core platform subsystem. It must be given the same engineering rigour, observability, and operational care as the database, authentication, and API layers. Treat it accordingly.

---

**Rule 10 — All future AI capabilities route through the Intelligence Layer**

No new AI feature may be implemented by calling a model API directly from an API route or component. Every new AI capability must be designed as an Intelligence Layer service, with a typed interface, a provider abstraction, and consistent cost tracking.

---

## 13. Architecture Implication

SpinBite is no longer a restaurant promotion engine with an AI feature bolted on.

SpinBite is becoming an **AI-native restaurant operating system**.

The successful production deployment of AI food image generation is not the end state — it is the first demonstration of a new architectural class of capability. The Intelligence Layer now exists as a permanent, production-grade subsystem. It will grow.

The implication for every future engineering decision is significant:

**AI is a foundational infrastructure domain**, with the same status as the database, the authentication layer, and the API surface. This means:

- Feature work must be evaluated for AI enablement, not just human interaction design
- Schema changes must preserve AI-readability of restaurant data
- New engines must expose clean, structured interfaces so AI can operate them later
- Performance and reliability standards for AI services are production standards, not research standards

The long-term trajectory is documented in `ai-engine-roadmap-v1.md`: a platform where a restaurant operator states a revenue goal in natural language and SpinBite reasons, proposes, and executes — with human approval — across menu, promotions, games, communications, and analytics simultaneously.

That future is not built yet. But the Intelligence Layer that makes it possible is live today.

> All engineering decisions must now recognise AI as a core infrastructure domain. The question is no longer "should SpinBite have AI?" The question is "how does this decision support or constrain SpinBite's AI trajectory?"

---

## Related Documents

| Document | Purpose |
|---|---|
| `spinbite-target-architecture-v2.md` | Platform-wide product decisions and engine map |
| `ai-engine-roadmap-v1.md` | Long-term AI Revenue Optimisation Engine concept |
| `database-map-v1.md` | Current database schema reference |
| `decision-log-v1.md` | Architectural decision records |

---

*This document is the authoritative reference for the SpinBite Intelligence Layer architecture. Future engineering sessions must treat it as the primary reference before implementing any AI-related capability.*
