import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-orange-50 p-6 text-stone-950">
      <section className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center text-center">
        <p className="mb-3 rounded-full bg-white px-4 py-2 text-sm font-semibold shadow">QR Restaurant Promo App</p>
        <h1 className="text-5xl font-black tracking-tight">Menu Reward Wheel</h1>
        <p className="mt-4 text-lg text-stone-700">Scan. Spin. Save. A mobile-first reward wheel for restaurant offers.</p>
        <div className="mt-8 grid w-full gap-3">
          <Link href="/play/demo" className="rounded-2xl bg-stone-950 px-6 py-4 font-bold text-white shadow-lg">Open Customer Demo</Link>
          <Link href="/staff" className="rounded-2xl bg-white px-6 py-4 font-bold text-stone-950 shadow-lg">Open Staff Validation</Link>
        </div>
      </section>
    </main>
  );
}
