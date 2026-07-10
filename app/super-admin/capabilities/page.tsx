import { createClient } from '@/lib/supabase/server';
import { CAPABILITY_REGISTRY, type CapabilityKey } from '@/lib/restaurant-planner/tool-registry';
import { setEnvironmentCapability, addScopedCapabilityOverride, removeCapabilityOverride } from './actions';

export const metadata = { title: 'Capability Management — SpinBite Super Admin' };

const CAPABILITY_KEYS = Object.keys(CAPABILITY_REGISTRY) as CapabilityKey[];

export default async function CapabilitiesPage() {
  const supabase = createClient();

  const { data: settings } = await supabase
    .from('capability_settings')
    .select('id, capability_key, scope, scope_id, enabled, updated_at')
    .order('capability_key')
    .order('scope');

  const environmentByKey = new Map((settings ?? []).filter((s) => s.scope === 'environment').map((s) => [s.capability_key, s]));
  const overrides = (settings ?? []).filter((s) => s.scope !== 'environment');

  // Resolve display names for override rows — a raw uuid is meaningless in
  // the UI, so look up the restaurant name (scope='restaurant') or owner
  // email (scope='owner') for each one.
  const restaurantIds = overrides.filter((o) => o.scope === 'restaurant').map((o) => o.scope_id).filter((v): v is string => v !== null);
  const ownerIds = overrides.filter((o) => o.scope === 'owner').map((o) => o.scope_id).filter((v): v is string => v !== null);

  const [{ data: restaurants }, { data: owners }] = await Promise.all([
    restaurantIds.length > 0
      ? supabase.from('restaurants').select('id, name, slug').in('id', restaurantIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string; slug: string }> }),
    ownerIds.length > 0
      ? supabase.from('profiles').select('id, email').in('id', ownerIds)
      : Promise.resolve({ data: [] as Array<{ id: string; email: string | null }> }),
  ]);

  const restaurantById = new Map((restaurants ?? []).map((r) => [r.id, r]));
  const ownerById = new Map((owners ?? []).map((o) => [o.id, o]));

  return (
    <main className="min-h-screen bg-[#FFF8F0] px-4 py-6 text-[#1F1F1F]">
      <section className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-3xl font-black text-[#FF6B00]">Capability Management</h1>
          <a href="/super-admin" className="self-start rounded-full bg-white px-4 py-3 text-sm font-black text-[#FF6B00] shadow sm:self-auto">
            Command Center
          </a>
        </div>

        <div className="mt-6 rounded-[2rem] bg-gradient-to-br from-[#FF6B00] to-[#E63939] p-6 text-white shadow-2xl shadow-orange-200 md:p-8">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-white/80">Super Admin</p>
          <h2 className="mt-3 max-w-3xl text-4xl font-black leading-tight md:text-5xl">Capabilities, not one big switch</h2>
          <p className="mt-4 max-w-3xl text-sm font-semibold leading-6 text-white/85 md:text-base">
            Each Restaurant Planner capability is enabled independently, at three levels — environment (platform default), owner, and restaurant. The most specific level always wins: a restaurant-level override beats an owner-level one, which beats the environment default.
          </p>
        </div>

        {/* Environment defaults */}
        <div className="mt-5">
          <h2 className="mb-3 text-xl font-black">Environment defaults</h2>
          <div className="space-y-3">
            {CAPABILITY_KEYS.map((key) => {
              const entry = CAPABILITY_REGISTRY[key];
              const row = environmentByKey.get(key);
              const enabled = row?.enabled ?? false;
              const usingLegacyFallback = key === 'menu_pricing' && !row;
              return (
                <article key={key} className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-white p-5 shadow-xl">
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-wide text-stone-400">{key}</p>
                    <h3 className="mt-1 text-lg font-black">{entry.label}</h3>
                    <p className="mt-0.5 text-xs font-bold text-stone-500">
                      {entry.status === 'active' ? 'Active — has real endpoints' : 'Planned — no capability module built yet'}
                      {usingLegacyFallback && ' · currently following the legacy dashboard_assistant feature flag (no row set yet)'}
                    </p>
                  </div>
                  <form action={setEnvironmentCapability} className="shrink-0">
                    <input type="hidden" name="capability_key" value={key} />
                    <input type="hidden" name="enabled" value={(!enabled).toString()} />
                    <button
                      type="submit"
                      className={`rounded-full px-4 py-2 text-sm font-black transition-colors ${
                        enabled ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-600 hover:bg-red-200'
                      }`}
                    >
                      {enabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </form>
                </article>
              );
            })}
          </div>
        </div>

        {/* Restaurant / owner overrides */}
        <div className="mt-5">
          <h2 className="mb-3 text-xl font-black">Restaurant &amp; owner overrides</h2>
          <div className="rounded-3xl bg-white p-6 shadow-xl">
            <p className="mb-4 text-xs font-bold text-stone-500">
              Turn a capability on (or off) for one restaurant or owner, regardless of the environment default — e.g. beta-testing a new capability on a single test restaurant before a platform-wide rollout.
            </p>

            {overrides.length > 0 && (
              <div className="mb-5 space-y-2">
                {overrides.map((o) => {
                  const entry = o.capability_key in CAPABILITY_REGISTRY ? CAPABILITY_REGISTRY[o.capability_key as CapabilityKey] : null;
                  const target =
                    o.scope === 'restaurant'
                      ? restaurantById.get(o.scope_id ?? '')?.name ?? o.scope_id
                      : ownerById.get(o.scope_id ?? '')?.email ?? o.scope_id;
                  return (
                    <div key={o.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-stone-50 p-3">
                      <div className="min-w-0 text-sm">
                        <span className="font-black">{entry?.label ?? o.capability_key}</span>{' '}
                        <span className="text-stone-500">
                          for {o.scope} <span className="font-semibold text-stone-700">{target}</span>
                        </span>
                        <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-black ${o.enabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                          {o.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      <form action={removeCapabilityOverride}>
                        <input type="hidden" name="id" value={o.id} />
                        <button type="submit" className="shrink-0 rounded-full border border-stone-200 px-3 py-1.5 text-xs font-black text-stone-500 hover:text-[#1F1F1F]">
                          Remove
                        </button>
                      </form>
                    </div>
                  );
                })}
              </div>
            )}

            <form action={addScopedCapabilityOverride} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-black uppercase tracking-wide text-stone-400">Capability</label>
                <select name="capability_key" className="w-full rounded-xl border border-stone-200 px-4 py-3 font-semibold outline-none focus:border-[#FF6B00]">
                  {CAPABILITY_KEYS.map((key) => (
                    <option key={key} value={key}>{CAPABILITY_REGISTRY[key].label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-black uppercase tracking-wide text-stone-400">Scope</label>
                <select name="scope" className="w-full rounded-xl border border-stone-200 px-4 py-3 font-semibold outline-none focus:border-[#FF6B00]">
                  <option value="restaurant">Restaurant</option>
                  <option value="owner">Owner</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-black uppercase tracking-wide text-stone-400">Restaurant slug / owner email</label>
                <input name="lookup" required placeholder="punjabi-by-nature-76752" className="w-full rounded-xl border border-stone-200 px-4 py-3 font-semibold outline-none focus:border-[#FF6B00]" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-black uppercase tracking-wide text-stone-400">State</label>
                <select name="enabled" className="w-full rounded-xl border border-stone-200 px-4 py-3 font-semibold outline-none focus:border-[#FF6B00]">
                  <option value="true">Enabled</option>
                  <option value="false">Disabled</option>
                </select>
              </div>
              <button type="submit" className="rounded-xl bg-[#FF6B00] px-5 py-3 text-sm font-black text-white transition-opacity hover:opacity-85 sm:col-span-2 lg:col-span-4">
                Add override
              </button>
            </form>
          </div>
        </div>

        <div className="mt-5 rounded-3xl bg-white p-5 shadow-xl">
          <p className="text-sm font-black uppercase tracking-wide text-[#FF6B00]">How resolution works</p>
          <p className="mt-2 text-sm font-semibold leading-6 text-stone-600">
            The Restaurant Planner checks, in order: a restaurant-level row for this capability, then an owner-level row, then the environment default above — the first one found wins. If nothing is set anywhere and the capability is <code>menu_pricing</code>, it falls back to the legacy <a href="/super-admin/intelligence-lab" className="underline">Intelligence Lab</a> <code>dashboard_assistant</code> feature flag, so existing behavior never silently changes. Any other capability with nothing set defaults to disabled.
          </p>
        </div>
      </section>
    </main>
  );
}
