import { describe, expect, test } from "vitest";
import { ageBand, percentileRank } from "@/lib/stats";

describe("ageBand", () => {
  test("5-year bands, birthday-accurate", () => {
    expect(ageBand("2000-06-15", new Date("2020-06-14"))).toBe(3); // 19
    expect(ageBand("2000-06-15", new Date("2020-06-15"))).toBe(4); // 20
    expect(ageBand("2010-01-01", new Date("2012-01-01"))).toBe(0);
  });
});
describe("percentileRank", () => {
  test("percent of cohort users slower than you (lower time is better)", () => {
    expect(percentileRank([100, 200, 300, 400], 250)).toBe(50);
    expect(percentileRank([100, 200, 300, 400], 50)).toBe(100);
    expect(percentileRank([100, 200, 300, 400], 500)).toBe(0);
  });
  test("ties are not counted as slower", () => {
    expect(percentileRank([100, 100, 200, 200], 100)).toBe(50);
  });
  test("empty cohort -> 0", () => expect(percentileRank([], 1)).toBe(0));
});
