"use client";

import React from 'react';

function RestaurantIcon(): JSX.Element {
  return (
    <div className="relative mx-auto mb-10 flex justify-center lg:mb-12">
      <div className="relative w-[300px] sm:w-[460px] lg:w-[620px]">
        <div className="absolute inset-0 rounded-full bg-orange-300/20 blur-3xl" />

        <div className="relative flex justify-center">
          <div className="absolute inset-x-[14%] top-[18%] h-[58%] rounded-full border border-yellow-300/30 bg-[radial-gradient(circle_at_center,rgba(255,190,80,0.38),rgba(255,120,0,0.05)_68%,transparent_80%)]" />

          <div className="absolute left-[6%] top-[45%] h-12 w-3 rotate-[-35deg] rounded-full bg-yellow-300 shadow-[0_0_20px_rgba(255,220,100,0.8)]" />
          <div className="absolute left-[10%] top-[53%] h-9 w-3 rotate-[-60deg] rounded-full bg-yellow-300 shadow-[0_0_20px_rgba(255,220,100,0.8)]" />
          <div className="absolute right-[6%] top-[45%] h-12 w-3 rotate-[35deg] rounded-full bg-yellow-300 shadow-[0_0_20px_rgba(255,220,100,0.8)]" />
          <div className="absolute right-[10%] top-[53%] h-9 w-3 rotate-[60deg] rounded-full bg-yellow-300 shadow-[0_0_20px_rgba(255,220,100,0.8)]" />

          <div className="absolute left-[14%] top-[58%] text-4xl text-white drop-shadow-xl">✦</div>
          <div className="absolute right-[14%] top-[36%] text-4xl text-white drop-shadow-xl">✦</div>

          <div className="relative w-[82%]">
            <div className="absolute left-1/2 top-[7%] z-30 flex h-20 w-20 -translate-x-1/2 items-center justify-center rounded-full border-[6px] border-[#FFE8D1] bg-gradient-to-br from-[#FF7A1A] to-[#E9411B] shadow-[0_12px_24px_rgba(0,0,0,0.25)] lg:h-24 lg:w-24">
              <span className="text-4xl lg:text-5xl">🍴</span>
            </div>

            <div className="relative overflow-visible rounded-[2rem] border border-white/25 bg-[#F8E6D3] shadow-[0_30px_60px_rgba(60,10,0,0.35)]">
              <div className="relative rounded-t-[2rem] border-b-[6px] border-[#2B211C] bg-[#F6ECE2] pt-8">
                <div className="absolute inset-x-0 top-0 h-5 rounded-t-[2rem] bg-[#2A211C]" />

                <div className="absolute left-1/2 top-0 h-12 w-[24%] -translate-x-1/2 rounded-b-xl border-x-[6px] border-b-[6px] border-[#2A211C] bg-[#3A2C25]" />

                <div className="flex h-16 overflow-hidden border-y-[5px] border-[#D85A2A]">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div
                      key={i}
                      className={`flex-1 ${i % 2 === 0 ? 'bg-[#FFF5EB]' : 'bg-[#FF5A1F]'}`}
                    />
                  ))}
                </div>
              </div>

              <div className="relative flex items-end justify-center gap-6 bg-gradient-to-b from-[#F8EBDD] to-[#F3D4B8] px-8 pb-8 pt-7">
                <div className="absolute left-[9%] top-[14%] h-28 w-24 rounded-xl border-[5px] border-[#2B211C] bg-gradient-to-b from-[#FFC54D] to-[#FF7A00] shadow-[inset_0_0_24px_rgba(255,255,255,0.2)]">
                  <div className="absolute inset-4 rounded-md border border-orange-100 bg-[#FFB34F]/50" />

                  <div className="absolute left-1/2 top-[36%] h-6 w-6 -translate-x-1/2 rounded-full bg-[#FFEDC9] shadow-lg" />

                  <div className="absolute left-1/2 top-[46%] h-10 w-[2px] -translate-x-1/2 bg-[#FFEDC9]" />
                </div>

                <div className="relative z-10 mt-8 flex h-44 w-32 flex-col items-center rounded-t-2xl border-[7px] border-[#2B211C] bg-[#181512] shadow-[0_20px_40px_rgba(0,0,0,0.45)]">
                  <div className="mt-3 h-24 w-[82%] rounded-lg border border-white/10 bg-gradient-to-b from-[#FFCF68] to-[#FF8D18] shadow-[inset_0_0_30px_rgba(255,255,255,0.2)]" />

                  <div className="mt-auto h-14 w-full border-t-[6px] border-[#2B211C] bg-[#2B211C]" />
                </div>

                <div className="absolute right-[9%] top-[14%] h-28 w-24 rounded-xl border-[5px] border-[#2B211C] bg-gradient-to-b from-[#FFC54D] to-[#FF7A00] shadow-[inset_0_0_24px_rgba(255,255,255,0.2)]">
                  <div className="absolute inset-4 rounded-md border border-orange-100 bg-[#FFB34F]/50" />

                  <div className="absolute left-1/2 top-[28%] flex -translate-x-1/2 gap-1">
                    <div className="h-3 w-3 rounded-full bg-[#FFEDC9]" />
                    <div className="h-3 w-3 rounded-full bg-[#FFEDC9]" />
                  </div>

                  <div className="absolute left-1/2 top-[45%] h-10 w-10 -translate-x-1/2 rounded-full border-[3px] border-[#FFEDC9]" />
                </div>
              </div>

              <div className="absolute -bottom-4 left-[-10px] h-16 w-16 rounded-full bg-[#2E7D32] shadow-[0_10px_18px_rgba(0,0,0,0.25)] lg:h-20 lg:w-20">
                <div className="absolute bottom-[-10px] left-1/2 h-9 w-12 -translate-x-1/2 rounded-t-md bg-[#4A2D1C]" />
              </div>

              <div className="absolute -bottom-4 right-[-10px] h-16 w-16 rounded-full bg-[#2E7D32] shadow-[0_10px_18px_rgba(0,0,0,0.25)] lg:h-20 lg:w-20">
                <div className="absolute bottom-[-10px] left-1/2 h-9 w-12 -translate-x-1/2 rounded-t-md bg-[#4A2D1C]" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CTASection(): JSX.Element {
  return (
    <section className="px-4 py-16 text-center sm:px-6 lg:py-20">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-[2.5rem] bg-gradient-to-r from-[#FF6B00] via-[#FF4A1C] to-[#F23559] px-6 py-12 text-white shadow-[0_30px_80px_rgba(255,120,0,0.28)] sm:px-12 sm:py-16 lg:px-16 lg:py-20">
        <RestaurantIcon />

        <h2 className="mx-auto max-w-5xl text-5xl font-black leading-[0.95] tracking-tight text-white drop-shadow-[0_10px_18px_rgba(0,0,0,0.22)] sm:text-6xl lg:text-8xl">
          Ready to gamify
          <br />
          your restaurant?
        </h2>

        <p className="mx-auto mt-7 max-w-3xl text-lg leading-relaxed text-white/92 sm:text-2xl">
          Create your first menu-powered reward wheel and publish a QR code diners can play instantly.
        </p>

        <a
          href="/auth"
          className="mt-10 inline-flex items-center gap-4 rounded-full bg-white px-10 py-5 text-xl font-black text-[#FF6B00] shadow-[0_15px_35px_rgba(0,0,0,0.18)] transition-all duration-300 hover:scale-105 hover:shadow-[0_18px_45px_rgba(0,0,0,0.25)] sm:px-14 sm:text-2xl"
        >
          Sign Up Free

          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#FF6B00] text-2xl text-white shadow-lg">
            →
          </span>
        </a>
      </div>
    </section>
  );
}
