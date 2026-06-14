'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { loadSiteContentMap } from '@/lib/site-content-client';
import { MenuItemImageUploader } from '@/components/admin/restaurants/MenuItemImageUploader';
import { BottomSheet, SheetTab } from '@/components/admin/BottomSheet';

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
  eyebrow: 'Categories',
  headline: 'Build your menu categories.',
  subheadline:
    'Categories are tied to one restaurant location. Select the exact location before creating or editing items.',
  select_location_label: 'Step 1: Select Restaurant Location',
  create_menu_label: 'Step 2: Create Category',
  no_menus_title: 'No categories for this location yet',
  no_menus_copy: 'Create the first category for this restaurant location.',
};

// Extend this array in Phase 3 to add Promotions, AI, Analytics tabs.
const SHEET_TABS: SheetTab[] = [{ id: 'details', label: 'Details' }];

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
  // Items keyed by menu ID so multiple categories can be expanded simultaneously.
  const [itemsByMenuId, setItemsByMenuId] = useState<Record<string, MenuItem[]>>({});
  // Set of expanded category IDs.
  const [expandedMenuIds, setExpandedMenuIds] = useState<Set<string>>(new Set());
  const [newMenu, setNewMenu] = useState('');
  // Category settings panel.
  const [settingsOpenMenuId, setSettingsOpenMenuId] = useState<string | null>(null);
  const [renamingMenuId, setRenamingMenuId] = useState<string | null>(null);
  const [editingMenuName, setEditingMenuName] = useState('');
  // Per-category add-item form state keyed by menu ID.
  const [newItemByMenuId, setNewItemByMenuId] = useState<Record<string, { name: string; price: string }>>({});

  // ── Bottom sheet state ──────────────────────────────────────────────
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeSheetTab, setActiveSheetTab] = useState('details');
  const closeSheetTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Item editor fields (live in state so they survive while the sheet animates closed).
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemMenuId, setEditingItemMenuId] = useState<string | null>(null);
  const [editingItemName, setEditingItemName] = useState('');
  const [editingItemPrice, setEditingItemPrice] = useState('');
  const [editingItemDescription, setEditingItemDescription] = useState('');
  const [editingItemFeatured, setEditingItemFeatured] = useState(false);
  const [editingItemAvailable, setEditingItemAvailable] = useState(true);
  const [editingItemTags, setEditingItemTags] = useState('');
  const [editingItemDisplayOrder, setEditingItemDisplayOrder] = useState('0');
  // Chef Special and Popular are stored as tags in the DB but surfaced as Quick Action chips.
  const [editingItemChefSpecial, setEditingItemChefSpecial] = useState(false);
  const [editingItemPopular, setEditingItemPopular] = useState(false);

  // Original snapshots — captured when the sheet opens. Used to compute dirty state.
  const [originalItemName, setOriginalItemName] = useState('');
  const [originalItemPrice, setOriginalItemPrice] = useState('');
  const [originalItemDescription, setOriginalItemDescription] = useState('');
  const [originalItemTags, setOriginalItemTags] = useState('');
  const [originalItemDisplayOrder, setOriginalItemDisplayOrder] = useState('0');

  // Transient feedback after a Quick Action instant-save.
  const [quickActionFeedback, setQuickActionFeedback] = useState<string | null>(null);

  // Overflow ⋮ menu in the sheet header.
  const [overflowMenuOpen, setOverflowMenuOpen] = useState(false);

  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [aiGenerating, setAiGenerating] = useState(false);

  // Form is dirty when any of the manually-editable fields differ from the snapshot
  // taken when the sheet was opened. Quick Action chips are excluded — they save instantly.
  const isDirty =
    editingItemId !== null &&
    (editingItemName !== originalItemName ||
      editingItemPrice !== originalItemPrice ||
      editingItemDescription !== originalItemDescription ||
      editingItemTags !== originalItemTags ||
      editingItemDisplayOrder !== originalItemDisplayOrder);

  const restaurant = restaurants.find((r) => r.id === selectedRestaurantId) || null;

  // Live item snapshot used inside the sheet (image URL, latest display values).
  // Recomputed whenever itemsByMenuId updates (e.g. after image upload).
  const editingItem = useMemo(
    () =>
      editingItemMenuId
        ? (itemsByMenuId[editingItemMenuId] || []).find((i) => i.id === editingItemId) ?? null
        : null,
    [editingItemMenuId, editingItemId, itemsByMenuId]
  );

  // Loads all menus and all their items in parallel.
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

  // Refreshes items for a single category without touching the rest of the state.
  // Also refreshes the image URL visible inside an open sheet.
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
    setExpandedMenuIds(new Set());
    setSettingsOpenMenuId(null);
    setRenamingMenuId(null);
    setItemsByMenuId({});
    setNewItemByMenuId({});
    setNewMenu('');
    setError('');
    loadMenus(selectedRestaurantId, true);
  }, [selectedRestaurantId]);

  // ── Sheet helpers ──────────────────────────────────────────────────

  function closeSheet() {
    setSheetOpen(false);
    setOverflowMenuOpen(false);
    // Delay clearing editor state until the close animation completes so the
    // sheet content doesn't flash empty during the slide-down transition.
    clearTimeout(closeSheetTimeoutRef.current);
    closeSheetTimeoutRef.current = setTimeout(() => {
      setEditingItemId(null);
      setEditingItemMenuId(null);
    }, 350);
  }

  function startEditItem(item: MenuItem, menuId: string) {
    // Cancel any in-flight close timeout so opening a new item immediately
    // after closing another doesn't clear the freshly-loaded state.
    clearTimeout(closeSheetTimeoutRef.current);

    const QUICK_ACTION_TAGS = ['chef_special', 'popular'];
    const userTags = (item.tags || []).filter((t) => !QUICK_ACTION_TAGS.includes(t));
    const priceStr = item.price != null ? String(item.price) : '';
    const descStr = item.description || '';
    const tagsStr = userTags.join(', ');
    const orderStr = String(item.display_order ?? 0);

    setEditingItemId(item.id);
    setEditingItemMenuId(menuId);
    setEditingItemName(item.name);
    setEditingItemPrice(priceStr);
    setEditingItemDescription(descStr);
    setEditingItemFeatured(item.is_featured);
    setEditingItemAvailable(item.available);
    setEditingItemTags(tagsStr);
    setEditingItemChefSpecial((item.tags || []).includes('chef_special'));
    setEditingItemPopular((item.tags || []).includes('popular'));
    setEditingItemDisplayOrder(orderStr);

    // Snapshot for dirty-state detection.
    setOriginalItemName(item.name);
    setOriginalItemPrice(priceStr);
    setOriginalItemDescription(descStr);
    setOriginalItemTags(tagsStr);
    setOriginalItemDisplayOrder(orderStr);

    setOverflowMenuOpen(false);
    setQuickActionFeedback(null);
    setActiveSheetTab('details');
    setSheetOpen(true);
  }

  // ── Quick Action instant-save ──────────────────────────────────────
  // Persists a boolean flag (available / is_featured / chef_special tag / popular tag)
  // immediately without requiring the main Save button.
  // Each call sends the full set of quick-action fields so the DB stays consistent.
  async function saveQuickAction(patch: {
    available?: boolean;
    is_featured?: boolean;
    chefSpecial?: boolean;
    popular?: boolean;
  }) {
    if (!restaurant || !editingItemId || !editingItemMenuId) return;
    const itemId = editingItemId;
    const menuId = editingItemMenuId;

    // Build the full tags array: keep user-authored tags + updated quick-action tags.
    const userTags = editingItemTags
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t && t !== 'chef_special' && t !== 'popular');
    const newChefSpecial = 'chefSpecial' in patch ? patch.chefSpecial! : editingItemChefSpecial;
    const newPopular = 'popular' in patch ? patch.popular! : editingItemPopular;

    const result = await supabase
      .from('menu_items')
      .update({
        tags: [...userTags, ...(newChefSpecial ? ['chef_special'] : []), ...(newPopular ? ['popular'] : [])],
        available: 'available' in patch ? patch.available! : editingItemAvailable,
        is_featured: 'is_featured' in patch ? patch.is_featured! : editingItemFeatured,
      })
      .eq('id', itemId)
      .eq('restaurant_id', restaurant.id)
      .eq('menu_id', menuId);

    if (result.error) { setError(result.error.message); return; }
    await reloadItemsForMenu(menuId);
    setQuickActionFeedback('✓ Updated');
    setTimeout(() => setQuickActionFeedback(null), 1500);
  }

  // ── Data mutations ─────────────────────────────────────────────────

  async function addMenu() {
    if (!newMenu.trim() || !restaurant) return;
    setError('');
    const slug =
      newMenu.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
    const result = await supabase
      .from('menus')
      .insert({ name: newMenu.trim(), menu_type: newMenu.trim().toLowerCase(), restaurant_id: restaurant.id, slug })
      .select('id')
      .single();
    if (result.error) { setError(result.error.message); return; }
    const newMenuId = result.data?.id as string | undefined;
    setNewMenu('');
    await loadMenus(restaurant.id);
    if (newMenuId) {
      setExpandedMenuIds((prev) => new Set(Array.from(prev).concat(newMenuId)));
    }
    setNotice(`Category created for ${restaurant.name} — ${restaurantAddress(restaurant)}`);
    setTimeout(() => setNotice(''), 1800);
  }

  function toggleMenu(menuId: string) {
    if (expandedMenuIds.has(menuId)) {
      setExpandedMenuIds((prev) => {
        const next = new Set(prev);
        next.delete(menuId);
        return next;
      });
      if (settingsOpenMenuId === menuId) setSettingsOpenMenuId(null);
      return;
    }
    setExpandedMenuIds((prev) => new Set(Array.from(prev).concat(menuId)));
  }

  function toggleSettings(menuId: string) {
    if (settingsOpenMenuId === menuId) {
      setSettingsOpenMenuId(null);
      setRenamingMenuId(null);
    } else {
      setSettingsOpenMenuId(menuId);
    }
  }

  function startRenameMenu(menu: Menu) {
    setRenamingMenuId(menu.id);
    setEditingMenuName(menu.name);
  }

  async function saveMenuName(menuId: string) {
    if (!restaurant || !editingMenuName.trim()) return;
    const newSlug =
      editingMenuName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
    const result = await supabase
      .from('menus')
      .update({ name: editingMenuName.trim(), menu_type: editingMenuName.trim().toLowerCase(), slug: newSlug })
      .eq('id', menuId)
      .eq('restaurant_id', restaurant.id);
    if (result.error) { setError(result.error.message); return; }
    setRenamingMenuId(null);
    setSettingsOpenMenuId(null);
    await loadMenus(restaurant.id);
    setNotice('Category name saved');
    setTimeout(() => setNotice(''), 1500);
  }

  async function addItem(menuId: string) {
    const itemForm = newItemByMenuId[menuId];
    if (!itemForm?.name.trim() || !restaurant) return;
    setError('');
    const result = await supabase.from('menu_items').insert({
      name: itemForm.name.trim(),
      price: parseCadPrice(itemForm.price || ''),
      menu_id: menuId,
      restaurant_id: restaurant.id,
    });
    if (result.error) { setError(result.error.message); return; }
    setNewItemByMenuId((prev) => ({ ...prev, [menuId]: { name: '', price: '' } }));
    await loadMenus(restaurant.id);
    setNotice('Item added');
    setTimeout(() => setNotice(''), 1500);
  }

  async function saveItem(itemId: string) {
    if (!restaurant || !editingItemMenuId || !editingItemName.trim()) return;
    const menuId = editingItemMenuId;
    // Save only the form-editable fields. Quick Actions (available, is_featured,
    // chef_special, popular) are persisted instantly by saveQuickAction and are
    // intentionally excluded here so Save never overwrites their current DB state.
    const result = await supabase
      .from('menu_items')
      .update({
        name: editingItemName.trim(),
        price: parseCadPrice(editingItemPrice),
        description: editingItemDescription.trim() || null,
        // Preserve user-authored tags; also include current quick-action tag state
        // (already synced to DB) so the column stays consistent.
        tags: [
          ...editingItemTags.split(',').map((t) => t.trim()).filter((t) => t && t !== 'chef_special' && t !== 'popular'),
          ...(editingItemChefSpecial ? ['chef_special'] : []),
          ...(editingItemPopular ? ['popular'] : []),
        ],
        display_order: parseInt(editingItemDisplayOrder, 10) || 0,
      })
      .eq('id', itemId)
      .eq('restaurant_id', restaurant.id)
      .eq('menu_id', menuId);
    if (result.error) { setError(result.error.message); return; }
    closeSheet();
    await reloadItemsForMenu(menuId);
    setNotice('Item saved');
    setTimeout(() => setNotice(''), 1500);
  }

  async function deleteItem(item: MenuItem, menuId: string) {
    if (!restaurant) return;
    if (!window.confirm(`Delete ${item.name} from this category?`)) return;
    const result = await supabase
      .from('menu_items')
      .delete()
      .eq('id', item.id)
      .eq('restaurant_id', restaurant.id)
      .eq('menu_id', menuId);
    if (result.error) { setError(result.error.message); return; }
    if (editingItemId === item.id) closeSheet();
    await loadMenus(restaurant.id);
    setNotice('Item deleted');
    setTimeout(() => setNotice(''), 1500);
  }

  async function deleteMenu(menu: Menu) {
    if (!restaurant) return;
    const ok = window.confirm(
      `Delete the entire ${menu.name} category for ${restaurant.name} at ${restaurantAddress(restaurant)}? This will also delete all items in that category.`
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
    setExpandedMenuIds((prev) => {
      const next = new Set(prev);
      next.delete(menu.id);
      return next;
    });
    if (settingsOpenMenuId === menu.id) setSettingsOpenMenuId(null);
    if (editingItemMenuId === menu.id) closeSheet();
    await loadMenus(restaurant.id);
    setNotice('Category deleted');
    setTimeout(() => setNotice(''), 1500);
  }

  if (loading) return <main className="min-h-screen bg-[#FFF8F0] p-6">Loading categories...</main>;

  return (
    <>
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

          {/* Restaurant selector */}
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

          {/* Create category */}
          <div className="mt-5 rounded-3xl bg-white p-5 shadow-xl">
            <p className="text-sm font-black uppercase text-[#FF6B00]">{copy.create_menu_label}</p>
            <div className="mt-3 flex gap-2">
              <input
                value={newMenu}
                onChange={(e) => setNewMenu(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addMenu()}
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

          {/* Category list */}
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
              const isSettingsOpen = settingsOpenMenuId === menu.id;
              const isRenaming = renamingMenuId === menu.id;
              const menuItems = itemsByMenuId[menu.id] || [];
              const newItem = newItemByMenuId[menu.id] || { name: '', price: '' };

              return (
                <article key={menu.id} className="rounded-3xl bg-white p-5 shadow-xl">

                  {/* Category header */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleMenu(menu.id)}
                      className="flex min-w-0 flex-1 items-center justify-between gap-4 text-left"
                    >
                      <div className="min-w-0">
                        <h3 className="text-3xl font-black">{menu.name}</h3>
                        <p className="mt-1 text-sm font-bold text-stone-500">{menu.item_count || 0} items</p>
                      </div>
                      <span className="shrink-0 text-2xl font-black text-stone-400">{isExpanded ? '▲' : '▼'}</span>
                    </button>

                    <button
                      onClick={() => toggleSettings(menu.id)}
                      aria-label="Category settings"
                      title="Category settings"
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-black transition-colors ${
                        isSettingsOpen
                          ? 'bg-[#FF6B00] text-white'
                          : 'bg-stone-100 text-stone-500 hover:bg-orange-50 hover:text-[#FF6B00]'
                      }`}
                    >
                      ⚙
                    </button>
                  </div>

                  {/* Category settings panel */}
                  {isSettingsOpen && (
                    <div className="mt-4 rounded-2xl border border-stone-100 bg-stone-50 p-4">
                      <p className="text-xs font-black uppercase tracking-wide text-stone-400">Category Settings</p>
                      <div className="mt-3 space-y-2">
                        {!isRenaming ? (
                          <button
                            onClick={() => startRenameMenu(menu)}
                            className="flex w-full items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-black text-stone-700 shadow-sm transition-colors hover:bg-orange-50 hover:text-[#FF6B00]"
                          >
                            ✏️ Rename Category
                          </button>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-xs font-black uppercase tracking-wide text-stone-400">Category Name</p>
                            <input
                              value={editingMenuName}
                              onChange={(e) => setEditingMenuName(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && saveMenuName(menu.id)}
                              className="w-full rounded-xl border border-stone-200 px-4 py-3 text-xl font-black outline-none focus:border-[#FF6B00]"
                              autoFocus
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={() => saveMenuName(menu.id)}
                                className="rounded-xl bg-green-600 px-4 py-3 text-sm font-black text-white"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setRenamingMenuId(null)}
                                className="rounded-xl bg-stone-100 px-4 py-3 text-sm font-black text-stone-600"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                        <button
                          onClick={() => deleteMenu(menu)}
                          className="flex w-full items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-black text-red-600 shadow-sm transition-colors hover:bg-red-50"
                        >
                          🗑 Delete Category
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="mt-4 space-y-2">

                      {menuItems.length === 0 && (
                        <p className="rounded-2xl bg-[#FFF8F0] px-4 py-3 text-sm font-semibold text-stone-500">
                          No items in this category yet. Add the first item below.
                        </p>
                      )}

                      {/* ── Item cards — tap any card to open the bottom sheet editor ── */}
                      {menuItems.map((item) => (
                        <div
                          key={item.id}
                          className="group flex items-stretch overflow-hidden rounded-2xl bg-white shadow-sm transition-all hover:shadow-md"
                        >
                          <button
                            onClick={() => startEditItem(item, menu.id)}
                            className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 p-3 text-left transition-colors hover:bg-orange-50 active:bg-orange-100"
                          >
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
                                {!item.available && (
                                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-black text-red-600">
                                    🚫 Sold Out
                                  </span>
                                )}
                                {item.is_featured && (
                                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-black text-amber-700">
                                    ⭐ Featured
                                  </span>
                                )}
                                {(item.tags || []).includes('chef_special') && (
                                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-black text-purple-700">
                                    👨‍🍳 Chef Special
                                  </span>
                                )}
                                {(item.tags || []).includes('popular') && (
                                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-black text-orange-600">
                                    🔥 Popular
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
                            {/* Chevron communicates the card is tappable */}
                            <span className="shrink-0 self-center text-xl font-black text-stone-300 transition-colors group-hover:text-[#FF6B00]">
                              ›
                            </span>
                          </button>

                          {/* Quick-delete — separate tap target so it doesn't trigger the sheet */}
                          <button
                            onClick={() => deleteItem(item, menu.id)}
                            aria-label={`Delete ${item.name}`}
                            className="flex items-center border-l border-stone-100 px-3 text-stone-300 transition-colors hover:bg-red-50 hover:text-red-500"
                          >
                            ✕
                          </button>
                        </div>
                      ))}

                      {/* Add item form */}
                      <div className="rounded-2xl border-2 border-dashed border-stone-200 p-4">
                        <p className="mb-2 text-xs font-black uppercase tracking-wide text-[#FF6B00]">+ Add Item</p>
                        <div className="grid grid-cols-[1fr_110px_48px] gap-2">
                          <input
                            value={newItem.name}
                            onChange={(e) =>
                              setNewItemByMenuId((prev) => ({
                                ...prev,
                                [menu.id]: { ...newItem, name: e.target.value },
                              }))
                            }
                            onKeyDown={(e) => e.key === 'Enter' && addItem(menu.id)}
                            placeholder="Item name"
                            className="min-w-0 rounded-xl border border-stone-200 px-3 py-3 font-semibold outline-none focus:border-[#FF6B00]"
                          />
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-stone-400">$</span>
                            <input
                              value={newItem.price}
                              onChange={(e) =>
                                setNewItemByMenuId((prev) => ({
                                  ...prev,
                                  [menu.id]: { ...newItem, price: e.target.value.replace(/[^0-9.]/g, '') },
                                }))
                              }
                              onKeyDown={(e) => e.key === 'Enter' && addItem(menu.id)}
                              placeholder="0.00"
                              inputMode="decimal"
                              className="w-full rounded-xl border border-stone-200 py-3 pl-7 pr-2 font-semibold outline-none focus:border-[#FF6B00]"
                            />
                          </div>
                          <button
                            onClick={() => addItem(menu.id)}
                            className="rounded-xl bg-[#FF6B00] text-xl font-black text-white"
                          >
                            +
                          </button>
                        </div>
                        <p className="mt-2 text-xs font-bold text-stone-400">
                          CAD · Name required · Price optional
                        </p>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </main>

      {/* ── Bottom sheet item editor ─────────────────────────────────── */}
      <BottomSheet
        open={sheetOpen}
        onClose={closeSheet}
        title={editingItemName || 'Edit Item'}
        tabs={SHEET_TABS}
        activeTab={activeSheetTab}
        onTabChange={setActiveSheetTab}
        headerAction={
          editingItemId ? (
            <div className="relative">
              <button
                onClick={() => setOverflowMenuOpen((v) => !v)}
                aria-label="More options"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-100 text-base font-black text-stone-500 transition-colors hover:bg-stone-200 active:bg-stone-300"
              >
                ⋮
              </button>
              {overflowMenuOpen && (
                <>
                  {/* Transparent overlay closes the menu when tapping outside */}
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setOverflowMenuOpen(false)}
                  />
                  <div className="absolute right-0 top-10 z-20 min-w-[160px] overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-stone-100">
                    <button
                      disabled
                      className="flex w-full cursor-not-allowed items-center gap-2 px-4 py-3 text-sm font-black text-stone-300"
                    >
                      Duplicate Item
                    </button>
                    <div className="mx-4 h-px bg-stone-100" />
                    <button
                      onClick={() => {
                        setOverflowMenuOpen(false);
                        if (editingItem && editingItemMenuId) {
                          deleteItem(editingItem, editingItemMenuId);
                        }
                      }}
                      className="flex w-full items-center gap-2 px-4 py-3 text-sm font-black text-red-500 transition-colors hover:bg-red-50 active:bg-red-100"
                    >
                      Delete Item
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : undefined
        }
        footer={
          isDirty && editingItemId ? (
            <div className="shrink-0 border-t border-stone-100 px-5 pb-5 pt-3">
              <button
                onClick={() => saveItem(editingItemId)}
                className="w-full rounded-xl bg-green-600 px-3 py-3.5 text-sm font-black text-white transition-opacity active:opacity-80"
              >
                Save Changes
              </button>
            </div>
          ) : undefined
        }
      >
        {editingItemId && editingItemMenuId && (
          <div className="space-y-5 pb-8">

            {/* ── QUICK ACTIONS ─────────────────────────────────────── */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-black uppercase tracking-widest text-stone-400">Quick Actions</p>
                {quickActionFeedback && (
                  <span className="text-xs font-black text-green-600 transition-opacity">{quickActionFeedback}</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {/* Available / Sold Out */}
                <button
                  type="button"
                  onClick={() => {
                    const next = !editingItemAvailable;
                    setEditingItemAvailable(next);
                    saveQuickAction({ available: next });
                  }}
                  className={`flex items-center justify-center gap-1.5 rounded-2xl px-3 py-3 text-sm font-black transition-all active:scale-95 ${
                    editingItemAvailable
                      ? 'bg-green-100 text-green-700 shadow-sm ring-1 ring-green-200'
                      : 'bg-red-100 text-red-600 shadow-sm ring-1 ring-red-200'
                  }`}
                >
                  <span>{editingItemAvailable ? '✓' : '🚫'}</span>
                  <span>{editingItemAvailable ? 'Available' : 'Sold Out'}</span>
                </button>

                {/* Featured */}
                <button
                  type="button"
                  onClick={() => {
                    const next = !editingItemFeatured;
                    setEditingItemFeatured(next);
                    saveQuickAction({ is_featured: next });
                  }}
                  className={`flex items-center justify-center gap-1.5 rounded-2xl px-3 py-3 text-sm font-black transition-all active:scale-95 ${
                    editingItemFeatured
                      ? 'bg-amber-100 text-amber-700 shadow-sm ring-1 ring-amber-200'
                      : 'bg-stone-100 text-stone-400 ring-1 ring-stone-200'
                  }`}
                >
                  <span>⭐</span>
                  <span>Featured</span>
                </button>

                {/* Chef Special */}
                <button
                  type="button"
                  onClick={() => {
                    const next = !editingItemChefSpecial;
                    setEditingItemChefSpecial(next);
                    saveQuickAction({ chefSpecial: next });
                  }}
                  className={`flex items-center justify-center gap-1.5 rounded-2xl px-3 py-3 text-sm font-black transition-all active:scale-95 ${
                    editingItemChefSpecial
                      ? 'bg-purple-100 text-purple-700 shadow-sm ring-1 ring-purple-200'
                      : 'bg-stone-100 text-stone-400 ring-1 ring-stone-200'
                  }`}
                >
                  <span>👨‍🍳</span>
                  <span>Chef Special</span>
                </button>

                {/* Popular */}
                <button
                  type="button"
                  onClick={() => {
                    const next = !editingItemPopular;
                    setEditingItemPopular(next);
                    saveQuickAction({ popular: next });
                  }}
                  className={`flex items-center justify-center gap-1.5 rounded-2xl px-3 py-3 text-sm font-black transition-all active:scale-95 ${
                    editingItemPopular
                      ? 'bg-orange-100 text-orange-600 shadow-sm ring-1 ring-orange-200'
                      : 'bg-stone-100 text-stone-400 ring-1 ring-stone-200'
                  }`}
                >
                  <span>🔥</span>
                  <span>Popular</span>
                </button>
              </div>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-stone-100" />
              <p className="text-xs font-black uppercase tracking-widest text-stone-300">Details</p>
              <div className="h-px flex-1 bg-stone-100" />
            </div>

            {/* Name + Price */}
            <div className="grid grid-cols-[1fr_110px] gap-3">
              <div>
                <p className="mb-1 text-xs font-black uppercase tracking-wide text-stone-400">Name</p>
                <input
                  value={editingItemName}
                  onChange={(e) => setEditingItemName(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-base font-bold outline-none focus:border-[#FF6B00]"
                />
              </div>
              <div>
                <p className="mb-1 text-xs font-black uppercase tracking-wide text-stone-400">Price</p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-stone-400">$</span>
                  <input
                    value={editingItemPrice}
                    onChange={(e) => setEditingItemPrice(e.target.value.replace(/[^0-9.]/g, ''))}
                    placeholder="0.00"
                    inputMode="decimal"
                    className="w-full rounded-xl border border-stone-200 py-2.5 pl-7 pr-2 text-base font-semibold outline-none focus:border-[#FF6B00]"
                  />
                </div>
              </div>
            </div>

            {/* Description */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <p className="text-xs font-black uppercase tracking-wide text-stone-400">Description</p>
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
                    ) : '✨'}
                    {aiGenerating ? 'Generating…' : 'Generate'}
                  </button>
                  <span className={`text-xs font-bold ${editingItemDescription.length > 300 ? 'text-amber-600' : 'text-stone-400'}`}>
                    {editingItemDescription.length}/300
                  </span>
                </div>
              </div>
              <textarea
                value={editingItemDescription}
                onChange={(e) => setEditingItemDescription(e.target.value)}
                placeholder="Describe this dish…"
                rows={3}
                className="w-full resize-none rounded-xl border border-stone-200 px-3 py-2.5 text-base font-semibold outline-none focus:border-[#FF6B00]"
              />
            </div>

            {/* Image */}
            {userId && (
              <MenuItemImageUploader
                currentUrl={editingItem?.image_url}
                itemId={editingItemId}
                restaurantId={restaurant!.id}
                ownerId={userId}
                supabase={supabase}
                onSaved={() => reloadItemsForMenu(editingItemMenuId)}
              />
            )}

            {/* Tags — chef_special and popular are excluded; managed by Quick Actions chips above */}
            <div>
              <p className="mb-1 text-xs font-black uppercase tracking-wide text-stone-400">Tags</p>
              <input
                value={editingItemTags}
                onChange={(e) => setEditingItemTags(e.target.value)}
                placeholder="Vegetarian, Vegan, Gluten Free, Spicy…"
                className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-base font-semibold outline-none focus:border-[#FF6B00]"
              />
              <p className="mt-1 text-xs text-stone-400">Comma-separated · chef_special and popular are managed above</p>
            </div>

            {/* Display order */}
            <div>
              <p className="mb-1 text-xs font-black uppercase tracking-wide text-stone-400">Display Order</p>
              <input
                type="number"
                value={editingItemDisplayOrder}
                onChange={(e) => setEditingItemDisplayOrder(e.target.value)}
                min="0"
                className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-base font-semibold outline-none focus:border-[#FF6B00]"
              />
              <p className="mt-1 text-xs text-stone-400">
                Lower numbers appear first. Items with the same order appear by creation date.
              </p>
            </div>

            {/* bottom spacer so last field doesn't hide behind the sticky footer */}
            <div className="h-2" />
          </div>
        )}
      </BottomSheet>
    </>
  );
}
