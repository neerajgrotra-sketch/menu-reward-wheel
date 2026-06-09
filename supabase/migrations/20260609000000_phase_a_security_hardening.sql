-- Phase A Security Hardening
-- Branch: feature/security-hardening-phase-1
-- Date: 2026-06-09
-- Scope: A-1 through A-7 only
-- Findings addressed: C-2, C-3, C-4, C-5, H-4, A-6 SELECT loophole, A-7 inactive menus

-- ── A-1: Fix restaurants UPDATE policies ─────────────────────
-- Removes open qual:true UPDATE (C-2) and owner_id IS NULL loophole

DROP POLICY IF EXISTS "allow update restaurants" ON public.restaurants;
DROP POLICY IF EXISTS "owners update own restaurants" ON public.restaurants;

CREATE POLICY "owners update own restaurants"
  ON public.restaurants
  FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- ── A-2: Fix restaurants INSERT policies ─────────────────────
-- Drops both anonymous-allow INSERT policies (C-3)
-- Retains "authenticated users create restaurants" (with_check already correct)

DROP POLICY IF EXISTS "allow insert restaurants" ON public.restaurants;
DROP POLICY IF EXISTS "public insert restaurants" ON public.restaurants;

-- ── A-3: Fix menus UPDATE policy ─────────────────────────────
-- Removes open qual:true UPDATE (C-4)

DROP POLICY IF EXISTS "public update menus" ON public.menus;

CREATE POLICY "owners update own menus"
  ON public.menus
  FOR UPDATE
  TO authenticated
  USING (restaurant_id IN (
    SELECT id FROM public.restaurants WHERE owner_id = auth.uid()
  ))
  WITH CHECK (restaurant_id IN (
    SELECT id FROM public.restaurants WHERE owner_id = auth.uid()
  ));

-- ── A-4: Fix promotions UPDATE policy ────────────────────────
-- Removes open qual:true UPDATE (C-5)

DROP POLICY IF EXISTS "public update promotions" ON public.promotions;

CREATE POLICY "owners update own promotions"
  ON public.promotions
  FOR UPDATE
  TO authenticated
  USING (restaurant_id IN (
    SELECT id FROM public.restaurants WHERE owner_id = auth.uid()
  ))
  WITH CHECK (restaurant_id IN (
    SELECT id FROM public.restaurants WHERE owner_id = auth.uid()
  ));

-- ── A-5: Fix restaurant-logos storage bucket policies ─────────
-- Replaces bucket-only checks with path-scoped ownership (H-4)
-- Path format enforced: {uid}/{restaurant_id}/{filename}
-- Note: upload policy created in next migration (20260609000100) to avoid
--       the name-resolution ambiguity discovered during implementation (H-6 pattern)

DROP POLICY IF EXISTS "Authenticated users upload restaurant logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users update restaurant logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users delete restaurant logos" ON storage.objects;

CREATE POLICY "Owners update restaurant logos"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'restaurant-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'restaurant-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Owners delete restaurant logos"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'restaurant-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── A-6: Remove owner_id IS NULL loophole from restaurants SELECT ──
-- Drops the policy that lets authenticated users read unclaimed restaurants

DROP POLICY IF EXISTS "owners read own restaurants" ON public.restaurants;

CREATE POLICY "owners read own restaurants"
  ON public.restaurants
  FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

-- ── A-7: Drop public read menus unscoped SELECT ───────────────
-- Removes qual:true SELECT that exposes inactive/draft menus to anonymous users
-- Adds owner-scoped SELECT to preserve admin UI access to all menus (incl. inactive)

DROP POLICY IF EXISTS "public read menus" ON public.menus;

CREATE POLICY "owners read own menus"
  ON public.menus
  FOR SELECT
  TO authenticated
  USING (restaurant_id IN (
    SELECT id FROM public.restaurants WHERE owner_id = auth.uid()
  ));
