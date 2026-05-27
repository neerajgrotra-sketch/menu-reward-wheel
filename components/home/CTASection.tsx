"use client";

import React from 'react';

function RestaurantIcon(): JSX.Element {
  return (
    <div className="mx-auto mb-8 flex justify-center">
      <div className="relative w-[240px] sm:w-[320px] lg:w-[380px]">
        <div className="absolute inset-0 rounded-full bg-yellow-400/25 blur-3xl" />

        <div className="relative rounded-[2rem]">
          <div className="relative overflow-hidden rounded-[2rem] border border-white/20 bg-[#FFF4EA]/95 shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
            <div className="relative h-10 bg-[#2B2B2B]">
              <div className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[5px] border-white bg-gradient-to-br from-orange-400 to-red-500 shadow-xl">
                <span className="text-2xl">🍴</span>
              </div>
            </div>

            <div className="flex h-10 items-end bg-gradient-to-r from-[#FF5E00] to-[#FF7B54] px-5 pb-2 pt-1">
              <div className="flex w-full justify-between">
                <div className="h-8 w-5 rounded-full bg-white/90" />
                <div className="h-8 w-5 rounded-full bg-white/90" />
                <div className="h-8 w-5 rounded-full bg-white/90" />
                <div className="h-8 w-5 rounded-full bg-white/90" />
                <div className="h-8 w-5 rounded-full bg-white/90" />
                <div className="h-8 w-5 rounded-full bg-white/90" />
              </div>
            </div>

            <div className="grid grid-cols-[0.9fr_1.2fr_0.9fr] gap-3 bg-gradient-to-b from-[#FF9A62] to-[#F26B4F] p-5">
              <div className="rounded-xl bg-white/85 p-2 shadow-inner">
                <div className="flex h-full min-h-[88px] flex-col items-center justify-center gap-1 rounded-lg border border-orange-100 bg-white">
                  <span className="text-lg">🎁</span>
                  <span className="text-xs font-black text-[#FF6B00]">WIN</span>
                </div>
              </div>

              <div className="relative overflow-hidden rounded-xl border border-white/20 bg-[#1E1E1E] shadow-inner">
                <div className="absolute inset-y-0 left-1/3 w-px bg-white/10" />
                <div className="absolute inset-y-0 left-2/3 w-px bg-white/10" />

                <div className="slot-window absolute inset-0 flex animate-[slotSpin_3.5s_linear_infinite] flex-col">
                  <div className="grid h-[110px] shrink-0 grid-cols-3 place-items-center text-3xl">
                    <span>🍔</span>
                    <span>🎯</span>
                    <span>🍕</span>
                  </div>

                  <div className="grid h-[110px] shrink-0 grid-cols-3 place-items-center text-3xl">
                    <span>🎁</span>
                    <span>🍟</span>
                    <span>🏆</span>
                  </div>

                  <div className="grid h-[110px] shrink-0 grid-cols-3 place-items-center text-3xl">
                    <span>🥤</span>
                    <span>🎉</span>
                    <span>🌮</span>
                  </div>
                </div>

                <div className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-black/50 to-transparent" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/50 to-transparent" />
              </div>

              <div className="rounded-xl bg-white/10 p-2 backdrop-blur-sm">
                <div className="flex h-full min-h-[88px] flex-col items-center justify-center rounded-lg border border-white/20 bg-white/10 text-white">
                  <span className="text-lg">QR</span>
                  <span className="mt-1 text-[10px] font-bold tracking-[0.2em] text-white/80">PLAY</span>
                </div>
              </div>
            </div>
          </div>

          <div className="absolute -left-5 top-16 hidden h-5 w-5 rounded-full bg-yellow-300 shadow-lg lg:block" />
          <div className="absolute -right-4 top-28 hidden h-4 w-4 rounded-full bg-white shadow-lg lg:block" />
        </div>

        <style jsx>{`
          @keyframes slotSpin {
            0% {
              transform: translateY(0);
            }
            100% {
              transform: translateY(-330px);
            }
          }
        `}</style>
      </div>
    </div>
  );
}

export default function CTASection(): JSX.Element {
  return (
    <section className="px-4 py-16 text-center sm:px-6">
      <div className="mx-auto max-w-4xl overflow-hidden rounded-[2rem] bg-gradient-to-r from-[#FF6B00] via-[#FF5A1F] to-[#E63939] p-8 text-white shadow-2xl shadow-orange-300/40 sm:p-12">
        <RestaurantIcon />

        <h2 className="text-4xl font-black leading-tight tracking-tight drop-shadow-lg sm:text-5xl lg:text-6xl">
          Ready to gamify
          <br />
          your restaurant?
        </h2>

        <p className="mx-auto mt-5 max-w-2xl text-lg text-white/90 sm:text-xl">
          Create your first menu-powered reward wheel and publish a QR code diners can play instantly.
        </p>

        <a
          href="/auth"
          className="mt-8 inline-flex items-center gap-3 rounded-full bg-white px-10 py-5 text-lg font-black text-[#FF6B00] shadow-[0_10px_30px_rgba(255,255,255,0.25)] transition-all duration-300 hover:scale-105 hover:shadow-[0_15px_40px_rgba(255,255,255,0.35)]"
        >
          <span className="text-2xl">🚀</span>
          Sign Up Free
        </a>
      </div>
    </section>
  );
}
