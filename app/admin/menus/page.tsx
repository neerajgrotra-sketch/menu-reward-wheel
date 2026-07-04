'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { loadSiteContentMap } from '@/lib/site-content-client';

type MenuCard = {
  id: string;
  name: string;
  menu_type: string;
  updated_at: string;
  categoryCount: number;
  itemCount: number;
  assignedCount: number;
  previewSlug: string | null;
};

const fallbackCopy = {
  eyebrow: 'Menu Library',
  headline: 'MENU LIBRARY',
  subheadline: 'Create, manage and deploy menus across one or many restaurant locations.',
};

function formatUpdatedAt(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function MenusLibraryPage() {
  const supabase = useMemo(() => createClient(), []);
  const [copy, setCopy] = useState(fallbackCopy);
  const [menus, setMenus] = useState<MenuCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [newMenuName, setNewMenuName] = useState('');
  const [creating, setCreating] = useState(false);
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [savingRename, setSavingRename] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) { window.location.href = '/auth'; return; }

    const menusResult = await supabase
      .from('menus')
      .select('id,name,menu_type,updated_at')
      .eq('owner_id', user.id)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });
    if (menusResult.error) { setError(menusResult.error.message); setLoading(false); return; }

    const menuRows = menusResult.data || [];
    const menuIds = menuRows.map((m) => m.id);

    if (menuIds.length === 0) {
      setMenus([]);
      setLoading(false);
      return;
    }

    const [categoriesResult, assignmentsResult] = await Promise.all([
      supabase.from('menu_categories').select('id,menu_id').in('menu_id', menuIds),
      supabase
        .from('restaurant_menu_assignments')
        .select('menu_id,restaurants(slug)')
        .eq('active', true)
        .in('menu_id', menuIds),
    ]);

    const categoryRows = categoriesResult.data || [];
    const categoryIds = categoryRows.map((c) => c.id);
    const itemsResult = categoryIds.length
      ? await supabase.from('menu_items').select('id,category_id').in('category_id', categoryIds)
      : { data: [] as Array<{ id: string; category_id: string }> };

    const categoryIdToMenuId = new Map(categoryRows.map((c) => [c.id, c.menu_id]));
    const categoryCountByMenu = new Map<string, number>();
    categoryRows.forEach((c) => categoryCountByMenu.set(c.menu_id, (categoryCountByMenu.get(c.menu_id) || 0) + 1));

    const itemCountByMenu = new Map<string, number>();
    (itemsResult.data || []).forEach((item) => {
      const menuId = categoryIdToMenuId.get(item.category_id);
      if (!menuId) return;
      itemCountByMenu.set(menuId, (itemCountByMenu.get(menuId) || 0) + 1);
    });

    const assignedCountByMenu = new Map<string, number>();
    const previewSlugByMenu = new Map<string, string>();
    (assignmentsResult.data || []).forEach((a: any) => {
      assignedCountByMenu.set(a.menu_id, (assignedCountByMenu.get(a.menu_id) || 0) + 1);
      const slug = a.restaurants?.slug;
      if (slug && !previewSlugByMenu.has(a.menu_id)) previewSlugByMenu.set(a.menu_id, slug);
    });

    setMenus(menuRows.map((m) => ({
      id: m.id,
      name: m.name,
      menu_type: m.menu_type,
      updated_at: m.updated_at,
      categoryCount: categoryCountByMenu.get(m.id) || 0,
      itemCount: itemCountByMenu.get(m.id) || 0,
      assignedCount: assignedCountByMenu.get(m.id) || 0,
      previewSlug: previewSlugByMenu.get(m.id) || null,
    })));
    setLoading(false);
  }

  useEffect(() => {
    async function init() {
      const loadedCopy = await loadSiteContentMap(supabase, 'admin_menus_library', fallbackCopy);
      setCopy(loadedCopy as typeof fallbackCopy);
      await load();
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  async function createMenu() {
    if (!newMenuName.trim() || creating) return;
    setCreating(true);
    setError('');
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) { window.location.href = '/auth'; return; }

    const trimmedName = newMenuName.trim();
    const result = await supabase
      .from('menus')
      .insert({ owner_id: user.id, name: trimmedName })
      .select('id')
      .single();
    setCreating(false);
    if (result.error) {
      setError(
        result.error.code === '23505'
          ? `You already have a menu named "${trimmedName}". Choose a different name.`
          : result.error.message
      );
      return;
    }
    window.location.href = `/admin/menus/${result.data.id}`;
  }

  function startRename(menu: MenuCard) {
    setRenamingId(menu.id);
    setRenameDraft(menu.name);
  }

  async function saveRename(menuId: string) {
    const trimmed = renameDraft.trim();
    const current = menus.find((m) => m.id === menuId)?.name;
    if (!trimmed || trimmed === current) { setRenamingId(null); return; }
    setSavingRename(true);
    setError('');
    const result = await supabase.from('menus').update({ name: trimmed }).eq('id', menuId);
    setSavingRename(false);
    if (result.error) {
      setError(
        result.error.code === '23505'
          ? `You already have a menu named "${trimmed}". Choose a different name.`
          : result.error.message
      );
      return;
    }
    setMenus((prev) => prev.map((m) => (m.id === menuId ? { ...m, name: trimmed } : m)));
    setRenamingId(null);
    setNotice('Menu name saved');
    setTimeout(() => setNotice(''), 1500);
  }

  // Soft delete: sets deleted_at + active=false rather than removing the row.
  // Assignments are left alone — menus."Public read assigned menus" already
  // requires menus.active=true, so a soft-deleted menu drops off every public
  // page immediately without needing a cascade.
  async function deleteMenu(menu: MenuCard) {
    if (!window.confirm(`Delete "${menu.name}"? This removes it from every assigned location.`)) return;
    setDeletingId(menu.id);
    setError('');
    const result = await supabase
      .from('menus')
      .update({ deleted_at: new Date().toISOString(), active: false })
      .eq('id', menu.id);
    setDeletingId(null);
    if (result.error) { setError(result.error.message); return; }
    setMenus((prev) => prev.filter((m) => m.id !== menu.id));
    setNotice(`Deleted "${menu.name}"`);
    setTimeout(() => setNotice(''), 2000);
  }

  // Deep clone: new menu + all its active categories + all their active items.
  // The clone starts with zero restaurant_menu_assignments (same as a brand-new
  // menu) — nothing changes on any public page until it's deliberately assigned.
  // Cloned items keep their original authoring restaurant_id.
  async function cloneMenu(menu: MenuCard) {
    setCloningId(menu.id);
    setError('');
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) { window.location.href = '/auth'; return; }

    const cloneName = `${menu.name} (Copy)`;
    const newMenuResult = await supabase
      .from('menus')
      .insert({ owner_id: user.id, name: cloneName, menu_type: menu.menu_type })
      .select('id')
      .single();
    if (newMenuResult.error) {
      setError(
        newMenuResult.error.code === '23505'
          ? `You already have a menu named "${cloneName}". Rename or delete it first, then clone again.`
          : newMenuResult.error.message
      );
      setCloningId(null);
      return;
    }
    const newMenuId = newMenuResult.data.id as string;

    const categoriesResult = await supabase
      .from('menu_categories')
      .select('id,name,menu_type,description,display_order,slug')
      .eq('menu_id', menu.id)
      .eq('active', true);
    if (categoriesResult.error) { setError(categoriesResult.error.message); setCloningId(null); return; }
    const categories = categoriesResult.data || [];

    const categoryIdMap = new Map<string, string>();
    for (const cat of categories) {
      const inserted = await supabase
        .from('menu_categories')
        .insert({
          menu_id: newMenuId,
          name: cat.name,
          menu_type: cat.menu_type,
          description: cat.description,
          display_order: cat.display_order,
          slug: cat.slug,
        })
        .select('id')
        .single();
      if (inserted.error) { setError(inserted.error.message); setCloningId(null); return; }
      categoryIdMap.set(cat.id, inserted.data.id as string);
    }

    const oldCategoryIds = categories.map((c) => c.id);
    if (oldCategoryIds.length > 0) {
      const itemsResult = await supabase
        .from('menu_items')
        .select('category_id,restaurant_id,name,price,description,image_url,is_featured,available,tags,display_order,special_enabled,special_type,special_percent,special_price,special_start_at,special_end_at,special_no_expiry')
        .in('category_id', oldCategoryIds)
        .is('deleted_at', null)
        .eq('active', true);
      if (itemsResult.error) { setError(itemsResult.error.message); setCloningId(null); return; }
      const clonedItems = (itemsResult.data || [])
        .map((item) => {
          const newCategoryId = categoryIdMap.get(item.category_id);
          return newCategoryId ? { ...item, category_id: newCategoryId } : null;
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);
      if (clonedItems.length > 0) {
        const itemInsert = await supabase.from('menu_items').insert(clonedItems);
        if (itemInsert.error) { setError(itemInsert.error.message); setCloningId(null); return; }
      }
    }

    setCloningId(null);
    await load();
    setNotice(`Cloned "${menu.name}"`);
    setTimeout(() => setNotice(''), 2000);
  }

  if (loading) return <main className="min-h-screen bg-[#FFF8F0] p-6">Loading menus...</main>;

  return (
    <main className="min-h-screen bg-[#FFF8F0] px-4 py-6 text-[#1F1F1F]">
      <section className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-[#FF6B00]">Menus</h1>
          </div>
          <a href="/admin" className="rounded-full bg-white px-4 py-3 text-sm font-black text-[#FF6B00] shadow">
            Dashboard
          </a>
        </div>

        {/* Hero banner */}
        <div className="mt-6 rounded-[2rem] bg-gradient-to-br from-[#FF6B00] to-[#E63939] p-6 text-white shadow-2xl shadow-orange-200">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-white/80">{copy.eyebrow}</p>
          <h2 className="mt-3 text-4xl font-black leading-tight">{copy.headline}</h2>
          <p className="mt-3 text-sm font-semibold text-white/85">{copy.subheadline}</p>
        </div>

        {notice && (
          <p className="mt-5 rounded-2xl bg-green-50 p-4 text-sm font-bold text-green-700">{notice}</p>
        )}
        {error && (
          <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p>
        )}

        {/* Menu grid */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {menus.map((menu) => (
            <div key={menu.id} className="flex flex-col rounded-3xl bg-white p-5 shadow-xl">
              <div className="flex h-28 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-100 to-red-100 text-4xl">
                🍽️
              </div>
              {renamingId === menu.id ? (
                <div className="mt-4 flex items-center gap-2">
                  <input
                    autoFocus
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveRename(menu.id)}
                    className="w-full min-w-0 rounded-xl border-2 border-[#FF6B00] px-2 py-1 text-lg font-black"
                  />
                  <button
                    onClick={() => saveRename(menu.id)}
                    disabled={savingRename}
                    className="rounded-full bg-[#FF6B00] px-3 py-1 text-xs font-black text-white"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setRenamingId(null)}
                    className="rounded-full bg-stone-100 px-3 py-1 text-xs font-black text-stone-600"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="mt-4 flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-xl font-black">{menu.name}</p>
                  <button
                    onClick={() => startRename(menu)}
                    aria-label="Rename menu"
                    className="shrink-0 rounded-full bg-stone-100 px-2 py-1 text-sm"
                  >
                    ✏️
                  </button>
                </div>
              )}
              <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs font-bold text-stone-600">
                <div>
                  <p className="text-lg font-black text-[#1F1F1F]">{menu.categoryCount}</p>
                  <p>Categories</p>
                </div>
                <div>
                  <p className="text-lg font-black text-[#1F1F1F]">{menu.itemCount}</p>
                  <p>Items</p>
                </div>
                <div>
                  <p className="text-lg font-black text-[#1F1F1F]">{menu.assignedCount}</p>
                  <p>Locations</p>
                </div>
              </div>
              <p className="mt-3 text-xs font-bold text-stone-400">Updated {formatUpdatedAt(menu.updated_at)}</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {menu.previewSlug ? (
                  <a
                    href={`/r/${menu.previewSlug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-2xl bg-stone-100 px-3 py-2 text-center text-sm font-black text-stone-700"
                  >
                    View
                  </a>
                ) : (
                  <button
                    disabled
                    title="Assign this menu to a location to preview it"
                    className="rounded-2xl bg-stone-100 px-3 py-2 text-center text-sm font-black text-stone-400"
                  >
                    View
                  </button>
                )}
                <a
                  href={`/admin/menus/${menu.id}`}
                  className="rounded-2xl bg-[#FF6B00] px-3 py-2 text-center text-sm font-black text-white"
                >
                  Edit
                </a>
                <a
                  href={`/admin/menus/${menu.id}/assign`}
                  className="rounded-2xl bg-stone-800 px-3 py-2 text-center text-sm font-black text-white"
                >
                  Assign
                </a>
                <button
                  onClick={() => cloneMenu(menu)}
                  disabled={cloningId === menu.id}
                  className="rounded-2xl bg-stone-200 px-3 py-2 text-center text-sm font-black text-stone-700 disabled:opacity-50"
                >
                  {cloningId === menu.id ? 'Cloning…' : 'Clone'}
                </button>
                <button
                  onClick={() => deleteMenu(menu)}
                  disabled={deletingId === menu.id}
                  className="col-span-2 rounded-2xl bg-red-50 px-3 py-2 text-center text-sm font-black text-red-600 disabled:opacity-50"
                >
                  {deletingId === menu.id ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          ))}

          {/* Create menu card */}
          <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-orange-200 bg-white p-5 text-center shadow-xl">
            <p className="text-sm font-black uppercase text-[#FF6B00]">+ Create Menu</p>
            <input
              value={newMenuName}
              onChange={(e) => setNewMenuName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createMenu()}
              placeholder="Breakfast Menu, Kids Menu..."
              className="mt-3 w-full rounded-2xl border border-stone-200 px-4 py-3 text-center font-semibold outline-none focus:border-[#FF6B00]"
            />
            <button
              onClick={createMenu}
              disabled={!newMenuName.trim() || creating}
              className="mt-3 w-full rounded-2xl bg-green-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create Menu'}
            </button>
          </div>
        </div>

        {menus.length === 0 && (
          <p className="mt-4 text-sm font-semibold text-stone-500">
            No menus yet — create your first one above.
          </p>
        )}
      </section>
    </main>
  );
}
