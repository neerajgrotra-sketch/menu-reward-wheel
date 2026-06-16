-- UX-2: Add restaurant_profile_generation intelligence feature
-- Enables the AI "About Your Restaurant" generation in the restaurant profile editor.
-- Prompt template must be created via Super Admin Intelligence Lab after this runs.

INSERT INTO public.intelligence_features (feature_key, name, description, enabled)
VALUES (
  'restaurant_profile_generation',
  'Restaurant Profile Generation',
  'Generate an About description for a restaurant from its name, cuisine type, and brand tone.',
  true
)
ON CONFLICT (feature_key) DO NOTHING;
