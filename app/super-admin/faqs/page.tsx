import { requireSuperAdmin } from '@/lib/super-admin';

export default async function SuperAdminFaqsPage() {
  await requireSuperAdmin();

  return (
    <main className="min-h-screen bg-[#FFF8F0] px-4 py-6 text-[#1F1F1F]">
      <section className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-[#FF6B00]">🎯 SpinBite</h1>
            <p className="mt-1 text-sm font-bold text-stone-500">Super Admin / FAQ</p>
          </div>
          <a href="/super-admin" className="rounded-full bg-white px-4 py-3 text-sm font-black text-[#FF6B00] shadow">Command Center</a>
        </div>
        <div className="mt-6 rounded-[2rem] bg-white p-6 shadow-xl">
          <p className="text-sm font-black uppercase tracking-wide text-[#FF6B00]">Next phase</p>
          <h2 className="mt-3 text-4xl font-black">FAQ management is reserved for Phase 2.</h2>
          <p className="mt-3 text-sm font-semibold leading-6 text-stone-600">
            This protected route reserves the future FAQ editor for questions, answers, categories, ordering, and public visibility controls.
          </p>
        </div>
      </section>
    </main>
  );
}
