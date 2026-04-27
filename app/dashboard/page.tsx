'use client';

import { getWorkspace } from '@/lib/rewards';

export default function DashboardPage() {
  const workspace = getWorkspace();

  if (!workspace) {
    return (
      <main className="min-h-screen bg-orange-50 p-6 text-stone-950">
        <div className="mx-auto max-w-md rounded-3xl bg-white p-6 shadow-xl">
          <h1 className="text-2xl font-black">No restaurant found</h1>
          <a href="/setup" className="mt-4 block rounded-2xl bg-green-600 px-4 py-3 text-center font-black text-white">
            Create Restaurant
          </a>
        </div>
      </main>
    );
  }

  const restaurant = workspace.restaurant;
  const playPath = '/play/' + restaurant.slug;

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-amber-100 px-4 py-6 text-stone-950">
      <section className="mx-auto max-w-md">
        <div className="rounded-3xl bg-white p-6 shadow-xl">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-orange-700">Restaurant Dashboard</p>
          <h1 className="mt-2 text-3xl font-black">{restaurant.name}</h1>
          <p className="mt-2 break-all rounded-2xl bg-stone-100 p-3 text-sm font-bold text-stone-700">{playPath}</p>

          <div className="mt-6 space-y-3">
            <a href="/dashboard/menu" className="block rounded-2xl bg-stone-100 px-4 py-3 font-black">
              Manage Menu Items
            </a>
            <a href="/dashboard/rewards" className="block rounded-2xl bg-stone-100 px-4 py-3 font-black">
              Manage Wheel Rewards
            </a>
            <a href={playPath} className="block rounded-2xl bg-green-600 px-4 py-3 text-center font-black text-white">
              Open Live Wheel
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
