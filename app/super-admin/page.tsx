import { requireSuperAdmin } from '@/lib/super-admin';

const cards = [
  {
    title: 'Games',
    href: '/super-admin/games',
    icon: '🎮',
    copy: 'Activate game types, tune default rules, and control what restaurants can build.',
    status: 'Available now',
  },
  {
    title: 'Homepage Content',
    href: '/super-admin/content',
    icon: '📝',
    copy: 'Manage hero copy, homepage sections, calls to action, and landing page messaging.',
    status: 'Available now',
  },
  {
    title: 'FAQ',
    href: '/super-admin/faqs',
    icon: '❓',
    copy: 'Edit public FAQ questions, categories, ordering, and active/inactive visibility.',
    status: 'Available now',
  },
  {
    title: 'Feature Flags',
    href: '/super-admin/settings',
    icon: '🚦',
    copy: 'Roll out print kits, AI menu import, digital signage, logos, and multi-game features.',
    status: 'Next phase',
  },
  {
    title: 'Print Templates',
    href: '/super-admin/settings',
    icon: '🖨️',
    copy: 'Prepare reusable poster, table tent, signage, and QR kit defaults.',
    status: 'Future',
  },
  {
    title: 'Intelligence Lab',
    href: '/super-admin/intelligence-lab',
    icon: '🧠',
    copy: 'Manage generation features, prompt templates, provider costs, and A/B experiments.',
    status: 'Available now',
  },
];

export default async function SuperAdminPage() {
  const { profile } = await requireSuperAdmin();

  return (
    <main className="min-h-screen bg-[#FFF8F0] px-4 py-6 text-[#1F1F1F]">
      <section className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-black text-[#FF6B00]">🎯 SpinBite</h1>
            <p className="mt-1 text-sm font-bold text-stone-500">Platform command center</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/admin" className="rounded-full bg-white px-4 py-3 text-sm font-black text-[#FF6B00] shadow">
              Restaurant Admin
            </a>
            <span className="rounded-full bg-[#1F1F1F] px-4 py-3 text-sm font-black text-white shadow">
              {profile.email || 'Super Admin'}
            </span>
          </div>
        </div>

        <div className="mt-6 rounded-[2rem] bg-gradient-to-br from-[#FF6B00] to-[#E63939] p-6 text-white shadow-2xl shadow-orange-200 md:p-8">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-white/80">Super Admin</p>
          <h2 className="mt-3 max-w-3xl text-4xl font-black leading-tight md:text-5xl">
            Control games, content, and platform settings.
          </h2>
          <p className="mt-4 max-w-3xl text-sm font-semibold leading-6 text-white/85 md:text-base">
            Manage which games restaurants can use, tune default rules, and prepare future product features without hardcoding platform behavior.
          </p>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-5">
          {cards.map((card) => {
            const enabled = card.status === 'Available now';
            return (
              <a
                key={card.title}
                href={card.href}
                aria-disabled={!enabled}
                className={`rounded-3xl p-5 shadow-xl transition ${enabled ? 'bg-white hover:-translate-y-1' : 'cursor-not-allowed bg-white/70'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="text-4xl">{card.icon}</span>
                  <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${enabled ? 'bg-green-50 text-green-700' : 'bg-stone-100 text-stone-500'}`}>
                    {card.status}
                  </span>
                </div>
                <h3 className="mt-4 text-2xl font-black">{card.title}</h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-stone-600">{card.copy}</p>
              </a>
            );
          })}
        </div>

        <div className="mt-5 rounded-3xl bg-white p-5 shadow-xl">
          <p className="text-sm font-black uppercase tracking-wide text-[#FF6B00]">Platform boundary</p>
          <p className="mt-2 text-sm font-semibold leading-6 text-stone-600">
            Restaurant admins manage locations, menus, promotions, rewards, print kits, and coupon validation. Super Admin controls available game types, platform defaults, site content, FAQs, feature flags, and future rollout settings.
          </p>
        </div>
      </section>
    </main>
  );
}
