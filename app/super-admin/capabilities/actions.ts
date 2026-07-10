'use server';

import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from '@/lib/super-admin';
import { createClient } from '@/lib/supabase/server';
import { isRegisteredCapability } from '@/lib/restaurant-planner/tool-registry';

function requiredString(value: FormDataEntryValue | null) {
  return String(value || '').trim();
}

function revalidateCapabilities() {
  revalidatePath('/super-admin/capabilities');
}

// Environment-level default for a capability — the platform-wide on/off
// switch. Explicit select-then-write rather than .upsert(onConflict:...):
// the uniqueness constraints on capability_settings are PARTIAL indexes
// (scoped `where scope = '...'`), and Postgres only honors an ON CONFLICT
// target against a partial index when the conflict clause's own WHERE
// matches it exactly — which the supabase-js upsert() column-list API has
// no way to express. Two round trips, but correct.
export async function setEnvironmentCapability(formData: FormData) {
  const { user } = await requireSuperAdmin();

  const capabilityKey = requiredString(formData.get('capability_key'));
  const enabled = formData.get('enabled') === 'true';
  if (!capabilityKey || !isRegisteredCapability(capabilityKey)) {
    throw new Error('Unknown capability.');
  }

  const supabase = createClient();
  const { data: existing } = await supabase
    .from('capability_settings')
    .select('id')
    .eq('capability_key', capabilityKey)
    .eq('scope', 'environment')
    .maybeSingle();

  const error = existing
    ? (await supabase.from('capability_settings').update({ enabled, updated_by: user.id }).eq('id', existing.id)).error
    : (await supabase.from('capability_settings').insert({ capability_key: capabilityKey, scope: 'environment', scope_id: null, enabled, updated_by: user.id })).error;

  if (error) throw new Error(error.message);
  revalidateCapabilities();
}

// A restaurant- or owner-scoped override. Accepts a restaurant slug (for
// scope='restaurant') or an owner email (for scope='owner') rather than a
// raw uuid — resolved server-side — since asking a super admin to go find
// and paste a restaurant id is unnecessary friction for what's meant to be
// a fast rollout-control surface (e.g. "turn analytics_agent on for
// Punjabi By Nature only" while testing).
export async function addScopedCapabilityOverride(formData: FormData) {
  const { user } = await requireSuperAdmin();

  const capabilityKey = requiredString(formData.get('capability_key'));
  const scope = requiredString(formData.get('scope'));
  const lookup = requiredString(formData.get('lookup'));
  const enabled = formData.get('enabled') === 'true';

  if (!capabilityKey || !isRegisteredCapability(capabilityKey)) throw new Error('Unknown capability.');
  if (scope !== 'restaurant' && scope !== 'owner') throw new Error('Scope must be "restaurant" or "owner".');
  if (!lookup) throw new Error(scope === 'restaurant' ? 'Restaurant slug is required.' : 'Owner email is required.');

  const supabase = createClient();
  let scopeId: string | null = null;

  if (scope === 'restaurant') {
    const { data } = await supabase.from('restaurants').select('id').eq('slug', lookup).is('deleted_at', null).maybeSingle();
    if (!data) throw new Error(`No restaurant found with slug "${lookup}".`);
    scopeId = data.id;
  } else {
    const { data } = await supabase.from('profiles').select('id').eq('email', lookup).maybeSingle();
    if (!data) throw new Error(`No owner found with email "${lookup}".`);
    scopeId = data.id;
  }

  const { data: existing } = await supabase
    .from('capability_settings')
    .select('id')
    .eq('capability_key', capabilityKey)
    .eq('scope', scope)
    .eq('scope_id', scopeId)
    .maybeSingle();

  const error = existing
    ? (await supabase.from('capability_settings').update({ enabled, updated_by: user.id }).eq('id', existing.id)).error
    : (await supabase.from('capability_settings').insert({ capability_key: capabilityKey, scope, scope_id: scopeId, enabled, updated_by: user.id })).error;

  if (error) throw new Error(error.message);
  revalidateCapabilities();
}

export async function removeCapabilityOverride(formData: FormData) {
  await requireSuperAdmin();

  const id = requiredString(formData.get('id'));
  if (!id) throw new Error('id is required.');

  const supabase = createClient();
  const { error } = await supabase.from('capability_settings').delete().eq('id', id).neq('scope', 'environment');
  // Deliberately excludes scope='environment' — an environment row should
  // be turned off via setEnvironmentCapability, not deleted (deleting it
  // would fall through to the legacy-flag/false fallback in
  // lib/restaurant-planner/capability-settings.ts, which is surprising
  // behavior for a button labeled "remove override").

  if (error) throw new Error(error.message);
  revalidateCapabilities();
}
