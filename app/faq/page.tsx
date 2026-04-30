const faqs = [
  {
    category: 'Getting Started',
    questions: [
      {
        q: 'What is SpinBite?',
        a: 'SpinBite is a QR-powered promotion platform for restaurants. You create a branded reward game tied to real menu items, customers scan a QR code, spin the wheel, win a coupon, and staff validate the coupon at the counter.',
      },
      {
        q: 'How does SpinBite work for customers?',
        a: 'Customers scan a restaurant QR code on their phone, play the promotion game, and receive a digital coupon. No app download is required. The coupon includes a code and QR code that staff can validate before redeeming.',
      },
      {
        q: 'How long does it take to launch a promotion?',
        a: 'A simple promotion can be created in minutes once your restaurant location and menu are set up. Choose the location, name the campaign, select rewards, set limits and expiry rules, then launch the QR link.',
      },
      {
        q: 'Do customers need to download an app?',
        a: 'No. SpinBite runs in the browser. Customers scan, play, and redeem from their phone without installing anything.',
      },
    ],
  },
  {
    category: 'Restaurant Setup',
    questions: [
      {
        q: 'Do I need to connect my POS system?',
        a: 'No POS integration is required for the first version. Staff validate the coupon in SpinBite, apply the reward manually in the POS, and then mark the coupon as redeemed. POS integrations can be added later for larger restaurant groups.',
      },
      {
        q: 'Can I manage more than one restaurant location?',
        a: 'Yes. SpinBite supports multiple restaurant locations, including locations with the same restaurant name but different addresses. Every promotion is tied to a specific restaurant location so staff always know which store the promotion belongs to.',
      },
      {
        q: 'Can I use menu items as rewards?',
        a: 'Yes. Rewards can be built from your menu items or added as custom rewards. For example, you can offer 10% off Lassi, a free appetizer, a free drink, or a custom chef special.',
      },
      {
        q: 'What if I open a new location with the same menu?',
        a: 'SpinBite is designed to support same-brand locations. Menu items can be reused across matching locations so a new store does not have to rebuild every menu from scratch.',
      },
    ],
  },
  {
    category: 'Promotion Controls',
    questions: [
      {
        q: 'Can I control how often each reward is won?',
        a: 'Yes. Restaurants can set reward weights such as common, normal, or rare. The current wheel keeps the visual design simple while using configured weights behind the scenes to control reward probability.',
      },
      {
        q: 'Can I limit how many coupons are given out?',
        a: 'Yes. SpinBite supports daily promotion limits and daily reward limits. This helps restaurants keep promotions margin-safe and avoid giving away too many high-cost items.',
      },
      {
        q: 'Can I set coupon expiry time?',
        a: 'Yes. Restaurants can set how many minutes a coupon remains valid after it is issued. This encourages customers to redeem during the visit and reduces delayed or misused redemptions.',
      },
      {
        q: 'Can I end a promotion early?',
        a: 'Yes. Active promotions can be ended from Manage Promotions. Once ended, the customer link shows a branded SpinBite message explaining that the promotion has ended.',
      },
      {
        q: 'Can I test a promotion before launch?',
        a: 'Yes. The promotion builder includes test mode so restaurants can spin the wheel and preview the customer experience without issuing real coupons.',
      },
    ],
  },
  {
    category: 'Coupon Validation',
    questions: [
      {
        q: 'How does staff validate a coupon?',
        a: 'Staff open the Coupon Validator, scan the coupon QR code with the phone camera, or enter the coupon code manually. The system checks the coupon status before staff applies the reward.',
      },
      {
        q: 'What happens after staff redeems a coupon?',
        a: 'Once staff confirms redemption, the coupon is marked as redeemed so the same coupon cannot be used again. The dashboard can then track issued coupons, redeemed coupons, and redemption rate.',
      },
      {
        q: 'Can expired coupons still be scanned?',
        a: 'Expired coupons can be shown with an expired stamp. Staff should not redeem expired coupons unless the restaurant chooses to make a manual exception.',
      },
      {
        q: 'Do you keep an audit record of coupons?',
        a: 'Yes. SpinBite is designed to record issued and redeemed coupons in the database for audit and reporting. Server-side coupon issuance should be enabled before any real restaurant pilot.',
      },
    ],
  },
  {
    category: 'Business Results',
    questions: [
      {
        q: 'How does SpinBite help restaurants increase sales?',
        a: 'SpinBite turns attention into action. Restaurants can promote specific dishes, slow-moving items, high-margin products, combos, or add-ons through a fun game that customers want to play.',
      },
      {
        q: 'What metrics can restaurants see?',
        a: 'Restaurants can see active promotions, issued coupons, redeemed coupons, and redemption rate. Manage Promotions also shows status filters for active, draft, ended, and all campaigns.',
      },
      {
        q: 'Is SpinBite only for dine-in restaurants?',
        a: 'No. SpinBite can work for dine-in, takeout, food courts, cafés, bakeries, and quick-service restaurants. QR codes can be placed on tables, menus, receipts, posters, or takeout bags.',
      },
    ],
  },
  {
    category: 'Security and Abuse Prevention',
    questions: [
      {
        q: 'Can customers refresh and play again?',
        a: 'Session-level abuse prevention is on the product backlog. For real pilots, SpinBite should enforce customer spin limits server-side so refreshing the page does not reset allowed plays.',
      },
      {
        q: 'Can a coupon be used more than once?',
        a: 'The validation flow is designed to prevent duplicate redemption. Once staff marks a coupon as redeemed, future scans should show that it has already been used.',
      },
      {
        q: 'Is customer data required?',
        a: 'The current flow can work without heavy customer data capture. Future versions may add optional email, SMS, loyalty, or wallet features with proper consent and privacy controls.',
      },
    ],
  },
];

export default function FAQPage() {
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
            {faqs.map((group) => (
              <section key={group.category} className="rounded-[2rem] bg-white p-5 shadow-xl ring-1 ring-orange-100 sm:p-7">
                <h2 className="text-sm font-black uppercase tracking-[0.16em] text-[#FF6B00]">{group.category}</h2>
                <div className="mt-4 divide-y divide-stone-100">
                  {group.questions.map((item) => (
                    <details key={item.q} className="group py-4">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-xl font-black">
                        <span>{item.q}</span>
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-50 text-[#FF6B00] transition group-open:rotate-45">+</span>
                      </summary>
                      <p className="mt-3 text-base font-medium leading-7 text-stone-600">{item.a}</p>
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
