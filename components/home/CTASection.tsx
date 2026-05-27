"use client";

import React from 'react';

function RestaurantIcon(): JSX.Element {
  return (
    <div className="relative mx-auto mb-8 flex justify-center lg:mb-10">
      <div className="relative flex h-32 w-32 items-center justify-center rounded-full border border-white/20 bg-white/10 shadow-[0_25px_55px_rgba(0,0,0,0.22)] backdrop-blur-md sm:h-40 sm:w-40">
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.28),transparent_70%)]" />

        <div className="relative flex h-20 w-20 flex-col overflow-hidden rounded-3xl bg-white shadow-2xl sm:h-24 sm:w-24">
          <div className="h-4 bg-[#2A211C]" />

          <div className="flex h-5 overflow-hidden border-y border-orange-300">
            <div className="flex-1 bg-[#FFF4E8]" />
            <div className="flex-1 bg-[#FF5A1F]" />
            <div className="flex-1 bg-[#FFF4E8]" />
            <div className="flex-1 bg-[#FF5A1F]" />
          </div>

          <div className="flex flex-1 items-end justify-center gap-2 bg-[#FFF8F2] px-3 pb-3 pt-2">
            <div className="h-6 w-6 rounded-lg border-[3px] border-[#2A211C] bg-gradient-to-b from-[#FFD06A] to-[#FF9622]" />

            <div className="flex h-10 w-8 flex-col rounded-t-xl border-[4px] border-[#2A211C] bg-[#1B1715]">
              <div className="m-1 flex-1 rounded-md bg-gradient-to-b from-[#FFD06A] to-[#FF9622]" />
            </div>

            <div className="h-6 w-6 rounded-lg border-[3px] border-[#2A211C] bg-gradient-to-b from-[#FFD06A] to-[#FF9622]" />
          </div>
        </div>

        <div className="absolute -left-2 top-1/2 h-8 w-3 -translate-y-1/2 rotate-[-35deg] rounded-full bg-yellow-300 shadow-[0_0_16px_rgba(255,220,100,0.8)]" />
        <div className="absolute -right-2 top-1/2 h-8 w-3 -translate-y-1/2 rotate-[35deg] rounded-full bg-yellow-300 shadow-[0_0_16px_rgba(255,220,100,0.8)]" />
      </div>
    </div>
  );
}

export default function CTASection(): JSX.Element {
  return (
    <section className="px-4 py-14 text-center sm:px-6 lg:py-20">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-[2.5rem] bg-gradient-to-r from-[#FF6B00] via-[#FF4A1C] to-[#F23559] px-6 py-10 text-white shadow-[0_30px_80px_rgba(255,120,0,0.28)] sm:px-12 sm:py-16 lg:px-16 lg:py-20">
        <RestaurantIcon />

        <h2 className="mx-auto max-w-5xl text-4xl font-black leading-[0.92] tracking-tight text-white drop-shadow-[0_8px_18px_rgba(0,0,0,0.2)] sm:text-6xl lg:text-7xl">
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
