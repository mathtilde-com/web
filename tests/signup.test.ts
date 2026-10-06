import { describe, expect, test } from "vitest";
import { parseSignup } from "@/lib/signup";

const base = { email: "A@B.com", password: "longenough1" };
describe("parseSignup", () => {
  test("lower-cases and trims email", () => {
    const r = parseSignup({ ...base, email: "  Foo@Bar.COM " });
    expect(r.ok && r.data.email).toBe("foo@bar.com");
  });
  test("rejects short password, bad email", () => {
    expect(parseSignup({ ...base, password: "short" }).ok).toBe(false);
    expect(parseSignup({ ...base, email: "nope" }).ok).toBe(false);
  });
  test("rejects future and malformed birth date; accepts empty", () => {
    expect(parseSignup({ ...base, birthDate: "2999-01-01" }).ok).toBe(false);
    expect(parseSignup({ ...base, birthDate: "not-a-date" }).ok).toBe(false);
    const r = parseSignup({ ...base, birthDate: "" });
    expect(r.ok && r.data.birthDate).toBeNull();
  });
  test("rejects implausibly old birth date", () => {
    expect(parseSignup({ ...base, birthDate: "1800-01-01" }).ok).toBe(false);
  });
  test("gender enum, empty -> null", () => {
    expect(parseSignup({ ...base, gender: "robot" }).ok).toBe(false);
    const r = parseSignup({ ...base, gender: "" });
    expect(r.ok && r.data.gender).toBeNull();
  });
  test("password max length 72 (bcrypt limit)", () => {
    expect(parseSignup({ ...base, password: "x".repeat(73) }).ok).toBe(false);
  });
  test("short password message is user-readable", () => {
    const r = parseSignup({ ...base, password: "short" });
    expect(!r.ok && r.error).toMatch(/at least 8/);
  });
});
