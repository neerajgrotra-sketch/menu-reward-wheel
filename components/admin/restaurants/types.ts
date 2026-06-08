import type { Tables } from '@/lib/supabase/database.types';

export type Restaurant = Tables<'restaurants'>;
export type RestaurantSettingRow = Tables<'restaurant_settings'>;

export type DayHours = { open: string; close: string; closed: boolean };
export type WeekHours = {
  monday: DayHours;
  tuesday: DayHours;
  wednesday: DayHours;
  thursday: DayHours;
  friday: DayHours;
  saturday: DayHours;
  sunday: DayHours;
};

export type ProfileForm = {
  experience_mode: string;
  description: string;
  secondary_color: string;
  accent_color: string;
};

export type ContactForm = {
  phone: string;
  address_line1: string;
  city: string;
  province_state: string;
  postal_code: string;
  country: string;
  website_url: string;
  instagram_url: string;
  facebook_url: string;
  google_maps_url: string;
  hours: WeekHours;
};

export type SettingsForm = {
  widget_position: 'bottom_right' | 'bottom_left';
  show_prices_on_landing: boolean;
  enable_floating_reward_widget: boolean;
  show_featured_items_on_landing: boolean;
};

export const SETTINGS_DEFAULTS: SettingsForm = {
  widget_position: 'bottom_right',
  show_prices_on_landing: true,
  enable_floating_reward_widget: false,
  show_featured_items_on_landing: true,
};

export type MessageState = { type: 'info' | 'error' | 'success'; text: string };

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
};

export function defaultWeekHours(): WeekHours {
  const weekday: DayHours = { open: '11:00', close: '22:00', closed: false };
  return {
    monday: { ...weekday },
    tuesday: { ...weekday },
    wednesday: { ...weekday },
    thursday: { ...weekday },
    friday: { open: '11:00', close: '23:00', closed: false },
    saturday: { open: '12:00', close: '23:00', closed: false },
    sunday: { open: '12:00', close: '21:00', closed: false },
  };
}

export function parseHours(raw: unknown): WeekHours {
  const defaults = defaultWeekHours();
  if (!raw || typeof raw !== 'object') return defaults;
  const result = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof WeekHours)[]) {
    const d = (raw as Record<string, unknown>)[key];
    if (d && typeof d === 'object') {
      const day = d as Record<string, unknown>;
      result[key] = {
        open: typeof day.open === 'string' ? day.open : defaults[key].open,
        close: typeof day.close === 'string' ? day.close : defaults[key].close,
        closed: typeof day.closed === 'boolean' ? day.closed : false,
      };
    }
  }
  return result;
}

export function rowsToSettingsForm(rows: RestaurantSettingRow[]): SettingsForm {
  const map = new Map(rows.map(r => [r.key, r.value]));
  return {
    widget_position: (map.get('widget_position') as 'bottom_right' | 'bottom_left') ?? SETTINGS_DEFAULTS.widget_position,
    show_prices_on_landing: (map.get('show_prices_on_landing') as boolean) ?? SETTINGS_DEFAULTS.show_prices_on_landing,
    enable_floating_reward_widget: (map.get('enable_floating_reward_widget') as boolean) ?? SETTINGS_DEFAULTS.enable_floating_reward_widget,
    show_featured_items_on_landing: (map.get('show_featured_items_on_landing') as boolean) ?? SETTINGS_DEFAULTS.show_featured_items_on_landing,
  };
}

export function normalizeUrl(value: string): string {
  const v = value.trim();
  if (!v) return v;
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v}`;
}

export function sanitizeFileName(name: string): string {
  const parts = name.split('.');
  const ext = parts.length > 1 ? parts.pop()?.toLowerCase() : 'jpg';
  const base = parts.join('.').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'upload';
  return `${base}.${ext ?? 'jpg'}`;
}

export function pathFromPublicUrl(url: string | null | undefined, bucket: string): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length).split('?')[0]);
}
