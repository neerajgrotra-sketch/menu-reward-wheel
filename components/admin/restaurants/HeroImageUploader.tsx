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

    const { error: updateErr } = await supabase
      .from('restaurants')
      .update({ hero_image_url: urlData.publicUrl })
      .eq('id', restaurantId);

    if (updateErr) {
      setMessage({ type: 'error', text: updateErr.message });
      setUploading(false);
      return;
    }

    if (currentUrl) {
      const oldPath = pathFromPublicUrl(currentUrl, HERO_BUCKET);
      if (oldPath && oldPath !== storagePath) {
        await supabase.storage.from(HERO_BUCKET).remove([oldPath]);
      }
    }

    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(null);
    setPendingPreview(null);
    setMessage({ type: 'success', text: 'Cover photo saved.' });
    setUploading(false);
    onSaved();
  }

  function requestRemove() {
    requestConfirm({
      title: 'Remove cover photo',
      message: 'This will remove the cover photo from your menu page. You can re-upload at any time.',
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
      <div className="overflow-hidden bg-gradient-to-br from-orange-200 via-amber-100 to-red-100">
        {displayUrl ? (
          <div className="relative">
            <img src={displayUrl} alt="Cover photo" className="h-64 w-full object-cover" />

            {pendingFile ? (
              // Step 2: file chosen — confirm before uploading
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/55">
                <p className="max-w-[200px] truncate text-xs font-bold text-white">{pendingFile.name}</p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={uploadPending}
                    disabled={uploading}
                    className="rounded-2xl bg-[#FF6B00] px-5 py-3 text-sm font-black text-white disabled:opacity-60"
                  >
                    {uploading ? 'Uploading…' : 'Save Photo'}
                  </button>
                  <button
                    type="button"
                    onClick={cancelPending}
                    disabled={uploading}
                    className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-stone-700 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              // Step 1: persistent overlay — full image is the click target for replace
              <div
                className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-3 bg-black/35"
                onClick={() => inputRef.current?.click()}
              >
                <span className="text-3xl">📷</span>
                <span className="text-sm font-black tracking-wide text-white">Change Cover Photo</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); requestRemove(); }}
                  disabled={removing}
                  className="rounded-2xl bg-white/20 px-5 py-2.5 text-sm font-black text-white ring-1 ring-white/40 backdrop-blur-sm disabled:opacity-50"
                >
                  {removing ? 'Removing…' : 'Remove Photo'}
                </button>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/jpeg,image/webp,image/png"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
            )}
          </div>
        ) : (
          // No image — full-height drop zone
          <label className="flex h-64 cursor-pointer flex-col items-center justify-center gap-2 text-stone-400 hover:bg-orange-50/50">
            <span className="text-4xl">📷</span>
            <span className="text-sm font-black text-stone-500">Tap to add a cover photo</span>
            <span className="text-xs text-stone-400">JPEG · WebP · PNG · Landscape photo works best · Max 10 MB</span>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/webp,image/png"
              onChange={handleFileSelect}
              className="hidden"
            />
          </label>
        )}
      </div>

      {message && (
        <p className={`mt-2 px-5 text-sm font-bold ${message.type === 'error' ? 'text-red-600' : message.type === 'success' ? 'text-green-700' : 'text-stone-500'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
