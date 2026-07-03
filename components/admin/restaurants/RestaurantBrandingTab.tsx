'use client';

import type { AppSupabaseClient } from '@/lib/supabase/client';
import type { Restaurant, ProfileForm, ContactForm, WeekHours, DayHours, ConfirmOptions } from './types';
import { RestaurantProfileTab } from './RestaurantProfileTab';
import { RestaurantContactTab } from './RestaurantContactTab';

// Composes the existing Profile and Contact forms under one "Branding" tab —
// the requested 8-tab structure has no separate Contact tab, and identity
// (colors/logo/description) and contact details (phone/address/hours/socials)
// both belong to "how this restaurant presents itself." Neither form's
// internals change; this is pure composition.

type Props = {
  restaurant: Restaurant;
  profileForm: ProfileForm;
  onProfileChange: (patch: Partial<ProfileForm>) => void;
  contactForm: ContactForm;
  onContactChange: (patch: Partial<ContactForm>) => void;
  onHoursChange: (day: keyof WeekHours, patch: Partial<DayHours>) => void;
  supabase: AppSupabaseClient;
  ownerId: string;
  requestConfirm: (opts: ConfirmOptions) => void;
  onSaved: () => void;
};

export function RestaurantBrandingTab({
  restaurant,
  profileForm,
  onProfileChange,
  contactForm,
  onContactChange,
  onHoursChange,
  supabase,
  ownerId,
  requestConfirm,
  onSaved,
}: Props) {
  return (
    <div className="space-y-8">
      <RestaurantProfileTab
        restaurant={restaurant}
        form={profileForm}
        onChange={onProfileChange}
        supabase={supabase}
        ownerId={ownerId}
        requestConfirm={requestConfirm}
        onSaved={onSaved}
      />

      <div className="border-t border-stone-100 pt-8">
        <p className="text-xs font-black uppercase tracking-wide text-stone-500">Contact & Hours</p>
        <div className="mt-4">
          <RestaurantContactTab
            restaurant={restaurant}
            form={contactForm}
            onChange={onContactChange}
            onHoursChange={onHoursChange}
            supabase={supabase}
            ownerId={ownerId}
            onSaved={onSaved}
          />
        </div>
      </div>
    </div>
  );
}
