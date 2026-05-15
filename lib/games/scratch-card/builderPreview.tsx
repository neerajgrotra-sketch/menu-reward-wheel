'use client';

export default function ScratchCardBuilderPreview() {
  return (
    <div className="rounded-[2rem] bg-gradient-to-br from-orange-400 via-yellow-300 to-red-500 p-5 shadow-xl">
      <div className="rounded-[1.5rem] border-2 border-white/60 bg-white/20 p-6 text-center text-white backdrop-blur-sm">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-white/80">Scratch Card</p>
        <h2 className="mt-3 text-4xl font-black leading-none">Scratch & Win</h2>
      </div>
    </div>
  );
}
