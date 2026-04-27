'use client';

import { useState } from 'react';
import { getWorkspace, saveWorkspace } from '@/lib/rewards';
import type { RestaurantWorkspace } from '@/types/reward';

export default function MenuPage() {
  const [workspace, setWorkspace] = useState<RestaurantWorkspace | null>(() => getWorkspace());
  const [name, setName] = useState('');

  if (!workspace) {
    return <div className="p-6">No workspace</div>;
  }

  function addItem() {
    if (!workspace || !name.trim()) return;

    const nextWorkspace: RestaurantWorkspace = {
      ...workspace,
      menuItems: [
        ...workspace.menuItems,
        {
          id: 'm_' + Date.now(),
          restaurantId: workspace.restaurant.id,
          name: name.trim(),
          category: 'General',
          active: true,
        },
      ],
    };

    saveWorkspace(nextWorkspace);
    setWorkspace(nextWorkspace);
    setName('');
  }

  return (
    <main className="min-h-screen bg-orange-50 p-6 text-stone-950">
      <div className="mx-auto max-w-md rounded-3xl bg-white p-6 shadow-xl">
        <h1 className="text-2xl font-black">Menu Items</h1>

        <div className="mt-4 flex gap-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Add menu item"
            className="flex-1 rounded-xl border px-3 py-2"
          />
          <button onClick={addItem} className="rounded-xl bg-green-600 px-4 py-2 font-black text-white">
            Add
          </button>
        </div>

        <ul className="mt-4 space-y-2">
          {workspace.menuItems.map((item) => (
            <li key={item.id} className="rounded-xl bg-stone-100 px-3 py-2 font-bold">
              {item.name}
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
