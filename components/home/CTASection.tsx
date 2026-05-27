"use client";

import React from 'react';

function RestaurantIcon(): JSX.Element {
  return (
    <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-white/18 ring-1 ring-white/30 backdrop-blur-sm sm:h-24 sm:w-24">
      <svg
        aria-hidden="true"
        className="h-11 w-11 text-white sm:h-13 sm:w-13"
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M16 28c0-8.837 7.163-16 16-16s16 7.163 16 16"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M11 28h42"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M16 52h32"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M20 34h24l-3 18H23l-3-18Z"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <path
          d="M26 20h.01M32 17h.01M38 20h.01"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
        />
      </svg>
      <span className="sr-only">Restaurant promotion icon</span>
    </div>
  );
}

export default function CTASection(): JSX.Element {
  return (
    <section className="px-4 py-16 text-center sm:px-6">
      <div className="mx-auto max-w-4xl rounded-[2rem] bg-gradient-to-r from-[#FF6B00] to-[#E63939] p-8 text-white shadow-2xl shadow-orange-200 sm:p-12">
        <RestaurantIcon />
        <h2 className="text-4xl font-black">Ready to gamify your restaurant?</h2>
        <p className="mx-auto mt-3 max-w-xl text-white/85">Create your first menu-powered reward wheel and publish a QR code diners can play instantly.</p>
        <a href="/auth" className="mt-7 inline-block rounded-full bg-white px-8 py-4 font-black text-[#FF6B00]">Sign Up Free</a>
      </div>
    </section>
  );
}
