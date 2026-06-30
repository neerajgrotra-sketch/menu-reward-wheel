'use client';

import { useEffect, useState } from 'react';
import { UI_LAYERS } from '@/lib/ui-layers';

const LIVE_PROMOTION_ERROR = 'This location already has a live promotion:';

function extractPromotionName(message: string) {
  const prefix = LIVE_PROMOTION_ERROR;
  if (!message.includes(prefix)) return '';

  const afterPrefix = message.split(prefix)[1] || '';
  return afterPrefix
    .replace('End the current promotion before launching a new one.', '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.$/, '');
}

export default function LaunchBlockedModalWatcher() {
  const [message, setMessage] = useState('');

  useEffect(() => {
    let lastMessage = '';

    function checkForLaunchBlockedError() {
      const bodyText = document.body?.innerText || '';
      const index = bodyText.indexOf(LIVE_PROMOTION_ERROR);

      if (index === -1) return;

      const sliced = bodyText.slice(index, index + 260);
      const endMarker = 'End the current promotion before launching a new one.';
      const endIndex = sliced.indexOf(endMarker);
      const nextMessage = endIndex >= 0 ? sliced.slice(0, endIndex + endMarker.length) : sliced;

      if (nextMessage && nextMessage !== lastMessage) {
        lastMessage = nextMessage;
        setMessage(nextMessage);
      }
    }

    checkForLaunchBlockedError();

    const observer = new MutationObserver(() => {
      checkForLaunchBlockedError();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, []);

  if (!message) return null;

  const livePromotionName = extractPromotionName(message);

  return (
    <div
      style={{ zIndex: UI_LAYERS.criticalOverlay }}
      className="fixed inset-0 flex items-end justify-center bg-black/55 px-4 pb-4 backdrop-blur-sm sm:items-center sm:pb-0"
    >
      <div className="w-full max-w-md rounded-[2rem] bg-white p-6 text-[#1F1F1F] shadow-2xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-3xl">
          ⚠️
        </div>
        <h2 className="mt-4 text-center text-3xl font-black leading-tight">
          Current promotion already live
        </h2>
        <p className="mt-3 text-center text-sm font-bold leading-6 text-stone-600">
          This location already has a live promotion. To launch this new promotion, first end the current live promotion.
        </p>

        {livePromotionName && (
          <div className="mt-4 rounded-2xl bg-red-50 p-4 text-center">
            <p className="text-xs font-black uppercase tracking-wide text-red-500">Current live promotion</p>
            <p className="mt-1 text-xl font-black text-red-700">{livePromotionName}</p>
          </div>
        )}

        <div className="mt-4 rounded-2xl bg-green-50 p-4 text-center text-sm font-black text-green-700">
          Your new promotion was saved as a draft and was not launched.
        </div>

        <div className="mt-5 grid gap-3">
          <a
            href="/admin/promotions?mode=manage"
            className="rounded-2xl bg-[#1F1F1F] px-5 py-4 text-center text-sm font-black text-white shadow-lg"
          >
            Go to Manage Promotions
          </a>
          <button
            type="button"
            onClick={() => setMessage('')}
            className="rounded-2xl bg-orange-50 px-5 py-4 text-sm font-black text-[#FF6B00]"
          >
            Keep Editing
          </button>
        </div>
      </div>
    </div>
  );
}
