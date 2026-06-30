export default async function SuperAdminSettingsPage() {
  return (
    <main className="min-h-screen bg-[#FFF8F0] px-4 py-6 text-[#1F1F1F]">
      <section className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-[#FF6B00]">Super Admin / Settings</h1>
          </div>
          <a href="/super-admin" className="rounded-full bg-white px-4 py-3 text-sm font-black text-[#FF6B00] shadow">Command Center</a>
        </div>
        <div className="mt-6 rounded-[2rem] bg-white p-6 shadow-xl">
          <p className="text-sm font-black uppercase tracking-wide text-[#FF6B00]">Next phase</p>
          <h2 className="mt-3 text-4xl font-black">Feature flags and template settings are reserved for Phase 2.</h2>
          <p className="mt-3 text-sm font-semibold leading-6 text-stone-600">
            This protected route reserves future controls for print kit rollout, digital signage, AI menu import, SMS coupon delivery, try-again rewards, restaurant logo upload, and multiple games.
          </p>
        </div>
      </section>
    </main>
  );
}
