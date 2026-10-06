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
