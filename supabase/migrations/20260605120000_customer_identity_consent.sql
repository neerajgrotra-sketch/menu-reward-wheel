-- Customer identity and consent foundation.
--
-- Captures phone number (optional) and SMS marketing consent (optional, separate
-- from phone capture) so future campaigns (Twilio, wallets, loyalty) have a
-- clean identity layer to build on.
--
-- Privacy design:
--   • phone_number_e164 is the lookup key for returning customers (unique)
--   • marketing_consent is stored separately from phone — phone ≠ consent
--   • service-role key is the only writer; customers are never authenticated
--
-- Session linkage:
--   • play_sessions.customer_profile_id  → FK back to this table (nullable)
--   • play_sessions.terms_accepted_timestamp → when customer clicked Save & Continue

-- -----------------------------------------------------------------------
-- 1. customer_profiles
-- -----------------------------------------------------------------------

create table if not exists public.customer_profiles (
  id                          uuid        primary key default gen_random_uuid(),
  phone_country_code          text,
  phone_number_raw            text,
  phone_number_e164           text        unique,
  marketing_consent           boolean     not null default false,
  marketing_consent_timestamp timestamptz,
  terms_accepted_timestamp    timestamptz not null default now(),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

alter table public.customer_profiles enable row level security;

-- All reads and writes go through service role only.
-- No customer-facing RLS policies are needed because customers are anonymous.
create policy "service role full access on customer_profiles"
  on public.customer_profiles
  using (true)
  with check (true);

create index if not exists customer_profiles_phone_e164_idx
  on public.customer_profiles(phone_number_e164)
  where phone_number_e164 is not null;

-- -----------------------------------------------------------------------
-- 2. play_sessions: link to customer profile + record terms acceptance
-- -----------------------------------------------------------------------

alter table public.play_sessions
  add column if not exists customer_profile_id uuid
    references public.customer_profiles(id)
    on delete set null;

alter table public.play_sessions
  add column if not exists terms_accepted_timestamp timestamptz;

create index if not exists play_sessions_customer_profile_id_idx
  on public.play_sessions(customer_profile_id)
  where customer_profile_id is not null;
