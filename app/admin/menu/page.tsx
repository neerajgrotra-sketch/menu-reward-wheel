'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Restaurant = { id: string; name: string; slug: string; address_line1?: string | null; city?: string | null };
type Menu = { id: string; name: string; menu_type?: string | null; item_count?: number };
type MenuItem = { id: string; name: string; price?: number | null };

function parseCadPrice(value: string) {
  const cleaned = value.replace('$', '').replace(',', '').trim();
  if (!cleaned) return null;
  const number = Number(cleaned);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 100) / 100;
}

function restaurantAddress(restaurant?: Restaurant | null) {
  return [restaurant?.address_line1, restaurant?.city].filter(Boolean).join(', ') || 'Address not added';
}

function locationLabel(restaurant: Restaurant) {
  return `${restaurant.name} — ${restaurantAddress(restaurant)}`;
}

export default function MenuPage() {
  const supabase = useMemo(() => createClient(), []);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState('');
  const [menus, setMenus] = useState<Menu[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [newMenu, setNewMenu] = useState('');
  const [expandedMenuId, setExpandedMenuId] = useState<string | null>(null);
  const [editingMenuId, setEditingMenuId] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const restaurant = restaurants.find((item) => item.id === selectedRestaurantId) || null;

  async function loadMenus(restaurantId: string) {
    const { data: menusData, error: menusError } = await supabase.from('menus').select('id,name,menu_type').eq('restaurant_id', restaurantId).order('created_at', { ascending: false });
    if (menusError) { setError(menusError.message); return; }
    const { data: itemData } = await supabase.from('menu_items').select('id,menu_id').eq('restaurant_id', restaurantId);
    const counts = new Map<string, number>();
    (itemData || []).forEach((item: any) => counts.set(item.menu_id, (counts.get(item.menu_id) || 0) + 1));
    setMenus((menusData || []).map((menu: any) => ({ ...menu, item_count: counts.get(menu.id) || 0 })));
  }

  async function loadItems(menuId: string) {
    const { data, error: itemsError } = await supabase.from('menu_items').select('id,name,price').eq('menu_id', menuId).order('created_at', { ascending: false });
    if (itemsError) { setError(itemsError.message); return; }
    setItems((data || []) as MenuItem[]);
  }

  useEffect(() => {
    async function init() {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) { window.location.href = '/auth'; return; }
      const requestedSlug = new URLSearchParams(window.location.search).get('slug');
      const { data: restaurantData, error: restaurantError } = await supabase.from('restaurants').select('id,name,slug,address_line1,city').eq('owner_id', user.id).order('created_at', { ascending: false });
      if (restaurantError) { setError(restaurantError.message); setLoading(false); return; }
      const ownedRestaurants = (restaurantData || []) as Restaurant[];
      if (ownedRestaurants.length === 0) { window.location.href = '/admin/restaurants'; return; }
      setRestaurants(ownedRestaurants);
      const requestedRestaurant = requestedSlug ? ownedRestaurants.find((item) => item.slug === requestedSlug) : null;
      setSelectedRestaurantId((requestedRestaurant || ownedRestaurants[0]).id);
      setLoading(false);
    }
    init();
  }, [supabase]);

  useEffect(() => {
    if (!selectedRestaurantId) return;
    setExpandedMenuId(null);
    setEditingMenuId(null);
    setItems([]);
    setNewMenu('');
    setError('');
    loadMenus(selectedRestaurantId);
  }, [selectedRestaurantId]);

  async function addMenu() {
    if (!newMenu.trim() || !restaurant) return;
    setError('');
    const { error: insertError } = await supabase.from('menus').insert({ name: newMenu.trim(), menu_type: newMenu.trim().toLowerCase(), restaurant_id: restaurant.id });
    if (insertError) { setError(insertError.message); return; }
    setNewMenu('');
    await loadMenus(restaurant.id);
    setNotice(`Menu created for ${restaurant.name} — ${restaurantAddress(restaurant)}`);
    setTimeout(() => setNotice(''), 1800);
  }

  async function toggleMenu(menuId: string) {
    if (expandedMenuId === menuId && editingMenuId !== menuId) { setExpandedMenuId(null); setItems([]); return; }
    setExpandedMenuId(menuId);
    await loadItems(menuId);
  }

  async function openEditor(menuId: string) {
    setExpandedMenuId(menuId);
    setEditingMenuId(menuId);
    setNewItemName('');
    setNewItemPrice('');
    await loadItems(menuId);
  }

  function finishEditing() {
    setEditingMenuId(null);
    setNotice('Menu saved');
    setTimeout(() => setNotice(''), 1500);
  }

  async function addItem() {
    if (!newItemName.trim() || !editingMenuId || !restaurant) return;
    setError('');
    const { error: insertError } = await supabase.from('menu_items').insert({ name: newItemName.trim(), price: parseCadPrice(newItemPrice), menu_id: editingMenuId, restaurant_id: restaurant.id });
    if (insertError) { setError(insertError.message); return; }
    setNewItemName('');
    setNewItemPrice('');
    await loadItems(editingMenuId);
    await loadMenus(restaurant.id);
    setNotice(`Item saved for ${restaurant.name} — ${restaurantAddress(restaurant)}`);
    setTimeout(() => setNotice(''), 1500);
  }

  async function deleteItem(itemId: string) {
    if (!expandedMenuId || !restaurant) return;
    await supabase.from('menu_items').delete().eq('id', itemId).eq('restaurant_id', restaurant.id);
    await loadItems(expandedMenuId);
    await loadMenus(restaurant.id);
  }

  async function deleteMenu(menu: Menu) {
    if (!restaurant) return;
    const ok = window.confirm(`Delete ${menu.name} menu for ${restaurant.name} at ${restaurantAddress(restaurant)}?`);
    if (!ok) return;
    setError('');
    await supabase.from('menu_items').delete().eq('menu_id', menu.id).eq('restaurant_id', restaurant.id);
    const { error: menuError } = await supabase.from('menus').delete().eq('id', menu.id).eq('restaurant_id', restaurant.id);
    if (menuError) { setError(menuError.message); return; }
    if (expandedMenuId === menu.id) { setExpandedMenuId(null); setEditingMenuId(null); setItems([]); }
    await loadMenus(restaurant.id);
  }

  if (loading) return <main className="min-h-screen bg-[#FFF8F0] p-6">Loading menus...</main>;

  return (
    <main className="min-h-screen bg-[#FFF8F0] px-4 py-6 text-[#1F1F1F]">
      <section className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-4">
          <div><h1 className="text-3xl font-black text-[#FF6B00]">🎯 SpinBite</h1><p className="mt-1 text-sm font-bold text-stone-500">Menu builder</p></div>
          <a href="/admin" className="rounded-full bg-white px-4 py-3 text-sm font-black text-[#FF6B00] shadow">Dashboard</a>
        </div>

        <div className="mt-6 rounded-[2rem] bg-gradient-to-br from-[#FF6B00] to-[#E63939] p-6 text-white shadow-2xl shadow-orange-200">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-white/80">Menus</p>
          <h2 className="mt-3 text-4xl font-black leading-tight">Build menus for rewards and promotions.</h2>
          <p className="mt-3 text-sm font-semibold text-white/85">Menus are tied to one restaurant location. Select the exact location before creating or editing items.</p>
          {restaurant && <div className="mt-4 rounded-2xl bg-white/15 p-4"><p className="text-xs font-black uppercase tracking-[0.16em] text-white/70">Selected Location</p><p className="mt-1 text-xl font-black">{restaurant.name}</p><p className="mt-1 text-sm font-bold text-white/85">{restaurantAddress(restaurant)}</p></div>}
        </div>

        <div className="mt-5 rounded-3xl bg-white p-5 shadow-xl">
          <p className="text-sm font-black uppercase text-[#FF6B00]">Step 1: Select Restaurant Location</p>
          <select value={selectedRestaurantId} onChange={(e) => setSelectedRestaurantId(e.target.value)} className="mt-3 w-full rounded-2xl border border-stone-200 bg-white px-4 py-4 font-black outline-none focus:border-[#FF6B00]">
            {restaurants.map((item) => <option key={item.id} value={item.id}>{locationLabel(item)}</option>)}
          </select>
          {restaurant && <div className="mt-4 rounded-2xl bg-orange-50 p-4"><p className="text-xl font-black">{restaurant.name}</p><p className="mt-1 text-sm font-bold text-stone-600">{restaurantAddress(restaurant)}</p><p className="mt-1 text-xs font-bold text-stone-500">/{restaurant.slug}</p></div>}
        </div>

        <div className="mt-5 rounded-3xl bg-white p-5 shadow-xl"><p className="text-sm font-black uppercase text-[#FF6B00]">Step 2: Create Menu</p><div className="mt-3 flex gap-2"><input value={newMenu} onChange={(e) => setNewMenu(e.target.value)} placeholder="Breakfast, Lunch, Dinner..." className="min-w-0 flex-1 rounded-2xl border border-stone-200 px-4 py-3 font-semibold outline-none focus:border-[#FF6B00]" /><button onClick={addMenu} className="rounded-2xl bg-green-600 px-5 py-3 text-xl font-black text-white">+</button></div></div>
        {notice && <p className="mt-5 rounded-2xl bg-green-50 p-4 text-sm font-bold text-green-700">{notice}</p>}
        {error && <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p>}
        <div className="mt-5 space-y-4">
          {menus.length === 0 && <div className="rounded-3xl bg-white p-6 shadow-xl"><p className="text-2xl font-black">No menus for this location yet</p><p className="mt-2 text-sm font-semibold text-stone-600">Create the first menu for {restaurant ? `${restaurant.name} — ${restaurantAddress(restaurant)}` : 'this restaurant location'}.</p></div>}
          {menus.map((menu) => {
            const isExpanded = expandedMenuId === menu.id;
            const isEditing = editingMenuId === menu.id;
            return <article key={menu.id} className="rounded-3xl bg-white p-5 shadow-xl">
              <button onClick={() => toggleMenu(menu.id)} className="flex w-full items-center justify-between gap-4 text-left"><div><h3 className="text-3xl font-black">{menu.name}</h3><p className="mt-1 text-sm font-bold text-stone-500">{menu.item_count || 0} items</p></div><span className="text-2xl font-black text-stone-400">{isExpanded ? '▲' : '▼'}</span></button>
              <div className="mt-3 rounded-2xl bg-orange-50 p-3 text-sm font-bold text-stone-600">Location: {restaurant?.name} — {restaurantAddress(restaurant)}</div>
              <div className="mt-4 grid grid-cols-2 gap-3"><button onClick={() => openEditor(menu.id)} className="rounded-2xl bg-orange-50 px-4 py-3 text-sm font-black text-[#FF6B00]">✏️ Edit</button><button onClick={() => deleteMenu(menu)} className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-black text-red-600">Delete Menu</button></div>
              {isExpanded && !isEditing && <div className="mt-4 space-y-2 rounded-3xl bg-[#FFF8F0] p-4">{items.length === 0 && <p className="text-sm font-semibold text-stone-500">No items in this menu yet. Tap Edit to add items.</p>}{items.map((item) => <div key={item.id} className="rounded-2xl bg-white p-3 shadow-sm"><p className="font-black">{item.name}</p><p className="text-sm font-bold text-stone-500">{item.price != null ? `$${Number(item.price).toFixed(2)} CAD` : 'No price'}</p></div>)}</div>}
              {isEditing && <div className="mt-5 rounded-3xl bg-[#FFF8F0] p-4"><div className="flex items-center justify-between gap-3"><h4 className="text-xl font-black">Edit {menu.name}</h4><button onClick={finishEditing} className="rounded-full bg-green-600 px-4 py-2 text-sm font-black text-white">Done / Save</button></div><div className="mt-3 grid grid-cols-[1fr_110px_48px] gap-2"><input value={newItemName} onChange={(e) => setNewItemName(e.target.value)} placeholder="Item name" className="min-w-0 rounded-2xl border border-stone-200 px-3 py-3 font-semibold outline-none focus:border-[#FF6B00]" /><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-stone-400">$</span><input value={newItemPrice} onChange={(e) => setNewItemPrice(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.00" inputMode="decimal" className="w-full rounded-2xl border border-stone-200 py-3 pl-7 pr-2 font-semibold outline-none focus:border-[#FF6B00]" /></div><button onClick={addItem} className="rounded-2xl bg-[#FF6B00] text-xl font-black text-white">+</button></div><p className="mt-2 text-xs font-bold text-stone-500">Currency: CAD for MVP. Name is required; price is optional.</p><div className="mt-4 space-y-2">{items.length === 0 && <p className="text-sm font-semibold text-stone-500">No items in this menu yet.</p>}{items.map((item) => <div key={item.id} className="flex items-center justify-between rounded-2xl bg-white p-3 shadow-sm"><div><p className="font-black">{item.name}</p><p className="text-sm font-bold text-stone-500">{item.price != null ? `$${Number(item.price).toFixed(2)} CAD` : 'No price'}</p></div><button onClick={() => deleteItem(item.id)} className="rounded-full bg-red-50 px-3 py-2 text-xs font-black text-red-600">Delete</button></div>)}</div></div>}
            </article>;
          })}
        </div>
      </section>
    </main>
  );
}
