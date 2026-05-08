'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import BuilderGamePreviewCard from '@/components/admin/BuilderGamePreviewCard';

function findPreviewSlot() {
  const labels = Array.from(document.querySelectorAll('p'));
  const previewLabel = labels.find((node) => node.textContent?.trim().toLowerCase() === 'wheel preview');
  return previewLabel?.closest('.rounded-\[2rem\]') as HTMLElement | null;
}

export default function BuilderPreviewSlotReplacement() {
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let attempts = 0;
    let cancelled = false;

    function locate() {
      if (cancelled) return;
      const found = findPreviewSlot();
      if (found) {
        found.setAttribute('data-spinbite-preview-slot', 'shared');
        setSlot(found);
        return;
      }

      attempts += 1;
      if (attempts < 20) window.setTimeout(locate, 150);
    }

    locate();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!slot) return null;

  return createPortal(
    <div className="text-[#1F1F1F]">
      <BuilderGamePreviewCard />
    </div>,
    slot
  );
}
