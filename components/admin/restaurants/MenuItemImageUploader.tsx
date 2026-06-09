'use client';

import { ChangeEvent, useRef, useState } from 'react';
import type { AppSupabaseClient } from '@/lib/supabase/client';
import { pathFromPublicUrl } from './types';

const ITEM_BUCKET = 'menu-item-images';
const MAX_ITEM_BYTES = 5 * 1024 * 1024;

type Props = {
  currentUrl: string | null | undefined;
  itemId: string;
  restaurantId: string;
  ownerId: string;
  supabase: AppSupabaseClient;
  onSaved: () => void;
};

export function MenuItemImageUploader({ currentUrl, itemId, restaurantId, ownerId, supabase, onSaved }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success' | 'info'; text: string } | null>(null);

  function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/webp', 'image/png'].includes(file.type)) {
      setMessage({ type: 'error', text: 'JPEG, WebP, or PNG only.' });
      return;
    }
    if (file.size > MAX_ITEM_BYTES) {
      setMessage({ type: 'error', text: `Image is ${(file.size / 1024 / 1024).toFixed(2)} MB — max 5 MB.` });
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
    const storagePath = `${ownerId}/${restaurantId}/items/${itemId}/${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from(ITEM_BUCKET)
      .upload(storagePath, pendingFile, { upsert: true, contentType: pendingFile.type });

    if (uploadErr) {
      setMessage({ type: 'error', text: uploadErr.message });
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from(ITEM_BUCKET).getPublicUrl(storagePath);
    const cleanUrl = urlData.publicUrl;

    const { error: updateErr } = await supabase
      .from('menu_items')
      .update({ image_url: cleanUrl })
      .eq('id', itemId);

    if (updateErr) {
      setMessage({ type: 'error', text: updateErr.message });
      setUploading(false);
      return;
    }

    if (currentUrl) {
      const oldPath = pathFromPublicUrl(currentUrl, ITEM_BUCKET);
      if (oldPath && oldPath !== storagePath) {
        await supabase.storage.from(ITEM_BUCKET).remove([oldPath]);
      }
    }

    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(null);
    setPendingPreview(null);
    setMessage({ type: 'success', text: 'Image saved.' });
    setUploading(false);
    onSaved();
  }

  async function removeImage() {
    if (!window.confirm('Remove this item image?')) return;
    setRemoving(true);
    const { error } = await supabase
      .from('menu_items')
      .update({ image_url: null })
      .eq('id', itemId);
    if (error) {
      setMessage({ type: 'error', text: error.message });
      setRemoving(false);
      return;
    }
    const path = pathFromPublicUrl(currentUrl, ITEM_BUCKET);
    if (path) await supabase.storage.from(ITEM_BUCKET).remove([path]);
    setMessage(null);
    setRemoving(false);
    onSaved();
  }

  const displayUrl = pendingPreview ?? currentUrl;

  return (
    <div>
      <p className="text-xs font-black uppercase tracking-wide text-stone-500">Item Image</p>
      <p className="mt-1 text-sm text-stone-500">
        Square or landscape recommended. JPEG · WebP · PNG · Max 5 MB.
      </p>
      <div className="mt-2 overflow-hidden rounded-2xl border-2 border-dashed border-stone-200">
        {displayUrl ? (
          <div className="relative">
            <img src={displayUrl} alt="Item preview" className="h-36 w-full object-cover" />
            {pendingFile ? (
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
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 transition-opacity hover:opacity-100">
                <label className="cursor-pointer rounded-xl bg-white px-3 py-2 text-sm font-black">
                  Replace
                  <input
                    ref={inputRef}
                    type="file"
                    accept="image/jpeg,image/webp,image/png"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>
                <button
                  type="button"
                  onClick={removeImage}
                  disabled={removing}
                  className="rounded-xl bg-red-600 px-3 py-2 text-sm font-black text-white disabled:opacity-60"
                >
                  {removing ? 'Removing…' : 'Remove'}
                </button>
              </div>
            )}
          </div>
        ) : (
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 py-8 text-stone-400 hover:bg-stone-50">
            <span className="text-3xl">🍽️</span>
            <span className="text-sm font-bold">Tap to add item photo</span>
            <span className="text-xs">JPEG · WebP · PNG · Max 5 MB</span>
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
        <p
          className={`mt-2 rounded-xl p-2 text-sm font-bold ${
            message.type === 'error'
              ? 'bg-red-50 text-red-700'
              : message.type === 'success'
                ? 'bg-green-50 text-green-700'
                : 'text-stone-600'
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
