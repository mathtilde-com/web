import { describe, expect, test } from "vitest";
import { validateDrillPayload } from "@/lib/drill/payload";
import { generateDrill } from "@/lib/drill/generate";

function payload() {
  let s = 42; const rng = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  return { questions: generateDrill(rng).map((q, i) => ({ index: i + 1, num1: q.num1, num2: q.num2, operator: q.operator, expectedAnswer: q.expected, attempts: 1, durationMs: 1500 })) };
}

describe("validateDrillPayload", () => {
  test("accepts valid and recomputes total from Q2..Q60", () => {
    const r = validateDrillPayload({ ...payload(), totalDurationMs: 1 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.totalDurationMs).toBe(59 * 1500);
  });
  test("rejects wrong count", () => {
    const p = payload(); p.questions.pop();
    expect(validateDrillPayload(p).ok).toBe(false);
  });
  test("rejects tampered answer", () => {
    const p = payload(); p.questions[3].expectedAnswer += 1;
    expect(validateDrillPayload(p).ok).toBe(false);
  });
  test("rejects bad indices", () => {
    const p = payload(); p.questions[5].index = 99;
    expect(validateDrillPayload(p).ok).toBe(false);
  });
  test("rejects durations over 10 min, negative, non-integer; attempts < 1", () => {
    for (const patch of [{ durationMs: 600001 }, { durationMs: -1 }, { durationMs: 1.5 }, { attempts: 0 }]) {
      const p = payload(); Object.assign(p.questions[10], patch);
      expect(validateDrillPayload(p).ok).toBe(false);
    }
  });
  test("accepts exactly 600000 ms", () => {
    const p = payload(); p.questions[10].durationMs = 600000;
    expect(validateDrillPayload(p).ok).toBe(true);
  });
  test("rejects garbage", () => {
    expect(validateDrillPayload(null).ok).toBe(false);
    expect(validateDrillPayload("x").ok).toBe(false);
  });
});
