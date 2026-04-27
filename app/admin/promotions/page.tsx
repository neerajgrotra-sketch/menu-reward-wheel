'use client';

import { useState } from 'react';

export default function PromotionsPage() {
  const [name, setName] = useState('');
  const [promotions, setPromotions] = useState<string[]>([]);

  function addPromotion() {
    if (!name.trim()) return;
    setPromotions([...promotions, name]);
    setName('');
  }

  return (
    <main className="min-h-screen bg-[#FFF8F0] p-6">
      <div className="mx-auto max-w-md rounded-3xl bg-white p-6 shadow-xl">
        <h1 className="text-2xl font-black text-[#FF6B00]">🎯 Promotions</h1>

        <div className="mt-4 flex gap-2">
          <input value={name} onChange={(e)=>setName(e.target.value)} placeholder="Promotion name" className="flex-1 rounded-xl border px-3 py-2" />
          <button onClick={addPromotion} className="rounded-xl bg-green-600 px-4 py-2 text-white font-bold">Add</button>
        </div>

        <ul className="mt-4 space-y-2">
          {promotions.map((p,i)=> (
            <li key={i} className="rounded-xl bg-gray-100 p-3 font-bold">{p}</li>
          ))}
        </ul>
      </div>
    </main>
  );
}
