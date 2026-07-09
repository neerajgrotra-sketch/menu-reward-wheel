-- Register the "Ask SpinBite" dashboard Q&A intelligence feature.
-- Metadata only (feature_key/name/description) — per the established pattern
-- (see 20260616000000_restaurant_profile_generation_feature.sql), the actual
-- prompt template is authored afterward via Super Admin Intelligence Lab, not
-- in a migration, since prompt text is proprietary and must never live in
-- source code (Rule 20). Ships disabled until a template exists and has been
-- reviewed.

INSERT INTO public.intelligence_features (feature_key, name, description, enabled)
VALUES (
  'dashboard_assistant',
  'Dashboard Assistant',
  'Answers natural-language questions about a restaurant''s live dashboard data (revenue, orders, guests, promotions, coupons) from the "Ask SpinBite" command center.',
  false
)
ON CONFLICT (feature_key) DO NOTHING;
