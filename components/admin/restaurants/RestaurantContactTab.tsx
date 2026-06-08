'use client';

import { useEffect, useState } from 'react';
import type { AppSupabaseClient } from '@/lib/supabase/client';
import type { Restaurant, ContactForm, MessageState, WeekHours, DayHours } from './types';
import { parseHours, normalizeUrl } from './types';
import { HoursEditor } from './HoursEditor';

type Props = {
  restaurant: Restaurant;
  form: ContactForm;
  onChange: (patch: Partial<ContactForm>) => void;
  onHoursChange: (day: keyof WeekHours, patch: Partial<DayHours>) => void;
  supabase: AppSupabaseClient;
  ownerId: string;
  onSaved: () => void;
};

const URL_FIELDS = [
  { field: 'website_url'    as const, label: 'Website',      placeholder: 'https://yourrestaurant.ca' },
  { field: 'google_maps_url' as const, label: 'Google Maps',  placeholder: 'Google Maps share link' },
  { field: 'instagram_url'  as const, label: 'Instagram',     placeholder: 'https://instagram.com/yourrestaurant' },
  { field: 'facebook_url'   as const, label: 'Facebook',      placeholder: 'https://facebook.com/yourrestaurant' },
];

const ICONS: Record<string, string> = {
  website_url:     '🌐',
  google_maps_url: '🗺️',
  instagram_url:   '📸',
  facebook_url:    '👥',
};

export function RestaurantContactTab({ restaurant, form, onChange, onHoursChange, supabase, ownerId, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<MessageState | null>(null);

  // Re-sync from parent when restaurant data reloads after a save.
  useEffect(() => {
    onChange({
      phone:          restaurant.phone          ?? '',
      address_line1:  restaurant.address_line1  ?? '',
      city:           restaurant.city           ?? '',
      province_state: restaurant.province_state ?? '',
      postal_code:    restaurant.postal_code    ?? '',
      country:        restaurant.country        ?? 'Canada',
      website_url:    restaurant.website_url    ?? '',
      instagram_url:  restaurant.instagram_url  ?? '',
      facebook_url:   restaurant.facebook_url   ?? '',
      google_maps_url: restaurant.google_maps_url ?? '',
      hours:          parseHours(restaurant.hours),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant.id, restaurant.updated_at]);

  function handleUrlBlur(field: keyof ContactForm) {
    const val = form[field] as string;
    const normalized = normalizeUrl(val);
    if (normalized !== val) onChange({ [field]: normalized });
  }

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from('restaurants')
      .update({
        phone:          form.phone           || null,
        address_line1:  form.address_line1   || null,
        city:           form.city            || null,
        province_state: form.province_state  || null,
        postal_code:    form.postal_code     || null,
        country:        form.country         || 'Canada',
        website_url:    normalizeUrl(form.website_url)     || null,
        instagram_url:  normalizeUrl(form.instagram_url)   || null,
        facebook_url:   normalizeUrl(form.facebook_url)    || null,
        google_maps_url: normalizeUrl(form.google_maps_url) || null,
        hours:          form.hours,
      })
      .eq('id', restaurant.id)
      .eq('owner_id', ownerId);
    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setMessage({ type: 'success', text: 'Contact info saved.' });
      setTimeout(() => setMessage(null), 2500);
      onSaved();
    }
    setSaving(false);
  }

  const input = 'w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm font-semibold focus:border-[#FF6B00] focus:outline-none';
  const label = 'text-xs font-black uppercase tracking-wide text-stone-500';

  return (
    <div className="space-y-6">

      {/* Address */}
      <div>
        <p className={label}>Address</p>
        <div className="mt-2 space-y-2">
          <input type="text" value={form.address_line1} onChange={(e) => onChange({ address_line1: e.target.value })} placeholder="Street address" className={input} />
          <div className="grid grid-cols-2 gap-2">
            <input type="text" value={form.city} onChange={(e) => onChange({ city: e.target.value })} placeholder="City" className={input} />
            <input type="text" value={form.province_state} onChange={(e) => onChange({ province_state: e.target.value })} placeholder="Province / State" className={input} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input type="text" value={form.postal_code} onChange={(e) => onChange({ postal_code: e.target.value })} placeholder="Postal / ZIP" className={input} />
            <input type="text" value={form.country} onChange={(e) => onChange({ country: e.target.value })} placeholder="Country" className={input} />
          </div>
        </div>
      </div>

      {/* Phone */}
      <div>
        <p className={label}>Phone</p>
        <input type="tel" value={form.phone} onChange={(e) => onChange({ phone: e.target.value })} placeholder="(416) 555-1234" className={`mt-2 ${input}`} />
      </div>

      {/* Online presence — URLs normalize on blur */}
      <div>
        <p className={label}>Online Presence</p>
        <p className="mt-1 text-xs text-stone-400">All fields optional — only filled fields appear on your landing page. URLs without https:// are auto-prefixed on save.</p>
        <div className="mt-2 space-y-2">
          {URL_FIELDS.map(({ field, label: fieldLabel, placeholder }) => (
            <div key={field}>
              <p className="mb-1 text-xs font-semibold text-stone-500">{ICONS[field]} {fieldLabel}</p>
              <input
                type="url"
                value={form[field] as string}
                onChange={(e) => onChange({ [field]: e.target.value })}
                onBlur={() => handleUrlBlur(field)}
                placeholder={placeholder}
                className={input}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Hours */}
      <div>
        <p className={label}>Opening Hours</p>
        <div className="mt-3">
          <HoursEditor hours={form.hours} onChange={onHoursChange} />
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
        {saving ? 'Saving…' : 'Save Contact Info'}
      </button>
    </div>
  );
}
