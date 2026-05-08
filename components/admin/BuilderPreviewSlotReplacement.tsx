'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import BuilderGamePreviewCard from '@/components/admin/BuilderGamePreviewCard';

function findPreviewSlot() {
  const labels = Array.from(document.querySelectorAll('p'));
  const previewLabel = labels.find((node) => node.textContent?.trim().toLowerCase() === 'wheel preview');
  return previewLabel?.closest('.rounded-\[2rem\]') as HTMLElement | null;
}

function applySlotReplacement(slot: HTMLElement) {
  slot.setAttribute('data-spinbite-preview-slot', 'shared');
  slot.setAttribute('aria-label', 'Shared game preview');

  Array.from(slot.children).forEach((child) => {
    const element = child as HTMLElement;
    if (element.dataset.spinbiteSharedPreviewHost === 'true') return;
    element.style.display = 'none';
    element.setAttribute('aria-hidden', 'true');
  });
}

export default function BuilderPreviewSlotReplacement() {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let attempts = 0;
    let cancelled = false;

    function locate() {
      if (cancelled) return;
      const found = findPreviewSlot();
      if (found) {
        applySlotReplacement(found);

        let nextHost = found.querySelector('[data-spinbite-shared-preview-host="true"]') as HTMLElement | null;
        if (!nextHost) {
          nextHost = document.createElement('div');
          nextHost.dataset.spinbiteSharedPreviewHost = 'true';
          found.appendChild(nextHost);
        }

        setSlot(found);
        setHost(nextHost);
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

  if (!slot || !host) return null;

  return createPortal(
    <div className="text-[#1F1F1F]">
      <BuilderGamePreviewCard />
    </div>,
    host
  );
}
