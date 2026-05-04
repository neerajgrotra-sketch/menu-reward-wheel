'use client';

import { useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';

type Props = {
  promotionId: string;
};

function toLocalDateTimeInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function findEndDateInput() {
  const labels = Array.from(document.querySelectorAll('label'));
  const endLabel = labels.find((label) => label.textContent?.toLowerCase().includes('end date/time'));
  const input = endLabel?.querySelector('input[type="datetime-local"]') as HTMLInputElement | null;
  return { endLabel: endLabel as HTMLElement | undefined, input };
}

export default function NoExpiryInlinePatch({ promotionId }: Props) {
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let removed = false;
    let checkbox: HTMLInputElement | null = null;
    let saveClickHandler: ((event: MouseEvent) => void) | null = null;

    async function persistEndsAt(value: string | null) {
      await supabase.from('promotions').update({ ends_at: value }).eq('id', promotionId);
    }

    function temporaryValidEndDate() {
      return toLocalDateTimeInput(new Date(Date.now() + 24 * 60 * 60 * 1000));
    }

    async function applyCheckedState(checked: boolean, options: { persist: boolean }) {
      const { input } = findEndDateInput();
      if (!input) return;

      if (checked) {
        // Keep the existing builder validation satisfied while the durable database value is null.
        // The visible checkbox communicates that the end date is overridden.
        if (!input.value) setNativeInputValue(input, temporaryValidEndDate());
        input.disabled = true;
        input.classList.add('bg-stone-100', 'text-stone-400');
        if (options.persist) await persistEndsAt(null);
      } else {
        input.disabled = false;
        input.classList.remove('bg-stone-100', 'text-stone-400');
        if (!input.value) setNativeInputValue(input, temporaryValidEndDate());
        if (options.persist) await persistEndsAt(new Date(input.value).toISOString());
      }
    }

    async function mount() {
      const { data } = await supabase
        .from('promotions')
        .select('id,ends_at')
        .eq('id', promotionId)
        .single();

      if (removed) return;

      let attempts = 0;
      const interval = window.setInterval(() => {
        attempts += 1;
        const { endLabel } = findEndDateInput();
        if (!endLabel) {
          if (attempts > 30) window.clearInterval(interval);
          return;
        }

        window.clearInterval(interval);

        if (document.getElementById('spinbite-no-expiry-inline-control')) return;

        const wrapper = document.createElement('div');
        wrapper.id = 'spinbite-no-expiry-inline-control';
        wrapper.className = 'sm:col-span-2 rounded-2xl bg-green-50 p-4 text-green-800';
        wrapper.innerHTML = `
          <label class="flex items-start gap-3 text-sm font-black">
            <input type="checkbox" class="mt-1 h-5 w-5" />
            <span>
              <span class="block text-base">No expiry date — run until manually ended</span>
              <span class="block text-xs font-bold text-green-700">Overrides the End Date/Time field. The promotion keeps running until staff clicks End Promotion.</span>
            </span>
          </label>
        `;

        endLabel.insertAdjacentElement('afterend', wrapper);
        checkbox = wrapper.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
        if (!checkbox) return;

        checkbox.checked = !data?.ends_at;
        applyCheckedState(checkbox.checked, { persist: false });

        checkbox.addEventListener('change', async () => {
          await applyCheckedState(Boolean(checkbox?.checked), { persist: true });
        });

        saveClickHandler = (event: MouseEvent) => {
          if (!checkbox?.checked) return;
          const target = event.target as HTMLElement | null;
          const button = target?.closest('button');
          const text = button?.textContent || '';
          if (!button || !/(Save Changes|Publish Promotion|Update Schedule|Update Live Promotion)/i.test(text)) return;
          window.setTimeout(() => persistEndsAt(null), 1200);
          window.setTimeout(() => persistEndsAt(null), 2600);
        };
        document.addEventListener('click', saveClickHandler, true);
      }, 200);
    }

    mount();

    return () => {
      removed = true;
      if (saveClickHandler) document.removeEventListener('click', saveClickHandler, true);
      document.getElementById('spinbite-no-expiry-inline-control')?.remove();
    };
  }, [promotionId, supabase]);

  return null;
}
