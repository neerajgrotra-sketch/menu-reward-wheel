'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function LogoutButton({ onNavigate }: { onNavigate?: () => void }) {
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    setBusy(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    onNavigate?.();
    window.location.href = '/auth';
  }

  return (
    <button
      onClick={handleLogout}
      disabled={busy}
      className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold text-stone-300 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
    >
      <span className="text-lg">🚪</span>
      <span>{busy ? 'Logging out...' : 'Logout'}</span>
    </button>
  );
}
