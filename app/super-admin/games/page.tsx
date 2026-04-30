import type { ReactNode } from 'react';
import { requireSuperAdmin } from '@/lib/super-admin';
import { createClient } from '@/lib/supabase/server';
import { updateGame } from './actions';

type Game = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: 'active' | 'coming_soon' | 'disabled';
  icon: string | null;
  min_rewards: number;
  max_rewards: number;
  default_spins: number;
  default_coupon_expiry_minutes: number;
  stop_on_win_default: boolean;
  supports_coupon: boolean;
  supports_weighting: boolean;
  supports_try_again: boolean;
  sort_order: number;
};

const statuses: Game['status'][] = ['active', 'coming_soon', 'disabled'];

function statusLabel(status: Game['status']) {
  if (status === 'coming_soon') return 'Coming soon';
  return status[0].toUpperCase() + status.slice(1);
}

function statusClass(status: Game['status']) {
  if (status === 'active') return 'bg-green-50 text-green-700';
  if (status === 'disabled') return 'bg-stone-100 text-stone-500';
  return 'bg-orange-50 text-[#FF6B00]';
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-wide text-stone-500">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function TextInput({ name, defaultValue, placeholder }: { name: string; defaultValue?: string | number | null; placeholder?: string }) {
  return <input name={name} defaultValue={defaultValue ?? ''} placeholder={placeholder} className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-[#FF6B00]" />;
}

function NumberInput({ name, defaultValue }: { name: string; defaultValue: number }) {
  return <input name={name} type="number" defaultValue={defaultValue} className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-[#FF6B00]" />;
}

function Toggle({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-2xl bg-stone-50 px-4 py-3 text-sm font-black text-stone-700">
      <span>{label}</span>
      <input name={name} type="checkbox" defaultChecked={defaultChecked} className="h-5 w-5 accent-[#FF6B00]" />
    </label>
  );
}

export default async function SuperAdminGamesPage() {
  await requireSuperAdmin();

  const supabase = createClient();
  const { data, error } = await supabase
    .from('games')
    .select('id,name,slug,description,status,icon,min_rewards,max_rewards,default_spins,default_coupon_expiry_minutes,stop_on_win_default,supports_coupon,supports_weighting,supports_try_again,sort_order')
    .order('sort_order', { ascending: true });

  const games = ((data || []) as Game[]).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  const activeCount = games.filter((game) => game.status === 'active').length;
  const comingSoonCount = games.filter((game) => game.status === 'coming_soon').length;
  const disabledCount = games.filter((game) => game.status === 'disabled').length;

  return (
    <main className="min-h-screen bg-[#FFF8F0] px-4 py-6 text-[#1F1F1F]">
      <section className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-black text-[#FF6B00]">🎯 SpinBite</h1>
            <p className="mt-1 text-sm font-bold text-stone-500">Super Admin / Games</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/super-admin" className="rounded-full bg-white px-4 py-3 text-sm font-black text-[#FF6B00] shadow">Command Center</a>
            <a href="/admin" className="rounded-full bg-[#1F1F1F] px-4 py-3 text-sm font-black text-white shadow">Restaurant Admin</a>
          </div>
        </div>

        <div className="mt-6 rounded-[2rem] bg-gradient-to-br from-[#FF6B00] to-[#E63939] p-6 text-white shadow-2xl shadow-orange-200 md:p-8">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-white/80">Games control</p>
          <h2 className="mt-3 max-w-3xl text-4xl font-black leading-tight md:text-5xl">Manage platform games.</h2>
          <p className="mt-4 max-w-3xl text-sm font-semibold leading-6 text-white/85 md:text-base">
            Activate game types, set default rules, and control what restaurants can build. Restaurant admins can configure promotions only from active platform games.
          </p>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          <div className="rounded-3xl bg-white p-4 text-center shadow"><p className="text-3xl font-black text-green-700">{activeCount}</p><p className="text-xs font-bold text-stone-500">Active</p></div>
          <div className="rounded-3xl bg-white p-4 text-center shadow"><p className="text-3xl font-black text-[#FF6B00]">{comingSoonCount}</p><p className="text-xs font-bold text-stone-500">Coming Soon</p></div>
          <div className="rounded-3xl bg-white p-4 text-center shadow"><p className="text-3xl font-black text-stone-500">{disabledCount}</p><p className="text-xs font-bold text-stone-500">Disabled</p></div>
        </div>

        {error && <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{error.message}</p>}

        <div className="mt-5 space-y-5">
          {games.map((game) => (
            <form key={game.id} action={updateGame} className="rounded-[2rem] bg-white p-5 shadow-xl">
              <input type="hidden" name="id" value={game.id} />
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-orange-50 text-4xl shadow-inner">{game.icon || '🎮'}</div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-3xl font-black">{game.name}</h3>
                      <span className={`rounded-full px-3 py-1 text-xs font-black uppercase ${statusClass(game.status)}`}>{statusLabel(game.status)}</span>
                    </div>
                    <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-stone-600">{game.description || 'No description added.'}</p>
                  </div>
                </div>
                <button type="submit" className="rounded-2xl bg-green-600 px-5 py-3 text-sm font-black text-white shadow-lg">Save Game</button>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-4">
                <Field label="Name"><TextInput name="name" defaultValue={game.name} /></Field>
                <Field label="Slug"><TextInput name="slug" defaultValue={game.slug} /></Field>
                <Field label="Icon"><TextInput name="icon" defaultValue={game.icon} /></Field>
                <Field label="Status">
                  <select name="status" defaultValue={game.status} className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-black outline-none focus:border-[#FF6B00]">
                    {statuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
                  </select>
                </Field>
              </div>

              <div className="mt-4">
                <Field label="Description">
                  <textarea name="description" defaultValue={game.description || ''} rows={3} className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#FF6B00]" />
                </Field>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-5">
                <Field label="Min Rewards"><NumberInput name="min_rewards" defaultValue={game.min_rewards} /></Field>
                <Field label="Max Rewards"><NumberInput name="max_rewards" defaultValue={game.max_rewards} /></Field>
                <Field label="Default Spins"><NumberInput name="default_spins" defaultValue={game.default_spins} /></Field>
                <Field label="Coupon Expiry Minutes"><NumberInput name="default_coupon_expiry_minutes" defaultValue={game.default_coupon_expiry_minutes} /></Field>
                <Field label="Sort Order"><NumberInput name="sort_order" defaultValue={game.sort_order} /></Field>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <Toggle name="stop_on_win_default" label="Stop on win" defaultChecked={game.stop_on_win_default} />
                <Toggle name="supports_coupon" label="Supports coupon" defaultChecked={game.supports_coupon} />
                <Toggle name="supports_weighting" label="Supports weighting" defaultChecked={game.supports_weighting} />
                <Toggle name="supports_try_again" label="Supports try again" defaultChecked={game.supports_try_again} />
              </div>
            </form>
          ))}
        </div>
      </section>
    </main>
  );
}
