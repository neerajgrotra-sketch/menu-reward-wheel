"use client";

import React from 'react';

function RestaurantIcon(): JSX.Element {
  return (
    <div className="mx-auto mb-8 flex justify-center">
      <div className="relative w-[220px] sm:w-[280px] lg:w-[340px]">
        <svg
          aria-hidden="true"
          viewBox="0 0 420 240"
          className="h-auto w-full drop-shadow-2xl"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect x="70" y="85" width="280" height="120" rx="18" fill="rgba(255,255,255,0.16)" />
          <rect x="95" y="120" width="70" height="85" rx="8" fill="rgba(255,255,255,0.92)" />
          <rect x="185" y="135" width="140" height="70" rx="10" fill="rgba(255,255,255,0.24)" />
          <rect x="70" y="70" width="280" height="35" rx="10" fill="white" />

          <path
            d="M90 70H330L315 35H105L90 70Z"
            fill="rgba(255,255,255,0.9)"
          />

          <path
            d="M120 35V70M165 35V70M210 35V70M255 35V70M300 35V70"
            stroke="#FF6B00"
            strokeWidth="10"
            strokeLinecap="round"
          />

          <circle cx="130" cy="160" r="10" fill="#FF6B00" />

          <path
            d="M200 95C200 72 218 54 240 54C262 54 280 72 280 95"
            stroke="white"
            strokeWidth="12"
            strokeLinecap="round"
          />

          <text
            x="210"
            y="167"
            textAnchor="middle"
            fill="white"
            fontSize="28"
            fontWeight="800"
            fontFamily="Arial, sans-serif"
          >
            RESTAURANT
          </text>
        </svg>
      </div>
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
