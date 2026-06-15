"use client";

import { useState } from 'react';

const games = [
  {
    title: 'Spin Wheel',
    icon: '🎯',
    status: 'Live',
    body: 'A branded reward wheel for discounts, free menu items, daily promos, and table-side excitement.',
    demoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
  },
  {
    title: 'Mystery Box Reveal',
    icon: '🎁',
    status: 'Live',
    body: 'Guests pick one of three mystery boxes and reveal a surprise coupon with a fun reward moment.',
    demoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
  },
  {
    title: 'Scratch Card',
    icon: '🎟️',
    status: 'Live',
    body: 'A quick scratch-and-win experience for receipts, posters, and post-payment campaigns.',
    demoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
  },
  { title: 'Lucky Reels', icon: '🎰', status: 'Coming Soon', body: 'A jackpot-style reveal for bigger campaign launches and high-energy promos.' },
  { title: 'Open The Door', icon: '🚪', status: 'Coming Soon', body: 'Guests choose a door to uncover a menu reward, discount, or comeback coupon.' },
  { title: 'Fortune Cookie', icon: '🥠', status: 'Coming Soon', body: 'A restaurant-friendly reveal for rewards, messages, and limited-time offers.' },
];

type Game = (typeof games)[number];

export default function AvailableGamesSection() {
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);

  return (
    <section id="available-games" className="px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-6xl rounded-[2rem] bg-white p-6 shadow-xl ring-1 ring-orange-100 sm:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.16em] text-[#FF6B00]">Available Games</p>
            <h2 className="mt-2 text-3xl font-black sm:text-4xl">More than one way to win</h2>
            <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-stone-600">SpinBite now supports multiple QR game formats. Start with the live games today, then expand into new campaign types as the library grows.</p>
          </div>
          <div className="rounded-full bg-orange-50 px-4 py-2 text-xs font-black uppercase tracking-wide text-[#FF6B00]">3 live games • more coming soon</div>
        </div>
        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((game) => {
            const isLive = game.status === 'Live';

            return (
              <div key={game.title} className="rounded-3xl border border-orange-100 bg-[#FFF8F0] p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-4xl">{game.icon}</span>
                  <span className={`rounded-full px-3 py-1 text-xs font-black uppercase ${isLive ? 'bg-green-50 text-green-700' : 'bg-stone-100 text-stone-500'}`}>
                    {game.status}
                  </span>
                </div>
                <h3 className="mt-4 text-2xl font-black">{game.title}</h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-stone-600">{game.body}</p>

                {isLive && game.demoUrl ? (
                  <button
                    type="button"
                    onClick={() => setSelectedGame(game)}
                    className="mt-5 inline-flex w-full items-center justify-center rounded-full bg-[#FF6B00] px-5 py-3 text-sm font-black text-white shadow-md shadow-orange-200 transition-all duration-200 hover:scale-[1.02] hover:bg-[#e85f00]"
                  >
                    Watch Demo
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {selectedGame?.demoUrl ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`${selectedGame.title} demo video`}>
          <div className="w-full max-w-4xl overflow-hidden rounded-[2rem] bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-stone-100 p-4 sm:p-5">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#FF6B00]">Game Demo</p>
                <h3 className="text-xl font-black text-stone-950 sm:text-2xl">{selectedGame.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedGame(null)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-xl font-black text-stone-700 transition-colors hover:bg-stone-200"
                aria-label="Close demo video"
              >
                ×
              </button>
            </div>

            <div className="aspect-video bg-black">
              <iframe
                className="h-full w-full"
                src={selectedGame.demoUrl}
                title={`${selectedGame.title} demo video`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
