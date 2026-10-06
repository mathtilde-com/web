const hits = new Map<string, number[]>();
const MAX_WINDOW_MS = 60 * 60_000;
const SWEEP_ABOVE = 1000;

function sweep(now: number) {
  for (const [k, ts] of hits) if (!ts.some((t) => now - t < MAX_WINDOW_MS)) hits.delete(k);
}

export function isRateLimited(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  return (hits.get(key) ?? []).filter((t) => now - t < windowMs).length >= limit;
}

export function recordHit(key: string, now = Date.now()) {
  if (hits.size > SWEEP_ABOVE) sweep(now);
  const ts = hits.get(key);
  if (ts) ts.push(now); else hits.set(key, [now]);
}

export const rateLimitSize = () => hits.size;

/** Consumes one hit; returns false when the caller is over the limit. */
export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  if (isRateLimited(key, limit, windowMs, now)) return false;
  recordHit(key, now);
  return true;
}
