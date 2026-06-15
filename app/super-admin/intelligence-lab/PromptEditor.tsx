'use client';

import { useRef, useState, useTransition } from 'react';
import { savePromptTemplate, activateTemplate } from './actions';

type Template = {
  id: string;
  feature_key: string;
  name: string;
  provider: string;
  model: string;
  system_prompt: string | null;
  user_prompt_template: string;
  temperature: string | number;
  max_tokens: number;
  active: boolean;
  version: number;
  notes: string | null;
  status: string;
};

type Props = {
  featureKey: string;
  templates: Template[];
};

const STATUS_STYLES: Record<string, string> = {
  active:   'bg-green-100 text-green-700',
  testing:  'bg-blue-100 text-blue-700',
  draft:    'bg-stone-100 text-stone-500',
  archived: 'bg-stone-50 text-stone-400',
};

export function PromptEditor({ featureKey, templates }: Props) {
  const active = templates.find((t) => t.active) ?? null;

  const [showForm, setShowForm]      = useState(false);
  const [notice, setNotice]          = useState('');
  const [error, setError]            = useState('');
  const [isPending, startTransition] = useTransition();
  const [activating, setActivating]  = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function flash(msg: string, isError = false) {
    if (isError) { setError(msg); setTimeout(() => setError(''), 4000); }
    else          { setNotice(msg); setTimeout(() => setNotice(''), 3000); }
  }

  function handleSaveDraft(formData: FormData) {
    startTransition(async () => {
      try {
        await savePromptTemplate(formData);
        setShowForm(false);
        formRef.current?.reset();
        flash('Draft saved. Review it in version history, then activate when ready.');
      } catch (err) {
        flash(err instanceof Error ? err.message : 'Save failed.', true);
      }
    });
  }

  function handleActivate(templateId: string) {
    setActivating(templateId);
    const fd = new FormData();
    fd.set('template_id', templateId);
    fd.set('feature_key', featureKey);
    startTransition(async () => {
      try {
        await activateTemplate(fd);
        flash('Template activated.');
      } catch (err) {
        flash(err instanceof Error ? err.message : 'Activation failed.', true);
      } finally {
        setActivating(null);
      }
    });
  }

  return (
    <div className="space-y-4">

      {/* Active template preview */}
      {active ? (
        <div className="rounded-2xl border border-orange-100 bg-orange-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-[#FF6B00]">Active · v{active.version}</p>
              <p className="mt-1 font-black">{active.name}</p>
              <p className="mt-0.5 text-xs font-bold text-stone-500">{active.provider} · {active.model}</p>
            </div>
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-black text-green-700">Live</span>
          </div>
          {active.system_prompt && (
            <div className="mt-3">
              <p className="mb-1 text-xs font-black uppercase tracking-wide text-stone-400">System Prompt</p>
              <pre className="whitespace-pre-wrap rounded-xl bg-white p-3 text-xs text-stone-700 shadow-sm">{active.system_prompt}</pre>
            </div>
          )}
          <div className="mt-3">
            <p className="mb-1 text-xs font-black uppercase tracking-wide text-stone-400">User Prompt Template</p>
            <pre className="whitespace-pre-wrap rounded-xl bg-white p-3 text-xs text-stone-700 shadow-sm">{active.user_prompt_template}</pre>
          </div>
          <div className="mt-3 flex gap-4 text-xs font-bold text-stone-500">
            <span>temp {Number(active.temperature).toFixed(2)}</span>
            <span>max_tokens {active.max_tokens}</span>
          </div>
          {active.notes && (
            <p className="mt-2 text-xs text-stone-500">{active.notes}</p>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
          <p className="text-sm font-black text-amber-700">No active template — generation will fail for this feature.</p>
          <p className="mt-1 text-xs text-amber-600">Save a draft and activate it before enabling this feature.</p>
        </div>
      )}

      {/* Feedback messages */}
      {notice && <p className="rounded-xl bg-green-50 px-4 py-3 text-sm font-bold text-green-700">{notice}</p>}
      {error  && <p className="rounded-xl bg-red-50   px-4 py-3 text-sm font-bold text-red-700">{error}</p>}

      {/* Toggle draft form */}
      <button
        type="button"
        onClick={() => setShowForm((v) => !v)}
        className="rounded-xl bg-[#FF6B00] px-5 py-2.5 text-sm font-black text-white transition-opacity hover:opacity-85"
      >
        {showForm ? 'Cancel' : '+ New Draft Version'}
      </button>

      {/* Draft form — saves as status=draft, never activates immediately */}
      {showForm && (
        <form ref={formRef} action={handleSaveDraft} className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <input type="hidden" name="feature_key" value={featureKey} />

          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-black uppercase tracking-wide text-[#FF6B00]">New Draft Version</p>
            <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-black text-stone-500">Saves as Draft</span>
          </div>

          <p className="text-xs text-stone-500">
            Drafts do not go live. Review the saved version in history and click Activate when ready.
          </p>

          {/* Name */}
          <div>
            <label className="mb-1 block text-xs font-black uppercase tracking-wide text-stone-400">Name</label>
            <input name="name" required placeholder="v2 — Concise, 2 sentences" className="w-full rounded-xl border border-stone-200 px-4 py-3 font-semibold outline-none focus:border-[#FF6B00]" />
          </div>

          {/* Provider + model */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-black uppercase tracking-wide text-stone-400">Provider</label>
              <select name="provider" defaultValue="anthropic" className="w-full rounded-xl border border-stone-200 px-4 py-3 font-semibold outline-none focus:border-[#FF6B00]">
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="gemini">Gemini</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-black uppercase tracking-wide text-stone-400">Model</label>
              <input name="model" required defaultValue="claude-haiku-4-5-20251001" className="w-full rounded-xl border border-stone-200 px-4 py-3 font-semibold outline-none focus:border-[#FF6B00]" />
            </div>
          </div>

          {/* System prompt */}
          <div>
            <label className="mb-1 block text-xs font-black uppercase tracking-wide text-stone-400">System Prompt (optional)</label>
            <textarea name="system_prompt" rows={3} placeholder="Optional system-level instruction..." className="w-full resize-none rounded-xl border border-stone-200 px-4 py-3 font-semibold outline-none focus:border-[#FF6B00]" />
          </div>

          {/* User prompt template */}
          <div>
            <label className="mb-1 block text-xs font-black uppercase tracking-wide text-stone-400">
              User Prompt Template <span className="font-normal normal-case text-stone-400">— use {'{{variable}}'} syntax</span>
            </label>
            <textarea name="user_prompt_template" required rows={6} placeholder="Write a 2-sentence description for {{item_name}}..." className="w-full resize-none rounded-xl border border-stone-200 px-4 py-3 font-semibold outline-none focus:border-[#FF6B00]" />
          </div>

          {/* Temperature + max tokens */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-black uppercase tracking-wide text-stone-400">Temperature</label>
              <input type="number" name="temperature" step="0.1" min="0" max="2" defaultValue="0.7" className="w-full rounded-xl border border-stone-200 px-4 py-3 font-semibold outline-none focus:border-[#FF6B00]" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-black uppercase tracking-wide text-stone-400">Max Tokens</label>
              <input type="number" name="max_tokens" min="1" max="4096" defaultValue="150" className="w-full rounded-xl border border-stone-200 px-4 py-3 font-semibold outline-none focus:border-[#FF6B00]" />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1 block text-xs font-black uppercase tracking-wide text-stone-400">Notes (internal)</label>
            <input name="notes" placeholder="What changed and why..." className="w-full rounded-xl border border-stone-200 px-4 py-3 font-semibold outline-none focus:border-[#FF6B00]" />
          </div>

          <button type="submit" disabled={isPending} className="w-full rounded-xl bg-stone-800 py-3 text-sm font-black text-white transition-opacity disabled:opacity-50">
            {isPending ? 'Saving draft…' : 'Save as Draft'}
          </button>
        </form>
      )}

      {/* Version history — all templates, with status badges and activate controls */}
      {templates.length > 0 && (
        <details className="rounded-2xl border border-stone-100 bg-white p-5 shadow-sm" open={!active}>
          <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-stone-400">
            Version History ({templates.length} total)
          </summary>
          <div className="mt-4 space-y-2">
            {templates.map((t) => (
              <div key={t.id} className={`flex items-center justify-between gap-3 rounded-xl p-3 ${t.active ? 'bg-orange-50' : 'bg-stone-50'}`}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-black">{t.name}</p>
                    <span className="text-xs text-stone-400">v{t.version}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-black ${STATUS_STYLES[t.status] ?? 'bg-stone-100 text-stone-400'}`}>
                      {t.status}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-stone-500">{t.provider} · {t.model}</p>
                  {t.notes && <p className="mt-0.5 text-xs text-stone-400 italic">{t.notes}</p>}
                </div>
                {t.active ? (
                  <span className="shrink-0 rounded-full bg-green-100 px-3 py-1 text-xs font-black text-green-700">Live</span>
                ) : (
                  <button
                    type="button"
                    disabled={activating === t.id || isPending}
                    onClick={() => handleActivate(t.id)}
                    className="shrink-0 rounded-full bg-stone-100 px-3 py-1 text-xs font-black text-stone-600 transition-colors hover:bg-[#FF6B00] hover:text-white disabled:opacity-50"
                  >
                    {activating === t.id ? 'Activating…' : 'Activate'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
