"use client";

import React from 'react';

export default function FooterSection(): JSX.Element {
  return (
    <footer className="bg-[#111111] px-4 py-12 text-white sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[1.2fr_2fr]">
        <div>
          <a href="#top" className="flex items-center gap-2 text-3xl font-black text-white" aria-label="SpinBite home">
            <span className="text-4xl leading-none">🎯</span>
            <span>SpinBite</span>
          </a>
          <p className="mt-4 max-w-sm text-sm font-medium leading-6 text-white/60">One QR code for your menu, commission-free ordering, and promotions — with the session intelligence to see what&apos;s actually happening at the table.</p>
          <p className="mt-6 text-xs font-bold text-white/40">Copyright © 2026 SpinBite. All rights reserved.</p>
        </div>

        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-[0.16em] text-white">Navigation</h3>
            <div className="mt-4 space-y-3 text-sm font-semibold text-white/60">
              <a className="block hover:text-white" href="#top">Home</a>
              <a className="block hover:text-white" href="#product">Product</a>
              <a className="block hover:text-white" href="#available-games">Games</a>
              <a className="block hover:text-white" href="#pricing">Pricing</a>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-black uppercase tracking-[0.16em] text-white">Resources</h3>
            <div className="mt-4 space-y-3 text-sm font-semibold text-white/60">
              <a className="block hover:text-white" href="/faq">FAQ</a>
              <a className="block hover:text-white" href="/auth">Create Account</a>
              <a className="block hover:text-white" href="/auth">Login</a>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-black uppercase tracking-[0.16em] text-white">For Restaurants</h3>
            <div className="mt-4 space-y-3 text-sm font-semibold text-white/60">
              <a className="block hover:text-white" href="#restaurants">Margin Controls</a>
              <a className="block hover:text-white" href="/faq">Coupon Validation</a>
              <a className="block hover:text-white" href="/faq">Multi-location FAQ</a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
