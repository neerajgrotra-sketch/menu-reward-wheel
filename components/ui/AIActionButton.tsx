'use client';

import { useState } from 'react';

type Props = {
  featureKey: string;
  restaurantId: string;
  context: Record<string, string>;
  onGenerated: (output: string) => void;
  disabled?: boolean;
};

export function AIActionButton({ featureKey, restaurantId, context, onGenerated, disabled }: Props) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/intelligence/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featureKey, restaurantId, context }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      onGenerated(data.output);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't generate right now.";
      setError(message);
      setTimeout(() => setError(null), 3000);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={generate}
        disabled={disabled || generating}
        className="flex items-center gap-1.5 rounded-lg bg-[#FF6B00] px-2.5 py-1 text-xs font-black text-white transition-opacity hover:opacity-80 disabled:opacity-40"
      >
        {generating ? (
          <>
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Generating…
          </>
        ) : (
          <>✨ Generate with AI</>
        )}
      </button>
      {error && (
        <p className="text-right text-xs font-bold text-red-500">{error}</p>
      )}
    </div>
  );
}
