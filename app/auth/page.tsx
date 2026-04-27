'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function AuthPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function goAfterAuth() {
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;

    if (!user) {
      window.location.href = '/auth';
      return;
    }

    await supabase
      .from('restaurants')
      .update({ owner_id: user.id })
      .is('owner_id', null)
      .eq('contact_email', user.email || email.trim());

    const { data } = await supabase
      .from('restaurants')
      .select('id')
      .eq('owner_id', user.id)
      .limit(1);

    window.location.href = data && data.length > 0 ? '/admin' : '/admin/restaurants';
  }

  async function handleAuth() {
    const supabase = createClient();
    setError('');
    setBusy(true);

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setError(error.message);
        setBusy(false);
        return;
      }
      const loginResult = await supabase.auth.signInWithPassword({ email, password });
      if (loginResult.error) {
        setError(loginResult.error.message);
        setBusy(false);
        return;
      }
      await goAfterAuth();
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
        setBusy(false);
        return;
      }
      await goAfterAuth();
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#FFF8F0] px-4 py-10">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
        <a href="/" className="text-sm font-black text-[#FF6B00]">← Back to home</a>
        <div className="mt-6 flex items-center gap-3">
          <span className="text-4xl">🎯</span>
          <h1 className="text-4xl font-black text-[#FF6B00]">SpinBite</h1>
        </div>
        <h2 className="mt-5 text-3xl font-black">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
        <p className="mt-2 text-sm font-semibold text-stone-600">
          {mode === 'login' ? 'Log in to manage your restaurants, menus, and promotions.' : 'Start building restaurant reward games in minutes.'}
        </p>

        <div className="mt-6 space-y-3">
          <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" className="w-full rounded-2xl border px-4 py-3 text-base outline-none focus:border-[#FF6B00]" />
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" className="w-full rounded-2xl border px-4 py-3 text-base outline-none focus:border-[#FF6B00]" />
        </div>

        {error && <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}

        <button onClick={handleAuth} disabled={busy || !email || !password} className="mt-6 w-full rounded-2xl bg-[#FF6B00] px-4 py-4 text-lg font-black text-white shadow-lg disabled:bg-stone-400">
          {busy ? 'Please wait...' : mode === 'login' ? 'Login' : 'Sign Up'}
        </button>

        <button onClick={() => setMode(mode === 'login' ? 'signup' : 'login')} className="mt-4 text-sm font-black text-[#FF6B00]">
          {mode === 'login' ? 'Create account' : 'Already have an account? Login'}
        </button>
      </div>
    </main>
  );
}
