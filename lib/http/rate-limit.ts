import type { SupabaseClient } from '@supabase/supabase-js';

type HeaderSource = { headers: { get(name: string): string | null } };

export function extractClientIp(req: HeaderSource): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

// Per-IP rate limit (in-memory, per Lambda instance — soft limit).
// Stops naive single-origin attacks. Not globally distributed across Vercel instances.
// Extracted from app/api/public/orders/route.ts so each public route gets its own
// independent bucket via createIpRateLimiter(...) while sharing the same tested logic.
export function createIpRateLimiter(windowMs: number, max: number) {
  const buckets = new Map<string, number[]>();
  let cleanupCounter = 0;

  return {
    check(ip: string): boolean {
      const now = Date.now();
      const cutoff = now - windowMs;

      // Prune stale entries every 100 requests to prevent unbounded memory growth
      cleanupCounter++;
      if (cleanupCounter % 100 === 0) {
        buckets.forEach((ts, key) => {
          const fresh = ts.filter((t: number) => t > cutoff);
          if (fresh.length === 0) buckets.delete(key);
          else buckets.set(key, fresh);
        });
      }

      const timestamps = (buckets.get(ip) ?? []).filter((t) => t > cutoff);
      if (timestamps.length >= max) return true;
      timestamps.push(now);
      buckets.set(ip, timestamps);
      return false;
    },
  };
}

// Per-restaurant rate limit — DB-backed COUNT, globally accurate across all Lambda instances.
// Fails open on a count error (a DB connectivity issue would block the downstream insert too).
export async function checkRestaurantRateLimit(
  supabase: SupabaseClient,
  table: string,
  restaurantId: string,
  windowMs: number,
  max: number,
): Promise<boolean> {
  const windowStart = new Date(Date.now() - windowMs).toISOString();
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId)
    .gte('created_at', windowStart);

  if (error) return false;
  return (count ?? 0) >= max;
}
