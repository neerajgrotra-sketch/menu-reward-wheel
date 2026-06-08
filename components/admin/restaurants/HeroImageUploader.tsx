'use client';

import { ChangeEvent, useRef, useState } from 'react';
import type { AppSupabaseClient } from '@/lib/supabase/client';
import type { ConfirmOptions, MessageState } from './types';
import { pathFromPublicUrl } from './types';

const HERO_BUCKET = 'restaurant-heroes';
const MAX_HERO_BYTES = 10 * 1024 * 1024;

type Props = {
  currentUrl: string | null | undefined;
  restaurantId: string;
  ownerId: string;
  supabase: AppSupabaseClient;
  requestConfirm: (opts: ConfirmOptions) => void;
  onSaved: () => void;
};

export function HeroImageUploader({ currentUrl, restaurantId, ownerId, supabase, requestConfirm, onSaved }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [message, setMessage] = useState<MessageState | null>(null);

  function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/webp', 'image/png'].includes(file.type)) {
      setMessage({ type: 'error', text: 'JPEG, WebP, or PNG only.' });
      return;
    }
    if (file.size > MAX_HERO_BYTES) {
      setMessage({ type: 'error', text: `Image is ${(file.size / 1024 / 1024).toFixed(2)} MB — max 10 MB.` });
      return;
    }
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(file);
    setPendingPreview(URL.createObjectURL(file));
    setMessage(null);
  }

  function cancelPending() {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(null);
    setPendingPreview(null);
    setMessage(null);
  }

  async function uploadPending() {
    if (!pendingFile) return;
    setUploading(true);
    setMessage({ type: 'info', text: 'Uploading…' });

    const ext = pendingFile.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    // Unique path per upload avoids CDN caching issues without polluting the stored URL.
    const storagePath = `${ownerId}/${restaurantId}/hero-${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from(HERO_BUCKET)
      .upload(storagePath, pendingFile, { upsert: true, contentType: pendingFile.type });

    if (uploadErr) {
      setMessage({ type: 'error', text: uploadErr.message });
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from(HERO_BUCKET).getPublicUrl(storagePath);
    // Store the clean public URL — no cache-busting params in the DB value.
    const cleanUrl = urlData.publicUrl;

    const { error: updateErr } = await supabase
      .from('restaurants')
      .update({ hero_image_url: cleanUrl })
      .eq('id', restaurantId);

    if (updateErr) {
      setMessage({ type: 'error', text: updateErr.message });
      setUploading(false);
      return;
    }

    // Clean up old hero file after successful save (best-effort; failure is non-fatal).
    if (currentUrl) {
      const oldPath = pathFromPublicUrl(currentUrl, HERO_BUCKET);
      if (oldPath && oldPath !== storagePath) {
        await supabase.storage.from(HERO_BUCKET).remove([oldPath]);
      }
    }

    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(null);
    setPendingPreview(null);
    setMessage({ type: 'success', text: 'Hero image saved.' });
    setUploading(false);
    onSaved();
  }

  function requestRemove() {
    requestConfirm({
      title: 'Remove hero image',
      message: 'This will remove the hero image from your landing page. You can re-upload at any time.',
      confirmLabel: 'Remove',
      danger: true,
      onConfirm: async () => {
        setRemoving(true);
        const { error } = await supabase
          .from('restaurants')
          .update({ hero_image_url: null })
          .eq('id', restaurantId);
        if (error) {
          setMessage({ type: 'error', text: error.message });
          setRemoving(false);
          return;
        }
        const path = pathFromPublicUrl(currentUrl, HERO_BUCKET);
        if (path) await supabase.storage.from(HERO_BUCKET).remove([path]);
        setMessage(null);
        setRemoving(false);
        onSaved();
      },
    });
  }

  const displayUrl = pendingPreview ?? currentUrl;

  return (
    <div>
      <p className="text-xs font-black uppercase tracking-wide text-stone-500">Hero Image</p>
      <p className="mt-1 text-sm text-stone-500">Full-bleed background shown on your landing page. Recommended: 1600 × 900px (16:9).</p>

      <div className="mt-2 overflow-hidden rounded-2xl border-2 border-dashed border-stone-200">
        {displayUrl ? (
          <div className="relative">
            <img src={displayUrl} alt="Hero preview" className="h-40 w-full object-cover" />
            {pendingFile ? (
              // Step 2: file selected, awaiting upload confirmation
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50">
                <p className="text-xs font-bold text-white">{pendingFile.name}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={uploadPending}
                    disabled={uploading}
                    className="rounded-xl bg-[#FF6B00] px-4 py-2 text-sm font-black text-white disabled:opacity-60"
                  >
                    {uploading ? 'Uploading…' : 'Upload'}
                  </button>
                  <button
                    type="button"
                    onClick={cancelPending}
                    disabled={uploading}
                    className="rounded-xl bg-white px-4 py-2 text-sm font-black text-stone-700 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              // Step 1: existing image, hover overlay
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 transition-opacity hover:opacity-100">
                <label className="cursor-pointer rounded-xl bg-white px-3 py-2 text-sm font-black">
                  Replace
                  <input ref={inputRef} type="file" accept="image/jpeg,image/webp,image/png" onChange={handleFileSelect} className="hidden" />
                </label>
                <button
                  type="button"
                  onClick={requestRemove}
                  disabled={removing}
                  className="rounded-xl bg-red-600 px-3 py-2 text-sm font-black text-white disabled:opacity-60"
                >
                  {removing ? 'Removing…' : 'Remove'}
                </button>
              </div>
            )}
          </div>
        ) : (
          // Step 1: no image — drop zone
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 py-10 text-stone-400 hover:bg-stone-50">
            <span className="text-4xl">📷</span>
            <span className="text-sm font-bold">Drag and drop, or tap to select</span>
            <span className="text-xs">JPEG · WebP · PNG · Max 10 MB</span>
            <input ref={inputRef} type="file" accept="image/jpeg,image/webp,image/png" onChange={handleFileSelect} className="hidden" />
          </label>
        )}
      </div>

      {message && (
        <p className={`mt-2 rounded-xl p-2 text-sm font-bold ${message.type === 'error' ? 'bg-red-50 text-red-700' : message.type === 'success' ? 'bg-green-50 text-green-700' : 'text-stone-600'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
