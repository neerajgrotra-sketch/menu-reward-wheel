'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { loadSiteContentMap } from '@/lib/site-content-client';
import { MenuItemImageUploader } from '@/components/admin/restaurants/MenuItemImageUploader';
import { BottomSheet, SheetTab } from '@/components/admin/BottomSheet';
import { calculateSpecialPrice, getDiscountLabel } from '@/lib/menu/special-offer';

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
  special_enabled: boolean;
  special_type: string | null;
  special_percent: number | null;
  special_price: number | null;
  special_start_at: string | null;
  special_end_at: string | null;
  special_no_expiry: boolean;
};

const fallbackCopy = {
  eyebrow: 'Categories',
  headline: 'Build your menu categories.',
  subheadline: 'Organize this menu into categories, then add items to each one.',
  create_menu_label: 'Create Category',
  no_menus_title: 'No categories in this menu yet',
  no_menus_copy: 'Create the first category for this menu.',
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

export default function MenuPage() {
  const supabase = useMemo(() => createClient(), []);
  const params = useParams();
  const libraryMenuId = params.menuId as string;
  const [copy, setCopy] = useState(fallbackCopy);
  const [userId, setUserId] = useState('');
  const [menuName, setMenuName] = useState('');
  const [assignedRestaurantCount, setAssignedRestaurantCount] = useState(0);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
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

  // Special Offer Engine fields
  const [editingItemSpecialEnabled, setEditingItemSpecialEnabled] = useState(false);
  const [editingItemSpecialType, setEditingItemSpecialType] = useState<'percentage' | 'fixed_price'>('percentage');
  const [editingItemSpecialPercent, setEditingItemSpecialPercent] = useState('');
  const [editingItemSpecialPrice, setEditingItemSpecialPrice] = useState('');
  // Duration mode: 'quick' = quick buttons, 'advanced' = explicit dates, 'no_expiry' = no end date
  const [editingItemDurationMode, setEditingItemDurationMode] = useState<'quick' | 'advanced' | 'no_expiry'>('quick');
  const [editingItemQuickHours, setEditingItemQuickHours] = useState<number | 'eod' | null>(null);
  const [editingItemAdvancedStart, setEditingItemAdvancedStart] = useState('');
  const [editingItemAdvancedEnd, setEditingItemAdvancedEnd] = useState('');

  // Original snapshots — captured when the sheet opens. Used to compute dirty state.
  const [originalItemName, setOriginalItemName] = useState('');
  const [originalItemPrice, setOriginalItemPrice] = useState('');
  const [originalItemDescription, setOriginalItemDescription] = useState('');
  const [originalItemTags, setOriginalItemTags] = useState('');
  const [originalItemDisplayOrder, setOriginalItemDisplayOrder] = useState('0');
  const [originalItemSpecialEnabled, setOriginalItemSpecialEnabled] = useState(false);
  const [originalItemSpecialType, setOriginalItemSpecialType] = useState<'percentage' | 'fixed_price'>('percentage');
  const [originalItemSpecialPercent, setOriginalItemSpecialPercent] = useState('');
  const [originalItemSpecialPrice, setOriginalItemSpecialPrice] = useState('');
  const [originalItemDurationMode, setOriginalItemDurationMode] = useState<'quick' | 'advanced' | 'no_expiry'>('quick');
  const [originalItemQuickHours, setOriginalItemQuickHours] = useState<number | 'eod' | null>(null);
  const [originalItemAdvancedStart, setOriginalItemAdvancedStart] = useState('');
  const [originalItemAdvancedEnd, setOriginalItemAdvancedEnd] = useState('');

  // Transient feedback after a Quick Action instant-save.
  const [quickActionFeedback, setQuickActionFeedback] = useState<string | null>(null);

  // Overflow ⋮ menu in the sheet header.
  const [overflowMenuOpen, setOverflowMenuOpen] = useState(false);

  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);

  // AI image generation state machine
  type ImageGenState = 'idle' | 'starting' | 'generating' | 'complete' | 'failed';
  const [imageGenState, setImageGenState] = useState<ImageGenState>('idle');
  const [imageGenJobId, setImageGenJobId] = useState<string | null>(null);
  const [imageGenError, setImageGenError] = useState<string | null>(null);
  type ImageVariant = { assetId: string; url: string; variantIndex: number };
  const [imageGenVariants, setImageGenVariants] = useState<ImageVariant[]>([]);
  const [acceptingAssetId, setAcceptingAssetId] = useState<string | null>(null);
  const imageGenPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Form is dirty when any of the manually-editable fields differ from the snapshot
  // taken when the sheet was opened. Quick Action chips are excluded — they save instantly.
  const isDirty =
    editingItemId !== null &&
    (editingItemName !== originalItemName ||
      editingItemPrice !== originalItemPrice ||
      editingItemDescription !== originalItemDescription ||
      editingItemTags !== originalItemTags ||
      editingItemDisplayOrder !== originalItemDisplayOrder ||
      editingItemSpecialEnabled !== originalItemSpecialEnabled ||
      editingItemSpecialType !== originalItemSpecialType ||
      editingItemSpecialPercent !== originalItemSpecialPercent ||
      editingItemSpecialPrice !== originalItemSpecialPrice ||
      editingItemDurationMode !== originalItemDurationMode ||
      editingItemQuickHours !== originalItemQuickHours ||
      editingItemAdvancedStart !== originalItemAdvancedStart ||
      editingItemAdvancedEnd !== originalItemAdvancedEnd);

  // When a special is enabled, a duration must be selected before save is allowed.
  // True when special is OFF (no duration needed) or exactly one valid path is configured.
  const hasValidDuration =
    !editingItemSpecialEnabled ||
    editingItemDurationMode === 'no_expiry' ||
    (editingItemDurationMode === 'quick' && editingItemQuickHours !== null) ||
    (editingItemDurationMode === 'advanced' &&
      !!editingItemAdvancedStart &&
      !!editingItemAdvancedEnd);

  // Live item snapshot used inside the sheet (image URL, latest display values).
  // Recomputed whenever itemsByMenuId updates (e.g. after image upload).
  const editingItem = useMemo(
    () =>
      editingItemMenuId
        ? (itemsByMenuId[editingItemMenuId] || []).find((i) => i.id === editingItemId) ?? null
        : null,
    [editingItemMenuId, editingItemId, itemsByMenuId]
  );

  // Loads a menu's categories and all their items. Categories must be fetched
  // first — items are then fetched by category_id, since menu_items no longer
  // has a direct menu-level FK (it's scoped via menu_categories.menu_id now).
  async function loadMenus(menuId: string, expandAll = false) {
    const categoryResult = await supabase
      .from('menu_categories')
      .select('id,name,menu_type')
      .eq('menu_id', menuId);

    if (categoryResult.error) { setError(categoryResult.error.message); return; }

    const categoryIds = (categoryResult.data || []).map((c: any) => c.id as string);
    const itemResult = categoryIds.length
      ? await supabase
          .from('menu_items')
          .select('id,name,price,description,image_url,is_featured,available,tags,display_order,category_id,special_enabled,special_type,special_percent,special_price,special_start_at,special_end_at,special_no_expiry')
          .in('category_id', categoryIds)
          .order('display_order', { ascending: true })
      : { data: [] as any[], error: null };

    if (itemResult.error) { setError(itemResult.error.message); return; }

    const allItems = (itemResult.data || []) as unknown as Array<MenuItem & { category_id: string }>;

    const grouped: Record<string, MenuItem[]> = {};
    allItems.forEach((item) => {
      if (!grouped[item.category_id]) grouped[item.category_id] = [];
      grouped[item.category_id].push(item);
    });

    const loadedMenus = (categoryResult.data || []).map((menu: any) => ({
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
  // Returns the fresh item list so callers can use it immediately.
  async function reloadItemsForMenu(categoryId: string): Promise<MenuItem[]> {
    const result = await supabase
      .from('menu_items')
      .select('id,name,price,description,image_url,is_featured,available,tags,display_order,special_enabled,special_type,special_percent,special_price,special_start_at,special_end_at,special_no_expiry')
      .eq('category_id', categoryId)
      .order('display_order', { ascending: true });
    if (result.error) { setError(result.error.message); return []; }
    const freshItems = (result.data || []) as unknown as MenuItem[];
    setItemsByMenuId((prev) => ({
      ...prev,
      [categoryId]: freshItems,
    }));
    return freshItems;
  }

  useEffect(() => {
    async function init() {
      const loadedCopy = await loadSiteContentMap(supabase, 'admin_menu', fallbackCopy);
      setCopy(loadedCopy as typeof fallbackCopy);
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) { window.location.href = '/auth'; return; }
      setUserId(user.id);

      const menuResult = await supabase
        .from('menus')
        .select('id,name,owner_id')
        .eq('id', libraryMenuId)
        .single();
      if (menuResult.error || !menuResult.data || menuResult.data.owner_id !== user.id) {
        window.location.href = '/admin/menus';
        return;
      }
      setMenuName(menuResult.data.name);

      // Authoring restaurant for new items: the first restaurant this menu is
      // currently assigned to (restaurant_menu_assignments.display_order asc).
      // A brand-new, unassigned menu has none yet — category/item creation is
      // gated on this being present (see the banner below).
      const assignmentResult = await supabase
        .from('restaurant_menu_assignments')
        .select('display_order,restaurants(id,name,slug,address_line1,city)')
        .eq('menu_id', libraryMenuId)
        .eq('active', true)
        .order('display_order', { ascending: true });
      const assignedRestaurants = (assignmentResult.data || [])
        .map((a: any) => a.restaurants)
        .filter(Boolean) as Restaurant[];
      setAssignedRestaurantCount(assignedRestaurants.length);
      setRestaurant(assignedRestaurants[0] ?? null);

      await loadMenus(libraryMenuId, true);
      setLoading(false);
    }
    if (libraryMenuId) init();
  }, [supabase, libraryMenuId]);

  // ── Job recovery: resume polling or restore variants on item reopen ──────
  // Fires when the restaurant opens (or reopens) the item editor. Checks
  // whether a background job is still running or completed within the last 24h.
  // If generating → resume polling. If complete → restore the variant grid.
  // This prevents credit loss when the sheet is closed or the page is refreshed
  // during an active generation.
  useEffect(() => {
    if (!editingItemId || !restaurant) return;

    let cancelled = false;

    fetch(
      `/api/admin/generate-food-image/resume?menuItemId=${editingItemId}&restaurantId=${restaurant.id}`,
    )
      .then((r) => r.json())
      .then((data: { status: string; jobId?: string; variants?: { assetId: string; url: string; variantIndex: number }[] }) => {
        if (cancelled) return;
        if (data.status === 'generating' && data.jobId) {
          setImageGenJobId(data.jobId);
          setImageGenState('generating');
          startImageGenPolling(data.jobId);
        } else if (data.status === 'complete' && data.variants && data.variants.length > 0 && data.jobId) {
          setImageGenJobId(data.jobId);
          setImageGenVariants(data.variants);
          setImageGenState('complete');
        }
      })
      .catch(() => {
        // Recovery is best-effort — a failed check falls back to the idle state.
      });

    return () => {
      cancelled = true;
    };
  // startImageGenPolling is redefined each render but functionally stable;
  // including it would cause an infinite loop. editingItemId + restaurant.id
  // are the correct triggers: re-run when the item being edited changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingItemId, restaurant?.id]);

  // ── Sheet helpers ──────────────────────────────────────────────────

  function stopImageGenPolling() {
    if (imageGenPollRef.current) {
      clearInterval(imageGenPollRef.current);
      imageGenPollRef.current = null;
    }
  }

  function resetImageGenState() {
    stopImageGenPolling();
    setImageGenState('idle');
    setImageGenJobId(null);
    setImageGenError(null);
    setImageGenVariants([]);
    setAcceptingAssetId(null);
  }

  function closeSheet() {
    setSheetOpen(false);
    setOverflowMenuOpen(false);
    stopImageGenPolling();
    // Delay clearing editor state until the close animation completes so the
    // sheet content doesn't flash empty during the slide-down transition.
    clearTimeout(closeSheetTimeoutRef.current);
    closeSheetTimeoutRef.current = setTimeout(() => {
      setEditingItemId(null);
      setEditingItemMenuId(null);
      resetImageGenState();
    }, 350);
  }

  function startEditItem(item: MenuItem, menuId: string) {
    // Cancel any in-flight close timeout so opening a new item immediately
    // after closing another doesn't clear the freshly-loaded state.
    clearTimeout(closeSheetTimeoutRef.current);
    resetImageGenState();

    const QUICK_ACTION_TAGS = ['chef_special', 'popular'];
    const userTags = (item.tags || []).filter((t) => !QUICK_ACTION_TAGS.includes(t));
    const priceStr = item.price != null ? String(item.price) : '';
    const descStr = item.description || '';
    const tagsStr = userTags.join(', ');
    const orderStr = String(item.display_order ?? 0);

    const specialType = (item.special_type === 'fixed_price' ? 'fixed_price' : 'percentage') as 'percentage' | 'fixed_price';
    const specialPercent = item.special_percent != null ? String(item.special_percent) : '';
    const specialPrice = item.special_price != null ? String(item.special_price) : '';

    // Determine duration mode from existing DB state.
    // When both timestamps exist, try to reverse-engineer which quick preset was used
    // so the correct button renders highlighted on reopen.
    let durationMode: 'quick' | 'advanced' | 'no_expiry' = 'quick';
    let restoredQuickHours: number | 'eod' | null = null;

    if (item.special_no_expiry) {
      durationMode = 'no_expiry';
    } else if (item.special_start_at && item.special_end_at) {
      const startMs = new Date(item.special_start_at).getTime();
      const endDate = new Date(item.special_end_at);
      const durationHours = Math.round((endDate.getTime() - startMs) / (1000 * 60 * 60));
      const isEod = endDate.getHours() === 23 && endDate.getMinutes() === 59 && endDate.getSeconds() === 59;

      if (isEod) {
        durationMode = 'quick';
        restoredQuickHours = 'eod';
      } else if (([1, 2, 4, 6, 12] as number[]).includes(durationHours)) {
        durationMode = 'quick';
        restoredQuickHours = durationHours;
      } else {
        durationMode = 'advanced';
      }
    } else if (item.special_start_at || item.special_end_at) {
      durationMode = 'advanced';
    }

    // Format datetime-local string (YYYY-MM-DDTHH:mm) from ISO string
    function toDatetimeLocal(iso: string | null): string {
      if (!iso) return '';
      const d = new Date(iso);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

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
    setEditingItemSpecialEnabled(item.special_enabled);
    setEditingItemSpecialType(specialType);
    setEditingItemSpecialPercent(specialPercent);
    setEditingItemSpecialPrice(specialPrice);
    setEditingItemDurationMode(durationMode);
    setEditingItemQuickHours(restoredQuickHours);
    setEditingItemAdvancedStart(toDatetimeLocal(item.special_start_at));
    setEditingItemAdvancedEnd(toDatetimeLocal(item.special_end_at));

    // Snapshot for dirty-state detection.
    setOriginalItemName(item.name);
    setOriginalItemPrice(priceStr);
    setOriginalItemDescription(descStr);
    setOriginalItemTags(tagsStr);
    setOriginalItemDisplayOrder(orderStr);
    setOriginalItemSpecialEnabled(item.special_enabled);
    setOriginalItemSpecialType(specialType);
    setOriginalItemSpecialPercent(specialPercent);
    setOriginalItemSpecialPrice(specialPrice);
    setOriginalItemDurationMode(durationMode);
    setOriginalItemQuickHours(restoredQuickHours);
    setOriginalItemAdvancedStart(toDatetimeLocal(item.special_start_at));
    setOriginalItemAdvancedEnd(toDatetimeLocal(item.special_end_at));

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
      .eq('category_id', menuId);

    if (result.error) { setError(result.error.message); return; }
    await reloadItemsForMenu(menuId);
    setQuickActionFeedback('✓ Updated');
    setTimeout(() => setQuickActionFeedback(null), 1500);
  }

  // ── Data mutations ─────────────────────────────────────────────────

  async function addMenu() {
    if (!newMenu.trim()) return;
    setError('');
    const slug =
      newMenu.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
    const result = await supabase
      .from('menu_categories')
      .insert({ name: newMenu.trim(), menu_type: newMenu.trim().toLowerCase(), menu_id: libraryMenuId, slug })
      .select('id')
      .single();
    if (result.error) { setError(result.error.message); return; }
    const newMenuId = result.data?.id as string | undefined;
    setNewMenu('');
    await loadMenus(libraryMenuId);
    if (newMenuId) {
      setExpandedMenuIds((prev) => new Set(Array.from(prev).concat(newMenuId)));
    }
    setNotice('Category created');
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
    if (!editingMenuName.trim()) return;
    const newSlug =
      editingMenuName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
    const result = await supabase
      .from('menu_categories')
      .update({ name: editingMenuName.trim(), menu_type: editingMenuName.trim().toLowerCase(), slug: newSlug })
      .eq('id', menuId)
      .eq('menu_id', libraryMenuId);
    if (result.error) { setError(result.error.message); return; }
    setRenamingMenuId(null);
    setSettingsOpenMenuId(null);
    await loadMenus(libraryMenuId);
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
      category_id: menuId,
      restaurant_id: restaurant.id,
    });
    if (result.error) { setError(result.error.message); return; }
    setNewItemByMenuId((prev) => ({ ...prev, [menuId]: { name: '', price: '' } }));
    await loadMenus(libraryMenuId);
    setNotice('Item added');
    setTimeout(() => setNotice(''), 1500);
  }

  async function saveItem(itemId: string) {
    if (!restaurant || !editingItemMenuId || !editingItemName.trim() || isSaving) return;
    const menuId = editingItemMenuId;
    setError('');

    // Compute special offer timestamps at save time (Rule 52)
    let specialStartAt: string | null = null;
    let specialEndAt: string | null = null;
    let specialNoExpiry = false;

    if (editingItemSpecialEnabled) {
      if (editingItemSpecialType === 'percentage') {
        const pct = parseFloat(editingItemSpecialPercent);
        if (!Number.isFinite(pct) || pct < 1 || pct > 99) {
          setError('Discount percentage must be between 1 and 99.');
          return;
        }
      }
      if (editingItemSpecialType === 'fixed_price') {
        const sp = parseCadPrice(editingItemSpecialPrice);
        if (sp == null || sp <= 0) {
          setError('Special price must be greater than $0.00.');
          return;
        }
      }

      if (editingItemDurationMode === 'no_expiry') {
        specialNoExpiry = true;
        specialStartAt = new Date().toISOString();
        specialEndAt = null;
      } else if (editingItemDurationMode === 'quick') {
        // Guard: user must have selected a duration preset
        if (editingItemQuickHours === null) {
          setError('Please select a duration for this offer (1H, 2H, 4H…).');
          return;
        }
        const now = new Date();
        specialStartAt = now.toISOString();
        if (editingItemQuickHours === 'eod') {
          const eod = new Date(now);
          eod.setHours(23, 59, 59, 0);
          specialEndAt = eod.toISOString();
        } else {
          specialEndAt = new Date(now.getTime() + editingItemQuickHours * 3600 * 1000).toISOString();
        }
      } else if (editingItemDurationMode === 'advanced') {
        // Guard: both start and end are required in advanced mode.
        if (!editingItemAdvancedStart || !editingItemAdvancedEnd) {
          setError('Choose a promotion duration: No Expiry, Quick Duration, or Advanced Schedule with both start and end dates.');
          return;
        }
        specialStartAt = new Date(editingItemAdvancedStart).toISOString();
        specialEndAt = new Date(editingItemAdvancedEnd).toISOString();
        if (new Date(specialEndAt) <= new Date(specialStartAt)) {
          setError('End date must be after start date.');
          return;
        }
        // Guard: expired end date means the offer will be invisible on the public menu.
        if (new Date(specialEndAt) <= new Date()) {
          setError('This offer\'s end date is in the past — it won\'t appear on your public menu. Please update the schedule or choose a new duration.');
          return;
        }
      }

      // Belt-and-suspenders: if special is enabled but no valid duration path produced
      // any timestamps or no-expiry flag, block the save to prevent a dead offer.
      if (!specialNoExpiry && !specialStartAt) {
        setError('Choose a promotion duration: No Expiry, Quick Duration, or Advanced Schedule.');
        return;
      }
    }

    const updatePayload = {
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
      special_enabled: editingItemSpecialEnabled,
      special_type: editingItemSpecialEnabled ? editingItemSpecialType : null,
      special_percent: editingItemSpecialEnabled && editingItemSpecialType === 'percentage'
        ? parseFloat(editingItemSpecialPercent) || null
        : null,
      special_price: editingItemSpecialEnabled && editingItemSpecialType === 'fixed_price'
        ? parseCadPrice(editingItemSpecialPrice)
        : null,
      special_start_at: specialStartAt,
      special_end_at: specialEndAt,
      special_no_expiry: specialNoExpiry,
    };

    setIsSaving(true);
    const result = await (supabase.from('menu_items').update(updatePayload as any) as any)
      .eq('id', itemId)
      .eq('restaurant_id', restaurant.id)
      .eq('category_id', menuId);

    if (result.error) {
      setError(result.error.message);
      setIsSaving(false);
      return;
    }

    // Reload and re-enter edit mode with fresh DB state so the panel stays open,
    // dirty resets to false, and the user can see what was actually persisted.
    const freshItems = await reloadItemsForMenu(menuId);
    const freshItem = freshItems.find((i) => i.id === itemId) ?? null;
    if (freshItem) {
      startEditItem(freshItem, menuId);
    } else {
      closeSheet();
    }
    setIsSaving(false);
    setNotice('Saved ✓');
    setTimeout(() => setNotice(''), 2000);
  }

  function startImageGenPolling(jobId: string) {
    stopImageGenPolling();
    let pollCount = 0;
    const MAX_POLLS = 25;

    imageGenPollRef.current = setInterval(async () => {
      pollCount++;
      if (pollCount > MAX_POLLS) {
        stopImageGenPolling();
        setImageGenState('failed');
        setImageGenError('Image generation timed out. Please try again.');
        return;
      }
      try {
        const res = await fetch(`/api/admin/generate-food-image/status/${jobId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === 'complete') {
          stopImageGenPolling();
          setImageGenVariants(data.variants ?? []);
          setImageGenState('complete');
        } else if (data.status === 'failed') {
          stopImageGenPolling();
          setImageGenState('failed');
          setImageGenError(data.errorMessage ?? 'Image generation failed. Please try again.');
        }
      } catch {
        // Network hiccup during poll — don't fail, keep polling.
      }
    }, 3000);
  }

  async function generateAIImage() {
    if (!restaurant || !editingItemId || !editingItemMenuId) return;
    resetImageGenState();
    setImageGenState('starting');

    try {
      const res = await fetch('/api/admin/generate-food-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: restaurant.id,
          menuItemId: editingItemId,
          itemName: editingItemName,
          itemDescription: editingItemDescription,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to start image generation.');
      setImageGenJobId(data.jobId);
      setImageGenState('generating');
      startImageGenPolling(data.jobId);
    } catch (err) {
      setImageGenState('failed');
      setImageGenError(err instanceof Error ? err.message : 'Failed to start generation.');
    }
  }

  async function acceptImageVariant(assetId: string) {
    if (!restaurant || !editingItemId || !editingItemMenuId) return;
    setAcceptingAssetId(assetId);
    try {
      const res = await fetch('/api/admin/generate-food-image/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: restaurant.id,
          menuItemId: editingItemId,
          assetId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to apply image.');
      await reloadItemsForMenu(editingItemMenuId);
      resetImageGenState();
      setNotice('Photo applied ✓');
      setTimeout(() => setNotice(''), 2000);
    } catch (err) {
      setImageGenError(err instanceof Error ? err.message : 'Failed to apply image.');
    } finally {
      setAcceptingAssetId(null);
    }
  }

  async function deleteItem(item: MenuItem, menuId: string) {
    if (!restaurant) return;
    if (!window.confirm(`Delete ${item.name} from this category?`)) return;
    const result = await supabase
      .from('menu_items')
      .delete()
      .eq('id', item.id)
      .eq('restaurant_id', restaurant.id)
      .eq('category_id', menuId);
    if (result.error) { setError(result.error.message); return; }
    if (editingItemId === item.id) closeSheet();
    await loadMenus(libraryMenuId);
    setNotice('Item deleted');
    setTimeout(() => setNotice(''), 1500);
  }

  async function deleteMenu(menu: Menu) {
    const ok = window.confirm(
      `Delete the entire ${menu.name} category? This will also delete all items in that category.`
    );
    if (!ok) return;
    setError('');
    const itemDelete = await supabase
      .from('menu_items')
      .delete()
      .eq('category_id', menu.id);
    if (itemDelete.error) { setError(itemDelete.error.message); return; }
    const menuDelete = await supabase
      .from('menu_categories')
      .delete()
      .eq('id', menu.id)
      .eq('menu_id', libraryMenuId);
    if (menuDelete.error) { setError(menuDelete.error.message); return; }
    setExpandedMenuIds((prev) => {
      const next = new Set(prev);
      next.delete(menu.id);
      return next;
    });
    if (settingsOpenMenuId === menu.id) setSettingsOpenMenuId(null);
    if (editingItemMenuId === menu.id) closeSheet();
    await loadMenus(libraryMenuId);
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
              <h1 className="text-3xl font-black text-[#FF6B00]">{menuName || 'Menu builder'}</h1>
            </div>
            <a href="/admin/menus" className="rounded-full bg-white px-4 py-3 text-sm font-black text-[#FF6B00] shadow">
              Menu Library
            </a>
          </div>

          {/* Hero banner */}
          <div className="mt-6 rounded-[2rem] bg-gradient-to-br from-[#FF6B00] to-[#E63939] p-6 text-white shadow-2xl shadow-orange-200">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-white/80">{copy.eyebrow}</p>
            <h2 className="mt-3 text-4xl font-black leading-tight">{copy.headline}</h2>
            <p className="mt-3 text-sm font-semibold text-white/85">{copy.subheadline}</p>
          </div>

          {/* Assigned locations status */}
          <div className="mt-5 rounded-3xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-black uppercase text-[#FF6B00]">Assigned Locations</p>
                {restaurant ? (
                  <>
                    <p className="mt-2 text-xl font-black">{restaurant.name}</p>
                    <p className="mt-1 text-sm font-bold text-stone-600">{restaurantAddress(restaurant)}</p>
                    {assignedRestaurantCount > 1 && (
                      <p className="mt-1 text-xs font-bold text-stone-500">
                        + {assignedRestaurantCount - 1} more location{assignedRestaurantCount - 1 === 1 ? '' : 's'}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="mt-2 text-sm font-bold text-stone-600">
                    Not assigned to any restaurant yet. Assign it before adding items.
                  </p>
                )}
              </div>
              <a
                href={`/admin/menus/${libraryMenuId}/assign`}
                className="shrink-0 rounded-full bg-[#FF6B00] px-4 py-3 text-sm font-black text-white shadow"
              >
                Assign Locations
              </a>
            </div>
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
                <p className="mt-2 text-sm font-semibold text-stone-600">{copy.no_menus_copy}</p>
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
                                {item.special_enabled && (
                                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-black text-[#FF6B00]">
                                    💸 On Special
                                  </span>
                                )}
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
          (isDirty || isSaving) && editingItemId ? (
            <div className="shrink-0 border-t border-stone-100 px-5 pb-5 pt-3">
              <button
                onClick={() => saveItem(editingItemId)}
                disabled={isSaving || !hasValidDuration}
                className="w-full rounded-xl bg-green-600 px-3 py-3.5 text-sm font-black text-white transition-opacity active:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving ? 'Saving…' : 'Save Changes'}
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

            {/* ── LIMITED TIME OFFER ────────────────────────────────── */}
            <div>
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-stone-100" />
                <p className="text-xs font-black uppercase tracking-widest text-stone-300">🔥 LIMITED TIME OFFER</p>
                <div className="h-px flex-1 bg-stone-100" />
              </div>

              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setEditingItemSpecialEnabled((v) => !v)}
                  className={`flex w-full items-center justify-between rounded-2xl px-4 py-3.5 text-sm font-black transition-all active:scale-95 ${
                    editingItemSpecialEnabled
                      ? 'bg-[#FF6B00] text-white shadow-md'
                      : 'bg-stone-100 text-stone-500 ring-1 ring-stone-200'
                  }`}
                >
                  <span>{editingItemSpecialEnabled ? '💸 Special Offer Active' : '💸 Enable Special Offer'}</span>
                  <span className={`relative h-5 w-9 rounded-full transition-colors ${editingItemSpecialEnabled ? 'bg-white/30' : 'bg-stone-300'}`}>
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${editingItemSpecialEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </span>
                </button>
              </div>

              <div className={`grid transition-all duration-200 ${editingItemSpecialEnabled ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                <div className="overflow-hidden">
                  <div className="mt-4 space-y-4">

                    {/* Discount Type */}
                    <div>
                      <p className="mb-2 text-xs font-black uppercase tracking-wide text-stone-400">Discount Type</p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingItemSpecialType('percentage')}
                          className={`rounded-xl px-3 py-3 text-sm font-black transition-all active:scale-95 ${
                            editingItemSpecialType === 'percentage'
                              ? 'bg-[#FF6B00] text-white shadow-md'
                              : 'bg-stone-100 text-stone-500 ring-1 ring-stone-200'
                          }`}
                        >
                          % Percentage Off
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingItemSpecialType('fixed_price')}
                          className={`rounded-xl px-3 py-3 text-sm font-black transition-all active:scale-95 ${
                            editingItemSpecialType === 'fixed_price'
                              ? 'bg-[#FF6B00] text-white shadow-md'
                              : 'bg-stone-100 text-stone-500 ring-1 ring-stone-200'
                          }`}
                        >
                          $ Fixed Price
                        </button>
                      </div>
                    </div>

                    {/* Amount field */}
                    {editingItemSpecialType === 'percentage' ? (
                      <div>
                        <p className="mb-1 text-xs font-black uppercase tracking-wide text-stone-400">Discount %</p>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={editingItemSpecialPercent}
                            onChange={(e) => setEditingItemSpecialPercent(e.target.value)}
                            placeholder="20"
                            min="1"
                            max="99"
                            inputMode="numeric"
                            className="w-28 rounded-xl border border-stone-200 px-3 py-2.5 text-base font-semibold outline-none focus:border-[#FF6B00]"
                          />
                          <span className="text-sm font-black text-stone-400">%</span>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p className="mb-1 text-xs font-black uppercase tracking-wide text-stone-400">Special Price</p>
                        <div className="relative w-36">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-stone-400">$</span>
                          <input
                            type="number"
                            value={editingItemSpecialPrice}
                            onChange={(e) => setEditingItemSpecialPrice(e.target.value)}
                            placeholder="14.99"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            className="w-full rounded-xl border border-stone-200 py-2.5 pl-7 pr-2 text-base font-semibold outline-none focus:border-[#FF6B00]"
                          />
                        </div>
                      </div>
                    )}

                    {/* Live Pricing Preview */}
                    {(() => {
                      const origPrice = parseCadPrice(editingItemPrice);
                      if (origPrice == null) return null;
                      let finalPrice: number | null = null;
                      let label = '';
                      if (editingItemSpecialType === 'percentage') {
                        const pct = parseFloat(editingItemSpecialPercent);
                        if (Number.isFinite(pct) && pct > 0 && pct < 100) {
                          finalPrice = calculateSpecialPrice(origPrice, 'percentage', pct, null);
                          label = getDiscountLabel(origPrice, 'percentage', pct, null);
                        }
                      } else {
                        const sp = parseCadPrice(editingItemSpecialPrice);
                        if (sp != null && sp > 0) {
                          finalPrice = calculateSpecialPrice(origPrice, 'fixed_price', null, sp);
                          label = getDiscountLabel(origPrice, 'fixed_price', null, sp);
                        }
                      }
                      if (finalPrice == null) return null;
                      return (
                        <div className="rounded-xl bg-orange-50 p-3 ring-1 ring-[#FF6B00]/20">
                          <p className="mb-2 text-xs font-black uppercase tracking-wide text-[#FF6B00]">Price Preview</p>
                          <div className="flex items-center gap-2">
                            <span className="text-base font-bold text-stone-400 line-through">${origPrice.toFixed(2)}</span>
                            <span className="text-stone-400">↓</span>
                            <span className="text-lg font-black text-[#FF6B00]">${finalPrice.toFixed(2)}</span>
                            <span className="rounded-full bg-[#FF6B00] px-2 py-0.5 text-xs font-black text-white">{label}</span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Duration */}
                    <div>
                      <p className="mb-1 text-xs font-black uppercase tracking-wide text-stone-400">Duration</p>
                      <p className="mb-3 text-xs text-stone-400">Select how long this offer should remain active.</p>

                      <button
                        type="button"
                        onClick={() => setEditingItemDurationMode(editingItemDurationMode === 'no_expiry' ? 'quick' : 'no_expiry')}
                        className={`mb-3 flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-black transition-all active:scale-95 ${
                          editingItemDurationMode === 'no_expiry'
                            ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-300'
                            : 'bg-stone-50 text-stone-500 ring-1 ring-stone-200'
                        }`}
                      >
                        <span className={`flex h-5 w-5 items-center justify-center rounded border-2 text-xs font-black ${editingItemDurationMode === 'no_expiry' ? 'border-amber-600 bg-amber-600 text-white' : 'border-stone-300'}`}>
                          {editingItemDurationMode === 'no_expiry' ? '✓' : ''}
                        </span>
                        ∞ No Expiry
                      </button>

                      {editingItemDurationMode !== 'no_expiry' && (
                        <>
                          <div className="grid grid-cols-3 gap-2">
                            {([1, 2, 4, 6, 12, 'eod'] as const).map((h) => (
                              <button
                                key={String(h)}
                                type="button"
                                onClick={() => {
                                  setEditingItemDurationMode('quick');
                                  setEditingItemQuickHours(h);
                                }}
                                className={`rounded-xl py-2.5 text-sm font-black transition-all active:scale-95 ${
                                  editingItemDurationMode === 'quick' && editingItemQuickHours === h
                                    ? 'bg-[#FF6B00] text-white shadow-md'
                                    : 'bg-stone-100 text-stone-600 ring-1 ring-stone-200'
                                }`}
                              >
                                {h === 'eod' ? 'End of Day' : `${h}H`}
                              </button>
                            ))}
                          </div>

                          <button
                            type="button"
                            onClick={() => setEditingItemDurationMode(editingItemDurationMode === 'advanced' ? 'quick' : 'advanced')}
                            className="mt-3 flex items-center gap-1 text-xs font-black text-stone-400 hover:text-stone-600"
                          >
                            <span>{editingItemDurationMode === 'advanced' ? '▾' : '▸'}</span>
                            Advanced Schedule
                          </button>

                          {editingItemDurationMode === 'advanced' && (
                            <div className="mt-3 space-y-3 rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200">
                              <div>
                                <p className="mb-1 text-xs font-black uppercase tracking-wide text-stone-400">Start</p>
                                <input
                                  type="datetime-local"
                                  value={editingItemAdvancedStart}
                                  onChange={(e) => setEditingItemAdvancedStart(e.target.value)}
                                  className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-[#FF6B00]"
                                />
                              </div>
                              <div>
                                <p className="mb-1 text-xs font-black uppercase tracking-wide text-stone-400">End</p>
                                <input
                                  type="datetime-local"
                                  value={editingItemAdvancedEnd}
                                  onChange={(e) => setEditingItemAdvancedEnd(e.target.value)}
                                  className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-[#FF6B00]"
                                />
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                  </div>
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
                        const res = await fetch('/api/admin/intelligence/generate', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            featureKey:   'menu_description_generation',
                            restaurantId: restaurant?.id ?? '',
                            context: {
                              item_name:       editingItemName,
                              tags:            editingItemTags,
                              restaurant_name: restaurant?.name ?? '',
                              category_name:   menus.find((m) => m.id === editingItemMenuId)?.name ?? '',
                            },
                          }),
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error || 'Generation failed');
                        setEditingItemDescription(data.output);
                      } catch {
                        setError("Couldn't generate right now. Please try again.");
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
            {userId && restaurant && (
              <MenuItemImageUploader
                currentUrl={editingItem?.image_url}
                itemId={editingItemId}
                restaurantId={restaurant.id}
                ownerId={userId}
                supabase={supabase}
                onSaved={() => reloadItemsForMenu(editingItemMenuId)}
              />
            )}

            {/* AI Image Generation */}
            <div className="rounded-2xl border border-stone-100 bg-stone-50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-black uppercase tracking-wide text-stone-400">AI Photo</p>
                {imageGenState !== 'idle' && (
                  <button
                    type="button"
                    onClick={resetImageGenState}
                    className="text-xs font-bold text-stone-400 underline"
                  >
                    Reset
                  </button>
                )}
              </div>

              {/* Idle — show generate button */}
              {imageGenState === 'idle' && (
                <button
                  type="button"
                  onClick={generateAIImage}
                  disabled={!editingItemName.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FF6B00] px-4 py-3 text-sm font-black text-white transition-opacity hover:opacity-80 disabled:opacity-40"
                >
                  <span>✨</span>
                  Generate AI Photo
                </button>
              )}

              {/* Starting / generating — spinner */}
              {(imageGenState === 'starting' || imageGenState === 'generating') && (
                <div className="flex flex-col items-center gap-3 py-4">
                  <span className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-[#FF6B00] border-t-transparent" />
                  <p className="text-sm font-bold text-stone-500">
                    {imageGenState === 'starting' ? 'Starting generation…' : 'Generating 4 variants…'}
                  </p>
                  <p className="text-xs text-stone-400">This takes 15–30 seconds</p>
                </div>
              )}

              {/* Failed — error + retry */}
              {imageGenState === 'failed' && (
                <div className="flex flex-col gap-3">
                  <p className="text-sm font-bold text-red-600">{imageGenError ?? 'Generation failed.'}</p>
                  <button
                    type="button"
                    onClick={generateAIImage}
                    disabled={!editingItemName.trim()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FF6B00] px-4 py-3 text-sm font-black text-white transition-opacity hover:opacity-80 disabled:opacity-40"
                  >
                    Try Again
                  </button>
                </div>
              )}

              {/* Complete — 4 variant grid (Phase 6: accept buttons added here) */}
              {imageGenState === 'complete' && imageGenVariants.length > 0 && (
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-stone-500">Choose the best photo for this item.</p>
                  <div className="grid grid-cols-2 gap-2">
                    {imageGenVariants.map((v) => (
                      <div key={v.assetId} className="relative overflow-hidden rounded-xl">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={v.url}
                          alt={`AI variant ${v.variantIndex}`}
                          className="aspect-square w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => acceptImageVariant(v.assetId)}
                          disabled={acceptingAssetId !== null}
                          className="absolute inset-x-0 bottom-0 bg-black/70 py-2 text-xs font-black text-white transition-opacity hover:bg-black/90 disabled:opacity-50"
                        >
                          {acceptingAssetId === v.assetId ? 'Applying…' : 'Use This Photo'}
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={generateAIImage}
                    disabled={acceptingAssetId !== null || !editingItemName.trim()}
                    className="text-xs font-bold text-stone-400 underline disabled:opacity-40"
                  >
                    Regenerate (new variants)
                  </button>
                </div>
              )}

              {imageGenJobId && (
                <p className="mt-2 text-[10px] text-stone-300">Job: {imageGenJobId}</p>
              )}
            </div>

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
