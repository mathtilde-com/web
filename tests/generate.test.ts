import { describe, expect, test } from "vitest";
import { generateDrill, generateQuestion, isValidQuestion, answerFor } from "@/lib/drill/generate";

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

describe("generator", () => {
  test("all questions valid over many seeds", () => {
    for (let seed = 1; seed <= 300; seed++) {
      for (const q of generateDrill(seeded(seed))) {
        expect(isValidQuestion(q)).toBe(true);
        expect(q.num1).toBeGreaterThanOrEqual(1); expect(q.num1).toBeLessThanOrEqual(100);
        expect(q.num2).toBeGreaterThanOrEqual(1); expect(q.num2).toBeLessThanOrEqual(100);
        expect(Number.isInteger(q.expected)).toBe(true);
        expect(q.expected).toBeGreaterThanOrEqual(0);
        if (q.operator === "-") expect(q.num1).toBeGreaterThanOrEqual(q.num2);
        if (q.operator === "/") { expect(q.num1 % q.num2).toBe(0); expect(q.expected).toBeGreaterThanOrEqual(1); }
      }
    }
  });
  test("drill has 60 questions and uses all operators", () => {
    const d = generateDrill(seeded(7));
    expect(d).toHaveLength(60);
    expect(new Set(d.map((q) => q.operator)).size).toBe(4);
  });
  test("division is not mostly trivial", () => {
    const rng = seeded(3); let ones = 0, n = 0;
    while (n < 400) { const q = generateQuestion(rng); if (q.operator === "/") { n++; if (q.expected === 1) ones++; } }
    expect(ones / n).toBeLessThan(0.3);
  });
  test("isValidQuestion rejects tampering", () => {
    expect(isValidQuestion({ num1: 5, num2: 3, operator: "+", expected: 9 })).toBe(false);
    expect(isValidQuestion({ num1: 3, num2: 5, operator: "-", expected: -2 })).toBe(false);
    expect(isValidQuestion({ num1: 7, num2: 2, operator: "/", expected: 3.5 })).toBe(false);
    expect(isValidQuestion({ num1: 101, num2: 1, operator: "+", expected: 102 })).toBe(false);
    expect(isValidQuestion({ num1: 1, num2: 0, operator: "+", expected: 1 })).toBe(false);
    expect(isValidQuestion({ num1: 2, num2: 3, operator: "^" as never, expected: 8 })).toBe(false);
  });
  test("answerFor", () => {
    expect(answerFor(12, "*", 12)).toBe(144);
    expect(answerFor(100, "*", 100)).toBe(10000);
    expect(answerFor(84, "/", 12)).toBe(7);
  });
});
