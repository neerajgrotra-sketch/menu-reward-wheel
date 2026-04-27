'use client';

import { FormEvent, useState } from 'react';

export default function StaffPage() {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'valid' | 'invalid' | 'redeemed'>('idle');

  function validate(event: FormEvent) {
    event.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (normalized.startsWith('SPIN-') && normalized.length >= 10) setStatus('valid');
    else setStatus('invalid');
  }

  return (
    <main className="min-h-screen bg-stone-950 px-4 py-8 text-white">
      <section className="mx-auto max-w-md">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-orange-300">Staff Tool</p>
        <h1 className="mt-2 text-4xl font-black">Validate Reward</h1>
        <p className="mt-2 text-stone-300">MVP mock validation. Phase 2 will connect this to the coupon database.</p>

        <form onSubmit={validate} className="mt-8 rounded-3xl bg-white p-5 text-stone-950 shadow-xl">
          <label className="text-sm font-bold uppercase text-stone-500">Coupon Code</label>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="SPIN-ABC123"
            className="mt-2 w-full rounded-2xl border border-stone-300 px-4 py-4 text-xl font-bold uppercase outline-none focus:border-orange-500"
          />
          <button className="mt-4 w-full rounded-2xl bg-orange-600 px-5 py-4 font-black text-white">Check Code</button>
        </form>

        {status !== 'idle' && (
          <section className={`mt-5 rounded-3xl p-5 shadow-xl ${status === 'valid' ? 'bg-green-500 text-white' : status === 'redeemed' ? 'bg-amber-500 text-stone-950' : 'bg-red-600 text-white'}`}>
            {status === 'valid' && (
              <>
                <h2 className="text-3xl font-black">Valid Reward</h2>
                <p className="mt-2 font-semibold">Reward can be accepted. Mark it as redeemed after applying the discount.</p>
                <button onClick={() => setStatus('redeemed')} className="mt-4 w-full rounded-2xl bg-white px-5 py-4 font-black text-green-700">Mark Redeemed</button>
              </>
            )}
            {status === 'invalid' && <><h2 className="text-3xl font-black">Invalid Code</h2><p className="mt-2 font-semibold">Ask the customer to show the original reward screen.</p></>}
            {status === 'redeemed' && <><h2 className="text-3xl font-black">Redeemed</h2><p className="mt-2 font-semibold">This coupon should not be used again.</p></>}
          </section>
        )}
      </section>
    </main>
  );
}
