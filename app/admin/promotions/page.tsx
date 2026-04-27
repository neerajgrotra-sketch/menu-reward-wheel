'use client';

export default function PromotionsPage() {
  return (
    <main className="min-h-screen bg-[#FFF8F0] px-4 py-8 text-[#1F1F1F]">
      <section className="mx-auto max-w-md rounded-3xl bg-white p-6 shadow-xl">
        <h1 className="text-3xl font-black text-[#FF6B00]">Create Promotion</h1>
        <p className="mt-3 text-sm text-stone-600">
          This section will create a restaurant promotion, add wheel rewards, and publish a customer play link.
        </p>
        <a href="/admin" className="mt-6 block rounded-2xl bg-[#FF6B00] px-4 py-3 text-center font-black text-white">
          Back to Dashboard
        </a>
      </section>
    </main>
  );
}
