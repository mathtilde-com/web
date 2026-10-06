import { describe, expect, test } from "vitest";
import { saveWithRetry } from "@/lib/drill/save";

const res = (status: number, body: unknown = {}) => ({ status, json: async () => body });
const noSleep = async () => {};

describe("saveWithRetry", () => {
  test("201 returns the saved id", async () => {
    const r = await saveWithRetry(async () => res(201, { id: "abc" }), noSleep);
    expect(r).toEqual({ status: "saved", id: "abc" });
  });
  test("204 means not signed in, no retry", async () => {
    let calls = 0;
    const r = await saveWithRetry(async () => (calls++, res(204)), noSleep);
    expect(r).toEqual({ status: "unauthenticated" }); expect(calls).toBe(1);
  });
  test("4xx fails immediately without sleeping", async () => {
    for (const code of [400, 429]) {
      let calls = 0, slept = 0;
      const r = await saveWithRetry(async () => (calls++, res(code)), async () => { slept++; });
      expect(r).toEqual({ status: "failed" }); expect(calls).toBe(1); expect(slept).toBe(0);
    }
  });
  test("network error then success retries once", async () => {
    let calls = 0, slept = 0;
    const r = await saveWithRetry(async () => { if (calls++ === 0) throw new Error("net"); return res(201, { id: "x" }); }, async () => { slept++; });
    expect(r).toEqual({ status: "saved", id: "x" }); expect(calls).toBe(2); expect(slept).toBe(1);
  });
  test("two 500s fail after exactly two attempts", async () => {
    let calls = 0;
    const r = await saveWithRetry(async () => (calls++, res(500)), noSleep);
    expect(r).toEqual({ status: "failed" }); expect(calls).toBe(2);
  });
});
