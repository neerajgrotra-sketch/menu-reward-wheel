'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Restaurant = {
  id: string;
  name: string;
  slug: string;
};

type Menu = {
  id: string;
  name: string;
  menu_type?: string | null;
  item_count?: number;
};

type MenuItem = {
  id: string;
  name: string;
  price?: number | null;
};

function parseCadPrice(value: string) {
  const cleaned = value.replace('$', '').replace(',', '').trim();
  if (!cleaned) return null;
  const number = Number(cleaned);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 100) / 100;
}

export default function MenuPage() {
  const supabase = useMemo(() => createClient(), []);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [newMenu, setNewMenu] = useState('');
  const [editingMenuId, setEditingMenuId] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function loadMenus(restaurantId: string) {
    const { data: menusData, error: menusError } = await supabase
      .from('menus')
      .select('id,name,menu_type')
      .eq('restaurant_id', restaurantId);

    if (menusError) {
      setError(menusError.message);
      return;
    }

    const { data: itemData } = await supabase
      .from('menu_items')
      .select('id,menu_id')
      .eq('restaurant_id', restaurantId);

    const counts = new Map<string, number>();
    (itemData || []).forEach((item: any) => {
      counts.set(item.menu_id, (counts.get(item.menu_id) || 0) + 1);
    });

    setMenus((menusData || []).map((menu: any) => ({ ...menu, item_count: counts.get(menu.id) || 0 })));
  }

  async function loadItems(menuId: string) {
    const { data, error: itemsError } = await supabase
      .from('menu_items')
      .select('id,name,price')
      .eq('menu_id', menuId);

    if (itemsError) {
      setError(itemsError.message);
      return;
    }

    setItems((data || []) as MenuItem[]);
  }

  useEffect(() => {
    async function init() {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;

      if (!user) {
        window.location.href = '/auth';
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const requestedSlug = params.get('slug');

      let query = supabase
        .from('restaurants')
        .select('id,name,slug')
        .eq('owner_id', user.id)
        .limit(1);

      if (requestedSlug) query = query.eq('slug', requestedSlug);

      const { data: restaurantData, error: restaurantError } = await query.single();

      if (restaurantError || !restaurantData) {
        window.location.href = '/admin/restaurants';
        return;
      }

      setRestaurant(restaurantData as Restaurant);
      await loadMenus(restaurantData.id);
      setLoading(false);
    }

    init();
  }, [supabase]);

  async function addMenu() {
    if (!newMenu.trim() || !restaurant) return;
    setError('');

    const { error: insertError } = await supabase.from('menus').insert({
      name: newMenu.trim(),
      menu_type: newMenu.trim().toLowerCase(),
      restaurant_id: restaurant.id,
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setNewMenu('');
    await loadMenus(restaurant.id);
  }

  async function openEditor(menuId: string) {
    setEditingMenuId(menuId);
    setNewItemName('');
    setNewItemPrice('');
    await loadItems(menuId);
  }

  async function addItem() {
    if (!newItemName.trim() || !editingMenuId || !restaurant) return;
    setError('');

    const parsedPrice = parseCadPrice(newItemPrice);

    const { error: insertError } = await supabase.from('menu_items').insert({
      name: newItemName.trim(),
      price: parsedPrice,
      menu_id: editingMenuId,
      restaurant_id: restaurant.id,
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setNewItemName('');
    setNewItemPrice('');
    await loadItems(editingMenuId);
    await loadMenus(restaurant.id);
  }

  async function deleteItem(itemId: string) {
    if (!editingMenuId || !restaurant) return;
    await supabase.from('menu_items').delete().eq('id', itemId);
    await loadItems(editingMenuId);
    await loadMenus(restaurant.id);
  }

  const editingMenu = menus.find((menu) => menu.id === editingMenuId);

  if (loading) return <main className="min-h-screen bg-[#FFF8F0] p-6">Loading menus...</main>;

  return (
    <main className="min-h-screen bg-[#FFF8F0] px-4 py-6 text-[#1F1F1F]">
      <section className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-[#FF6B00]">🎯 SpinBite</h1>
            <p className="mt-1 text-sm font-bold text-stone-500">Menu builder</p>
          </div>
          <a href="/admin" className="rounded-full bg-white px-4 py-3 text-sm font-black text-[#FF6B00] shadow">Dashboard</a>
        </div>

        <div className="mt-6 rounded-[2rem] bg-gradient-to-br from-[#FF6B00] to-[#E63939] p-6 text-white shadow-2xl shadow-orange-200">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-white/80">Menus</p>
          <h2 className="mt-3 text-4xl font-black leading-tight">Build menus for rewards and promotions.</h2>
          <p className="mt-3 text-sm font-semibold text-white/85">
            Add items with optional CAD prices. Promotions will later pull reward items directly from here.
          </p>
          {restaurant && <p className="mt-4 rounded-2xl bg-white/15 p-3 text-sm font-black">Restaurant: {restaurant.name}</p>}
        </div>

        <div className="mt-5 rounded-3xl bg-white p-5 shadow-xl">
          <p className="text-sm font-black uppercase text-[#FF6B00]">Create Menu</p>
          <div className="mt-3 flex gap-2">
            <input value={newMenu} onChange={(event) => setNewMenu(event.target.value)} placeholder="Breakfast, Lunch, Dinner..." className="min-w-0 flex-1 rounded-2xl border border-stone-200 px-4 py-3 font-semibold outline-none focus:border-[#FF6B00]" />
            <button onClick={addMenu} className="rounded-2xl bg-green-600 px-5 py-3 text-xl font-black text-white">+</button>
          </div>
        </div>

        {error && <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p>}

        <div className="mt-5 space-y-4">
          {menus.length === 0 && (
            <div className="rounded-3xl bg-white p-6 shadow-xl">
              <p className="text-2xl font-black">No menus yet</p>
              <p className="mt-2 text-sm font-semibold text-stone-600">Create your first menu, then add items with names and optional CAD prices.</p>
            </div>
          )}

          {menus.map((menu) => (
            <article key={menu.id} className="rounded-3xl bg-white p-5 shadow-xl">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-3xl font-black">{menu.name}</h3>
                  <p className="mt-1 text-sm font-bold text-stone-500">{menu.item_count || 0} items</p>
                </div>
                <button onClick={() => openEditor(menu.id)} className="rounded-full bg-orange-50 px-4 py-3 text-sm font-black text-[#FF6B00]">
                  ✏️ Edit
                </button>
              </div>

              {editingMenuId === menu.id && (
                <div className="mt-5 rounded-3xl bg-[#FFF8F0] p-4">
                  <h4 className="text-xl font-black">Edit {editingMenu?.name}</h4>
                  <div className="mt-3 grid grid-cols-[1fr_110px_48px] gap-2">
                    <input value={newItemName} onChange={(event) => setNewItemName(event.target.value)} placeholder="Item name" className="min-w-0 rounded-2xl border border-stone-200 px-3 py-3 font-semibold outline-none focus:border-[#FF6B00]" />
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-stone-400">$</span>
                      <input value={newItemPrice} onChange={(event) => setNewItemPrice(event.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.00" inputMode="decimal" className="w-full rounded-2xl border border-stone-200 py-3 pl-7 pr-2 font-semibold outline-none focus:border-[#FF6B00]" />
                    </div>
                    <button onClick={addItem} className="rounded-2xl bg-[#FF6B00] text-xl font-black text-white">+</button>
                  </div>
                  <p className="mt-2 text-xs font-bold text-stone-500">Currency: CAD for MVP. Name is required; price is optional.</p>

                  <div className="mt-4 space-y-2">
                    {items.length === 0 && <p className="text-sm font-semibold text-stone-500">No items in this menu yet.</p>}
                    {items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between rounded-2xl bg-white p-3 shadow-sm">
                        <div>
                          <p className="font-black">{item.name}</p>
                          <p className="text-sm font-bold text-stone-500">{item.price != null ? `$${Number(item.price).toFixed(2)} CAD` : 'No price'}</p>
                        </div>
                        <button onClick={() => deleteItem(item.id)} className="rounded-full bg-red-50 px-3 py-2 text-xs font-black text-red-600">Delete</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
