import { expect, test } from "vitest";
import { summarize } from "@/lib/drill/summary";
import type { QuestionLog } from "@/lib/drill/types";

const mk = (index: number, durationMs: number, attempts = 1, operator: "+" | "*" = "+"): QuestionLog =>
  ({ index, num1: 1, num2: 1, operator, expected: 2, attempts, durationMs });

test("total excludes Q1", () => {
  const s = summarize([mk(1, 9999), mk(2, 1000), mk(3, 2000)]);
  expect(s.totalDurationMs).toBe(3000);
});
test("retries, accuracy, slowest, per-operator", () => {
  const logs = [mk(1, 500), mk(2, 1000, 2), mk(3, 3000, 1, "*"), mk(4, 2000, 1, "*")];
  const s = summarize(logs);
  expect(s.retries).toBe(1);
  expect(s.accuracyPct).toBeCloseTo(75);
  expect(s.slowest[0].index).toBe(3);
  expect(s.perOperatorAvgMs["*"]).toBe(2500);
  expect(s.perOperatorAvgMs["+"]).toBe(1000); // Q1 excluded
});
