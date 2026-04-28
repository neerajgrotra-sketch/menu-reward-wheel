'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function MenuPage() {
  const supabase = createClient();
  const [menus, setMenus] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [newMenu, setNewMenu] = useState('');
  const [newItem, setNewItem] = useState('');
  const [selectedMenu, setSelectedMenu] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getUser();
      const user = data.user;

      const { data: r } = await supabase
        .from('restaurants')
        .select('id')
        .eq('owner_id', user?.id)
        .limit(1)
        .single();

      if (r) {
        setRestaurantId(r.id);

        const { data: menusData } = await supabase
          .from('menus')
          .select('*')
          .eq('restaurant_id', r.id);

        setMenus(menusData || []);
      }
    }

    init();
  }, []);

  async function addMenu() {
    if (!newMenu || !restaurantId) return;

    const { data } = await supabase
      .from('menus')
      .insert({ name: newMenu, restaurant_id: restaurantId })
      .select();

    setMenus([...menus, ...(data || [])]);
    setNewMenu('');
  }

  async function loadItems(menuId: string) {
    setSelectedMenu(menuId);

    const { data } = await supabase
      .from('menu_items')
      .select('*')
      .eq('menu_id', menuId);

    setItems(data || []);
  }

  async function addItem() {
    if (!newItem || !selectedMenu || !restaurantId) return;

    const { data } = await supabase
      .from('menu_items')
      .insert({
        name: newItem,
        menu_id: selectedMenu,
        restaurant_id: restaurantId,
      })
      .select();

    setItems([...items, ...(data || [])]);
    setNewItem('');
  }

  return (
    <main className="min-h-screen bg-[#FFF8F0] p-4">
      <h1 className="text-3xl font-black text-[#FF6B00]">Menus</h1>

      <div className="mt-4">
        <input
          value={newMenu}
          onChange={(e) => setNewMenu(e.target.value)}
          placeholder="Add menu (Breakfast, Lunch...)"
          className="w-full p-3 rounded-xl border"
        />
        <button onClick={addMenu} className="mt-2 w-full bg-green-600 text-white p-3 rounded-xl font-bold">
          Add Menu
        </button>
      </div>

      <div className="mt-6 space-y-3">
        {menus.map((menu) => (
          <div key={menu.id} className="p-4 bg-white rounded-xl shadow">
            <div className="flex justify-between">
              <h2 className="font-bold">{menu.name}</h2>
              <button onClick={() => loadItems(menu.id)} className="text-sm text-blue-500">Open</button>
            </div>
          </div>
        ))}
      </div>

      {selectedMenu && (
        <div className="mt-6">
          <h2 className="font-bold text-xl">Menu Items</h2>

          <input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            placeholder="Add item"
            className="w-full p-3 rounded-xl border mt-2"
          />
          <button onClick={addItem} className="mt-2 w-full bg-orange-500 text-white p-3 rounded-xl font-bold">
            Add Item
          </button>

          <div className="mt-4 space-y-2">
            {items.map((item) => (
              <div key={item.id} className="p-3 bg-white rounded-xl shadow">
                {item.name}
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
