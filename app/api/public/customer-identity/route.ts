import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function makeServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) throw new Error('Supabase service client is not configured.');
  return createServiceClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// -----------------------------------------------------------------------
// E.164 normalisation
// -----------------------------------------------------------------------

/** Strip everything that isn't a digit, then prepend the country code. */
function buildE164(countryCode: string, rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, '');
  const cc = countryCode.replace(/\D/g, '');
  return `+${cc}${digits}`;
}

/** Minimum digit lengths after the country code for each supported prefix. */
const MIN_LOCAL_DIGITS: Record<string, number> = {
  '1': 10,   // North America (NANP) — must be exactly 10
  '44': 10,  // UK
  '91': 10,  // India
  '52': 10,  // Mexico
  '57': 10,  // Colombia
  '971': 9,  // UAE
  '61': 9,   // Australia
  '33': 9,   // France
  '49': 7,   // Germany — variable length, accept 7+
};

function isPhoneValid(countryCode: string, rawPhone: string): boolean {
  const ccDigits = countryCode.replace(/\D/g, '');
  const localDigits = rawPhone.replace(/\D/g, '');
  const min = MIN_LOCAL_DIGITS[ccDigits] ?? 7;
  return localDigits.length >= min;
}

// -----------------------------------------------------------------------
// POST /api/public/customer-identity
// -----------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const {
      play_session_id,
      phone_country_code,
      phone_number_raw,
      marketing_consent = false,
    }: {
      play_session_id?: string;
      phone_country_code?: string;
      phone_number_raw?: string;
      marketing_consent?: boolean;
    } = body;

    if (!play_session_id) {
      return NextResponse.json({ error: 'Missing play_session_id.' }, { status: 400 });
    }

    const hasPhone = Boolean(phone_number_raw?.trim() && phone_country_code?.trim());

    // Validate phone if provided.
    if (hasPhone) {
      if (!isPhoneValid(phone_country_code!, phone_number_raw!)) {
        return NextResponse.json(
          { error: 'Please enter a valid phone number or choose Not Now.' },
          { status: 422 },
        );
      }
    }

    const supabase = makeServiceClient();

    let customerProfileId: string | null = null;

    if (hasPhone) {
      const e164 = buildE164(phone_country_code!, phone_number_raw!);
      const now = new Date().toISOString();

      // Upsert by phone_number_e164 (unique key).
      // If the customer has played before, update their consent if they are
      // opting in (never revoke via this route — that belongs in a preferences
      // flow we haven't built yet).
      const { data: existing } = await supabase
        .from('customer_profiles')
        .select('id, marketing_consent')
        .eq('phone_number_e164', e164)
        .maybeSingle();

      if (existing) {
        customerProfileId = existing.id as string;

        // Only update consent forward (opt-in only via this route).
        if (marketing_consent && !existing.marketing_consent) {
          await supabase
            .from('customer_profiles')
            .update({
              marketing_consent: true,
              marketing_consent_timestamp: now,
              updated_at: now,
            })
            .eq('id', customerProfileId);
        }
      } else {
        const { data: created, error: createError } = await supabase
          .from('customer_profiles')
          .insert({
            phone_country_code: phone_country_code!.trim(),
            phone_number_raw: phone_number_raw!.trim(),
            phone_number_e164: e164,
            marketing_consent,
            marketing_consent_timestamp: marketing_consent ? now : null,
            terms_accepted_timestamp: now,
          })
          .select('id')
          .single();

        if (createError) {
          return NextResponse.json(
            { error: `Could not save profile: ${createError.message}` },
            { status: 500 },
          );
        }

        customerProfileId = created.id as string;
      }
    }

    // Update the play session regardless of whether a profile was created —
    // terms_accepted_timestamp records that the customer engaged with the screen.
    const sessionUpdate: Record<string, unknown> = {
      terms_accepted_timestamp: new Date().toISOString(),
    };
    if (customerProfileId) sessionUpdate.customer_profile_id = customerProfileId;

    await supabase
      .from('play_sessions')
      .update(sessionUpdate)
      .eq('id', play_session_id);

    return NextResponse.json({ customer_profile_id: customerProfileId });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Could not save identity.' },
      { status: 500 },
    );
  }
}
