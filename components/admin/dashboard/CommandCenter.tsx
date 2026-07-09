'use client';

import { useEffect, useRef, useState } from 'react';
import { DashboardIcon } from './icons';

const ROTATING_PLACEHOLDERS = [
  'Apply 20% discount on desserts after 7 PM…',
  'Increase lunch sales this week…',
  'Pair chai with rasmalai at 30% off…',
  'Create a weekend family combo…',
  'Why are today’s sales lower?…',
];

const SUGGESTED_PROMPTS = [
  'Why are sales lower today?',
  'Show me my slowest selling items',
  'Create a weekend family combo',
  'Increase average order value',
];

type Props = {
  /** Whether the "Ask SpinBite" feature is live yet (ships disabled until PR-E). */
  enabled?: boolean;
};

export function CommandCenter({ enabled = false }: Props) {
  const [value, setValue] = useState('');
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [notice, setNotice] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const id = setInterval(() => {
      setPlaceholderIndex((current) => (current + 1) % ROTATING_PLACEHOLDERS.length);
    }, 3600);
    return () => clearInterval(id);
  }, []);

  function fillPrompt(prompt: string) {
    setValue(prompt);
    inputRef.current?.focus();
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!value.trim()) return;
    if (!enabled) {
      setNotice('SpinBite is still learning this restaurant — this is coming soon.');
      setTimeout(() => setNotice(''), 4000);
      return;
    }
    // Wired up in a later phase once the dashboard_qa intelligence feature ships.
  }

  return (
    <div className="relative overflow-hidden rounded-[2rem] bg-white p-6 shadow-2xl shadow-orange-100 md:p-8">
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full opacity-50"
        style={{ background: 'radial-gradient(circle, rgba(108,79,209,0.30), transparent 70%)' }}
        aria-hidden="true"
      />
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EFE9FB] px-3 py-1.5 text-xs font-black uppercase tracking-wide text-[#6C4FD1]">
        <DashboardIcon name="sparkle" className="h-3 w-3" />
        Ask SpinBite
      </span>
      <h2 className="relative mt-3 text-3xl font-black leading-tight text-[#1F1F1F] md:text-4xl">
        What would you like me to do today?
      </h2>
      <form onSubmit={handleSubmit} className="mt-5 rounded-2xl border-[1.5px] border-stone-200 bg-[#FFF8F0] p-3 focus-within:border-[#6C4FD1] focus-within:ring-4 focus-within:ring-[#EFE9FB]">
        <label htmlFor="ask-spinbite-input" className="sr-only">Tell SpinBite what to do</label>
        <textarea
          id="ask-spinbite-input"
          ref={inputRef}
          rows={2}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={ROTATING_PLACEHOLDERS[placeholderIndex]}
          className="w-full resize-none bg-transparent text-base text-[#1F1F1F] placeholder:text-stone-400 focus:outline-none md:text-lg"
        />
        <div className="mt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            aria-label="Use voice input"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-500 hover:text-[#1F1F1F]"
          >
            <DashboardIcon name="mic" className="h-4 w-4" />
          </button>
          <button
            type="submit"
            aria-label="Send to SpinBite"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FF6B00] text-white transition hover:-translate-y-0.5"
          >
            <DashboardIcon name="send" className="h-4 w-4" />
          </button>
        </div>
      </form>
      {notice && <p className="mt-3 text-sm font-bold text-[#6C4FD1]">{notice}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {SUGGESTED_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => fillPrompt(prompt)}
            className="rounded-full border border-stone-200 bg-white px-3.5 py-2 text-sm font-semibold text-stone-600 hover:border-[#6C4FD1] hover:text-[#6C4FD1]"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
