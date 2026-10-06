import { describe, expect, test } from "vitest";
import { initState, startDrill, submitAnswer, sanitizeInput, shouldAutoSubmit } from "@/lib/drill/machine";
import type { Question } from "@/lib/drill/types";

const qs: Question[] = [
  { num1: 2, num2: 3, operator: "+", expected: 5 },
  { num1: 50, num2: 50, operator: "+", expected: 100 },
];

describe("sanitizeInput", () => {
  test("keeps digits only", () => {
    expect(sanitizeInput("1e2")).toBe("12");
    expect(sanitizeInput("-5")).toBe("5");
    expect(sanitizeInput(" 12 ")).toBe("12");
    expect(sanitizeInput("123456789")).toBe("12345");
  });
});
describe("shouldAutoSubmit", () => {
  test("by digit count", () => {
    expect(shouldAutoSubmit("1", 5)).toBe(true);
    expect(shouldAutoSubmit("10", 100)).toBe(false);
    expect(shouldAutoSubmit("100", 100)).toBe(true);
    expect(shouldAutoSubmit("", 5)).toBe(false);
  });
});
describe("reducer", () => {
  test("ignores answers before start", () => {
    const r = submitAnswer(initState(qs), "5", 0);
    expect(r.correct).toBeNull();
  });
  test("correct answer logs and advances; wrong increments attempts", () => {
    let s = startDrill(initState(qs), 1000);
    let r = submitAnswer(s, "4", 1500); expect(r.correct).toBe(false); s = r.state;
    expect(s.attempts).toBe(2); expect(s.index).toBe(0);
    r = submitAnswer(s, "5", 2000); expect(r.correct).toBe(true); s = r.state;
    expect(s.index).toBe(1);
    expect(s.logs[0]).toMatchObject({ index: 1, attempts: 2, durationMs: 1000 });
    r = submitAnswer(s, "100", 5000); s = r.state;
    expect(s.phase).toBe("done");
    expect(s.logs[1]).toMatchObject({ index: 2, attempts: 1, durationMs: 3000 });
  });
  test("leading zeros are numeric: '05' equals 5", () => {
    const s = startDrill(initState(qs), 0);
    expect(submitAnswer(s, "05", 10).correct).toBe(true);
  });
  test("events after done are ignored", () => {
    let s = startDrill(initState(qs), 0);
    s = submitAnswer(s, "5", 10).state; s = submitAnswer(s, "100", 20).state;
    const again = submitAnswer(s, "100", 30);
    expect(again.correct).toBeNull(); expect(again.state.logs).toHaveLength(2);
  });
  test("durations clamp to 600000", () => {
    let s = startDrill(initState(qs), 0);
    s = submitAnswer(s, "5", 10_000_000).state;
    expect(s.logs[0].durationMs).toBe(600000);
  });
  test("empty input ignored", () => {
    const s = startDrill(initState(qs), 0);
    expect(submitAnswer(s, "", 5).correct).toBeNull();
  });
});
