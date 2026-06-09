-- Phase C1: H-6, H-5, H-2 Security Hardening
-- Date: 2026-06-09
-- Branch: feature/security-hardening-phase-c
--
-- Findings addressed:
--   H-6: storage.objects — restaurant-heroes and menu-item-images upload policies
--        use EXISTS(... r.name ...) where r.name resolves to the restaurant display
--        name instead of the storage object path. The restaurant-ID path segment
--        is never validated. Fix: apply the IN-pattern used for restaurant-logos
--        in Phase A migration 20260609000100.
--
--   H-5: menu_items — three issues:
--        (a) No UPDATE policy → owners cannot update item names/prices (silent failure)
--        (b) INSERT and DELETE policies use {public} role (should be {authenticated})
--        (c) "read menu items via restaurant ownership" is redundant with the
--            correct "Owners read own menu items including deleted" policy and uses
--            {public} role — drop it.
--
--   H-2: promotion_game_assignments — {public} ALL policy validates only that the
--        promotion exists (world-readable), not that the caller owns it. Any
--        unauthenticated caller can enumerate promotion UUIDs and overwrite any
--        promotion's game configuration. Fix: owner-scoped authenticated policy
--        via promotions → restaurants join. No public SELECT needed — the play
--        flow reads via SUPABASE_SERVICE_ROLE_KEY (resolvePromotionGame.ts).
--
-- H-6 menu-item-images note:
--   No application code currently uploads to menu-item-images (the feature is
--   not yet built). The bucket and policy were created ahead of the feature.
--   The upload path convention [uid]/[restaurant-id]/filename is consistent with
--   all other buckets and with the intent of the existing (buggy) policy.
--   The corrected policy enforces this convention correctly for when the feature
--   is implemented.

-- ════════════════════════════════════════════════════════════════════════
-- H-6: Fix storage upload path validation — restaurant-heroes
-- ════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Owners upload hero images" ON storage.objects;

CREATE POLICY "Owners upload hero images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'restaurant-heroes'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (storage.foldername(name))[2] IN (
      SELECT r.id::text FROM public.restaurants r WHERE r.owner_id = auth.uid()
    )
  );

-- ════════════════════════════════════════════════════════════════════════
-- H-6: Fix storage upload path validation — menu-item-images
-- ════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Owners upload menu item images" ON storage.objects;

CREATE POLICY "Owners upload menu item images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'menu-item-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (storage.foldername(name))[2] IN (
      SELECT r.id::text FROM public.restaurants r WHERE r.owner_id = auth.uid()
    )
  );

-- ════════════════════════════════════════════════════════════════════════
-- H-5: menu_items — drop redundant {public} owner SELECT
-- ════════════════════════════════════════════════════════════════════════

-- Redundant with "Owners read own menu items including deleted" ({authenticated}).
-- auth.uid() is null for anon so the EXISTS was always false for anon callers.
-- For authenticated callers the correct policy already covers the same rows.
DROP POLICY IF EXISTS "read menu items via restaurant ownership" ON public.menu_items;

-- ════════════════════════════════════════════════════════════════════════
-- H-5: menu_items — fix INSERT role {public} → {authenticated}
-- ════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "insert menu items via restaurant ownership" ON public.menu_items;

CREATE POLICY "owners insert own menu items"
  ON public.menu_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = menu_items.restaurant_id AND r.owner_id = auth.uid()
  ));

-- ════════════════════════════════════════════════════════════════════════
-- H-5: menu_items — fix DELETE role {public} → {authenticated}
-- ════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "delete menu items via restaurant ownership" ON public.menu_items;

CREATE POLICY "owners delete own menu items"
  ON public.menu_items FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = menu_items.restaurant_id AND r.owner_id = auth.uid()
  ));

-- ════════════════════════════════════════════════════════════════════════
-- H-5: menu_items — add missing UPDATE policy
-- ════════════════════════════════════════════════════════════════════════

-- No UPDATE policy existed. Owners calling supabase.from('menu_items').update(...)
-- received 0 rows affected with no error — menu/page.tsx:144 displayed a false
-- "Item updated" success notice. This adds the missing policy.
CREATE POLICY "owners update own menu items"
  ON public.menu_items FOR UPDATE TO authenticated
  USING (
    restaurant_id IN (
      SELECT id FROM public.restaurants WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    restaurant_id IN (
      SELECT id FROM public.restaurants WHERE owner_id = auth.uid()
    )
  );

-- ════════════════════════════════════════════════════════════════════════
-- H-2: promotion_game_assignments — replace open {public} ALL with owner-scoped
-- ════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Users can manage their promotion game assignments"
  ON public.promotion_game_assignments;

-- Admin builder (builder/page.tsx) reads and writes game assignments using the
-- authenticated Supabase client — satisfied by this owner policy.
-- resolvePromotionGame.ts reads using SUPABASE_SERVICE_ROLE_KEY — bypasses RLS,
-- unaffected by this change. No public SELECT policy is needed.
CREATE POLICY "owners manage own promotion game assignments"
  ON public.promotion_game_assignments FOR ALL TO authenticated
  USING (
    promotion_id IN (
      SELECT p.id FROM public.promotions p
      JOIN public.restaurants r ON r.id = p.restaurant_id
      WHERE r.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    promotion_id IN (
      SELECT p.id FROM public.promotions p
      JOIN public.restaurants r ON r.id = p.restaurant_id
      WHERE r.owner_id = auth.uid()
    )
  );
