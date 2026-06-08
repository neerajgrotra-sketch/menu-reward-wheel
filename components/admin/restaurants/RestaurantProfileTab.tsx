'use client';

import { ChangeEvent, useEffect, useState } from 'react';
import type { AppSupabaseClient } from '@/lib/supabase/client';
import type { Restaurant, ProfileForm, MessageState, ConfirmOptions } from './types';
import { sanitizeFileName, pathFromPublicUrl } from './types';
import { HeroImageUploader } from './HeroImageUploader';
import { BrandColorFields } from './BrandColorFields';

const LOGO_BUCKET = 'restaurant-logos';
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

const EXPERIENCE_MODES = [
  {
    value: 'promotion_only',
    icon: '🎯',
    label: 'Promotion Only',
    flow: 'QR → Game → Win',
    detail: 'For campaigns and promotions only',
  },
  {
    value: 'menu_only',
    icon: '🍽️',
    label: 'Menu Only',
    flow: 'QR → Menu → Browse',
    detail: 'Digital menu, no promotions',
  },
  {
    value: 'menu_and_promotion',
    icon: '✨',
    label: 'Menu + Promotion',
    flow: 'QR → Landing → Menu → Game → Win',
    detail: 'Full experience',
    recommended: true,
  },
] as const;

type Props = {
  restaurant: Restaurant;
  form: ProfileForm;
  onChange: (patch: Partial<ProfileForm>) => void;
  supabase: AppSupabaseClient;
  ownerId: string;
  requestConfirm: (opts: ConfirmOptions) => void;
  onSaved: () => void;
};

export function RestaurantProfileTab({ restaurant, form, onChange, supabase, ownerId, requestConfirm, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<MessageState | null>(null);

  // Logo upload state
  const [localLogoPreview, setLocalLogoPreview] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [removingLogo, setRemovingLogo] = useState(false);
  const [logoMessage, setLogoMessage] = useState<MessageState | null>(null);

  // Re-sync form from server data after parent reloads (e.g. post-save).
  useEffect(() => {
    onChange({
      experience_mode:  restaurant.experience_mode  ?? 'promotion_only',
      description:      restaurant.description      ?? '',
      secondary_color:  restaurant.secondary_color  ?? '',
      accent_color:     restaurant.accent_color     ?? '',
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant.id, restaurant.updated_at]);

  // ── Logo upload ─────────────────────────────────────────────────────────────

  async function handleLogoInput(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setLogoMessage({ type: 'error', text: 'Please choose an image file.' });
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoMessage({ type: 'error', text: `Logo is ${(file.size / 1024 / 1024).toFixed(2)} MB — max 2 MB.` });
      return;
    }

    const preview = URL.createObjectURL(file);
    if (localLogoPreview) URL.revokeObjectURL(localLogoPreview);
    setLocalLogoPreview(preview);
    setLogoMessage({ type: 'info', text: 'Uploading…' });
    setUploadingLogo(true);

    const oldPath = pathFromPublicUrl(restaurant.logo_url, LOGO_BUCKET);
    const storagePath = `${ownerId}/${restaurant.id}/${Date.now()}-${sanitizeFileName(file.name || 'logo.png')}`;

    const { error: uploadErr } = await supabase.storage.from(LOGO_BUCKET).upload(storagePath, file, { upsert: true, contentType: file.type });
    if (uploadErr) { setLogoMessage({ type: 'error', text: uploadErr.message }); setUploadingLogo(false); return; }

    const { data: urlData } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(storagePath);
    const { error: updateErr } = await supabase.from('restaurants').update({ logo_url: urlData.publicUrl }).eq('id', restaurant.id);
    if (updateErr) { setLogoMessage({ type: 'error', text: updateErr.message }); setUploadingLogo(false); return; }

    if (oldPath) await supabase.storage.from(LOGO_BUCKET).remove([oldPath]);
    setLogoMessage({ type: 'success', text: 'Logo saved.' });
    setUploadingLogo(false);
    setTimeout(() => URL.revokeObjectURL(preview), 3000);
    onSaved();
  }

  function requestLogoRemove() {
    requestConfirm({
      title: 'Remove logo',
      message: `Remove the logo for ${restaurant.name}? You can re-upload at any time.`,
      confirmLabel: 'Remove',
      danger: true,
      onConfirm: async () => {
        setRemovingLogo(true);
        const { error } = await supabase.from('restaurants').update({ logo_url: null }).eq('id', restaurant.id);
        if (error) { setLogoMessage({ type: 'error', text: error.message }); setRemovingLogo(false); return; }
        const path = pathFromPublicUrl(restaurant.logo_url, LOGO_BUCKET);
        if (path) await supabase.storage.from(LOGO_BUCKET).remove([path]);
        setLocalLogoPreview(null);
        setLogoMessage({ type: 'success', text: 'Logo removed.' });
        setRemovingLogo(false);
        onSaved();
      },
    });
  }

  // ── Profile save ─────────────────────────────────────────────────────────────

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from('restaurants')
      .update({
        experience_mode: form.experience_mode,
        description:     form.description || null,
        secondary_color: form.secondary_color || null,
        accent_color:    form.accent_color || null,
      })
      .eq('id', restaurant.id)
      .eq('owner_id', ownerId);
    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setMessage({ type: 'success', text: 'Profile saved.' });
      setTimeout(() => setMessage(null), 2500);
      onSaved();
    }
    setSaving(false);
  }

  const displayLogo = localLogoPreview ?? restaurant.logo_url;

  return (
    <div className="space-y-6">

      {/* Experience mode */}
      <div>
        <p className="text-xs font-black uppercase tracking-wide text-stone-500">Customer Experience Mode</p>
        <p className="mt-1 text-sm text-stone-500">How customers experience your restaurant after scanning the QR code.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {EXPERIENCE_MODES.map((mode) => (
            <button
              key={mode.value}
              type="button"
              onClick={() => onChange({ experience_mode: mode.value })}
              className={`relative rounded-2xl border-2 p-4 text-left transition-all ${
                form.experience_mode === mode.value
                  ? 'border-[#FF6B00] bg-orange-50'
                  : 'border-stone-200 bg-white hover:border-orange-200'
              }`}
            >
              {'recommended' in mode && mode.recommended && (
                <span className="absolute right-2 top-2 rounded-full bg-[#FF6B00] px-2 py-0.5 text-[10px] font-black text-white">
                  ★ Recommended
                </span>
              )}
              <p className="text-2xl">{mode.icon}</p>
              <p className="mt-2 text-sm font-black">{mode.label}</p>
              <p className="mt-1 text-xs font-semibold text-stone-500">{mode.flow}</p>
              <p className="mt-0.5 text-xs text-stone-400">{mode.detail}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Hero image — only relevant for menu modes */}
      {form.experience_mode !== 'promotion_only' && (
        <HeroImageUploader
          currentUrl={restaurant.hero_image_url}
          restaurantId={restaurant.id}
          ownerId={ownerId}
          supabase={supabase}
          requestConfirm={requestConfirm}
          onSaved={onSaved}
        />
      )}

      {/* Description — only relevant for menu modes */}
      {form.experience_mode !== 'promotion_only' && (
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-stone-500">About Your Restaurant</p>
          <p className="mt-1 text-sm text-stone-500">Shown in the About section of your landing page.</p>
          <textarea
            value={form.description}
            onChange={(e) => onChange({ description: e.target.value.slice(0, 300) })}
            placeholder="Authentic cuisine serving the finest seasonal ingredients since 1998…"
            rows={4}
            className="mt-2 w-full rounded-2xl border border-stone-200 p-3 text-sm font-semibold focus:border-[#FF6B00] focus:outline-none"
          />
          <p className={`mt-1 text-right text-xs font-bold ${form.description.length >= 280 ? 'text-red-500' : 'text-stone-400'}`}>
            {form.description.length} / 300
          </p>
        </div>
      )}

      {/* Brand colors */}
      <BrandColorFields
        brandColor={restaurant.brand_color}
        secondaryColor={form.secondary_color}
        accentColor={form.accent_color}
        onSecondaryChange={(v) => onChange({ secondary_color: v })}
        onAccentChange={(v) => onChange({ accent_color: v })}
      />

      {/* Logo */}
      <div className="rounded-2xl bg-orange-50 p-4">
        <p className="text-xs font-black uppercase tracking-wide text-[#FF6B00]">Logo</p>
        <p className="mt-1 text-xs font-semibold text-stone-500">PNG, JPG, SVG, or WebP · Max 2 MB</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-orange-100 bg-white p-1.5 shadow-sm">
            {displayLogo
              ? <img src={displayLogo} alt="logo preview" className="max-h-full max-w-full object-contain" />
              : <span className="text-xs font-black text-stone-400">No logo</span>
            }
          </div>
          <label className="cursor-pointer rounded-2xl bg-[#FF6B00] px-4 py-2 text-sm font-black text-white">
            {uploadingLogo ? 'Uploading…' : restaurant.logo_url ? 'Replace' : 'Upload Logo'}
            <input type="file" accept="image/*" disabled={uploadingLogo} onChange={handleLogoInput} className="hidden" />
          </label>
          {restaurant.logo_url && (
            <button type="button" onClick={requestLogoRemove} disabled={removingLogo} className="rounded-2xl bg-white px-4 py-2 text-sm font-black text-red-600 shadow-sm disabled:opacity-50">
              {removingLogo ? 'Removing…' : 'Remove'}
            </button>
          )}
        </div>
        {logoMessage && (
          <p className={`mt-2 rounded-xl p-2 text-sm font-bold ${logoMessage.type === 'error' ? 'bg-red-50 text-red-700' : logoMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'text-stone-600'}`}>
            {logoMessage.text}
          </p>
        )}
      </div>

      {message && (
        <p className={`rounded-xl p-3 text-sm font-bold ${message.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {message.text}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex-1 rounded-2xl bg-[#FF6B00] py-3 font-black text-white disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save Profile'}
        </button>
        <a
          href={`/r/${restaurant.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center rounded-2xl border-2 border-[#FF6B00] px-5 py-3 text-sm font-black text-[#FF6B00] hover:bg-orange-50"
        >
          Preview →
        </a>
      </div>
    </div>
  );
}
