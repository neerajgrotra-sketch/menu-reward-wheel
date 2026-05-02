'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';

const ENDED_MESSAGE = 'This promotion has ended.';

export default function PlayEndedRedirectWatcher() {
  const { restaurantSlug } = useParams() as { restaurantSlug?: string };

  useEffect(() => {
    if (!restaurantSlug) return;

    function redirectIfEnded() {
      const text = document.body?.innerText || '';
      if (text.includes(ENDED_MESSAGE)) {
        window.location.replace(`/r/${restaurantSlug}`);
      }
    }

    redirectIfEnded();

    const observer = new MutationObserver(() => redirectIfEnded());
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, [restaurantSlug]);

  return null;
}
