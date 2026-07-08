'use client';

import { useEffect, useState } from 'react';
import { RestaurantPublicPage } from '@/components/public/RestaurantPublicPage';
import { GuestNameModal } from '@/components/public/GuestNameModal';
import type {
  PublicRestaurant,
  PublicSection,
  PublicPromotion,
  PublicReward,
} from '@/app/r/[restaurantSlug]/page';

// Wraps RestaurantPublicPage for the reusable/no-touchpoint restaurant link
// (no per-table QR code — see app/r/[restaurantSlug]/page.tsx). Deliberately
// does NOT call /api/public/sessions/resolve or create any visit_sessions /
// session_guests row: that flow assumes one active session per touchpoint
// (engine/session-presence/join-session.ts), which is correct for a printed
// per-table QR but would silently merge unrelated customers who happen to
// open this same shared link within the same 2-hour window into one
// "session" — see hooks/useDirectOrders.ts for the established boundary this
// route already follows for orders. What this wrapper does replicate from
// the touchpoint flow is purely visual/local: the same "what's your name"
// prompt, backed by sessionStorage instead of a server-side guest record.
const NAME_STORAGE_PREFIX = 'spinbite_direct_guest_name_v1:';
const SKIPPED_STORAGE_PREFIX = 'spinbite_direct_guest_name_skipped_v1:';

interface Props {
  restaurant: PublicRestaurant;
  sections: PublicSection[];
  promotion: PublicPromotion | null;
  promotionRewards: PublicReward[];
  orderingEnabled: boolean;
  paymentSimulationEnabled?: boolean;
  taxRatePercent?: number;
  serviceFeePercent?: number;
}

export function DirectMenuPage({
  restaurant,
  sections,
  promotion,
  promotionRewards,
  orderingEnabled,
  paymentSimulationEnabled,
  taxRatePercent,
  serviceFeePercent,
}: Props) {
  const [guestName, setGuestName] = useState<string | null>(null);
  const [showNameModal, setShowNameModal] = useState(false);
  const brandColor = restaurant.brand_color || '#FF6B00';

  useEffect(() => {
    let storedName: string | null = null;
    let skipped = false;
    try {
      storedName = sessionStorage.getItem(`${NAME_STORAGE_PREFIX}${restaurant.id}`);
      skipped = sessionStorage.getItem(`${SKIPPED_STORAGE_PREFIX}${restaurant.id}`) === '1';
    } catch { /* sessionStorage unavailable (private browsing restriction) */ }

    if (storedName) {
      setGuestName(storedName);
    } else if (!skipped) {
      setShowNameModal(true);
    }
  }, [restaurant.id]);

  return (
    <>
      <RestaurantPublicPage
        restaurant={restaurant}
        sections={sections}
        promotion={promotion}
        promotionRewards={promotionRewards}
        orderingEnabled={orderingEnabled}
        paymentSimulationEnabled={paymentSimulationEnabled}
        taxRatePercent={taxRatePercent}
        serviceFeePercent={serviceFeePercent}
        guestName={guestName}
      />

      {showNameModal && (
        <GuestNameModal
          restaurantName={restaurant.name}
          brandColor={brandColor}
          onConfirm={(name) => {
            setGuestName(name);
            setShowNameModal(false);
            try { sessionStorage.setItem(`${NAME_STORAGE_PREFIX}${restaurant.id}`, name); } catch { /* ignore */ }
          }}
          onSkip={() => {
            setShowNameModal(false);
            try { sessionStorage.setItem(`${SKIPPED_STORAGE_PREFIX}${restaurant.id}`, '1'); } catch { /* ignore */ }
          }}
        />
      )}
    </>
  );
}
