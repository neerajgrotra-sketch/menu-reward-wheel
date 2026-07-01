"use client";

import React from 'react';

export default function PricingSection(): JSX.Element {
  const plans: [string, string, string][] = [
    ['Starter', 'Free', 'One QR menu, commission-free ordering, and your first promotion'],
    ['Pro', '$49/mo', 'Unlimited promotions, AI menu content, session intelligence'],
    ['Enterprise', 'Custom', 'Multi-location controls, priority support, custom integrations'],
  ];

  return (
    <section id="pricing" className="px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-6xl text-center">
        <h2 className="text-3xl font-black sm:text-4xl">Simple pricing that grows with you</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {plans.map(([plan, price, copy]) => (
            <div key={plan} className="rounded-3xl bg-white p-6 text-left shadow-lg ring-1 ring-orange-100">
              <p className="text-sm font-black uppercase text-[#FF6B00]">{plan}</p>
              <h3 className="mt-2 text-3xl font-black">{price}</h3>
              <p className="mt-3 text-sm text-stone-600">{copy}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
