'use client';

import { useEffect, useRef, useState } from 'react';
import { DashboardIcon } from './icons';
import { ProposalCard } from './ProposalCard';
import { TargetSelector } from './TargetSelector';
import { RevenueOpportunityList } from './RevenueOpportunityList';
import type { MenuDiscountAction } from '@/lib/intelligence/actions/menu-discount-schema';
import type { ResolvableAction } from '@/lib/menu-discount-actions/resolve';
import { resolveDiscountSchedule } from '@/lib/menu-discount-actions/schedule';
import type { DashboardAssistantMessage } from '@/lib/dashboard-assistant/types';
import { isProposalLive, isClarificationLive, hasResolvedOutcome, isOpportunityListLive, isOpportunityConverted } from '@/lib/dashboard-assistant/types';
import type { Database } from '@/lib/supabase/database.types';
import type { RevenueGoalKey, RevenueOpportunity } from '@/lib/restaurant-planner/types';

type ProposalRow = Database['public']['Tables']['restaurant_planner_proposals']['Row'];

function toResolvableAction(action: MenuDiscountAction): ResolvableAction {
  if (action.type === 'clear_discount') return action;
  return { type: 'set_discount', target: action.target, discount: resolveDiscountSchedule(action.discount) };
}

function makeTempId(): string {
  return `optimistic-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`}`;
}

const ROTATING_PLACEHOLDERS = [
  'Apply 20% discount on desserts after 7 PM…',
  'Increase lunch sales this week…',
  'Pair chai with rasmalai at 30% off…',
  'Create a weekend family combo…',
  'Why are today’s sales lower?…',
];

// A larger pool than what's shown at once — a fresh subset rotates into
// view periodically (mission: "Rotate them periodically") so a returning
// owner sees new ideas instead of the same four chips every visit. Only
// shown while the conversation is empty — once a real exchange starts,
// these would just be clutter.
const EXAMPLE_PROMPTS = [
  'Apply 20% discount to desserts',
  'Create a lunch combo',
  'Pair chai with rasmalai',
  'Increase beverage sales',
  'Make butter chicken featured',
  'Offer free naan with butter chicken',
  'Why are sales lower today?',
  'Show me my slowest selling items',
];
const EXAMPLE_PROMPTS_VISIBLE = 4;

// Shown one at a time while a turn is in flight — a concrete progress
// narration instead of a bare spinner. Not tied to real planner phases (the
// planner is a single blocking model call, see
// lib/restaurant-planner/planner-engine.ts) — this is perceived progress,
// not a real event stream. See the Product Polish Report for why real
// phase-by-phase streaming would require new infrastructure.
const THINKING_STAGES = ['Reading your request…', 'Checking your menu…', 'Estimating impact…', 'Preparing a response…'];

function randomSubset<T>(pool: T[], count: number): T[] {
  return [...pool].sort(() => Math.random() - 0.5).slice(0, count);
}

type Props = {
  restaurantId: string;
  /** Live dashboard numbers, already formatted as strings — merged into the AI's context. */
  dashboardContext: Record<string, string>;
};

export function CommandCenter({ restaurantId, dashboardContext }: Props) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DashboardAssistantMessage[]>([]);
  // V2: proposals are fetched/persisted separately from messages (one
  // restaurant_planner_proposals row per version) — this map, keyed by
  // proposal id, is what makes ProposalCard's initial render instant
  // instead of waiting on a live /preview round trip.
  const [proposals, setProposals] = useState<Record<string, ProposalRow>>({});
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [value, setValue] = useState('');
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [visiblePrompts, setVisiblePrompts] = useState<string[]>(() => randomSubset(EXAMPLE_PROMPTS, EXAMPLE_PROMPTS_VISIBLE));
  const [notice, setNotice] = useState('');
  const [failedDraft, setFailedDraft] = useState<{ tempId: string; question: string } | null>(null);
  const [asking, setAsking] = useState(false);
  const [thinkingStage, setThinkingStage] = useState(0);
  const [liveStatus, setLiveStatus] = useState('');
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => {
      setPlaceholderIndex((current) => (current + 1) % ROTATING_PLACEHOLDERS.length);
    }, 3600);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setVisiblePrompts(randomSubset(EXAMPLE_PROMPTS, EXAMPLE_PROMPTS_VISIBLE));
    }, 9000);
    return () => clearInterval(id);
  }, []);

  // Advances the thinking narration while a turn is in flight; resets once
  // it resolves. Deliberately never reaches 100% before the real response —
  // capped at the last stage rather than looping, so a slow turn doesn't
  // look stuck repeating "Reading your request…".
  useEffect(() => {
    if (!asking) {
      setThinkingStage(0);
      return;
    }
    const id = setInterval(() => {
      setThinkingStage((current) => Math.min(current + 1, THINKING_STAGES.length - 1));
    }, 900);
    return () => clearInterval(id);
  }, [asking]);

  useEffect(() => {
    let cancelled = false;
    async function loadHistory() {
      try {
        const response = await fetch(`/api/admin/assistant/conversations?restaurantId=${encodeURIComponent(restaurantId)}`);
        const payload = await response.json().catch(() => ({}));
        if (!cancelled && response.ok) {
          setConversationId(payload.conversation?.id ?? null);
          setMessages(payload.messages ?? []);
          setProposals(payload.proposals ?? {});
        }
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    }
    loadHistory();
    return () => { cancelled = true; };
  }, [restaurantId]);

  // Keeps the latest turn in view without requiring a manual scroll — fires
  // on every new message and when the thinking indicator mounts/unmounts.
  // The very first scroll (rehydrating existing history on page load) jumps
  // instantly — a returning owner with a long thread would otherwise watch
  // the whole conversation animate past. Every scroll after that (a message
  // sent or received live) is smooth.
  const hasScrolledOnceRef = useRef(false);
  useEffect(() => {
    if (loadingHistory) return;
    const behavior = hasScrolledOnceRef.current ? 'smooth' : 'auto';
    hasScrolledOnceRef.current = true;
    scrollAnchorRef.current?.scrollIntoView({ behavior, block: 'end' });
  }, [messages.length, asking, loadingHistory]);

  function fillPrompt(prompt: string) {
    setValue(prompt);
    inputRef.current?.focus();
  }

  function mergeProposal(proposal: ProposalRow | null | undefined) {
    if (!proposal) return;
    setProposals((current) => ({ ...current, [proposal.id]: proposal }));
  }

  function dismissMessage(messageId: string) {
    setDismissedIds((current) => new Set(current).add(messageId));
  }

  async function sendMessage(question: string, replaceTempId?: string) {
    setAsking(true);
    setNotice('');
    setFailedDraft(null);
    setLiveStatus('SpinBite is thinking…');

    const tempId = replaceTempId ?? makeTempId();
    if (!replaceTempId) {
      setMessages((current) => [
        ...current,
        {
          id: tempId,
          conversation_id: conversationId ?? '',
          restaurant_id: restaurantId,
          role: 'user',
          content: question,
          intent: null,
          action: null,
          outcome: null,
          candidates: null,
          capability: null,
          proposal_group_id: null,
          proposal_id: null,
          related_message_id: null,
          revenue_opportunities: null,
          created_by: '',
          created_at: new Date().toISOString(),
        },
      ]);
    }

    try {
      const response = await fetch('/api/admin/assistant/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId, conversationId, message: question, dashboardContext }),
      });
      const payload = await response.json().catch(() => ({}));

      if (payload.conversationId) setConversationId(payload.conversationId);
      if (payload.userMessage) {
        setMessages((current) => current.map((m) => (m.id === tempId ? payload.userMessage : m)));
      }

      if (!response.ok) {
        setNotice(
          response.status === 503
            ? "This isn't enabled for this restaurant yet — check back soon."
            : payload?.error || "Couldn't answer that right now — send it again to retry.",
        );
        setLiveStatus('SpinBite could not answer that.');
        return;
      }

      if (payload.assistantMessage) setMessages((current) => [...current, payload.assistantMessage]);
      mergeProposal(payload.proposal);
      setLiveStatus('SpinBite replied.');
    } catch {
      // Nothing was persisted server-side if the request itself never
      // completed, so resending as the same draft is always safe — unlike
      // a non-OK HTTP response, where the user message may already be saved
      // and a blind resend risks a duplicate turn.
      setNotice("Couldn't reach SpinBite.");
      setFailedDraft({ tempId, question });
      setLiveStatus('SpinBite could not be reached.');
    } finally {
      setAsking(false);
    }
  }

  async function submitCurrent() {
    const question = value.trim();
    if (!question || asking) return;
    setValue('');
    await sendMessage(question);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    void submitCurrent();
  }

  function handleRetry() {
    if (!failedDraft) return;
    void sendMessage(failedDraft.question, failedDraft.tempId);
  }

  function handleResolved(outcomeMessage: DashboardAssistantMessage) {
    setMessages((current) => [...current, outcomeMessage]);
  }

  function handleSelectionResolved(payload: { userMessage: DashboardAssistantMessage; assistantMessage: DashboardAssistantMessage; proposal?: ProposalRow }) {
    setMessages((current) => [...current, payload.userMessage, payload.assistantMessage]);
    mergeProposal(payload.proposal);
  }

  function handleOpportunityConverted(payload: { assistantMessage: DashboardAssistantMessage; proposal?: ProposalRow }) {
    setMessages((current) => [...current, payload.assistantMessage]);
    mergeProposal(payload.proposal);
  }

  function dismissOpportunity(opportunityId: string) {
    setDismissedIds((current) => new Set(current).add(opportunityId));
  }

  const showEmptyState = !loadingHistory && messages.length === 0;

  return (
    <div className="relative overflow-hidden rounded-[2rem] bg-white p-6 shadow-2xl shadow-orange-100 md:p-8">
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full opacity-50"
        style={{ background: 'radial-gradient(circle, rgba(108,79,209,0.30), transparent 70%)' }}
        aria-hidden="true"
      />
      <div aria-live="polite" className="sr-only">{liveStatus}</div>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EFE9FB] px-3 py-1.5 text-xs font-black uppercase tracking-wide text-[#6C4FD1]">
        <DashboardIcon name="sparkle" className="h-3 w-3" />
        Ask SpinBite
      </span>
      <h2 className="relative mt-3 text-3xl font-black leading-tight text-[#1F1F1F] md:text-4xl">
        What would you like me to do today?
      </h2>
      {showEmptyState && (
        <p className="relative mt-2 text-sm font-semibold text-stone-500">
          I can currently help with menu pricing and promotions — more capabilities are on the way.
        </p>
      )}

      {loadingHistory && (
        <div className="mt-5 space-y-3 rounded-2xl border border-stone-100 bg-[#FBFAF8] p-4">
          <div className="h-9 w-2/3 animate-pulse rounded-2xl bg-stone-200" aria-hidden="true" />
          <div className="ml-auto h-7 w-1/2 animate-pulse rounded-2xl bg-stone-200" aria-hidden="true" />
          <div className="h-9 w-3/4 animate-pulse rounded-2xl bg-stone-200" aria-hidden="true" />
        </div>
      )}

      {!loadingHistory && messages.length > 0 && (
        <div className="mt-5 max-h-[32rem] space-y-3 overflow-y-auto rounded-2xl border border-stone-100 bg-[#FBFAF8] p-4 md:max-h-[38rem]">
          {messages.map((message) => (
            <ChatTurn
              key={message.id}
              message={message}
              messages={messages}
              restaurantId={restaurantId}
              conversationId={conversationId}
              proposal={message.proposal_id ? proposals[message.proposal_id] : undefined}
              dismissed={dismissedIds.has(message.id)}
              failed={failedDraft?.tempId === message.id}
              onDismiss={() => dismissMessage(message.id)}
              onResolved={handleResolved}
              onSelectionResolved={handleSelectionResolved}
              onModify={fillPrompt}
              isOpportunityDismissed={(opportunityId) => dismissedIds.has(opportunityId)}
              onDismissOpportunity={dismissOpportunity}
              onOpportunityConverted={handleOpportunityConverted}
            />
          ))}
          {asking && (
            <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-[#EFE9FB] px-4 py-2.5 text-sm font-semibold text-[#6C4FD1]">
              <span className="inline-flex items-center gap-2">
                <span className="flex gap-0.5" aria-hidden="true">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#6C4FD1] [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#6C4FD1] [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#6C4FD1]" />
                </span>
                {THINKING_STAGES[thinkingStage]}
              </span>
            </div>
          )}
          <div ref={scrollAnchorRef} />
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
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void submitCurrent();
            }
          }}
          placeholder={ROTATING_PLACEHOLDERS[placeholderIndex]}
          className="w-full resize-none bg-transparent text-base text-[#1F1F1F] placeholder:text-stone-400 focus:outline-none md:text-lg"
        />
        <div className="mt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled
            aria-disabled="true"
            title="Voice input is coming soon"
            aria-label="Voice input — coming soon"
            className="flex h-11 w-11 cursor-not-allowed items-center justify-center rounded-full border border-stone-200 bg-white text-stone-300"
          >
            <DashboardIcon name="mic" className="h-4 w-4" />
          </button>
          <button
            type="submit"
            aria-label="Send to SpinBite"
            disabled={asking || !value.trim()}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[#FF6B00] text-white transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF6B00] disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {asking ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <DashboardIcon name="send" className="h-4 w-4" />
            )}
          </button>
        </div>
      </form>
      {notice && (
        <div className="mt-3 flex flex-wrap items-center gap-3" role="status">
          <p className="text-sm font-bold text-[#6C4FD1]">{notice}</p>
          {failedDraft && (
            <button
              type="button"
              onClick={handleRetry}
              className="rounded-full border border-[#6C4FD1] px-3 py-1 text-xs font-black text-[#6C4FD1] hover:bg-[#EFE9FB] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C4FD1]"
            >
              Try again
            </button>
          )}
        </div>
      )}
      {showEmptyState && (
        <div className="mt-4 flex flex-wrap gap-2">
          {visiblePrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => fillPrompt(prompt)}
              className="rounded-full border border-stone-200 bg-white px-3.5 py-2 text-sm font-semibold text-stone-600 transition hover:border-[#6C4FD1] hover:text-[#6C4FD1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C4FD1]"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type ChatTurnProps = {
  message: DashboardAssistantMessage;
  messages: DashboardAssistantMessage[];
  restaurantId: string;
  conversationId: string | null;
  proposal?: ProposalRow;
  dismissed: boolean;
  failed: boolean;
  onDismiss: () => void;
  onResolved: (outcomeMessage: DashboardAssistantMessage) => void;
  onSelectionResolved: (payload: { userMessage: DashboardAssistantMessage; assistantMessage: DashboardAssistantMessage; proposal?: ProposalRow }) => void;
  onModify: (draftText: string) => void;
  isOpportunityDismissed: (opportunityId: string) => boolean;
  onDismissOpportunity: (opportunityId: string) => void;
  onOpportunityConverted: (payload: { assistantMessage: DashboardAssistantMessage; proposal?: ProposalRow }) => void;
};

function ChatTurn({
  message,
  messages,
  restaurantId,
  conversationId,
  proposal,
  dismissed,
  failed,
  onDismiss,
  onResolved,
  onSelectionResolved,
  onModify,
  isOpportunityDismissed,
  onDismissOpportunity,
  onOpportunityConverted,
}: ChatTurnProps) {
  if (message.role === 'user') {
    return (
      <div
        className={`ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-[#1F1F1F] px-4 py-2.5 text-sm font-semibold text-white ${failed ? 'opacity-60 ring-2 ring-red-400' : ''} animate-[dash-fade-in_0.2s_ease-out]`}
      >
        {message.content}
      </div>
    );
  }

  const bubbleClass = 'max-w-[85%] rounded-2xl rounded-tl-sm bg-[#EFE9FB] px-4 py-2.5 text-sm font-semibold leading-6 text-[#1F1F1F] animate-[dash-fade-in_0.2s_ease-out]';
  const inertClass = `${bubbleClass} opacity-60`;

  // 'menu_discount_action' is the one capability with a real ProposalCard
  // today (lib/restaurant-planner/tool-registry.ts's CAPABILITY_REGISTRY —
  // the other 8 entries are metadata-only stubs). 'unsupported' falls
  // through to the default bubble below, same as 'answer'.
  if (message.intent === 'menu_discount_action') {
    if (dismissed) {
      return <div className={inertClass}>{message.content} — dismissed.</div>;
    }
    if (isProposalLive(message, messages) && conversationId) {
      return (
        <div>
          <div className={bubbleClass}>{message.content}</div>
          <ProposalCard
            restaurantId={restaurantId}
            action={toResolvableAction(message.action as unknown as MenuDiscountAction)}
            proposal={proposal}
            conversationId={conversationId}
            messageId={message.id}
            onDismiss={onDismiss}
            onResolved={onResolved}
            onModify={onModify}
          />
        </div>
      );
    }
    if (!hasResolvedOutcome(message, messages)) {
      return <div className={inertClass}>{message.content} — no longer active, ask again to reapply.</div>;
    }
  }

  // Revenue Intelligence Agent V1 — a ranked opportunity list renders as
  // expandable cards instead of a plain bubble, same "moving on to a new
  // ask makes the old one inert" rule as the proposal/clarification cases
  // above, via isOpportunityListLive.
  if (message.intent === 'revenue_opportunities') {
    if (isOpportunityListLive(message, messages) && conversationId) {
      const stored = message.revenue_opportunities as unknown as { goal: RevenueGoalKey; opportunities: RevenueOpportunity[] } | null;
      if (stored) {
        return (
          <div>
            <div className={bubbleClass}>{message.content}</div>
            <RevenueOpportunityList
              restaurantId={restaurantId}
              conversationId={conversationId}
              goal={stored.goal}
              opportunities={stored.opportunities}
              listMessageId={message.id}
              isConverted={(opportunityId) => isOpportunityConverted(opportunityId, message.id, messages)}
              isDismissed={isOpportunityDismissed}
              onDismiss={onDismissOpportunity}
              onProposalCreated={onOpportunityConverted}
            />
          </div>
        );
      }
    }
    return <div className={inertClass}>{message.content}</div>;
  }

  // V2 (Objective 2) — a clarification with real, resolver-sourced
  // candidates renders checkboxes instead of asking the user to retype a
  // name; a plain clarification (no candidates) falls through to the
  // default bubble, unchanged from Phase 1.
  if (isClarificationLive(message, messages) && conversationId) {
    if (dismissed) {
      return <div className={inertClass}>{message.content} — dismissed.</div>;
    }
    return (
      <div>
        <div className={bubbleClass}>{message.content}</div>
        <TargetSelector
          restaurantId={restaurantId}
          conversationId={conversationId}
          relatedMessageId={message.id}
          candidates={(message.candidates as unknown as Array<{ name: string; categoryName: string }>) ?? []}
          onResolved={onSelectionResolved}
          onCancelled={onResolved}
          onDismiss={onDismiss}
        />
      </div>
    );
  }

  return <div className={bubbleClass}>{message.content}</div>;
}
