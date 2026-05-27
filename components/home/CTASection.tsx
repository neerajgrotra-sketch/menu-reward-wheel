"use client";

import React from 'react';

function RestaurantIcon(): JSX.Element {
  return (
    <div className="relative mx-auto mb-8 flex justify-center lg:mb-10">
      <div className="relative w-full max-w-[520px]">
        <div className="absolute inset-0 rounded-full bg-orange-300/20 blur-3xl" />

        <div className="relative mx-auto aspect-[1.8/1] w-full max-w-[460px]">
          <div className="absolute inset-x-[12%] top-[12%] h-[72%] rounded-full border border-yellow-300/30 bg-[radial-gradient(circle_at_center,rgba(255,190,80,0.35),rgba(255,120,0,0.05)_70%,transparent_85%)]" />

          <div className="absolute left-[6%] top-[42%] h-10 w-3 rotate-[-35deg] rounded-full bg-yellow-300 shadow-[0_0_20px_rgba(255,220,100,0.7)]" />
          <div className="absolute left-[10%] top-[49%] h-8 w-3 rotate-[-55deg] rounded-full bg-yellow-300 shadow-[0_0_20px_rgba(255,220,100,0.7)]" />
          <div className="absolute right-[6%] top-[42%] h-10 w-3 rotate-[35deg] rounded-full bg-yellow-300 shadow-[0_0_20px_rgba(255,220,100,0.7)]" />
          <div className="absolute right-[10%] top-[49%] h-8 w-3 rotate-[55deg] rounded-full bg-yellow-300 shadow-[0_0_20px_rgba(255,220,100,0.7)]" />

          <div className="absolute left-[14%] top-[55%] text-3xl text-white/90">✦</div>
          <div className="absolute right-[14%] top-[28%] text-3xl text-white/90">✦</div>

          <div className="absolute left-1/2 top-0 z-30 flex h-16 w-16 -translate-x-1/2 items-center justify-center rounded-full border-[5px] border-[#FFE8D1] bg-gradient-to-br from-[#FF7A1A] to-[#E9411B] shadow-[0_10px_24px_rgba(0,0,0,0.25)] sm:h-20 sm:w-20">
            <span className="text-3xl sm:text-4xl">🍴</span>
          </div>

          <div className="absolute inset-x-[10%] bottom-0 top-[12%] overflow-hidden rounded-[2rem] border border-white/20 bg-[#F6E6D5] shadow-[0_25px_55px_rgba(60,10,0,0.35)]">
            <div className="relative h-[28%] bg-[#F4ECE2]">
              <div className="absolute inset-x-0 top-0 h-4 bg-[#2A211C]" />

              <div className="absolute left-1/2 top-0 h-10 w-[24%] -translate-x-1/2 rounded-b-xl border-x-[5px] border-b-[5px] border-[#2A211C] bg-[#3B2D25]" />

              <div className="absolute bottom-0 flex h-[55%] w-full overflow-hidden border-y-[4px] border-[#D85A2A]">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className={`flex-1 ${i % 2 === 0 ? 'bg-[#FFF5EB]' : 'bg-[#FF5A1F]'}`}
                  />
                ))}
              </div>
            </div>

            <div className="relative flex h-[72%] items-end justify-center bg-gradient-to-b from-[#F8EBDD] to-[#F3D4B8] px-6 pb-6">
              <div className="absolute left-[10%] top-[18%] h-[38%] w-[18%] rounded-xl border-[4px] border-[#2B211C] bg-gradient-to-b from-[#FFC54D] to-[#FF7A00] shadow-inner" />

              <div className="absolute right-[10%] top-[18%] h-[38%] w-[18%] rounded-xl border-[4px] border-[#2B211C] bg-gradient-to-b from-[#FFC54D] to-[#FF7A00] shadow-inner" />

              <div className="relative z-10 flex h-[72%] w-[24%] flex-col rounded-t-2xl border-[6px] border-[#2B211C] bg-[#181512] shadow-[0_20px_40px_rgba(0,0,0,0.4)]">
                <div className="m-3 flex-1 rounded-lg bg-gradient-to-b from-[#FFD06A] to-[#FF8D18] shadow-[inset_0_0_25px_rgba(255,255,255,0.25)]" />
                <div className="h-10 border-t-[5px] border-[#2B211C] bg-[#2B211C]" />
              </div>
            </div>
          </div>

          <div className="absolute bottom-[-6px] left-[12%] h-14 w-14 rounded-full bg-[#2E7D32] shadow-lg sm:h-16 sm:w-16">
            <div className="absolute bottom-[-8px] left-1/2 h-7 w-10 -translate-x-1/2 rounded-t-md bg-[#4A2D1C]" />
          </div>

          <div className="absolute bottom-[-6px] right-[12%] h-14 w-14 rounded-full bg-[#2E7D32] shadow-lg sm:h-16 sm:w-16">
            <div className="absolute bottom-[-8px] left-1/2 h-7 w-10 -translate-x-1/2 rounded-t-md bg-[#4A2D1C]" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CTASection(): JSX.Element {
  return (
    <section className="px-4 py-14 text-center sm:px-6 lg:py-20">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-[2.5rem] bg-gradient-to-r from-[#FF6B00] via-[#FF4A1C] to-[#F23559] px-6 py-10 text-white shadow-[0_30px_80px_rgba(255,120,0,0.28)] sm:px-12 sm:py-16 lg:px-16 lg:py-20">
        <RestaurantIcon />

        <h2 className="mx-auto max-w-5xl text-4xl font-black leading-[0.92] tracking-tight text-white drop-shadow-[0_8px_18px_rgba(0,0,0,0.2)] sm:text-6xl lg:text-8xl">
          Ready to gamify
          <br />
          your restaurant?
        </h2>

        <p className="mx-auto mt-6 max-w-3xl text-base leading-relaxed text-white/92 sm:text-2xl">
          Create your first menu-powered reward wheel and publish a QR code diners can play instantly.
        </p>

        <a
          href="/auth"
          className="mt-9 inline-flex items-center gap-4 rounded-full bg-white px-9 py-4 text-lg font-black text-[#FF6B00] shadow-[0_15px_35px_rgba(0,0,0,0.18)] transition-all duration-300 hover:scale-105 hover:shadow-[0_18px_45px_rgba(0,0,0,0.25)] sm:px-14 sm:py-5 sm:text-2xl"
        >
          Sign Up Free
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FF6B00] text-xl text-white shadow-lg sm:h-11 sm:w-11 sm:text-2xl">
            →
          </span>
        </a>
      </div>
    </section>
  );
}
