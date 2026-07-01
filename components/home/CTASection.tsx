"use client";

import React from 'react';

function RestaurantIcon(): JSX.Element {
  return (
    <div className="relative mx-auto mb-8 flex justify-center lg:mb-10">
      <div className="relative flex h-28 w-28 animate-[iconFloat_4s_ease-in-out_infinite] items-center justify-center rounded-full border border-white/25 bg-white/12 shadow-[0_22px_48px_rgba(0,0,0,0.2)] backdrop-blur-md sm:h-36 sm:w-36">
        <div className="absolute inset-0 animate-[softPulse_3s_ease-in-out_infinite] rounded-full bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.28),transparent_70%)]" />

        <svg
          aria-hidden="true"
          viewBox="0 0 64 64"
          className="relative h-16 w-16 text-white drop-shadow-[0_8px_14px_rgba(0,0,0,0.28)] sm:h-20 sm:w-20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M14 29h36v24H14V29Z"
            fill="currentColor"
            fillOpacity="0.18"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinejoin="round"
          />
          <path
            d="M18 15h28l5 14H13l5-14Z"
            fill="currentColor"
            fillOpacity="0.28"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinejoin="round"
          />
          <path
            d="M20 15v14M29 15v14M38 15v14M47 29v3a5 5 0 0 1-10 0v-3M37 29v3a5 5 0 0 1-10 0v-3M27 29v3a5 5 0 0 1-10 0v-3"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            d="M26 53V40h12v13"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinejoin="round"
          />
          <path
            d="M20 39h6M38 39h6"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </svg>
      </div>

      <style jsx>{`
        @keyframes iconFloat {
          0%, 100% {
            transform: translateY(0) scale(1);
          }
          50% {
            transform: translateY(-8px) scale(1.025);
          }
        }

        @keyframes softPulse {
          0%, 100% {
            opacity: 0.75;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.08);
          }
        }
      `}</style>
    </div>
  );
}

export default function CTASection(): JSX.Element {
  return (
    <section className="px-4 py-14 text-center sm:px-6 lg:py-20">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-[2.5rem] bg-gradient-to-r from-[#FF6B00] via-[#FF4A1C] to-[#F23559] px-6 py-10 text-white shadow-[0_30px_80px_rgba(255,120,0,0.28)] sm:px-12 sm:py-16 lg:px-16 lg:py-20">
        <RestaurantIcon />

        <h2 className="mx-auto max-w-5xl text-4xl font-black leading-[0.92] tracking-tight text-white drop-shadow-[0_8px_18px_rgba(0,0,0,0.2)] sm:text-6xl lg:text-7xl">
          Ready to turn every
          <br />
          scan into a sale?
        </h2>

        <p className="mx-auto mt-6 max-w-3xl text-base leading-relaxed text-white/92 sm:text-2xl">
          Set up your menu, turn on commission-free ordering, and launch your first promotion — all from one QR code diners can scan today.
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
