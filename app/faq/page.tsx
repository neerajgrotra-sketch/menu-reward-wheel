import { createClient } from '@/lib/supabase/server';

type Faq = {
  id: string;
  question: string;
  answer: string;
  category: string;
  sort_order: number;
};

function groupFaqs(faqs: Faq[]) {
  return faqs.reduce<Record<string, Faq[]>>((groups, faq) => {
    const category = faq.category || 'general';
    groups[category] = groups[category] || [];
    groups[category].push(faq);
    return groups;
  }, {});
}

function categoryLabel(category: string) {
  return category
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export default async function FAQPage() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('faqs')
    .select('id,question,answer,category,sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  const faqs = ((data || []) as Faq[]).sort((a, b) => a.sort_order - b.sort_order || a.question.localeCompare(b.question));
  const grouped = groupFaqs(faqs);
  const categories = Object.keys(grouped).sort((a, b) => {
    const firstA = grouped[a]?.[0]?.sort_order || 0;
    const firstB = grouped[b]?.[0]?.sort_order || 0;
    return firstA - firstB || a.localeCompare(b);
  });

  return (
    <main className="min-h-screen bg-[#FFF8F0] text-[#1F1F1F]">
      <nav className="sticky top-0 z-50 border-b border-orange-100 bg-[#FFF8F0]/90 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <a href="/" className="flex items-center gap-2 text-2xl font-black text-[#FF6B00]" aria-label="SpinBite home">
            <span className="text-3xl leading-none">🎯</span>
            <span>SpinBite</span>
          </a>
          <div className="flex items-center gap-2">
            <a href="/" className="rounded-full px-4 py-2 text-sm font-black hover:bg-white">Home</a>
            <a href="/auth" className="rounded-full bg-[#FF6B00] px-5 py-2 text-sm font-black text-white shadow-lg shadow-orange-200">Sign Up</a>
          </div>
        </div>
      </nav>

      <section className="px-4 py-12 text-center sm:px-6 md:py-18">
        <p className="mx-auto inline-flex rounded-full bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#E63939] shadow">
          Restaurant promotion FAQ
        </p>
        <h1 className="mx-auto mt-5 max-w-4xl text-5xl font-black leading-[0.95] tracking-tight sm:text-6xl md:text-7xl">
          Questions restaurant owners ask before using SpinBite
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base font-medium leading-7 text-stone-700 sm:text-lg">
          Clear answers about QR games, coupon validation, menu rewards, promotion limits, and how SpinBite helps restaurants turn attention into orders.
        </p>
      </section>

      <section className="px-4 pb-16 sm:px-6">
        <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[0.7fr_1.3fr]">
          <aside className="h-fit rounded-[2rem] bg-gradient-to-br from-[#FF6B00] to-[#E63939] p-6 text-white shadow-2xl shadow-orange-200 lg:sticky lg:top-24">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-white/75">Quick answer</p>
            <h2 className="mt-3 text-3xl font-black leading-tight">No app. No POS change. QR-ready campaigns.</h2>
            <p className="mt-4 text-sm font-semibold leading-6 text-white/85">
              SpinBite lets restaurants launch interactive rewards with simple staff validation and margin-safe controls.
            </p>
            <a href="/auth" className="mt-6 inline-block rounded-full bg-white px-6 py-3 text-sm font-black text-[#FF6B00]">Start Building</a>
          </aside>

          <div className="space-y-5">
            {error && (
              <section className="rounded-[2rem] bg-red-50 p-6 text-red-700 shadow-xl">
                <h2 className="text-2xl font-black">Could not load FAQs</h2>
                <p className="mt-2 text-sm font-bold">Please try again later.</p>
              </section>
            )}

            {!error && faqs.length === 0 && (
              <section className="rounded-[2rem] bg-white p-6 text-center shadow-xl ring-1 ring-orange-100">
                <h2 className="text-3xl font-black">FAQ content is coming soon.</h2>
                <p className="mt-2 text-sm font-semibold text-stone-500">Check back soon for answers about SpinBite.</p>
              </section>
            )}

            {!error && categories.map((category) => (
              <section key={category} className="rounded-[2rem] bg-white p-5 shadow-xl ring-1 ring-orange-100 sm:p-7">
                <h2 className="text-sm font-black uppercase tracking-[0.16em] text-[#FF6B00]">{categoryLabel(category)}</h2>
                <div className="mt-4 divide-y divide-stone-100">
                  {grouped[category].map((item) => (
                    <details key={item.id} className="group py-4">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-xl font-black">
                        <span>{item.question}</span>
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-50 text-[#FF6B00] transition group-open:rotate-45">+</span>
                      </summary>
                      <p className="mt-3 whitespace-pre-line text-base font-medium leading-7 text-stone-600">{item.answer}</p>
                    </details>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-12 text-center sm:px-6">
        <div className="mx-auto max-w-4xl rounded-[2rem] bg-[#1F1F1F] p-8 text-white shadow-2xl sm:p-12">
          <h2 className="text-4xl font-black">Still have questions?</h2>
          <p className="mx-auto mt-3 max-w-xl text-white/75">Create a demo promotion or use the dashboard to test the full customer journey.</p>
          <a href="/auth" className="mt-7 inline-block rounded-full bg-[#00C853] px-8 py-4 font-black text-white">Try SpinBite</a>
        </div>
      </section>
    </main>
  );
}
