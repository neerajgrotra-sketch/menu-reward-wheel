'use client';

import { useEffect, useState } from 'react';
import type { AppSupabaseClient } from '@/lib/supabase/client';
import type { SettingsForm, MessageState } from './types';
import { rowsToSettingsForm } from './types';
import { ToggleRow } from './ToggleRow';

type Props = {
  restaurantId: string;
  restaurantName: string;
  supabase: AppSupabaseClient;
  onDeleteRequest: () => void;
};

export function RestaurantSettingsTab({ restaurantId, restaurantName, supabase, onDeleteRequest }: Props) {
  const [form, setForm] = useState<SettingsForm>({
    widget_position: 'bottom_right',
    show_prices_on_landing: true,
    enable_floating_reward_widget: false,
    show_featured_items_on_landing: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<MessageState | null>(null);

  // Ordering capability — separate table, saves immediately on toggle
  const [orderingEnabled, setOrderingEnabled] = useState(false);
  const [orderingSaving, setOrderingSaving] = useState(false);
  const [orderingMessage, setOrderingMessage] = useState<MessageState | null>(null);

  // Table management capability — same pattern
  const [tableManagementEnabled, setTableManagementEnabled] = useState(false);
  const [tableManagementSaving, setTableManagementSaving] = useState(false);
  const [tableManagementMessage, setTableManagementMessage] = useState<MessageState | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [settingsResult, orderingCapResult, tableCapResult] = await Promise.all([
        supabase.from('restaurant_settings').select('*').eq('restaurant_id', restaurantId),
        (supabase as any)
          .from('restaurant_capabilities')
          .select('enabled')
          .eq('restaurant_id', restaurantId)
          .eq('capability_name', 'ordering')
          .maybeSingle(),
        (supabase as any)
          .from('restaurant_capabilities')
          .select('enabled')
          .eq('restaurant_id', restaurantId)
          .eq('capability_name', 'table_management')
          .maybeSingle(),
      ]);
      if (!cancelled) {
        setForm(rowsToSettingsForm(settingsResult.data ?? []));
        setOrderingEnabled((orderingCapResult.data as { enabled: boolean } | null)?.enabled === true);
        setTableManagementEnabled((tableCapResult.data as { enabled: boolean } | null)?.enabled === true);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [restaurantId, supabase]);

  async function handleToggleTableManagement(enabled: boolean) {
    if (tableManagementSaving) return;
    setTableManagementSaving(true);
    setTableManagementMessage(null);

    const { error } = await (supabase as any)
      .from('restaurant_capabilities')
      .upsert(
        { restaurant_id: restaurantId, capability_name: 'table_management', enabled },
        { onConflict: 'restaurant_id,capability_name' },
      );

    setTableManagementSaving(false);
    if (error) {
      setTableManagementMessage({ type: 'error', text: `Failed to save: ${error.message}` });
    } else {
      setTableManagementEnabled(enabled);
      setTableManagementMessage({ type: 'success', text: enabled ? 'Table management enabled.' : 'Table management disabled.' });
      setTimeout(() => setTableManagementMessage(null), 2500);
    }
  }

  async function handleToggleOrdering(enabled: boolean) {
    if (orderingSaving) return;
    setOrderingSaving(true);
    setOrderingMessage(null);

    const { error } = await (supabase as any)
      .from('restaurant_capabilities')
      .upsert(
        { restaurant_id: restaurantId, capability_name: 'ordering', enabled },
        { onConflict: 'restaurant_id,capability_name' },
      );

    setOrderingSaving(false);
    if (error) {
      setOrderingMessage({ type: 'error', text: `Failed to save: ${error.message}` });
    } else {
      setOrderingEnabled(enabled);
      setOrderingMessage({ type: 'success', text: enabled ? 'Online ordering enabled.' : 'Online ordering disabled.' });
      setTimeout(() => setOrderingMessage(null), 2500);
    }
  }

  const patch = (p: Partial<SettingsForm>) => setForm(f => ({ ...f, ...p }));

  async function save() {
    setSaving(true);
    setMessage(null);

    const { error } = await supabase
      .from('restaurant_settings')
      .upsert(
        [
          { restaurant_id: restaurantId, key: 'widget_position',                value: form.widget_position },
          { restaurant_id: restaurantId, key: 'show_prices_on_landing',         value: form.show_prices_on_landing },
          { restaurant_id: restaurantId, key: 'enable_floating_reward_widget',  value: form.enable_floating_reward_widget },
          { restaurant_id: restaurantId, key: 'show_featured_items_on_landing', value: form.show_featured_items_on_landing },
        ],
        { onConflict: 'restaurant_id,key' }
      );

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setMessage({ type: 'success', text: 'Settings saved.' });
      setTimeout(() => setMessage(null), 2500);
    }
    setSaving(false);
  }

  if (loading) {
    return <p className="py-8 text-center text-sm text-stone-400">Loading settings…</p>;
  }

  return (
    <div className="space-y-4">

      {/* Customer Landing Page */}
      <div>
        <p className="text-xs font-black uppercase tracking-wide text-stone-500">Customer Menu Page</p>
        <div className="mt-2 space-y-2">
          <ToggleRow
            label="Show featured items strip"
            description="Displays a horizontal scroll of featured menu items above the reward card."
            checked={form.show_featured_items_on_landing}
            onChange={(v) => patch({ show_featured_items_on_landing: v })}
          />
          <ToggleRow
            label="Show item prices"
            description="Prices are shown on featured item cards on the menu page."
            checked={form.show_prices_on_landing}
            onChange={(v) => patch({ show_prices_on_landing: v })}
          />
        </div>
      </div>

      {/* Floating Reward Widget */}
      <div>
        <p className="text-xs font-black uppercase tracking-wide text-stone-500">Floating Reward Widget</p>
        <div className="mt-2 space-y-2">
          <ToggleRow
            label="Enable floating widget"
            description="Shows an animated floating button on the menu page for restaurants with Menu + Promotion mode."
            checked={form.enable_floating_reward_widget}
            onChange={(v) => patch({ enable_floating_reward_widget: v })}
          />
          <div className="rounded-2xl border border-stone-100 p-4">
            <p className="text-sm font-black text-[#1F1F1F]">Widget position</p>
            <p className="mt-0.5 text-xs font-semibold text-stone-500">Corner of the screen where the floating widget appears.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(['bottom_right', 'bottom_left'] as const).map((pos) => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => patch({ widget_position: pos })}
                  className={`rounded-2xl border-2 py-2.5 text-sm font-black transition-all ${form.widget_position === pos ? 'border-[#FF6B00] bg-orange-50 text-[#FF6B00]' : 'border-stone-200 text-stone-600 hover:border-orange-200'}`}
                >
                  {pos === 'bottom_right' ? 'Bottom Right' : 'Bottom Left'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {message && (
        <p className={`rounded-xl p-3 text-sm font-bold ${message.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {message.text}
        </p>
      )}

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="w-full rounded-2xl bg-[#FF6B00] py-3 font-black text-white disabled:opacity-60"
      >
        {saving ? 'Saving…' : 'Save Settings'}
      </button>

      {/* Ordering */}
      <div>
        <p className="text-xs font-black uppercase tracking-wide text-stone-500">Ordering</p>
        <div className="mt-2 space-y-2">
          <ToggleRow
            label="Enable Online Ordering"
            description={orderingEnabled
              ? 'Customers can add items to cart and place orders directly from QR menu.'
              : 'Customers can browse menu but cannot place orders.'}
            checked={orderingEnabled}
            onChange={handleToggleOrdering}
            disabled={orderingSaving}
          />
          {orderingMessage && (
            <p className={`rounded-xl p-3 text-sm font-bold ${orderingMessage.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
              {orderingMessage.text}
            </p>
          )}
        </div>
      </div>

      {/* Table Management */}
      <div>
        <p className="text-xs font-black uppercase tracking-wide text-stone-500">Table Management</p>
        <div className="mt-2 space-y-2">
          <ToggleRow
            label="Enable Table Management"
            description={tableManagementEnabled
              ? 'Tables are visible in the Tables tab and available for QR assignment.'
              : 'Table management is disabled for this restaurant.'}
            checked={tableManagementEnabled}
            onChange={handleToggleTableManagement}
            disabled={tableManagementSaving}
          />
          {tableManagementMessage && (
            <p className={`rounded-xl p-3 text-sm font-bold ${tableManagementMessage.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
              {tableManagementMessage.text}
            </p>
          )}
        </div>
      </div>

      {/* Danger Zone */}
      <div className="rounded-2xl border border-red-100 p-4">
        <p className="text-xs font-black uppercase tracking-wide text-red-500">Danger Zone</p>
        <div className="mt-3 space-y-3">

          {/* Archive — placeholder for future lifecycle management */}
          <div className="flex items-start justify-between gap-4 rounded-2xl border border-stone-100 p-4 opacity-50">
            <div className="min-w-0">
              <p className="text-sm font-black text-stone-700">Archive Restaurant</p>
              <p className="mt-0.5 text-xs font-semibold text-stone-500">
                Temporarily hide this location without deleting data. Coming soon.
              </p>
            </div>
            <button
              type="button"
              disabled
              className="shrink-0 cursor-not-allowed rounded-xl bg-stone-200 px-3 py-2 text-xs font-black text-stone-400"
            >
              Archive
            </button>
          </div>

          {/* Delete */}
          <div className="flex items-start justify-between gap-4 rounded-2xl border border-red-100 bg-red-50/50 p-4">
            <div className="min-w-0">
              <p className="text-sm font-black text-stone-700">Delete Restaurant</p>
              <p className="mt-0.5 text-xs font-semibold text-stone-500">
                Permanently removes {restaurantName} and all related data. This cannot be undone.
              </p>
            </div>
            <button
              type="button"
              onClick={onDeleteRequest}
              className="shrink-0 rounded-xl bg-red-600 px-3 py-2 text-xs font-black text-white"
            >
              Delete
            </button>
          </div>

        </div>
      </div>

    </div>
  );
}
