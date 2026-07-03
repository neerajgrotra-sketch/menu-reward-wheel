'use client';

import { useEffect, useState } from 'react';
import type { AppSupabaseClient } from '@/lib/supabase/client';

type Props = {
  restaurantId: string;
  supabase: AppSupabaseClient;
};

type AssignedMenu = {
  id: string;
  name: string;
  menu_type: string;
  active: boolean;
};

export function RestaurantMenusTab({ restaurantId, supabase }: Props) {
  const [menus, setMenus] = useState<AssignedMenu[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');

      const assignmentsResult = await (supabase as any)
        .from('restaurant_menu_assignments')
        .select('menu_id,active')
        .eq('restaurant_id', restaurantId);

      if (cancelled) return;
      if (assignmentsResult.error) { setError(assignmentsResult.error.message); setLoading(false); return; }

      const assignments = (assignmentsResult.data || []) as Array<{ menu_id: string; active: boolean }>;
      const menuIds = assignments.map((a) => a.menu_id);
      if (menuIds.length === 0) { setMenus([]); setLoading(false); return; }

      const activeByMenuId = new Map(assignments.map((a) => [a.menu_id, a.active]));
      const menusResult = await supabase.from('menus').select('id,name,menu_type').in('id', menuIds);

      if (cancelled) return;
      if (menusResult.error) { setError(menusResult.error.message); setLoading(false); return; }

      const rows = (menusResult.data || []) as Array<{ id: string; name: string; menu_type: string }>;
      setMenus(rows.map((m) => ({ ...m, active: activeByMenuId.get(m.id) ?? false })));
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [restaurantId, supabase]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-stone-500">Assigned Menus</p>
          <p className="mt-1 text-sm font-semibold text-stone-500">
            Menus are shared platform objects — create and edit them from the Menu Library.
          </p>
        </div>
        <a
          href="/admin/menus"
          className="shrink-0 rounded-full bg-[#FF6B00] px-4 py-2 text-sm font-black text-white"
        >
          Manage Menus →
        </a>
      </div>

      {loading && <p className="py-6 text-center text-sm text-stone-400">Loading assigned menus…</p>}
      {error && <p className="rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p>}

      {!loading && !error && menus.length === 0 && (
        <div className="rounded-2xl bg-stone-50 p-6 text-center">
          <p className="text-lg font-black">No menus assigned</p>
          <p className="mt-1 text-sm font-semibold text-stone-500">Assign a menu from the Menu Library to get started.</p>
        </div>
      )}

      {!loading && !error && menus.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {menus.map((menu) => (
            <div key={menu.id} className="rounded-2xl border border-stone-100 p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-lg font-black text-[#1F1F1F]">{menu.name}</p>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${menu.active ? 'bg-green-100 text-green-700' : 'bg-stone-100 text-stone-500'}`}>
                  {menu.active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <p className="mt-1 text-xs font-bold uppercase tracking-wide text-stone-400">{menu.menu_type}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
