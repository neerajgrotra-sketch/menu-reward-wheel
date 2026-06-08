'use client';

import { useEffect, useState } from 'react';
import type { AppSupabaseClient } from '@/lib/supabase/client';
import type { SettingsForm, MessageState } from './types';
import { rowsToSettingsForm } from './types';

type Props = {
  restaurantId: string;
  supabase: AppSupabaseClient;
};

type ToggleRowProps = {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
};

function ToggleRow({ label, description, checked, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-stone-100 p-4">
      <div className="min-w-0">
        <p className="text-sm font-black text-[#1F1F1F]">{label}</p>
        <p className="mt-0.5 text-xs font-semibold leading-5 text-stone-500">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-[#FF6B00] focus:ring-offset-2 ${checked ? 'bg-[#FF6B00]' : 'bg-stone-200'}`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`}
        />
      </button>
    </div>
  );
}

export function RestaurantSettingsTab({ restaurantId, supabase }: Props) {
  const [form, setForm] = useState<SettingsForm>({
    widget_position: 'bottom_right',
    show_prices_on_landing: true,
    enable_floating_reward_widget: false,
    show_featured_items_on_landing: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<MessageState | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from('restaurant_settings')
        .select('*')
        .eq('restaurant_id', restaurantId);
      if (!cancelled) {
        setForm(rowsToSettingsForm(data ?? []));
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [restaurantId, supabase]);

  const patch = (p: Partial<SettingsForm>) => setForm(f => ({ ...f, ...p }));

  async function save() {
    setSaving(true);
    setMessage(null);

    const { error } = await supabase
      .from('restaurant_settings')
      .upsert(
        [
          { restaurant_id: restaurantId, key: 'widget_position',               value: form.widget_position },
          { restaurant_id: restaurantId, key: 'show_prices_on_landing',        value: form.show_prices_on_landing },
          { restaurant_id: restaurantId, key: 'enable_floating_reward_widget', value: form.enable_floating_reward_widget },
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
      <div>
        <p className="text-xs font-black uppercase tracking-wide text-stone-500">Customer Landing Page</p>
        <div className="mt-2 space-y-2">
          <ToggleRow
            label="Show featured items strip"
            description="Displays a horizontal scroll of featured menu items above the reward card."
            checked={form.show_featured_items_on_landing}
            onChange={(v) => patch({ show_featured_items_on_landing: v })}
          />
          <ToggleRow
            label="Show item prices"
            description="Prices are shown on featured item cards on the landing page."
            checked={form.show_prices_on_landing}
            onChange={(v) => patch({ show_prices_on_landing: v })}
          />
        </div>
      </div>

      <div>
        <p className="text-xs font-black uppercase tracking-wide text-stone-500">Floating Reward Widget</p>
        <div className="mt-2 space-y-2">
          <ToggleRow
            label="Enable floating widget"
            description="Shows an animated floating button on the menu page for Mode 3 restaurants."
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
    </div>
  );
}
