-- Phase A: Fix restaurant-logos upload policy (A-5 correction)
-- Separate migration because the initial A-5 upload policy in 20260609000000
-- exhibited the H-6 name-resolution bug: inside an EXISTS subquery with
-- FROM restaurants r, unqualified `name` resolves to r.name (restaurant display
-- name) rather than storage.objects.name (the storage path). The EXISTS would
-- always return false, blocking all logo uploads.
--
-- Fix: move (storage.foldername(name))[2] to the left side of an IN expression,
-- where it is evaluated in the outer storage.objects context before the subquery.

DROP POLICY IF EXISTS "Owners upload restaurant logos" ON storage.objects;

CREATE POLICY "Owners upload restaurant logos"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'restaurant-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (storage.foldername(name))[2] IN (
      SELECT r.id::text
      FROM public.restaurants r
      WHERE r.owner_id = auth.uid()
    )
  );
