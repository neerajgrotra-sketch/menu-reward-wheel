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

function revalidateFaqs() {
  revalidatePath('/super-admin/faqs');
  revalidatePath('/faq');
}

export async function createFaq(formData: FormData) {
  await requireSuperAdmin();

  const question = requiredString(formData.get('question'));
  const answer = requiredString(formData.get('answer'));

  if (!question || !answer) {
    throw new Error('Question and answer are required.');
  }

  const supabase = createClient();
  const { error } = await supabase.from('faqs').insert({
    question,
    answer,
    category: requiredString(formData.get('category'), 'general').toLowerCase(),
    sort_order: toInt(formData.get('sort_order'), 0),
    is_active: formData.get('is_active') === 'on',
  });

  if (error) throw new Error(error.message);
  revalidateFaqs();
}

export async function updateFaq(formData: FormData) {
  await requireSuperAdmin();

  const id = requiredString(formData.get('id'));
  const question = requiredString(formData.get('question'));
  const answer = requiredString(formData.get('answer'));

  if (!id) throw new Error('Missing FAQ id.');
  if (!question || !answer) throw new Error('Question and answer are required.');

  const supabase = createClient();
  const { error } = await supabase
    .from('faqs')
    .update({
      question,
      answer,
      category: requiredString(formData.get('category'), 'general').toLowerCase(),
      sort_order: toInt(formData.get('sort_order'), 0),
      is_active: formData.get('is_active') === 'on',
    })
    .eq('id', id);

  if (error) throw new Error(error.message);
  revalidateFaqs();
}

export async function deleteFaq(formData: FormData) {
  await requireSuperAdmin();

  const id = requiredString(formData.get('id'));
  if (!id) throw new Error('Missing FAQ id.');

  const supabase = createClient();
  const { error } = await supabase.from('faqs').delete().eq('id', id);

  if (error) throw new Error(error.message);
  revalidateFaqs();
}
