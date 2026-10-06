import { expect, test } from "vitest";
import { rateLimit } from "@/lib/rateLimit";

test("allows up to limit then blocks, then recovers after window", () => {
  const k = "k1";
  expect(rateLimit(k, 2, 1000, 0)).toBe(true);
  expect(rateLimit(k, 2, 1000, 1)).toBe(true);
  expect(rateLimit(k, 2, 1000, 2)).toBe(false);
  expect(rateLimit(k, 2, 1000, 1500)).toBe(true);
});
test("keys are independent", () => {
  expect(rateLimit("a", 1, 1000, 0)).toBe(true);
  expect(rateLimit("b", 1, 1000, 0)).toBe(true);
});

import { isRateLimited, recordHit, rateLimitSize } from "@/lib/rateLimit";

test("isRateLimited only peeks; recordHit counts", () => {
  expect(isRateLimited("p", 2, 1000, 0)).toBe(false);
  expect(isRateLimited("p", 2, 1000, 0)).toBe(false); // peeking does not consume
  recordHit("p", 0); recordHit("p", 1);
  expect(isRateLimited("p", 2, 1000, 2)).toBe(true);
  expect(isRateLimited("p", 2, 1000, 2000)).toBe(false);
});
test("stale keys are evicted so the map cannot grow without bound", () => {
  for (let i = 0; i < 2000; i++) recordHit(`junk${i}`, 0);
  recordHit("fresh", 2 * 60 * 60_000); // sweeps entries older than the 1h max window
  expect(rateLimitSize()).toBeLessThan(10);
});
