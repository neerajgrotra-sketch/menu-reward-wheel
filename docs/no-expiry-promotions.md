# No Expiry Promotions

Restaurant feedback: promotions need an option to run until manually ended.

Desired behavior:

- Add a checkbox in the promotion builder: `No expiry — run until ended`.
- When checked, save `promotions.ends_at = null`.
- When unchecked, require an end date/time.
- A promotion is active when `status = active`, `starts_at <= now()`, and `ends_at is null or ends_at > now()`.
- The End Promotion button remains the kill switch and sets `ends_at = now()`.
- Admin cards should display `No expiry — runs until ended` instead of `Not set`.

No SQL migration is required because `ends_at` already supports null values.
