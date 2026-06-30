import { createClient } from '@/lib/supabase/server';
import GameLabCard, { type GameForLab } from './GameLabCard';

export default async function SuperAdminGamesPage() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('games')
    .select('id,name,slug,description,status,icon,min_rewards,max_rewards,min_products,max_products,default_spins,default_coupon_expiry_minutes,stop_on_win_default,supports_coupon,supports_weighting,supports_try_again,sort_order,game_config')
    .order('sort_order', { ascending: true });

  const games = ((data || []) as GameForLab[]).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  const activeCount = games.filter((game) => game.status === 'active').length;
  const comingSoonCount = games.filter((game) => game.status === 'coming_soon').length;
  const disabledCount = games.filter((game) => game.status === 'disabled').length;

  return (
    <main className="min-h-screen bg-[#FFF8F0] px-4 py-6 text-[#1F1F1F]">
      <section className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-black text-[#FF6B00]">Super Admin / Games</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/super-admin" className="rounded-full bg-white px-4 py-3 text-sm font-black text-[#FF6B00] shadow">Command Center</a>
            <a href="/admin" className="rounded-full bg-[#1F1F1F] px-4 py-3 text-sm font-black text-white shadow">Restaurant Admin</a>
          </div>
        </div>

        <div className="mt-6 rounded-[2rem] bg-gradient-to-br from-[#FF6B00] to-[#E63939] p-6 text-white shadow-2xl shadow-orange-200 md:p-8">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-white/80">Games control</p>
          <h2 className="mt-3 max-w-4xl text-4xl font-black leading-tight md:text-5xl">Manage platform games and global play feel.</h2>
          <p className="mt-4 max-w-4xl text-sm font-semibold leading-6 text-white/85 md:text-base">
            Test the functioning game on the left, tune global configuration on the right, then push defaults to restaurants. Spin Wheel is live in the lab now; future game engines get their own configuration panels as they are built.
          </p>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          <div className="rounded-3xl bg-white p-4 text-center shadow"><p className="text-3xl font-black text-green-700">{activeCount}</p><p className="text-xs font-bold text-stone-500">Active</p></div>
          <div className="rounded-3xl bg-white p-4 text-center shadow"><p className="text-3xl font-black text-[#FF6B00]">{comingSoonCount}</p><p className="text-xs font-bold text-stone-500">Coming Soon</p></div>
          <div className="rounded-3xl bg-white p-4 text-center shadow"><p className="text-3xl font-black text-stone-500">{disabledCount}</p><p className="text-xs font-bold text-stone-500">Disabled</p></div>
        </div>

        {error && <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{error.message}</p>}

        <div className="mt-5 space-y-5">
          {games.map((game) => <GameLabCard key={game.id} game={game} />)}
        </div>
      </section>
    </main>
  );
}
