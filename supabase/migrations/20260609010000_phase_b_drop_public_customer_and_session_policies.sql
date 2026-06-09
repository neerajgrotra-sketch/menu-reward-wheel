-- Phase B: C-1 + C-6 Critical Customer Data Remediation
-- Date: 2026-06-09
-- Branch: feature/security-hardening-phase-b
--
-- Context:
--   C-1: "service role full access on customer_profiles" was bound to {public}
--        instead of service_role. Any anon-key caller could SELECT, INSERT,
--        UPDATE, and DELETE all customer phone numbers and consent records.
--
--   C-6: "Users can access their play sessions" granted ALL operations to any
--        caller who knew a promotion UUID (which is world-readable). This
--        exposed session tokens, IP addresses, and customer_profile_id links.
--
-- Why no replacement policies are added:
--   All legitimate reads and writes to both tables go exclusively through
--   Next.js server-side API routes using SUPABASE_SERVICE_ROLE_KEY. The
--   service role bypasses RLS entirely (relforcerowsecurity = false on both
--   tables). No client-side Supabase call touches either table. Dropping the
--   {public} policies closes the attack surface with zero application impact.

DROP POLICY IF EXISTS "service role full access on customer_profiles"
  ON public.customer_profiles;

DROP POLICY IF EXISTS "Users can access their play sessions"
  ON public.play_sessions;
