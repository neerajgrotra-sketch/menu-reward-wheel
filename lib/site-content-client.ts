import type { SupabaseClient } from '@supabase/supabase-js';

export async function loadSiteContentMap(
  supabase: SupabaseClient,
  pageKey: string,
  fallback: Record<string, string>
) {
  const { data } = await supabase
    .from('site_content')
    .select('field_key,value')
    .eq('page_key', pageKey)
    .eq('is_active', true);

  const loaded = Object.fromEntries((data || []).map((item: any) => [item.field_key, item.value]));
  return { ...fallback, ...loaded };
}
