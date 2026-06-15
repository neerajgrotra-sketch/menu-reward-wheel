import { requireSuperAdmin } from '@/lib/super-admin';
import { createClient } from '@/lib/supabase/server';
import { toggleFeature, updateProviderCost } from './actions';
import { PromptEditor } from './PromptEditor';

export const metadata = { title: 'Intelligence Lab — SpinBite Super Admin' };

export default async function IntelligenceLabPage() {
  await requireSuperAdmin();
  const supabase = createClient();

  const [
    { data: features },
    { data: templates },
    { data: experiments },
    { data: costs },
    { data: recentLogs },
  ] = await Promise.all([
    supabase
      .from('intelligence_features')
      .select('feature_key, name, description, enabled')
      .order('feature_key'),
    supabase
      .from('intelligence_prompt_templates')
      .select('id, feature_key, name, provider, model, system_prompt, user_prompt_template, temperature, max_tokens, active, version, notes, status')
      .order('feature_key')
      .order('version', { ascending: false }),
    supabase
      .from('intelligence_experiments')
      .select('id, feature_key, name, active, traffic_split_pct, winner')
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('intelligence_provider_costs')
      .select('id, provider, model, input_cost_per_1m, output_cost_per_1m')
      .order('provider'),
    supabase
      .from('intelligence_generation_logs')
      .select('id, feature_key, provider, model, success, estimated_cost_usd, latency_ms, created_at')
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  // Group templates by feature_key for the editor components.
  const templatesByFeature: Record<string, typeof templates> = {};
  (templates ?? []).forEach((t) => {
    if (!templatesByFeature[t.feature_key]) templatesByFeature[t.feature_key] = [];
    templatesByFeature[t.feature_key]!.push(t);
  });

  const totalLogs    = recentLogs?.length ?? 0;
  const successLogs  = (recentLogs ?? []).filter((l) => l.success).length;
  const totalCostUsd = (recentLogs ?? []).reduce((s, l) => s + Number(l.estimated_cost_usd ?? 0), 0);
  const avgLatencyMs = totalLogs
    ? Math.round((recentLogs ?? []).reduce((s, l) => s + (l.latency_ms ?? 0), 0) / totalLogs)
    : 0;

  return (
    <main className="min-h-screen bg-[#FFF8F0] px-4 py-6 text-[#1F1F1F]">
      <section className="mx-auto max-w-6xl">

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-black text-[#FF6B00]">🎯 SpinBite</h1>
            <p className="mt-1 text-sm font-bold text-stone-500">Intelligence Lab</p>
          </div>
          <a href="/super-admin" className="self-start rounded-full bg-white px-4 py-3 text-sm font-black text-[#FF6B00] shadow sm:self-auto">
            Command Center
          </a>
        </div>

        {/* Hero */}
        <div className="mt-6 rounded-[2rem] bg-gradient-to-br from-[#FF6B00] to-[#E63939] p-6 text-white shadow-2xl shadow-orange-200 md:p-8">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-white/80">Super Admin</p>
          <h2 className="mt-3 max-w-3xl text-4xl font-black leading-tight md:text-5xl">
            Intelligence Lab
          </h2>
          <p className="mt-4 max-w-3xl text-sm font-semibold leading-6 text-white/85 md:text-base">
            Manage generation features, prompt templates, provider costs, and A/B experiments. All prompts are stored in the database — no source code changes required.
          </p>
        </div>

        {/* Usage summary */}
        <div className="mt-5 grid gap-4 sm:grid-cols-4">
          {[
            { label: 'Requests (last 20)', value: String(totalLogs) },
            { label: 'Success rate',       value: totalLogs ? `${Math.round((successLogs / totalLogs) * 100)}%` : '—' },
            { label: 'Avg latency',        value: totalLogs ? `${avgLatencyMs}ms` : '—' },
            { label: 'Est. cost (USD)',     value: `$${totalCostUsd.toFixed(4)}` },
          ].map((stat) => (
            <div key={stat.label} className="rounded-3xl bg-white p-5 shadow-xl">
              <p className="text-xs font-black uppercase tracking-wide text-stone-400">{stat.label}</p>
              <p className="mt-2 text-3xl font-black text-[#FF6B00]">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Features */}
        <div className="mt-5">
          <h2 className="mb-3 text-xl font-black">Features</h2>
          <div className="space-y-5">
            {(features ?? []).map((feature) => {
              const featureTemplates = templatesByFeature[feature.feature_key] ?? [];
              return (
                <article key={feature.feature_key} className="rounded-3xl bg-white p-6 shadow-xl">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-xs font-black uppercase tracking-wide text-stone-400">{feature.feature_key}</p>
                      <h3 className="mt-1 text-2xl font-black">{feature.name}</h3>
                      {feature.description && (
                        <p className="mt-1 text-sm font-semibold text-stone-500">{feature.description}</p>
                      )}
                    </div>
                    <form action={toggleFeature} className="shrink-0">
                      <input type="hidden" name="feature_key" value={feature.feature_key} />
                      <input type="hidden" name="enabled"     value={(!feature.enabled).toString()} />
                      <button
                        type="submit"
                        className={`rounded-full px-4 py-2 text-sm font-black transition-colors ${
                          feature.enabled
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-red-100 text-red-600 hover:bg-red-200'
                        }`}
                      >
                        {feature.enabled ? 'Enabled' : 'Disabled'}
                      </button>
                    </form>
                  </div>

                  {/* Prompt editor for this feature */}
                  <div className="mt-5 border-t border-stone-100 pt-5">
                    <p className="mb-3 text-sm font-black uppercase tracking-wide text-stone-400">Prompt Templates</p>
                    <PromptEditor featureKey={feature.feature_key} templates={featureTemplates} />
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        {/* Provider costs */}
        <div className="mt-5">
          <h2 className="mb-3 text-xl font-black">Provider Costs</h2>
          <div className="rounded-3xl bg-white p-6 shadow-xl">
            <p className="mb-4 text-xs font-bold text-stone-500">
              USD per 1M tokens. Update when provider pricing changes.
            </p>
            <div className="space-y-3">
              {(costs ?? []).map((cost) => (
                <form key={cost.id} action={updateProviderCost} className="flex flex-wrap items-center gap-3">
                  <input type="hidden" name="id" value={cost.id} />
                  <div className="min-w-[140px] flex-1">
                    <p className="text-sm font-black">{cost.provider}</p>
                    <p className="text-xs text-stone-500">{cost.model}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div>
                      <label className="mb-1 block text-xs font-black uppercase text-stone-400">Input /1M</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-stone-400">$</span>
                        <input
                          type="number"
                          name="input_cost_per_1m"
                          step="0.01"
                          min="0"
                          defaultValue={Number(cost.input_cost_per_1m)}
                          className="w-24 rounded-xl border border-stone-200 py-2 pl-6 pr-2 text-sm font-semibold outline-none focus:border-[#FF6B00]"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-black uppercase text-stone-400">Output /1M</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-stone-400">$</span>
                        <input
                          type="number"
                          name="output_cost_per_1m"
                          step="0.01"
                          min="0"
                          defaultValue={Number(cost.output_cost_per_1m)}
                          className="w-24 rounded-xl border border-stone-200 py-2 pl-6 pr-2 text-sm font-semibold outline-none focus:border-[#FF6B00]"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="mt-5 rounded-xl bg-[#FF6B00] px-4 py-2 text-sm font-black text-white hover:opacity-85"
                    >
                      Save
                    </button>
                  </div>
                </form>
              ))}
            </div>
          </div>
        </div>

        {/* Experiments */}
        {(experiments ?? []).length > 0 && (
          <div className="mt-5">
            <h2 className="mb-3 text-xl font-black">A/B Experiments</h2>
            <div className="rounded-3xl bg-white p-6 shadow-xl">
              <div className="space-y-3">
                {(experiments ?? []).map((exp) => (
                  <div key={exp.id} className="flex items-center justify-between gap-4 rounded-2xl bg-stone-50 p-4">
                    <div className="min-w-0">
                      <p className="font-black">{exp.name}</p>
                      <p className="text-xs text-stone-500">{exp.feature_key} · {exp.traffic_split_pct}% to variant B{exp.winner ? ` · winner: ${exp.winner}` : ''}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${
                      exp.active ? 'bg-green-100 text-green-700' : 'bg-stone-100 text-stone-500'
                    }`}>
                      {exp.active ? 'Running' : 'Ended'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Recent generation logs */}
        {totalLogs > 0 && (
          <div className="mt-5">
            <h2 className="mb-3 text-xl font-black">Recent Generations</h2>
            <div className="rounded-3xl bg-white p-6 shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-stone-100">
                      {['Feature', 'Provider', 'Model', 'Status', 'Latency', 'Est. cost', 'Time'].map((h) => (
                        <th key={h} className="pb-3 pr-4 text-xs font-black uppercase tracking-wide text-stone-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(recentLogs ?? []).map((log) => (
                      <tr key={log.id} className="border-b border-stone-50 last:border-0">
                        <td className="py-2.5 pr-4 font-semibold">{log.feature_key}</td>
                        <td className="py-2.5 pr-4 text-stone-500">{log.provider}</td>
                        <td className="py-2.5 pr-4 text-stone-500">{log.model}</td>
                        <td className="py-2.5 pr-4">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-black ${log.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                            {log.success ? 'OK' : 'Error'}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 text-stone-500">{log.latency_ms != null ? `${log.latency_ms}ms` : '—'}</td>
                        <td className="py-2.5 pr-4 text-stone-500">{log.estimated_cost_usd != null ? `$${Number(log.estimated_cost_usd).toFixed(5)}` : '—'}</td>
                        <td className="py-2.5 text-xs text-stone-400">
                          {new Date(log.created_at).toLocaleString('en-CA', { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Platform boundary note */}
        <div className="mt-5 rounded-3xl bg-white p-5 shadow-xl">
          <p className="text-sm font-black uppercase tracking-wide text-[#FF6B00]">Intelligence Engine boundary</p>
          <p className="mt-2 text-sm font-semibold leading-6 text-stone-600">
            All prompts are SpinBite intellectual property stored exclusively in the database. No prompt text exists in source code. Provider adapters are pluggable — swap or add providers here without any code changes.
          </p>
        </div>

      </section>
    </main>
  );
}
