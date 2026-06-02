import { requireSuperAdmin } from '@/lib/super-admin';
import { createClient } from '@/lib/supabase/server';
import { createContentField, deleteContentField, updateContentField } from './actions';

type ContentField = {
  id: string;
  page_key: string;
  section_key: string;
  field_key: string;
  label: string;
  value: string;
  field_type: string;
  sort_order: number;
  is_active: boolean;
};

function titleCase(value: string) {
  return value
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-wide text-stone-500">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function TextInput({ name, defaultValue, placeholder, required }: { name: string; defaultValue?: string | number | null; placeholder?: string; required?: boolean }) {
  return <input name={name} defaultValue={defaultValue ?? ''} placeholder={placeholder} required={required} className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-[#FF6B00]" />;
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

function groupContent(fields: ContentField[]) {
  return fields.reduce<Record<string, Record<string, ContentField[]>>>((pages, field) => {
    pages[field.page_key] = pages[field.page_key] || {};
    pages[field.page_key][field.section_key] = pages[field.page_key][field.section_key] || [];
    pages[field.page_key][field.section_key].push(field);
    return pages;
  }, {});
}

export default async function SuperAdminContentPage({
  searchParams,
}: {
  searchParams?: { error?: string; success?: string };
}) {
  await requireSuperAdmin();

  const supabase = createClient();
  const { data, error } = await supabase
    .from('site_content')
    .select('id,page_key,section_key,field_key,label,value,field_type,sort_order,is_active')
    .order('page_key', { ascending: true })
    .order('section_key', { ascending: true })
    .order('sort_order', { ascending: true });

  const fields = ((data || []) as ContentField[]).sort((a, b) =>
    a.page_key.localeCompare(b.page_key) ||
    a.section_key.localeCompare(b.section_key) ||
    a.sort_order - b.sort_order ||
    a.field_key.localeCompare(b.field_key)
  );
  const grouped = groupContent(fields);
  const pageKeys = Object.keys(grouped).sort();
  const activeCount = fields.filter((field) => field.is_active).length;
  const inactiveCount = fields.length - activeCount;

  return (
    <main className="min-h-screen bg-[#FFF8F0] px-4 py-6 text-[#1F1F1F]">
      <section className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-black text-[#FF6B00]">🎯 SpinBite</h1>
            <p className="mt-1 text-sm font-bold text-stone-500">Super Admin / Content Directory</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/super-admin" className="rounded-full bg-white px-4 py-3 text-sm font-black text-[#FF6B00] shadow">Command Center</a>
            <a href="/" className="rounded-full bg-[#1F1F1F] px-4 py-3 text-sm font-black text-white shadow">View Home</a>
          </div>
        </div>

        <div className="mt-6 rounded-[2rem] bg-gradient-to-br from-[#FF6B00] to-[#E63939] p-6 text-white shadow-2xl shadow-orange-200 md:p-8">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-white/80">Content control</p>
          <h2 className="mt-3 max-w-4xl text-4xl font-black leading-tight md:text-5xl">Edit platform copy by page and section.</h2>
          <p className="mt-4 max-w-4xl text-sm font-semibold leading-6 text-white/85 md:text-base">
            Use this directory to manage homepage hero copy and future text across FAQ, Super Admin, auth, unavailable pages, and other platform screens.
          </p>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          <div className="rounded-3xl bg-white p-4 text-center shadow"><p className="text-3xl font-black text-[#FF6B00]">{fields.length}</p><p className="text-xs font-bold text-stone-500">Fields</p></div>
          <div className="rounded-3xl bg-white p-4 text-center shadow"><p className="text-3xl font-black text-green-700">{activeCount}</p><p className="text-xs font-bold text-stone-500">Active</p></div>
          <div className="rounded-3xl bg-white p-4 text-center shadow"><p className="text-3xl font-black text-stone-500">{inactiveCount}</p><p className="text-xs font-bold text-stone-500">Hidden</p></div>
        </div>

        {error && <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{error.message}</p>}

        {searchParams?.error && (
          <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">
            {decodeURIComponent(searchParams.error)}
          </p>
        )}
        {searchParams?.success && (
          <p className="mt-5 rounded-2xl bg-green-50 p-4 text-sm font-bold text-green-700">
            Content field created successfully.
          </p>
        )}

        <form action={createContentField} className="mt-5 rounded-[2rem] bg-white p-5 shadow-xl">
          <p className="text-sm font-black uppercase tracking-wide text-[#FF6B00]">Add content field</p>
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <Field label="Page Key"><TextInput name="page_key" placeholder="home" required /></Field>
            <Field label="Section Key"><TextInput name="section_key" placeholder="hero" required /></Field>
            <Field label="Field Key"><TextInput name="field_key" placeholder="headline" required /></Field>
            <Field label="Field Type">
              <select name="field_type" defaultValue="text" className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-black outline-none focus:border-[#FF6B00]">
                <option value="text">Text</option>
                <option value="textarea">Textarea</option>
                <option value="url">URL</option>
                <option value="boolean">Boolean</option>
              </select>
            </Field>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-[1fr_120px]">
            <Field label="Label"><TextInput name="label" placeholder="Hero Headline" required /></Field>
            <Field label="Sort Order"><NumberInput name="sort_order" defaultValue={(fields.length + 1) * 10} /></Field>
          </div>
          <div className="mt-4">
            <Field label="Value">
              <textarea name="value" rows={4} placeholder="Content value shown on the site." className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#FF6B00]" />
            </Field>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-[220px_1fr] md:items-center">
            <ActiveToggle />
            <button type="submit" className="rounded-2xl bg-green-600 px-5 py-4 text-sm font-black text-white shadow-lg">Add Content Field</button>
          </div>
        </form>

        <div className="mt-5 grid gap-5 lg:grid-cols-[280px_1fr]">
          <aside className="h-fit rounded-[2rem] bg-white p-5 shadow-xl lg:sticky lg:top-5">
            <p className="text-sm font-black uppercase tracking-wide text-[#FF6B00]">Directory</p>
            <div className="mt-4 space-y-3">
              {pageKeys.map((pageKey) => (
                <div key={pageKey} className="rounded-2xl bg-[#FFF8F0] p-3">
                  <a href={`#page-${pageKey}`} className="text-sm font-black text-stone-900">/{pageKey}</a>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Object.keys(grouped[pageKey]).sort().map((sectionKey) => (
                      <a key={sectionKey} href={`#section-${pageKey}-${sectionKey}`} className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-[#FF6B00] shadow-sm">{sectionKey}</a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <div className="space-y-5">
            {pageKeys.map((pageKey) => (
              <section key={pageKey} id={`page-${pageKey}`} className="rounded-[2rem] bg-white p-5 shadow-xl">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#FF6B00]">Page</p>
                <h3 className="mt-1 text-3xl font-black">/{pageKey}</h3>

                <div className="mt-5 space-y-4">
                  {Object.keys(grouped[pageKey]).sort().map((sectionKey) => (
                    <div key={sectionKey} id={`section-${pageKey}-${sectionKey}`} className="rounded-[2rem] bg-[#FFF8F0] p-4">
                      <p className="text-xs font-black uppercase tracking-wide text-stone-500">Section</p>
                      <h4 className="mt-1 text-2xl font-black">{titleCase(sectionKey)}</h4>

                      <div className="mt-4 space-y-4">
                        {grouped[pageKey][sectionKey]
                          .sort((a, b) => a.sort_order - b.sort_order || a.field_key.localeCompare(b.field_key))
                          .map((field) => (
                            <div key={field.id} className="rounded-3xl bg-white p-4 shadow">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={field.is_active ? 'rounded-full bg-green-50 px-3 py-1 text-xs font-black uppercase text-green-700' : 'rounded-full bg-stone-100 px-3 py-1 text-xs font-black uppercase text-stone-500'}>{field.is_active ? 'Active' : 'Hidden'}</span>
                                <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-black uppercase text-[#FF6B00]">{field.field_key}</span>
                                <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-black uppercase text-stone-500">{field.field_type}</span>
                              </div>
                              <p className="mt-3 text-sm font-black uppercase tracking-wide text-stone-500">{field.label}</p>
                              <p className="mt-1 whitespace-pre-line text-sm font-semibold leading-6 text-stone-700">{field.value || '—'}</p>

                              <form action={updateContentField} className="mt-4 rounded-3xl bg-[#FFF8F0] p-4">
                                <input type="hidden" name="id" value={field.id} />
                                <div className="grid gap-4 md:grid-cols-4">
                                  <Field label="Page"><TextInput name="page_key" defaultValue={field.page_key} /></Field>
                                  <Field label="Section"><TextInput name="section_key" defaultValue={field.section_key} /></Field>
                                  <Field label="Field"><TextInput name="field_key" defaultValue={field.field_key} /></Field>
                                  <Field label="Type">
                                    <select name="field_type" defaultValue={field.field_type} className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-black outline-none focus:border-[#FF6B00]">
                                      <option value="text">Text</option>
                                      <option value="textarea">Textarea</option>
                                      <option value="url">URL</option>
                                      <option value="boolean">Boolean</option>
                                    </select>
                                  </Field>
                                </div>
                                <div className="mt-4 grid gap-4 md:grid-cols-[1fr_120px]">
                                  <Field label="Label"><TextInput name="label" defaultValue={field.label} /></Field>
                                  <Field label="Sort Order"><NumberInput name="sort_order" defaultValue={field.sort_order} /></Field>
                                </div>
                                <div className="mt-4">
                                  <Field label="Value">
                                    <textarea name="value" defaultValue={field.value} rows={field.field_type === 'textarea' ? 5 : 3} className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#FF6B00]" />
                                  </Field>
                                </div>
                                <div className="mt-4 grid gap-3 md:grid-cols-[220px_1fr] md:items-center">
                                  <ActiveToggle defaultChecked={field.is_active} />
                                  <button type="submit" className="rounded-2xl bg-[#FF6B00] px-5 py-4 text-sm font-black text-white shadow-lg">Save Field</button>
                                </div>
                              </form>

                              <form action={deleteContentField} className="mt-3">
                                <input type="hidden" name="id" value={field.id} />
                                <button type="submit" className="rounded-2xl bg-red-50 px-5 py-3 text-sm font-black text-red-700">Delete Field</button>
                              </form>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
