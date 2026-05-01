'use server';

import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from '@/lib/super-admin';
import { createClient } from '@/lib/supabase/server';

function requiredString(value: FormDataEntryValue | null, fallback = '') {
  const next = String(value || '').trim();
  return next || fallback;
}

function toInt(value: FormDataEntryValue | null, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) ? Math.round(next) : fallback;
}

function normalizeKey(value: FormDataEntryValue | null, fallback = '') {
  return requiredString(value, fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function revalidateContent() {
  revalidatePath('/super-admin/content');
  revalidatePath('/');
  revalidatePath('/faq');
  revalidatePath('/super-admin');
}

export async function createContentField(formData: FormData) {
  await requireSuperAdmin();

  const page_key = normalizeKey(formData.get('page_key'));
  const section_key = normalizeKey(formData.get('section_key'));
  const field_key = normalizeKey(formData.get('field_key'));
  const label = requiredString(formData.get('label'));
  const value = requiredString(formData.get('value'));

  if (!page_key || !section_key || !field_key || !label) {
    throw new Error('Page key, section key, field key, and label are required.');
  }

  const supabase = createClient();
  const { error } = await supabase.from('site_content').insert({
    page_key,
    section_key,
    field_key,
    label,
    value,
    field_type: requiredString(formData.get('field_type'), 'text'),
    sort_order: toInt(formData.get('sort_order'), 0),
    is_active: formData.get('is_active') === 'on',
  });

  if (error) throw new Error(error.message);
  revalidateContent();
}

export async function updateContentField(formData: FormData) {
  await requireSuperAdmin();

  const id = requiredString(formData.get('id'));
  if (!id) throw new Error('Missing content field id.');

  const supabase = createClient();
  const { error } = await supabase
    .from('site_content')
    .update({
      page_key: normalizeKey(formData.get('page_key')),
      section_key: normalizeKey(formData.get('section_key')),
      field_key: normalizeKey(formData.get('field_key')),
      label: requiredString(formData.get('label'), 'Untitled Field'),
      value: requiredString(formData.get('value')),
      field_type: requiredString(formData.get('field_type'), 'text'),
      sort_order: toInt(formData.get('sort_order'), 0),
      is_active: formData.get('is_active') === 'on',
    })
    .eq('id', id);

  if (error) throw new Error(error.message);
  revalidateContent();
}

export async function deleteContentField(formData: FormData) {
  await requireSuperAdmin();

  const id = requiredString(formData.get('id'));
  if (!id) throw new Error('Missing content field id.');

  const supabase = createClient();
  const { error } = await supabase.from('site_content').delete().eq('id', id);

  if (error) throw new Error(error.message);
  revalidateContent();
}
