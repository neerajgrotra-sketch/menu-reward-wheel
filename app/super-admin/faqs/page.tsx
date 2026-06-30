import { createClient } from '@/lib/supabase/server';
import { createFaq, deleteFaq, updateFaq } from './actions';

type Faq = {
  id: string;
  question: string;
  answer: string;
  category: string;
  sort_order: number;
  is_active: boolean;
  updated_at: string | null;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-wide text-stone-500">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function TextInput({ name, defaultValue, placeholder }: { name: string; defaultValue?: string | number | null; placeholder?: string }) {
  return <input name={name} defaultValue={defaultValue ?? ''} placeholder={placeholder} className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-[#FF6B00]" />;
}

function NumberInput({ name, defaultValue }: { name: string; defaultValue: number }) {
  return <input name={name} type="number" defaultValue={defaultValue} className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-[#FF6B00]" />;
}

function ActiveToggle({ defaultChecked = true }: { defaultChecked?: boolean }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-2xl bg-stone-50 px-4 py-3 text-sm font-black text-stone-700">
      <span>Active</span>
      <input name="is_active" type="checkbox" defaultChecked={defaultChecked} className="h-5 w-5 accent-[#FF6B00]" />
    </label>
  );
}

export default async function SuperAdminFaqsPage() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('faqs')
    .select('id,question,answer,category,sort_order,is_active,updated_at')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  const faqs = ((data || []) as Faq[]).sort((a, b) => a.sort_order - b.sort_order || a.question.localeCompare(b.question));
  const activeCount = faqs.filter((faq) => faq.is_active).length;
  const inactiveCount = faqs.length - activeCount;
  const categories = Array.from(new Set(faqs.map((faq) => faq.category))).filter(Boolean);

  return (
    <main className="min-h-screen bg-[#FFF8F0] px-4 py-6 text-[#1F1F1F]">
      <section className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-black text-[#FF6B00]">Super Admin / FAQ</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/super-admin" className="rounded-full bg-white px-4 py-3 text-sm font-black text-[#FF6B00] shadow">Command Center</a>
            <a href="/faq" className="rounded-full bg-[#1F1F1F] px-4 py-3 text-sm font-black text-white shadow">Public FAQ</a>
          </div>
        </div>

        <div className="mt-6 rounded-[2rem] bg-gradient-to-br from-[#FF6B00] to-[#E63939] p-6 text-white shadow-2xl shadow-orange-200 md:p-8">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-white/80">FAQ control</p>
          <h2 className="mt-3 max-w-3xl text-4xl font-black leading-tight md:text-5xl">Manage public FAQ content.</h2>
          <p className="mt-4 max-w-3xl text-sm font-semibold leading-6 text-white/85 md:text-base">
            Add, edit, reorder, categorize, activate, or hide FAQ entries shown on the public SpinBite FAQ page.
          </p>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          <div className="rounded-3xl bg-white p-4 text-center shadow"><p className="text-3xl font-black text-[#FF6B00]">{faqs.length}</p><p className="text-xs font-bold text-stone-500">Total</p></div>
          <div className="rounded-3xl bg-white p-4 text-center shadow"><p className="text-3xl font-black text-green-700">{activeCount}</p><p className="text-xs font-bold text-stone-500">Active</p></div>
          <div className="rounded-3xl bg-white p-4 text-center shadow"><p className="text-3xl font-black text-stone-500">{inactiveCount}</p><p className="text-xs font-bold text-stone-500">Hidden</p></div>
        </div>

        {error && <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{error.message}</p>}

        <form action={createFaq} className="mt-5 rounded-[2rem] bg-white p-5 shadow-xl">
          <p className="text-sm font-black uppercase tracking-wide text-[#FF6B00]">Add new FAQ</p>
          <div className="mt-4 grid gap-4 md:grid-cols-[1fr_180px_120px]">
            <Field label="Question"><TextInput name="question" placeholder="What question should customers or restaurants see?" /></Field>
            <Field label="Category"><TextInput name="category" defaultValue="general" /></Field>
            <Field label="Sort Order"><NumberInput name="sort_order" defaultValue={(faqs.length + 1) * 10} /></Field>
          </div>
          <div className="mt-4">
            <Field label="Answer">
              <textarea name="answer" rows={4} placeholder="Write a clear, helpful answer." className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#FF6B00]" />
            </Field>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-[220px_1fr] md:items-center">
            <ActiveToggle />
            <button type="submit" className="rounded-2xl bg-green-600 px-5 py-4 text-sm font-black text-white shadow-lg">Add FAQ</button>
          </div>
        </form>

        {categories.length > 0 && (
          <div className="mt-5 rounded-3xl bg-white p-4 shadow-xl">
            <p className="text-xs font-black uppercase tracking-wide text-stone-500">Categories</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {categories.map((category) => <span key={category} className="rounded-full bg-orange-50 px-3 py-2 text-xs font-black text-[#FF6B00]">{category}</span>)}
            </div>
          </div>
        )}

        <div className="mt-5 space-y-4">
          {faqs.map((faq) => (
            <div key={faq.id} className="rounded-[2rem] bg-white p-5 shadow-xl">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={faq.is_active ? 'rounded-full bg-green-50 px-3 py-1 text-xs font-black uppercase text-green-700' : 'rounded-full bg-stone-100 px-3 py-1 text-xs font-black uppercase text-stone-500'}>{faq.is_active ? 'Active' : 'Hidden'}</span>
                    <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-black uppercase text-[#FF6B00]">{faq.category}</span>
                    <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-black uppercase text-stone-500">Order {faq.sort_order}</span>
                  </div>
                  <h3 className="mt-3 text-2xl font-black">{faq.question}</h3>
                  <p className="mt-2 whitespace-pre-line text-sm font-semibold leading-6 text-stone-600">{faq.answer}</p>
                </div>
              </div>

              <form action={updateFaq} className="mt-5 rounded-3xl bg-[#FFF8F0] p-4">
                <input type="hidden" name="id" value={faq.id} />
                <div className="grid gap-4 md:grid-cols-[1fr_180px_120px]">
                  <Field label="Question"><TextInput name="question" defaultValue={faq.question} /></Field>
                  <Field label="Category"><TextInput name="category" defaultValue={faq.category} /></Field>
                  <Field label="Sort Order"><NumberInput name="sort_order" defaultValue={faq.sort_order} /></Field>
                </div>
                <div className="mt-4">
                  <Field label="Answer">
                    <textarea name="answer" defaultValue={faq.answer} rows={4} className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#FF6B00]" />
                  </Field>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-[220px_1fr] md:items-center">
                  <ActiveToggle defaultChecked={faq.is_active} />
                  <button type="submit" className="rounded-2xl bg-[#FF6B00] px-5 py-4 text-sm font-black text-white shadow-lg">Save FAQ</button>
                </div>
              </form>

              <form action={deleteFaq} className="mt-3">
                <input type="hidden" name="id" value={faq.id} />
                <button type="submit" className="rounded-2xl bg-red-50 px-5 py-3 text-sm font-black text-red-700">Delete FAQ</button>
              </form>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
