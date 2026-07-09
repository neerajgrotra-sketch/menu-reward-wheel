import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

// Keys that must be present in rawInput for each feature.
//
// dashboard_assistant's caller (app/api/admin/assistant/messages/route.ts)
// also always passes a `conversation_history` key (a flattened transcript of
// recent turns, '' on a fresh conversation) so its prompt template can
// reference {{conversation_history}} to resolve short follow-up replies
// ("only cardamom chai") against the prior turn. It's deliberately NOT
// listed as required here — buildContext already passes any rawInput key
// through below, and requiring a non-empty value would break turn one of
// every conversation.
const REQUIRED_INPUT_KEYS: Record<string, string[]> = {
  menu_description_generation:        ['item_name'],
  restaurant_profile_generation:      ['restaurant_name'],
  restaurant_food_image_generation:   ['item_name', 'item_description', 'restaurant_name'],
  food_image_prompt_enhancement:      ['item_name', 'restaurant_name'],
  dashboard_assistant:                ['question'],
};

export class MissingContextError extends Error {
  constructor(featureKey: string, missing: string[]) {
    super(
      `Missing required context for '${featureKey}': ${missing.join(', ')}`
    );
    this.name = 'MissingContextError';
  }
}

export async function buildContext(
  featureKey: string,
  restaurantId: string,
  rawInput: Record<string, string>,
  supabase: SupabaseClient<Database>
): Promise<Record<string, string>> {
  // Validate required input keys for this feature.
  const required = REQUIRED_INPUT_KEYS[featureKey] ?? [];
  const missing = required.filter((key) => !rawInput[key]?.trim());
  if (missing.length > 0) throw new MissingContextError(featureKey, missing);

  // Load the restaurant's intelligence profile (may be null if not yet filled in).
  const { data: profile } = await supabase
    .from('restaurant_intelligence_profile')
    .select(
      'cuisine_type, brand_tone, restaurant_style, customer_demographic, price_range, target_customer, service_style'
    )
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  // Build context: profile fields first, then rawInput overrides (empty string for nulls).
  const context: Record<string, string> = {
    cuisine_type:         profile?.cuisine_type         ?? '',
    brand_tone:           profile?.brand_tone           ?? '',
    restaurant_style:     profile?.restaurant_style     ?? '',
    customer_demographic: profile?.customer_demographic ?? '',
    price_range:          profile?.price_range          ?? '',
    target_customer:      profile?.target_customer      ?? '',
    service_style:        profile?.service_style        ?? '',
    ...Object.fromEntries(
      Object.entries(rawInput).map(([k, v]) => [k, v ?? ''])
    ),
  };

  return context;
}
