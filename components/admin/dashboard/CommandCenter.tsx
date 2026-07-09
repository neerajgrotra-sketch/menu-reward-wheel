'use client';

import { useEffect, useRef, useState } from 'react';
import { DashboardIcon } from './icons';
import { DiscountActionPreview } from './DiscountActionPreview';
import type { MenuDiscountAction } from '@/lib/intelligence/actions/menu-discount-schema';
import type { ResolvableAction } from '@/lib/menu-discount-actions/resolve';
import { resolveDiscountSchedule } from '@/lib/menu-discount-actions/schedule';
import type { DashboardAssistantMessage } from '@/lib/dashboard-assistant/types';
import { isProposalLive, hasResolvedOutcome } from '@/lib/dashboard-assistant/types';

function toResolvableAction(action: MenuDiscountAction): ResolvableAction {
  if (action.type === 'clear_discount') return action;
  return { type: 'set_discount', target: action.target, discount: resolveDiscountSchedule(action.discount) };
}

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
  restaurantId: string;
  /** Live dashboard numbers, already formatted as strings — merged into the AI's context. */
  dashboardContext: Record<string, string>;
};

export function CommandCenter({ restaurantId, dashboardContext }: Props) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DashboardAssistantMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [value, setValue] = useState('');
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [notice, setNotice] = useState('');
  const [asking, setAsking] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const id = setInterval(() => {
      setPlaceholderIndex((current) => (current + 1) % ROTATING_PLACEHOLDERS.length);
    }, 3600);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadHistory() {
      try {
        const response = await fetch(`/api/admin/assistant/conversations?restaurantId=${encodeURIComponent(restaurantId)}`);
        const payload = await response.json().catch(() => ({}));
        if (!cancelled && response.ok) {
          setConversationId(payload.conversation?.id ?? null);
          setMessages(payload.messages ?? []);
        }
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    }
    loadHistory();
    return () => { cancelled = true; };
  }, [restaurantId]);

  function fillPrompt(prompt: string) {
    setValue(prompt);
    inputRef.current?.focus();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const question = value.trim();
    if (!question || asking) return;

    setAsking(true);
    setNotice('');
    setValue('');

    try {
      const response = await fetch('/api/admin/assistant/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId, conversationId, message: question, dashboardContext }),
      });
      const payload = await response.json().catch(() => ({}));

      if (payload.conversationId) setConversationId(payload.conversationId);
      if (payload.userMessage) setMessages((current) => [...current, payload.userMessage]);

      if (!response.ok) {
        setNotice(
          response.status === 503
            ? 'SpinBite is still learning this restaurant — this is coming soon.'
            : payload?.error || "Couldn't answer that right now.",
        );
        return;
      }

      if (payload.assistantMessage) setMessages((current) => [...current, payload.assistantMessage]);
    } catch {
      setNotice("Couldn't reach SpinBite. Try again in a moment.");
    } finally {
      setAsking(false);
    }
  }

  function handleResolved(outcomeMessage: DashboardAssistantMessage) {
    setMessages((current) => [...current, outcomeMessage]);
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

      {!loadingHistory && messages.length > 0 && (
        <div className="mt-5 max-h-96 space-y-3 overflow-y-auto rounded-2xl border border-stone-100 bg-[#FBFAF8] p-4">
          {messages.map((message) => (
            <ChatTurn key={message.id} message={message} messages={messages} restaurantId={restaurantId} conversationId={conversationId} onResolved={handleResolved} />
          ))}
        </div>
      )}

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
            disabled={asking}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FF6B00] text-white transition hover:-translate-y-0.5 disabled:opacity-50"
          >
            {asking ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <DashboardIcon name="send" className="h-4 w-4" />
            )}
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

type ChatTurnProps = {
  message: DashboardAssistantMessage;
  messages: DashboardAssistantMessage[];
  restaurantId: string;
  conversationId: string | null;
  onResolved: (outcomeMessage: DashboardAssistantMessage) => void;
};

function ChatTurn({ message, messages, restaurantId, conversationId, onResolved }: ChatTurnProps) {
  if (message.role === 'user') {
    return (
      <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-[#1F1F1F] px-4 py-2.5 text-sm font-semibold text-white">
        {message.content}
      </div>
    );
  }

  const bubbleClass = 'max-w-[85%] rounded-2xl rounded-tl-sm bg-[#EFE9FB] px-4 py-2.5 text-sm font-semibold leading-6 text-[#1F1F1F]';

  if (message.intent === 'menu_discount_action') {
    if (isProposalLive(message, messages) && conversationId) {
      return (
        <div>
          <div className={bubbleClass}>{message.content}</div>
          <DiscountActionPreview
            restaurantId={restaurantId}
            action={toResolvableAction(message.action as unknown as MenuDiscountAction)}
            conversationId={conversationId}
            messageId={message.id}
            onDismiss={() => {}}
            onResolved={onResolved}
          />
        </div>
      );
    }
    if (!hasResolvedOutcome(message, messages)) {
      return <div className={`${bubbleClass} opacity-60`}>{message.content} — no longer active, ask again to reapply.</div>;
    }
  }

  return <div className={bubbleClass}>{message.content}</div>;
}
