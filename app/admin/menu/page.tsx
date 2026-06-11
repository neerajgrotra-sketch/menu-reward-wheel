'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { loadSiteContentMap } from '@/lib/site-content-client';
import { MenuItemImageUploader } from '@/components/admin/restaurants/MenuItemImageUploader';

type Restaurant = {
  id: string;
  name: string;
  slug: string;
  address_line1?: string | null;
  city?: string | null;
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
  price: number | null;
  description: string | null;
  image_url: string | null;
  is_featured: boolean;
  available: boolean;
  tags: string[];
  display_order: number;
};

const fallbackCopy = {
  eyebrow: 'Sections',
  headline: 'Build your menu sections.',
  subheadline:
    'Sections are tied to one restaurant location. Select the exact location before creating or editing items.',
  select_location_label: 'Step 1: Select Restaurant Location',
  create_menu_label: 'Step 2: Create Section',
  no_menus_title: 'No sections for this location yet',
  no_menus_copy: 'Create the first section for this restaurant location.',
};

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
  const [copy, setCopy] = useState(fallbackCopy);
  const [userId, setUserId] = useState('');
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState('');
  const [menus, setMenus] = useState<Menu[]>([]);
  // Items keyed by menu ID so multiple sections can be expanded simultaneously.
  const [itemsByMenuId, setItemsByMenuId] = useState<Record<string, MenuItem[]>>({});
  // Set of expanded section IDs — allows all sections to be open at once.
  const [expandedMenuIds, setExpandedMenuIds] = useState<Set<string>>(new Set());
  const [newMenu, setNewMenu] = useState('');
  const [editingMenuId, setEditingMenuId] = useState<string | null>(null);
  const [renamingMenuId, setRenamingMenuId] = useState<string | null>(null);
  const [editingMenuName, setEditingMenuName] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemName, setEditingItemName] = useState('');
  const [editingItemPrice, setEditingItemPrice] = useState('');
  const [editingItemDescription, setEditingItemDescription] = useState('');
  const [editingItemFeatured, setEditingItemFeatured] = useState(false);
  const [editingItemAvailable, setEditingItemAvailable] = useState(true);
  const [editingItemTags, setEditingItemTags] = useState('');
  const [editingItemDisplayOrder, setEditingItemDisplayOrder] = useState('0');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [aiGenerating, setAiGenerating] = useState(false);

  const restaurant = restaurants.find((r) => r.id === selectedRestaurantId) || null;

  // Loads all menus and all their items in parallel.
  // expandAll=true: sets every section as expanded (used on initial load and new section creation).
  // expandAll=false: preserves whatever the user has collapsed/expanded (used on item mutations).
  async function loadMenus(restaurantId: string, expandAll = false) {
    const [menuResult, itemResult] = await Promise.all([
      supabase.from('menus').select('id,name,menu_type').eq('restaurant_id', restaurantId),
      supabase
        .from('menu_items')
        .select('id,name,price,description,image_url,is_featured,available,tags,display_order,menu_id')
        .eq('restaurant_id', restaurantId)
        .order('display_order', { ascending: true }),
    ]);

    if (menuResult.error) { setError(menuResult.error.message); return; }
    if (itemResult.error) { setError(itemResult.error.message); return; }

    const allItems = (itemResult.data || []) as Array<MenuItem & { menu_id: string }>;

    // Group items by menu_id so each section has its own list ready.
    const grouped: Record<string, MenuItem[]> = {};
    allItems.forEach((item) => {
      if (!grouped[item.menu_id]) grouped[item.menu_id] = [];
      grouped[item.menu_id].push(item);
    });

    const loadedMenus = (menuResult.data || []).map((menu: any) => ({
      ...menu,
      item_count: (grouped[menu.id] || []).length,
    }));

    setMenus(loadedMenus);
    setItemsByMenuId(grouped);

    if (expandAll) {
      setExpandedMenuIds(new Set(loadedMenus.map((m: Menu) => m.id)));
    }
  }

  // Refreshes items for a single section without touching the rest of the state.
  // Used after saveItem and image upload so the section doesn't re-collapse.
  async function reloadItemsForMenu(menuId: string) {
    if (!restaurant) return;
    const result = await supabase
      .from('menu_items')
      .select('id,name,price,description,image_url,is_featured,available,tags,display_order')
      .eq('restaurant_id', restaurant.id)
      .eq('menu_id', menuId)
      .order('display_order', { ascending: true });
    if (result.error) { setError(result.error.message); return; }
    setItemsByMenuId((prev) => ({
      ...prev,
      [menuId]: (result.data || []) as MenuItem[],
    }));
  }

  useEffect(() => {
    async function init() {
      const loadedCopy = await loadSiteContentMap(supabase, 'admin_menu', fallbackCopy);
      setCopy(loadedCopy as typeof fallbackCopy);
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) { window.location.href = '/auth'; return; }
      setUserId(user.id);
      const requestedSlug = new URLSearchParams(window.location.search).get('slug');
      const result = await supabase
        .from('restaurants')
        .select('id,name,slug,address_line1,city')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false });
      if (result.error) { setError(result.error.message); setLoading(false); return; }
      const owned = (result.data || []) as Restaurant[];
      if (owned.length === 0) { window.location.href = '/admin/restaurants'; return; }
      setRestaurants(owned);
      const requested = requestedSlug ? owned.find((r) => r.slug === requestedSlug) : null;
      setSelectedRestaurantId((requested || owned[0]).id);
      setLoading(false);
    }
    init();
  }, [supabase]);

  useEffect(() => {
    if (!selectedRestaurantId) return;
    // Reset all section state when switching restaurants.
    setExpandedMenuIds(new Set());
    setEditingMenuId(null);
    setRenamingMenuId(null);
    setItemsByMenuId({});
    setNewMenu('');
    setError('');
    // expandAll=true: open every section on initial restaurant load.
    loadMenus(selectedRestaurantId, true);
  }, [selectedRestaurantId]);

  async function addMenu() {
    if (!newMenu.trim() || !restaurant) return;
    setError('');
    const slug =
      newMenu.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
    // Select the new row's id so we can expand it immediately.
    const result = await supabase
      .from('menus')
      .insert({ name: newMenu.trim(), menu_type: newMenu.trim().toLowerCase(), restaurant_id: restaurant.id, slug })
      .select('id')
      .single();
    if (result.error) { setError(result.error.message); return; }
    const newMenuId = result.data?.id as string | undefined;
    setNewMenu('');
    // Reload without expandAll so user-collapsed sections stay collapsed.
    await loadMenus(restaurant.id);
    // Explicitly expand the new section so the owner can start adding items immediately.
    if (newMenuId) {
      setExpandedMenuIds((prev) => new Set(Array.from(prev).concat(newMenuId)));
    }
    setNotice(`Section created for ${restaurant.name} — ${restaurantAddress(restaurant)}`);
    setTimeout(() => setNotice(''), 1800);
  }

  function toggleMenu(menuId: string) {
    // Do not collapse a section that is currently being edited.
    if (expandedMenuIds.has(menuId) && editingMenuId !== menuId) {
      setExpandedMenuIds((prev) => {
        const next = new Set(prev);
        next.delete(menuId);
        return next;
      });
      return;
    }
    setExpandedMenuIds((prev) => new Set(Array.from(prev).concat(menuId)));
  }

  async function openEditor(menu: Menu) {
    // Ensure the section is expanded when entering edit mode.
    setExpandedMenuIds((prev) => new Set(Array.from(prev).concat(menu.id)));
    setEditingMenuId(menu.id);
    setRenamingMenuId(null);
    setEditingMenuName(menu.name);
    setNewItemName('');
    setNewItemPrice('');
    setEditingItemId(null);
    // Items are already loaded via loadMenus — no extra fetch needed.
  }

  function startRenameMenu(menu: Menu) {
    setRenamingMenuId(menu.id);
    setEditingMenuName(menu.name);
  }

  async function saveMenuName(menuId: string) {
    if (!restaurant || !editingMenuName.trim()) return;
    const newSlug =
      editingMenuName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') ||
      'section';
    const result = await supabase
      .from('menus')
      .update({ name: editingMenuName.trim(), menu_type: editingMenuName.trim().toLowerCase(), slug: newSlug })
      .eq('id', menuId)
      .eq('restaurant_id', restaurant.id);
    if (result.error) { setError(result.error.message); return; }
    setRenamingMenuId(null);
    // Preserve expanded state on rename — only refresh menu metadata.
    await loadMenus(restaurant.id);
    setNotice('Section name saved');
    setTimeout(() => setNotice(''), 1500);
  }

  function finishEditing() {
    setEditingMenuId(null);
    setRenamingMenuId(null);
    setEditingItemId(null);
    setNotice('Section saved');
    setTimeout(() => setNotice(''), 1500);
  }

  async function addItem() {
    if (!newItemName.trim() || !editingMenuId || !restaurant) return;
    setError('');
    const result = await supabase.from('menu_items').insert({
      name: newItemName.trim(),
      price: parseCadPrice(newItemPrice),
      menu_id: editingMenuId,
      restaurant_id: restaurant.id,
    });
    if (result.error) { setError(result.error.message); return; }
    setNewItemName('');
    setNewItemPrice('');
    // Reload all menus to update item counts; expandAll=false preserves collapse state.
    await loadMenus(restaurant.id);
    setNotice('Item added');
    setTimeout(() => setNotice(''), 1500);
  }

  function startEditItem(item: MenuItem) {
    setEditingItemId(item.id);
    setEditingItemName(item.name);
    setEditingItemPrice(item.price != null ? String(item.price) : '');
    setEditingItemDescription(item.description || '');
    setEditingItemFeatured(item.is_featured);
    setEditingItemAvailable(item.available);
    setEditingItemTags((item.tags || []).join(', '));
    setEditingItemDisplayOrder(String(item.display_order ?? 0));
  }

  async function saveItem(itemId: string) {
    if (!restaurant || !editingMenuId || !editingItemName.trim()) return;
    const result = await supabase
      .from('menu_items')
      .update({
        name: editingItemName.trim(),
        price: parseCadPrice(editingItemPrice),
        description: editingItemDescription.trim() || null,
        is_featured: editingItemFeatured,
        available: editingItemAvailable,
        tags: editingItemTags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        display_order: parseInt(editingItemDisplayOrder, 10) || 0,
      })
      .eq('id', itemId)
      .eq('restaurant_id', restaurant.id)
      .eq('menu_id', editingMenuId);
    if (result.error) { setError(result.error.message); return; }
    setEditingItemId(null);
    // Only reload items for this section — no full menu refresh needed.
    await reloadItemsForMenu(editingMenuId);
    setNotice('Item updated');
    setTimeout(() => setNotice(''), 1500);
  }

  async function deleteItem(item: MenuItem) {
    if (!restaurant || !editingMenuId) return;
    if (!window.confirm(`Delete ${item.name} from this section?`)) return;
    const result = await supabase
      .from('menu_items')
      .delete()
      .eq('id', item.id)
      .eq('restaurant_id', restaurant.id)
      .eq('menu_id', editingMenuId);
    if (result.error) { setError(result.error.message); return; }
    // Reload all menus to update item counts; expandAll=false preserves collapse state.
    await loadMenus(restaurant.id);
    setNotice('Item deleted');
    setTimeout(() => setNotice(''), 1500);
  }

  async function deleteMenu(menu: Menu) {
    if (!restaurant) return;
    const ok = window.confirm(
      `Delete the entire ${menu.name} section for ${restaurant.name} at ${restaurantAddress(restaurant)}? This will also delete all items in that section.`
    );
    if (!ok) return;
    setError('');
    const itemDelete = await supabase
      .from('menu_items')
      .delete()
      .eq('menu_id', menu.id)
      .eq('restaurant_id', restaurant.id);
    if (itemDelete.error) { setError(itemDelete.error.message); return; }
    const menuDelete = await supabase
      .from('menus')
      .delete()
      .eq('id', menu.id)
      .eq('restaurant_id', restaurant.id);
    if (menuDelete.error) { setError(menuDelete.error.message); return; }
    // Clean up state for the deleted section.
    setExpandedMenuIds((prev) => {
      const next = new Set(prev);
      next.delete(menu.id);
      return next;
    });
    if (editingMenuId === menu.id) {
      setEditingMenuId(null);
      setRenamingMenuId(null);
    }
    await loadMenus(restaurant.id);
    setNotice('Section deleted');
    setTimeout(() => setNotice(''), 1500);
  }

  if (loading) return <main className="min-h-screen bg-[#FFF8F0] p-6">Loading sections...</main>;

  return (
    <main className="min-h-screen bg-[#FFF8F0] px-4 py-6 text-[#1F1F1F]">
      <section className="mx-auto max-w-5xl">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-[#FF6B00]">🎯 SpinBite</h1>
            <p className="mt-1 text-sm font-bold text-stone-500">Menu builder</p>
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

        {/* Restaurant selector — location context lives here only, not repeated per section */}
        <div className="mt-5 rounded-3xl bg-white p-5 shadow-xl">
          <p className="text-sm font-black uppercase text-[#FF6B00]">{copy.select_location_label}</p>
          <select
            value={selectedRestaurantId}
            onChange={(e) => setSelectedRestaurantId(e.target.value)}
            className="mt-3 w-full rounded-2xl border border-stone-200 bg-white px-4 py-4 font-black outline-none focus:border-[#FF6B00]"
          >
            {restaurants.map((r) => (
              <option key={r.id} value={r.id}>{locationLabel(r)}</option>
            ))}
          </select>
          {restaurant && (
            <div className="mt-4 rounded-2xl bg-orange-50 p-4">
              <p className="text-xl font-black">{restaurant.name}</p>
              <p className="mt-1 text-sm font-bold text-stone-600">{restaurantAddress(restaurant)}</p>
              <p className="mt-1 text-xs font-bold text-stone-500">/{restaurant.slug}</p>
            </div>
          )}
        </div>

        {/* Create section */}
        <div className="mt-5 rounded-3xl bg-white p-5 shadow-xl">
          <p className="text-sm font-black uppercase text-[#FF6B00]">{copy.create_menu_label}</p>
          <div className="mt-3 flex gap-2">
            <input
              value={newMenu}
              onChange={(e) => setNewMenu(e.target.value)}
              placeholder="Breakfast, Lunch, Dinner..."
              className="min-w-0 flex-1 rounded-2xl border border-stone-200 px-4 py-3 font-semibold outline-none focus:border-[#FF6B00]"
            />
            <button onClick={addMenu} className="rounded-2xl bg-green-600 px-5 py-3 text-xl font-black text-white">
              +
            </button>
          </div>
        </div>

        {/* Notices */}
        {notice && (
          <p className="mt-5 rounded-2xl bg-green-50 p-4 text-sm font-bold text-green-700">{notice}</p>
        )}
        {error && (
          <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p>
        )}

        {/* Section list */}
        <div className="mt-5 space-y-4">
          {menus.length === 0 && (
            <div className="rounded-3xl bg-white p-6 shadow-xl">
              <p className="text-2xl font-black">{copy.no_menus_title}</p>
              <p className="mt-2 text-sm font-semibold text-stone-600">
                {copy.no_menus_copy.replace(
                  'this restaurant location',
                  restaurant ? `${restaurant.name} — ${restaurantAddress(restaurant)}` : 'this restaurant location'
                )}
              </p>
            </div>
          )}

          {menus.map((menu) => {
            const isExpanded = expandedMenuIds.has(menu.id);
            const isEditing = editingMenuId === menu.id;
            const isRenaming = renamingMenuId === menu.id;
            const menuItems = itemsByMenuId[menu.id] || [];

            return (
              <article key={menu.id} className="rounded-3xl bg-white p-5 shadow-xl">

                {/* Section header — tapping toggles collapse/expand */}
                <button
                  onClick={() => toggleMenu(menu.id)}
                  className="flex w-full items-center justify-between gap-4 text-left"
                >
                  <div>
                    <h3 className="text-3xl font-black">{menu.name}</h3>
                    <p className="mt-1 text-sm font-bold text-stone-500">{menu.item_count || 0} items</p>
                  </div>
                  <span className="text-2xl font-black text-stone-400">{isExpanded ? '▲' : '▼'}</span>
                </button>

                {/* Location/address context removed — shown once in the restaurant selector above */}

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <button
                    onClick={() => openEditor(menu)}
                    className="rounded-2xl bg-orange-50 px-4 py-3 text-sm font-black text-[#FF6B00]"
                  >
                    ✏️ Edit Section
                  </button>
                  <button
                    onClick={() => deleteMenu(menu)}
                    className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-black text-red-600"
                  >
                    Delete Section
                  </button>
                </div>

                {/* Browse view (expanded, not editing) */}
                {isExpanded && !isEditing && (
                  <div className="mt-4 space-y-2 rounded-3xl bg-[#FFF8F0] p-4">
                    {menuItems.length === 0 && (
                      <p className="text-sm font-semibold text-stone-500">
                        No items in this section yet. Tap Edit Section to add items.
                      </p>
                    )}
                    {menuItems.map((item) => (
                      <div key={item.id} className="rounded-2xl bg-white p-3 shadow-sm">
                        <div className="flex items-start gap-3">
                          {item.image_url && (
                            <img
                              src={item.image_url}
                              alt={item.name}
                              className="h-16 w-16 shrink-0 rounded-xl object-cover"
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="font-black">{item.name}</p>
                              {item.is_featured && (
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-black text-amber-700">
                                  Featured
                                </span>
                              )}
                              {!item.available && (
                                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-black text-red-600">
                                  Unavailable
                                </span>
                              )}
                            </div>
                            {item.description && (
                              <p className="mt-0.5 line-clamp-2 text-xs text-stone-500">{item.description}</p>
                            )}
                            <p className="mt-1 text-sm font-bold text-stone-500">
                              {item.price != null ? `$${Number(item.price).toFixed(2)} CAD` : 'No price'}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Editor view */}
                {isEditing && (
                  <div className="mt-5 rounded-3xl bg-[#FFF8F0] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-xl font-black">Edit Section</h4>
                      <button
                        onClick={finishEditing}
                        className="rounded-full bg-green-600 px-4 py-2 text-sm font-black text-white"
                      >
                        Done
                      </button>
                    </div>

                    {/* Section rename */}
                    <div className="mt-4 rounded-2xl bg-white p-3 shadow-sm">
                      {!isRenaming ? (
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-black uppercase tracking-wide text-stone-400">Section name</p>
                            <p className="text-2xl font-black">{menu.name}</p>
                          </div>
                          <button
                            onClick={() => startRenameMenu(menu)}
                            aria-label="Edit section name"
                            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-orange-50 text-xl shadow-sm"
                          >
                            ✏️
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <p className="text-xs font-black uppercase tracking-wide text-stone-400">Rename section</p>
                          <input
                            value={editingMenuName}
                            onChange={(e) => setEditingMenuName(e.target.value)}
                            className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-xl font-black outline-none focus:border-[#FF6B00]"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => saveMenuName(menu.id)}
                              className="rounded-2xl bg-green-600 px-4 py-3 text-sm font-black text-white"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setRenamingMenuId(null)}
                              className="rounded-2xl bg-stone-100 px-4 py-3 text-sm font-black text-stone-600"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Add item */}
                    <p className="mt-5 text-sm font-black uppercase text-[#FF6B00]">Add item</p>
                    <div className="mt-2 grid grid-cols-[1fr_110px_48px] gap-2">
                      <input
                        value={newItemName}
                        onChange={(e) => setNewItemName(e.target.value)}
                        placeholder="Item name"
                        className="min-w-0 rounded-2xl border border-stone-200 px-3 py-3 font-semibold outline-none focus:border-[#FF6B00]"
                      />
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-stone-400">$</span>
                        <input
                          value={newItemPrice}
                          onChange={(e) => setNewItemPrice(e.target.value.replace(/[^0-9.]/g, ''))}
                          placeholder="0.00"
                          inputMode="decimal"
                          className="w-full rounded-2xl border border-stone-200 py-3 pl-7 pr-2 font-semibold outline-none focus:border-[#FF6B00]"
                        />
                      </div>
                      <button
                        onClick={addItem}
                        className="rounded-2xl bg-[#FF6B00] text-xl font-black text-white"
                      >
                        +
                      </button>
                    </div>
                    <p className="mt-2 text-xs font-bold text-stone-500">
                      Currency: CAD for MVP. Name is required; price is optional.
                    </p>

                    {/* Item list */}
                    <div className="mt-4 space-y-2">
                      {menuItems.length === 0 && (
                        <p className="text-sm font-semibold text-stone-500">No items in this section yet.</p>
                      )}

                      {menuItems.map((item) => (
                        <div key={item.id} className="rounded-2xl bg-white p-3 shadow-sm">
                          {editingItemId === item.id ? (
                            /* ── Rich item editor ── */
                            <div className="space-y-4">

                              {/* Name + Price */}
                              <div className="grid grid-cols-[1fr_110px] gap-3">
                                <div>
                                  <p className="mb-1 text-xs font-black uppercase tracking-wide text-stone-400">Name</p>
                                  <input
                                    value={editingItemName}
                                    onChange={(e) => setEditingItemName(e.target.value)}
                                    className="w-full rounded-xl border border-stone-200 px-3 py-2 font-bold outline-none focus:border-[#FF6B00]"
                                  />
                                </div>
                                <div>
                                  <p className="mb-1 text-xs font-black uppercase tracking-wide text-stone-400">Price</p>
                                  <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-stone-400">
                                      $
                                    </span>
                                    <input
                                      value={editingItemPrice}
                                      onChange={(e) =>
                                        setEditingItemPrice(e.target.value.replace(/[^0-9.]/g, ''))
                                      }
                                      placeholder="0.00"
                                      inputMode="decimal"
                                      className="w-full rounded-xl border border-stone-200 py-2 pl-7 pr-2 font-semibold outline-none focus:border-[#FF6B00]"
                                    />
                                  </div>
                                </div>
                              </div>

                              {/* Description */}
                              <div>
                                <div className="mb-1 flex items-center justify-between">
                                  <p className="text-xs font-black uppercase tracking-wide text-stone-400">
                                    Description
                                  </p>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      disabled={aiGenerating || !editingItemName.trim()}
                                      onClick={async () => {
                                        setAiGenerating(true);
                                        try {
                                          const res = await fetch('/api/admin/generate-description', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ itemName: editingItemName, tags: editingItemTags }),
                                          });
                                          const data = await res.json();
                                          if (!res.ok) throw new Error(data.error || 'Generation failed');
                                          setEditingItemDescription(data.description);
                                        } catch (err: any) {
                                          setError(err.message || 'AI generation failed');
                                        } finally {
                                          setAiGenerating(false);
                                        }
                                      }}
                                      className="flex items-center gap-1 rounded-lg bg-[#FF6B00] px-2 py-0.5 text-xs font-black text-white transition-opacity hover:opacity-80 disabled:opacity-40"
                                    >
                                      {aiGenerating ? (
                                        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                      ) : (
                                        '✨'
                                      )}
                                      {aiGenerating ? 'Generating…' : 'Generate'}
                                    </button>
                                    <span
                                      className={`text-xs font-bold ${
                                        editingItemDescription.length > 300 ? 'text-amber-600' : 'text-stone-400'
                                      }`}
                                    >
                                      {editingItemDescription.length}/300
                                    </span>
                                  </div>
                                </div>
                                <textarea
                                  value={editingItemDescription}
                                  onChange={(e) => setEditingItemDescription(e.target.value)}
                                  placeholder="Describe this dish…"
                                  rows={3}
                                  className="w-full resize-none rounded-xl border border-stone-200 px-3 py-2 text-sm font-semibold outline-none focus:border-[#FF6B00]"
                                />
                              </div>

                              {/* Image */}
                              {userId && (
                                <MenuItemImageUploader
                                  currentUrl={menuItems.find((i) => i.id === item.id)?.image_url}
                                  itemId={item.id}
                                  restaurantId={restaurant!.id}
                                  ownerId={userId}
                                  supabase={supabase}
                                  onSaved={() => reloadItemsForMenu(editingMenuId!)}
                                />
                              )}

                              {/* Featured + Available toggles */}
                              <div className="grid grid-cols-2 gap-3">
                                <button
                                  type="button"
                                  onClick={() => setEditingItemFeatured(!editingItemFeatured)}
                                  className={`rounded-xl p-3 text-sm font-black transition-colors ${
                                    editingItemFeatured
                                      ? 'bg-amber-100 text-amber-700'
                                      : 'bg-stone-100 text-stone-500'
                                  }`}
                                >
                                  {editingItemFeatured ? '⭐ Featured' : 'Not Featured'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingItemAvailable(!editingItemAvailable)}
                                  className={`rounded-xl p-3 text-sm font-black transition-colors ${
                                    editingItemAvailable
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-red-100 text-red-600'
                                  }`}
                                >
                                  {editingItemAvailable ? '✓ Available' : '✗ Unavailable'}
                                </button>
                              </div>

                              {/* Tags */}
                              <div>
                                <p className="mb-1 text-xs font-black uppercase tracking-wide text-stone-400">Tags</p>
                                <input
                                  value={editingItemTags}
                                  onChange={(e) => setEditingItemTags(e.target.value)}
                                  placeholder="Vegetarian, Vegan, Gluten Free, Spicy…"
                                  className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm font-semibold outline-none focus:border-[#FF6B00]"
                                />
                                <p className="mt-1 text-xs text-stone-400">Comma-separated</p>
                              </div>

                              {/* Display order */}
                              <div>
                                <p className="mb-1 text-xs font-black uppercase tracking-wide text-stone-400">
                                  Display Order
                                </p>
                                <input
                                  type="number"
                                  value={editingItemDisplayOrder}
                                  onChange={(e) => setEditingItemDisplayOrder(e.target.value)}
                                  min="0"
                                  className="w-full rounded-xl border border-stone-200 px-3 py-2 font-semibold outline-none focus:border-[#FF6B00]"
                                />
                                <p className="mt-1 text-xs text-stone-400">
                                  Lower numbers appear first. Items with the same order appear by creation date.
                                </p>
                              </div>

                              {/* Save / Cancel */}
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  onClick={() => saveItem(item.id)}
                                  className="rounded-xl bg-green-600 px-3 py-3 text-sm font-black text-white"
                                >
                                  Save Item
                                </button>
                                <button
                                  onClick={() => setEditingItemId(null)}
                                  className="rounded-xl bg-stone-100 px-3 py-3 text-sm font-black text-stone-600"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* ── Item card ── */
                            <div className="flex items-start gap-3">
                              {item.image_url && (
                                <img
                                  src={item.image_url}
                                  alt={item.name}
                                  className="h-16 w-16 shrink-0 rounded-xl object-cover"
                                />
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <p className="font-black">{item.name}</p>
                                      {item.is_featured && (
                                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-black text-amber-700">
                                          Featured
                                        </span>
                                      )}
                                      {!item.available && (
                                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-black text-red-600">
                                          Unavailable
                                        </span>
                                      )}
                                    </div>
                                    {item.description && (
                                      <p className="mt-0.5 line-clamp-2 text-xs text-stone-500">
                                        {item.description}
                                      </p>
                                    )}
                                    <p className="mt-1 text-sm font-bold text-stone-500">
                                      {item.price != null
                                        ? `$${Number(item.price).toFixed(2)} CAD`
                                        : 'No price'}
                                    </p>
                                  </div>
                                  <div className="flex shrink-0 gap-2">
                                    <button
                                      onClick={() => startEditItem(item)}
                                      className="rounded-full bg-orange-50 px-3 py-2 text-xs font-black text-[#FF6B00]"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => deleteItem(item)}
                                      className="rounded-full bg-red-50 px-3 py-2 text-xs font-black text-red-600"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
