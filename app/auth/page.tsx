'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function AuthPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [error, setError] = useState('');

  async function handleAuth() {
    const supabase = createClient();
    setError('');

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
      else window.location.href = '/admin/restaurants';
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else window.location.href = '/admin/restaurants';
    }
  }

  return (
    <main className="min-h-screen bg-[#FFF8F0] flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
        <h1 className="text-3xl font-black text-[#FF6B00]">SpinBite</h1>
        <h2 className="mt-2 text-xl font-bold">{mode === 'login' ? 'Login' : 'Create Account'}</h2>

        <div className="mt-6 space-y-3">
          <input
            value={email}
            onChange={(e)=>setEmail(e.target.value)}
            placeholder="Email"
            className="w-full rounded-xl border px-3 py-2"
          />
          <input
            type="password"
            value={password}
            onChange={(e)=>setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-xl border px-3 py-2"
          />
        </div>

        {error && <p className="mt-4 text-sm text-red-600 font-bold">{error}</p>}

        <button
          onClick={handleAuth}
          className="mt-6 w-full rounded-xl bg-[#FF6B00] px-4 py-3 font-black text-white"
        >
          {mode === 'login' ? 'Login' : 'Sign Up'}
        </button>

        <button
          onClick={()=>setMode(mode === 'login' ? 'signup' : 'login')}
          className="mt-4 text-sm font-bold text-[#FF6B00]"
        >
          {mode === 'login' ? 'Create account' : 'Already have an account? Login'}
        </button>
      </div>
    </main>
  );
}
