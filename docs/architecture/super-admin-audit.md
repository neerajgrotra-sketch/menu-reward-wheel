# Super Admin Architecture Audit

**Date:** June 1, 2026  
**Updated:** June 11, 2026  
**Status:** Discovery complete; several items completed post-audit (see update notes below)  
**Purpose:** Assess existing Super Admin functionality to inform Game Management feature design

> **June 2026 update notes:**
> - `game_type` column added to `games` table (migration 20260601000000). All rows populated.
> - `open_the_door` added to `games` table with `game_type = 'open_the_door'`, `status = 'active'`; game is now live.
> - `lib/game-pool/gameRegistry.ts` **deleted** — registry unification complete.
> - Super Admin slug checks partially cleaned up (`game-type-cleanup-report.md`) but super-admin still references old game names ("Scratch & Win", "Lucky Slot") — actual names are now "Scratch Card" and "Reward Reels".
> - Implementation Checklist (Section 9) items remain largely **not yet implemented**.
> - `games` table now includes `game_type` column — `slug` is retained for admin display only.
> - Phase 2 menu system added: `restaurant_settings` table now exists (similar to proposed Settings pattern).

---

## 1. Existing Super Admin Pages

### Routes & Navigation

- **Base:** `/super-admin` — Command Center landing page (hub for all super-admin features)
- **Games:** `/super-admin/games` — Game management and testing interface
- **Content:** `/super-admin/content` — Homepage and platform messaging management
- **FAQs:** `/super-admin/faqs` — Public FAQ management
- **Settings:** `/super-admin/settings` — Placeholder for phase 2 (feature flags, print templates)

### Navigation Structure

All super-admin pages:
- Include a breadcrumb-style navigation back to `/super-admin` (Command Center)
- Display a link to `/admin` (Restaurant Admin) for context switching
- Use consistent branding (`🎯 SpinBite` header, orange/black color scheme)
- Require super-admin role authentication via `requireSuperAdmin()` middleware

---

## 2. Existing Super Admin Features

### 2.1 Game Management (`/super-admin/games`)

**Capability:** Platform-wide game control and tuning

**Current Implementation:**
- Browse all registered games (active, coming soon, disabled)
- Game Lab: visual testing area for each game
- Update global game settings:
  - Status (active, coming_soon, disabled)
  - Display name, description, icon emoji
  - Min/max reward count
  - Min/max product count (for menu item mapping)
  - Default spin count
  - Default coupon expiry minutes
  - Feature toggles: supports_coupon, supports_weighting, supports_try_again
  - Sort order (for display priority)
  - Game-specific config (e.g., wheel speed, spin rotations, slowdown)

**Games Currently Configured (as of June 2026):**
- Spin Wheel (active) — `🎯` icon, `game_type = 'spin_wheel'`
- **Open The Door** (active) — `game_type = 'open_the_door'` *(added June 2026)*
- Scratch Card (coming_soon) — `🪙` icon, `game_type = 'scratch_card'` *(DB slug still `scratch-win`, name was "Scratch & Win")*
- Mystery Box (coming_soon) — `🎁` icon, `game_type = 'mystery_box'`
- Reward Reels (beta) — `🎰` icon, `game_type = 'reward_reels'` *(DB slug still `lucky-slot`, name was "Lucky Slot")*
- Pick a Card (coming_soon) — `🃏` icon, `game_type = 'pick_a_card'` — no runtime contract

**User Actions:**
- View game list (sorted by sort_order, then name)
- Play game in lab (test mechanics, win conditions)
- Edit global game config (name, description, status, defaults, feature flags)
- JSON config editor for wheel-specific tuning (speed, rotations, slowdown, win effect)

### 2.2 Content Management (`/super-admin/content`)

**Capability:** Central CMS for homepage and platform messaging

**Current Implementation:**
- Manage site content organized by:
  - `page_key`: which page (e.g., "home", "super_admin", "faq")
  - `section_key`: which section (e.g., "hero", "features")
  - `field_key`: field identifier (e.g., "headline", "primary_cta_label")
- Each field has:
  - Label (display name for super-admin UI)
  - Value (actual content)
  - Field type (text, textarea, etc.)
  - Sort order
  - Active/inactive toggle

**Current Content Configured:**
- Homepage hero section (eyebrow, headline, subheadline, badges, CTA labels)
- Super Admin Command Center hero copy
- FAQ hero copy
- Demo/marketing content tied to landing page rendering

**User Actions:**
- Create new content fields
- Update field values (inline editing)
- Toggle fields active/inactive (without deleting)
- Delete fields permanently
- Organize by sort_order

### 2.3 FAQ Management (`/super-admin/faqs`)

**Capability:** Manage public-facing FAQ (marketing content)

**Current Implementation:**
- Create/read/update/delete FAQ entries
- Each FAQ has:
  - Question and answer text
  - Category (e.g., "general", "customer experience", "restaurant admin", "games")
  - Sort order
  - Active/inactive toggle
- Public users see only `is_active=true` FAQs; super-admin sees all

**Sample FAQs Seeded:**
- What is SpinBite? (general)
- Do customers need to download an app? (customer experience)
- Can restaurants control the rewards? (restaurant admin)
- How are coupons redeemed? (coupons)
- Can coupons expire? (coupons)
- Can SpinBite support more than one game? (games)

**User Actions:**
- Create new FAQ entry
- Update question, answer, category, sort order, status
- Delete FAQs
- Toggle visibility without deletion

---

## 3. Existing Database Tables Used By Super Admin

### Core Super Admin Tables

#### `profiles`
- **Primary Key:** `id` (UUID, references auth.users)
- **Columns:**
  - `email` (text)
  - `role` (text, enum: 'restaurant_owner', 'super_admin')
  - `created_at` (timestamptz)
- **RLS Policies:**
  - Super-admin users can read/update all profiles
  - Restaurant owners can only see their own profile
  - Only super-admin can insert super-admin profiles
- **Purpose:** Role-based access control; gate super-admin routes

#### `games`
- **Primary Key:** `id` (UUID)
- **Columns:**
  - `name` (text) — display name
  - `slug` (text, unique) — display/URL identifier (legacy; game resolution now uses `game_type`)
  - `game_type` (text, unique) — **canonical runtime identifier** (added migration 20260601000000)
  - `description` (text) — marketing copy
  - `status` (text, enum: 'active', 'coming_soon', 'disabled')
  - `icon` (text) — emoji or icon identifier
  - `min_rewards`, `max_rewards` (int) — default reward count range
  - `min_products`, `max_products` (int) — menu item count range
  - `default_spins` (int) — default spin count per play
  - `default_coupon_expiry_minutes` (int) — default coupon TTL
  - `stop_on_win_default` (boolean) — default play behavior
  - `supports_coupon`, `supports_weighting`, `supports_try_again` (boolean) — feature flags
  - `sort_order` (int) — display order
  - `game_config` (jsonb) — game-specific configuration (wheel speed, rotations, etc.)
  - `created_at`, `updated_at` (timestamptz)
- **Constraints:**
  - `games_reward_range_check` — min > 0, max >= min
  - `games_default_spins_check` — default_spins > 0
  - `games_coupon_expiry_check` — expiry_minutes > 0
  - `games_product_range_check` — min > 0, max >= min
- **Triggers:**
  - Auto-update `updated_at` on any change
- **RLS Policies:**
  - Authenticated users can read all games
  - Only super-admin can insert/update/delete
- **Purpose:** Platform-wide game registry and configuration

#### `site_content`
- **Primary Key:** `id` (UUID)
- **Columns:**
  - `page_key` (text) — page identifier
  - `section_key` (text) — section within page
  - `field_key` (text) — field identifier
  - `label` (text) — display name for super-admin
  - `value` (text) — actual content value
  - `field_type` (text) — input type hint (text, textarea, etc.)
  - `sort_order` (int) — display order
  - `is_active` (boolean) — visibility toggle
  - `created_at`, `updated_at` (timestamptz)
- **Constraints:**
  - `site_content_unique_field` — (page_key, section_key, field_key) must be unique
- **Indexes:**
  - `site_content_directory_idx` — (page_key, section_key, sort_order, field_key)
  - `site_content_active_idx` — (is_active, page_key, section_key)
- **Triggers:**
  - Auto-update `updated_at` on any change
- **RLS Policies:**
  - Public users see only `is_active=true` content
  - Super-admin sees all content
  - Only super-admin can insert/update/delete
- **Purpose:** Centralized CMS for homepage, platform messaging, and site copy

#### `faqs`
- **Primary Key:** `id` (UUID)
- **Columns:**
  - `question` (text) — FAQ question
  - `answer` (text) — FAQ answer
  - `category` (text) — category label (e.g., "general", "games")
  - `sort_order` (int) — display order
  - `is_active` (boolean) — visibility toggle
  - `created_at`, `updated_at` (timestamptz)
- **Indexes:**
  - `faqs_active_sort_idx` — (is_active, sort_order, created_at)
  - `faqs_category_sort_idx` — (category, sort_order, created_at)
- **Triggers:**
  - Auto-update `updated_at` on any change
- **RLS Policies:**
  - Public users see only `is_active=true` FAQs
  - Super-admin sees all FAQs
  - Only super-admin can insert/update/delete
- **Purpose:** Public FAQ content and categorization

### Related Tables (Not Super Admin–Specific but Used Alongside)

- **restaurants** — restaurant profiles (managed by restaurant admin)
- **promotions** — promotions created by restaurants
- **rewards**, **promotion_rewards** — reward definitions and associations
- **coupons** — issued coupons (used for validation/reporting)

---

## 4. Existing APIs Used By Super Admin

### Super Admin Action Routes (Server Actions)

Super-admin functionality uses **Next.js Server Actions** (not REST API routes) for mutations:

#### Content Management
- `app/super-admin/content/actions.ts`:
  - `createContentField(formData)` — insert into site_content
  - `updateContentField(formData)` — update site_content by id
  - `deleteContentField(formData)` — delete from site_content
  - Revalidates paths: `/super-admin/content`, `/`, `/faq`, `/super-admin`

#### FAQ Management
- `app/super-admin/faqs/actions.ts`:
  - `createFaq(formData)` — insert into faqs
  - `updateFaq(formData)` — update faqs by id
  - `deleteFaq(formData)` — delete from faqs
  - Revalidates paths: `/super-admin/faqs`, `/faq`

#### Game Management
- `app/super-admin/games/actions.ts`:
  - `updateGame(formData)` — update games by id (no create/delete in current UI)
  - Validates and persists game config (e.g., wheel-specific settings)
  - Revalidates paths: `/super-admin/games`

### Public/Restaurant API Routes

- `app/api/public/promotion-play/route.ts` — loads promotion and game data for play pages (uses `games` table to resolve game type)
- `app/api/admin/*` — restaurant admin APIs (promotions, coupons, metrics)

**No dedicated REST API exists for super-admin mutations** — all updates flow through Server Actions.

---

## 5. Existing Configuration Patterns

### 5.1 Settings Table Pattern

The system **uses dedicated settings/configuration tables:**

1. **`games` table:**
   - Stores game metadata (status, defaults, feature flags)
   - Includes `game_config` JSONB column for game-specific tuning
   - Indexed by `slug` for fast resolution in game registry
   - Updated via super-admin form → Server Action → Supabase

2. **`site_content` table:**
   - Hierarchical structure: `page_key` → `section_key` → `field_key`
   - Single responsibility: platform messaging and CMS copy
   - Values stored as text; type hints in `field_type` column
   - Indexed for fast retrieval by page/section

3. **`profiles` table:**
   - Minimal: only role and email
   - Used solely for role-based access control
   - No application-level settings stored here

### 5.2 Feature Flag Pattern

Feature flags are **baked into the `games` table** as boolean columns:
- `supports_coupon` — whether this game issues coupons
- `supports_weighting` — whether rewards have weights
- `supports_try_again` — whether players can retry
- `status` field (active/coming_soon/disabled) — controls visibility

**Pattern:** Boolean columns + status enum, not a separate feature_flags table.

### 5.3 Configuration as JSONB

Game-specific configuration is stored in **`game_config` JSONB column**:
- Example (Spin Wheel):
  ```json
  {
    "wheel": {
      "speed": 1.2,
      "spinRotations": 6,
      "slowdownSeconds": 3.5,
      "winEffect": "confetti",
      "tryAgain": {
        "enabled": true,
        "label": "Try Again",
        "backgroundColor": "#111111",
        "textColor": "#ffffff"
      }
    }
  }
  ```
- Flexible; each game can define its own config schema
- Validated client-side in the form and in Server Action

### 5.4 Revalidation Pattern

After mutations, super-admin actions **revalidate Next.js paths** to keep content fresh:
```typescript
revalidatePath('/super-admin/games');
revalidatePath('/some-public-page-that-uses-this-data');
```

This ensures:
- Database changes immediately visible in UI
- Public-facing pages reflect updates without manual cache invalidation

---

## 6. Recommendations for Game Management

### 6.1 Architecture Decision: Single Table vs. Separate Catalog

**Question:** Should Game Management use an extension of the existing `games` table or a dedicated `game_catalog` table?

### Recommendation: **Extend the Existing `games` Table**

**Rationale:**

1. **Games Table Already Serves as the Catalog:**
   - The `games` table is the single source of truth for all game metadata
   - It's already integrated with:
     - Game registry resolution (`getGameDefinition()`)
     - Game selection UI (`getAvailableGameContracts()`)
     - Promotion builder (allows selection based on `status`)
     - Play flow (resolves game type and config)
   - The table has proper RLS, triggers, and constraints

2. **Adding a New Catalog Table Would Create Duplication:**
   - Game definitions would exist in two places (registry code + catalog table)
   - Risk of sync issues between code and database
   - Extra join/filter logic needed in queries
   - More complex data flow during game creation/updates

3. **Existing Pattern Already Supports Game Metadata:**
   - `games.status` controls visibility/availability
   - `games.game_config` JSONB stores extensible game-specific settings
   - Sort order, feature flags, defaults already structured
   - Boolean columns (`supports_coupon`, `supports_weighting`, etc.) model capabilities

4. **Code Registry Already Bridges Static & Dynamic:**
   - `lib/games/registry.ts` maps game keys to `GameContract` instances
   - `GameContract` includes static metadata (icon, UI components, name)
   - Database `games` table provides **dynamic** overrides (status, config, defaults)
   - This separation is healthy: code defines structure, DB provides configuration

### Alternative Considered: Separate `game_catalog` Table

**Why Not:**
- Would require code changes to query both registry + DB catalog
- Adds complexity to "is this game available?" logic
- Duplicates game slugs/names that already exist in code
- Breaks the current game resolution flow

---

## 7. Game Management Feature Design (Suggested)

Based on the audit, here's how Game Management **should integrate** with existing architecture:

### 7.1 New Fields to Add to `games` Table (Optional)

If Game Management requires storing new metadata beyond current structure:

- `admin_notes` (text) — internal notes about the game
- `game_pool_weight` (int) — if games are offered probabilistically
- `requires_kitchen_integration` (boolean) — if game depends on menu/inventory
- `customizable_fields` (text[]) — JSON array of fields restaurants can customize
- `metadata` (jsonb) — flexible extension point for future game-specific data

**But ONLY if needed.** The current `games` table is already comprehensive.

### 7.2 UI Pages for Game Management

Similar structure to existing super-admin pages:

- **`/super-admin/games/[slug]`** — detailed game editor (extends current `/super-admin/games` card)
  - Edit game metadata (name, description, icon, status)
  - Configure game defaults (min/max rewards, spins, expiry)
  - Manage feature flags (supports_coupon, etc.)
  - Game Lab preview (already exists)
  - Game-specific config editor (wheel speed, etc.)
  - View/edit customization options for restaurants

- **`/super-admin/games/registry`** — optional: show registry vs. DB comparison
  - Highlight any drift between code-defined games and DB games
  - Useful for debugging

### 7.3 Server Actions for Game Management

Add to `app/super-admin/games/actions.ts`:
```typescript
export async function createGameCustomization(formData: FormData)
// Allow super-admin to define which fields restaurants can customize per game

export async function updateGameAvailability(formData: FormData)
// Toggle game status (active/coming_soon/disabled) with audit logging

export async function batchUpdateGameConfig(formData: FormData)
// Bulk-update defaults (e.g., extend all coupon expiry to 30 min)
```

### 7.4 Database Queries for Game Management

Leverage existing indexes:
```sql
-- List all games with their current usage
SELECT g.*, COUNT(p.id) as active_promotions
FROM games g
LEFT JOIN promotions p ON p.game_type = g.slug AND p.status = 'live'
GROUP BY g.id
ORDER BY g.sort_order;

-- Find games used in live promotions (can't delete)
SELECT DISTINCT p.game_type
FROM promotions p
WHERE p.status IN ('live', 'scheduled')
GROUP BY p.game_type;
```

### 7.5 Constraints & Validation

Game Management should enforce:
1. **Cannot delete active games** used in live promotions (use soft-delete via `status = 'disabled'`)
2. **Cannot change game slug** (used as key in registry + promotions.game_type)
3. **Game feature flags must be backward-compatible** (toggling `supports_coupon` may break existing promotions)
4. **Config JSONB must pass schema validation** (define per-game validator)

---

## 8. Summary

| Aspect | Current State | Pattern for Game Management |
|--------|---------------|-----|
| **Games Registry** | Code-based (lib/games/registry.ts) | Keep; DB overrides via `games` table |
| **Game Metadata** | Stored in `games` table | Extend with new columns if needed |
| **Game Configuration** | `game_config` JSONB per game | Expand for new game types |
| **Feature Flags** | Boolean columns in `games` | Reuse; add new flags as columns |
| **CMS Content** | `site_content` table | Unchanged; separate concern |
| **Access Control** | Role-based in `profiles` table | Unchanged |
| **Mutations** | Server Actions (form → action → DB) | Reuse pattern for game updates |
| **Caching** | Next.js `revalidatePath()` | Reuse pattern for game changes |

---

## 9. Implementation Checklist (Not Yet Implemented)

- [ ] Add any new columns to `games` table (e.g., `admin_notes`, `metadata`)
- [ ] Create UI page(s) for detailed game editing (extend current `/super-admin/games`)
- [ ] Add Server Actions for game-specific mutations (create, update, archive)
- [ ] Add constraints to prevent breaking game changes (soft-delete, no slug changes)
- [ ] Implement game usage audit (show # of live promotions using each game)
- [ ] Add game-specific config validators (schema per game type)
- [ ] Document game registry + DB `games` table relationship in code
- [ ] Test full flow: create game → configure → make available → use in promotion

---

## 10. Related Documentation

- [docs/architecture/README.md](README.md) — Overall architecture and game framework
- [docs/mystery-box-game.sql](../mystery-box-game.sql) — Example game SQL setup
- [docs/no-expiry-promotions.md](../no-expiry-promotions.md) — Related feature example
- `lib/games/registry.ts` — Game registry and availability logic
- `lib/super-admin.ts` — Super-admin authentication helper
- `supabase/migrations/20260430170000_super_admin_games.sql` — Initial super-admin schema

