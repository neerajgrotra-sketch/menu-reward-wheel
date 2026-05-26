const games = [
  { title: 'Spin Wheel', icon: '🎯', status: 'Live', body: 'A branded reward wheel for discounts, free menu items, daily promos, and table-side excitement.' },
  { title: 'Mystery Box Reveal', icon: '🎁', status: 'Live', body: 'Guests pick one of three mystery boxes and reveal a surprise coupon with a fun reward moment.' },
  { title: 'Scratch Card', icon: '🎟️', status: 'Coming Soon', body: 'A quick scratch-and-win experience for receipts, posters, and post-payment campaigns.' },
  { title: 'Slot Machine', icon: '🎰', status: 'Coming Soon', body: 'A jackpot-style reveal for bigger campaign launches and high-energy promos.' },
  { title: 'Pick a Door', icon: '🚪', status: 'Coming Soon', body: 'Guests choose a door to uncover a menu reward, discount, or comeback coupon.' },
  { title: 'Fortune Cookie', icon: '🥠', status: 'Coming Soon', body: 'A restaurant-friendly reveal for rewards, messages, and limited-time offers.' },
];

export default function AvailableGamesSection() {
  return (
    <section id="available-games" className="px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-6xl rounded-[2rem] bg-white p-6 shadow-xl ring-1 ring-orange-100 sm:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.16em] text-[#FF6B00]">Available Games</p>
            <h2 className="mt-2 text-3xl font-black sm:text-4xl">More than one way to win</h2>
            <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-stone-600">SpinBite now supports multiple QR game formats. Start with the live games today, then expand into new campaign types as the library grows.</p>
          </div>
          <div className="rounded-full bg-orange-50 px-4 py-2 text-xs font-black uppercase tracking-wide text-[#FF6B00]">2 live games • more coming soon</div>
        </div>
        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((game) => (
            <div key={game.title} className="rounded-3xl border border-orange-100 bg-[#FFF8F0] p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <span className="text-4xl">{game.icon}</span>
                <span className={`rounded-full px-3 py-1 text-xs font-black uppercase ${game.status === 'Live' ? 'bg-green-50 text-green-700' : 'bg-stone-100 text-stone-500'}`}>
                  {game.status}
                </span>
              </div>
              <h3 className="mt-4 text-2xl font-black">{game.title}</h3>
              <p className="mt-2 text-sm font-semibold leading-6 text-stone-600">{game.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
