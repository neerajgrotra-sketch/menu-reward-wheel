'use client';

import { ChangeEvent, useRef, useState } from 'react';
import type { AppSupabaseClient } from '@/lib/supabase/client';
import { pathFromPublicUrl } from '@/components/admin/restaurants/types';

const MENU_BUCKET = 'menu-images';
const MAX_MENU_IMAGE_BYTES = 10 * 1024 * 1024;

type Props = {
  currentUrl: string | null | undefined;
  menuId: string;
  ownerId: string;
  supabase: AppSupabaseClient;
  onSaved: (imageUrl: string | null) => void;
};

export function MenuImageUploader({ currentUrl, menuId, ownerId, supabase, onSaved }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');

  function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/webp', 'image/png'].includes(file.type)) {
      setError('JPEG, WebP, or PNG only.');
      return;
    }
    if (file.size > MAX_MENU_IMAGE_BYTES) {
      setError(`Image is ${(file.size / 1024 / 1024).toFixed(2)} MB — max 10 MB.`);
      return;
    }
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(file);
    setPendingPreview(URL.createObjectURL(file));
    setError('');
  }

  function cancelPending() {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(null);
    setPendingPreview(null);
    setError('');
  }

  async function uploadPending() {
    if (!pendingFile) return;
    setUploading(true);
    setError('');

    const ext = pendingFile.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const storagePath = `${ownerId}/${menuId}/${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from(MENU_BUCKET)
      .upload(storagePath, pendingFile, { upsert: true, contentType: pendingFile.type });

    if (uploadErr) {
      setError(uploadErr.message);
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from(MENU_BUCKET).getPublicUrl(storagePath);

    const { error: updateErr } = await supabase
      .from('menus')
      .update({ image_url: urlData.publicUrl })
      .eq('id', menuId);

    if (updateErr) {
      setError(updateErr.message);
      setUploading(false);
      return;
    }

    if (currentUrl) {
      const oldPath = pathFromPublicUrl(currentUrl, MENU_BUCKET);
      if (oldPath && oldPath !== storagePath) {
        await supabase.storage.from(MENU_BUCKET).remove([oldPath]);
      }
    }

    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(null);
    setPendingPreview(null);
    setUploading(false);
    onSaved(urlData.publicUrl);
  }

  async function removeImage(e: React.MouseEvent) {
    e.stopPropagation();
    if (!window.confirm('Remove this menu photo?')) return;
    setRemoving(true);
    const { error: updateErr } = await supabase.from('menus').update({ image_url: null }).eq('id', menuId);
    if (updateErr) {
      setError(updateErr.message);
      setRemoving(false);
      return;
    }
    const path = pathFromPublicUrl(currentUrl, MENU_BUCKET);
    if (path) await supabase.storage.from(MENU_BUCKET).remove([path]);
    setRemoving(false);
    onSaved(null);
  }

  const displayUrl = pendingPreview ?? currentUrl;

  return (
    <div>
      <div className="relative h-28 overflow-hidden rounded-2xl bg-gradient-to-br from-orange-100 to-red-100">
        {displayUrl ? (
          <img src={displayUrl} alt="Menu cover" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-4xl">🍽️</div>
        )}

        {pendingFile ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60">
            <p className="max-w-[80%] truncate text-xs font-bold text-white">{pendingFile.name}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={uploadPending}
                disabled={uploading}
                className="rounded-xl bg-[#FF6B00] px-3 py-1.5 text-xs font-black text-white disabled:opacity-60"
              >
                {uploading ? 'Uploading…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={cancelPending}
                disabled={uploading}
                className="rounded-xl bg-white px-3 py-1.5 text-xs font-black text-stone-700 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            aria-label={displayUrl ? 'Change menu photo' : 'Add menu photo'}
            className="absolute bottom-1.5 right-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-sm text-white shadow-lg backdrop-blur-sm hover:bg-black/70"
          >
            📷
          </button>
        )}

        {displayUrl && !pendingFile && (
          <button
            type="button"
            onClick={removeImage}
            disabled={removing}
            aria-label="Remove menu photo"
            className="absolute bottom-1.5 left-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-xs text-white shadow-lg backdrop-blur-sm hover:bg-black/70 disabled:opacity-50"
          >
            {removing ? '…' : '✕'}
          </button>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/webp,image/png"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>
      {error && <p className="mt-1 text-xs font-bold text-red-600">{error}</p>}
    </div>
  );
}
