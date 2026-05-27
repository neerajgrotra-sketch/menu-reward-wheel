"use client";

import React from 'react';

export default function CTASection(): JSX.Element {
  return (
    <section className="px-4 py-16 text-center sm:px-6">
      <div className="mx-auto max-w-4xl rounded-[2rem] bg-gradient-to-r from-[#FF6B00] to-[#E63939] p-8 text-white shadow-2xl shadow-orange-200 sm:p-12">
        <h2 className="text-4xl font-black">Ready to gamify your restaurant?</h2>
        <p className="mx-auto mt-3 max-w-xl text-white/85">Create your first menu-powered reward wheel and publish a QR code diners can play instantly.</p>
        <a href="/auth" className="mt-7 inline-block rounded-full bg-white px-8 py-4 font-black text-[#FF6B00]">Sign Up Free</a>
      </div>
    </section>
  );
}
