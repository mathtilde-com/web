# MathTilde Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build MathTilde: a timed 60-question mixed-operator arithmetic drill with accounts, per-question logging, and analytics/benchmarks.

**Architecture:** A pure domain module (`lib/drill`) generates/validates questions and drives a reducer-based drill state machine. A thin Next.js route handler validates and stores drills in Neon via Kysely; Auth.js credentials auth gates saving and stats. Guests play fully client-side.

**Tech Stack:** Next.js (App Router, TS, Tailwind), Kysely + kysely-neon + @neondatabase/serverless, Auth.js (next-auth v5, Credentials, JWT), bcryptjs, zod, Recharts, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-06-mathtilde-design.md` (read it first; it supersedes `spec.md`).

## Global Constraints

- 60 questions per drill; operators `+ - * /` mixed uniformly; operands integers 1..100.
- `-`: `num1 >= num2` (result >= 0). `/`: exact, `num1` in 1..100, `num2` a divisor of `num1`, answer >= 1.
- Q1 untimed warm-up: logged, excluded from `total_duration_ms`; total = sum of `duration_ms` for `question_index` 2..60. Server recomputes it; never trust the client total.
- Wrong answer: stay on question, `attempts_count` += 1, timer keeps running. Auto-submit when typed length == digit count of expected answer.
- Guests can play; guest results are never stored (API returns 204 without a session). `sessions_drill.user_id` NOT NULL.
- `rules_version SMALLINT NOT NULL DEFAULT 1` on `sessions_drill`; CHECK on `operator IN ('+','-','*','/')` and `question_index BETWEEN 1 AND 60`.
- Benchmark shown only if cohort (same gender, same 5-year age band at drill time) has >= 20 distinct users.
- Emails stored lower-cased. Secrets only via env: `DATABASE_URL`, `AUTH_SECRET`.
- Do NOT push to GitHub or touch Vercel/Cloudflare without explicit user confirmation.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- Client abandons/refreshes mid-drill: state is lost, nothing partially saved; no crash on reload.
- User walks away mid-question: durations clamp to 600000 ms client-side and the server accepts <= 600000 (test in Task 2 and 5).
- Non-digit / pasted / leading-zero input (`"007"`, `"1e2"`, `"-5"`, `" 12"`): only digits accepted, evaluated as number.
- Double submit / events after the drill is done: reducer ignores them, only one POST is sent.
- Users with null `birth_date`/`gender`, or future `birth_date`: signup rejects future dates; stats shows "add your age and gender to see a benchmark" instead of failing.
- Duplicate email differing in case: rejected at signup.

---

## File Structure

```
package.json, tsconfig.json, next.config.ts, vitest.config.ts, playwright.config.ts
.env.example                     env var template
migrations/001_init.sql          schema
scripts/migrate.ts               migration runner
lib/drill/types.ts               Operator, Question, QuestionLog, Rng
lib/drill/generate.ts            generateQuestion, generateDrill, answerFor, isValidQuestion
lib/drill/machine.ts             pure reducer for the drill flow + shouldAutoSubmit
lib/drill/summary.ts             summarize(logs)
lib/drill/payload.ts             zod schema + validateDrillPayload (server)
lib/db/schema.ts                 Kysely table types
lib/db/index.ts                  db instance
lib/rateLimit.ts                 in-memory limiter
lib/stats.ts                     history/perOperator/benchmark queries + pure helpers
auth.ts                          Auth.js config (credentials)
app/api/auth/[...nextauth]/route.ts
app/api/signup/route.ts
app/api/drills/route.ts
app/page.tsx, app/login/page.tsx, app/signup/page.tsx
app/drill/page.tsx, app/results/[id]/page.tsx, app/stats/page.tsx
components/Drill.tsx, Numpad.tsx, Summary.tsx, HistoryChart.tsx, AuthForm.tsx
tests/                           vitest unit tests; e2e/ playwright
docs/SETUP.md                    infra checklist
```

---

### Task 1: Scaffold project and tooling

**Files:** Create everything from `create-next-app`, plus `vitest.config.ts`, `.env.example`, `tests/smoke.test.ts`.

**Interfaces:** Produces: `npm test` (vitest), `npm run dev`, `@/` import alias to repo root.

- [ ] **Step 1: Scaffold in the existing directory** (it contains `spec.md`, `docs/`, `.git`; scaffold into a temp dir then move)

```bash
cd /home/gilad/Work/mathtilde.com
npx create-next-app@latest ../mathtilde-scaffold --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm --yes
rsync -a --exclude .git ../mathtilde-scaffold/ ./ && rm -rf ../mathtilde-scaffold
```

- [ ] **Step 2: Install dependencies**

```bash
npm i kysely kysely-neon @neondatabase/serverless ws next-auth@beta bcryptjs zod recharts
npm i -D vitest @vitejs/plugin-react @types/bcryptjs @types/ws tsx dotenv @playwright/test
```

- [ ] **Step 3: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
  resolve: { alias: { "@": path.resolve(__dirname) } },
});
```

- [ ] **Step 4: Add scripts to `package.json`**: `"test": "vitest run"`, `"migrate": "tsx scripts/migrate.ts"`, `"e2e": "playwright test"`.

- [ ] **Step 5: Write `.env.example`**

```
DATABASE_URL=postgres://user:pass@host/db?sslmode=require
AUTH_SECRET=generate-with-openssl-rand-base64-32
```

Ensure `.gitignore` ignores `.env*` except `.env.example` (create-next-app ignores `.env*`; add `!.env.example`).

- [ ] **Step 6: Smoke test** `tests/smoke.test.ts`

```ts
import { expect, test } from "vitest";
test("runner works", () => expect(1 + 1).toBe(2));
```

Run: `npm test` → PASS. Run `npm run build` → succeeds.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore: scaffold Next.js app with vitest

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Drill domain (generation, validation, scoring, payload)

**Files:**
- Create: `lib/drill/types.ts`, `lib/drill/generate.ts`, `lib/drill/summary.ts`, `lib/drill/payload.ts`
- Test: `tests/generate.test.ts`, `tests/summary.test.ts`, `tests/payload.test.ts`

**Interfaces:**
- Produces:
  - `type Operator = "+" | "-" | "*" | "/"`; `type Rng = () => number` (0 <= x < 1)
  - `interface Question { num1: number; num2: number; operator: Operator; expected: number }`
  - `interface QuestionLog extends Question { index: number; attempts: number; durationMs: number }` (index 1-based)
  - `answerFor(num1, op, num2): number`; `isValidQuestion(q: Question): boolean`
  - `generateQuestion(rng): Question`; `generateDrill(rng, count = 60): Question[]`
  - `MAX_QUESTION_MS = 600000`
  - `summarize(logs: QuestionLog[]): { totalDurationMs: number; retries: number; accuracyPct: number; slowest: QuestionLog[]; perOperatorAvgMs: Partial<Record<Operator, number>> }`
  - `validateDrillPayload(input: unknown): { ok: true; logs: QuestionLog[]; totalDurationMs: number } | { ok: false }`

- [ ] **Step 1: Write failing tests** `tests/generate.test.ts`

```ts
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
```

`tests/summary.test.ts`

```ts
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
```

`tests/payload.test.ts`

```ts
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
```

- [ ] **Step 2: Run** `npm test` → FAIL (modules missing).

- [ ] **Step 3: Implement** `lib/drill/types.ts`

```ts
export type Operator = "+" | "-" | "*" | "/";
export type Rng = () => number;
export interface Question { num1: number; num2: number; operator: Operator; expected: number }
export interface QuestionLog extends Question { index: number; attempts: number; durationMs: number }
export const OPERATORS: Operator[] = ["+", "-", "*", "/"];
export const DRILL_SIZE = 60;
export const MAX_QUESTION_MS = 600000;
```

`lib/drill/generate.ts`

```ts
import { DRILL_SIZE, OPERATORS, type Operator, type Question, type Rng } from "./types";

const int = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));

export function answerFor(a: number, op: Operator, b: number): number {
  switch (op) {
    case "+": return a + b;
    case "-": return a - b;
    case "*": return a * b;
    case "/": return a / b;
  }
}

const inRange = (n: number) => Number.isInteger(n) && n >= 1 && n <= 100;

export function isValidQuestion(q: Question): boolean {
  if (!OPERATORS.includes(q.operator)) return false;
  if (!inRange(q.num1) || !inRange(q.num2)) return false;
  if (q.operator === "-" && q.num1 < q.num2) return false;
  if (q.operator === "/" && q.num1 % q.num2 !== 0) return false;
  const ans = answerFor(q.num1, q.operator, q.num2);
  return Number.isInteger(ans) && ans === q.expected;
}

function divisorsOf(n: number): number[] {
  const out: number[] = [];
  for (let d = 1; d <= n; d++) if (n % d === 0) out.push(d);
  return out;
}

export function generateQuestion(rng: Rng): Question {
  const operator = OPERATORS[int(rng, 0, 3)];
  let num1: number, num2: number;
  if (operator === "-") { num1 = int(rng, 1, 100); num2 = int(rng, 1, num1); }
  else if (operator === "/") {
    num1 = int(rng, 1, 100);
    const ds = divisorsOf(num1);
    num2 = ds[int(rng, 0, ds.length - 1)];
  } else { num1 = int(rng, 1, 100); num2 = int(rng, 1, 100); }
  return { num1, num2, operator, expected: answerFor(num1, operator, num2) };
}

export function generateDrill(rng: Rng, count = DRILL_SIZE): Question[] {
  return Array.from({ length: count }, () => generateQuestion(rng));
}
```

`lib/drill/summary.ts`

```ts
import type { Operator, QuestionLog } from "./types";

export function summarize(logs: QuestionLog[]) {
  const timed = logs.filter((l) => l.index >= 2);
  const totalDurationMs = timed.reduce((s, l) => s + l.durationMs, 0);
  const retries = logs.filter((l) => l.attempts > 1).length;
  const accuracyPct = logs.length ? ((logs.length - retries) / logs.length) * 100 : 0;
  const slowest = [...timed].sort((a, b) => b.durationMs - a.durationMs).slice(0, 5);
  const sums: Partial<Record<Operator, { t: number; n: number }>> = {};
  for (const l of timed) {
    const e = (sums[l.operator] ??= { t: 0, n: 0 });
    e.t += l.durationMs; e.n++;
  }
  const perOperatorAvgMs: Partial<Record<Operator, number>> = {};
  for (const [op, e] of Object.entries(sums)) perOperatorAvgMs[op as Operator] = e!.t / e!.n;
  return { totalDurationMs, retries, accuracyPct, slowest, perOperatorAvgMs };
}
```

`lib/drill/payload.ts`

```ts
import { z } from "zod";
import { isValidQuestion } from "./generate";
import { DRILL_SIZE, MAX_QUESTION_MS, type QuestionLog } from "./types";

const schema = z.object({
  questions: z.array(z.object({
    index: z.number().int(),
    num1: z.number().int(),
    num2: z.number().int(),
    operator: z.enum(["+", "-", "*", "/"]),
    expectedAnswer: z.number().int(),
    attempts: z.number().int().min(1).max(1000),
    durationMs: z.number().int().min(0).max(MAX_QUESTION_MS),
  })).length(DRILL_SIZE),
});

export function validateDrillPayload(input: unknown):
  | { ok: true; logs: QuestionLog[]; totalDurationMs: number }
  | { ok: false } {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const logs: QuestionLog[] = [];
  for (const [i, q] of parsed.data.questions.entries()) {
    if (q.index !== i + 1) return { ok: false };
    const log: QuestionLog = { index: q.index, num1: q.num1, num2: q.num2, operator: q.operator, expected: q.expectedAnswer, attempts: q.attempts, durationMs: q.durationMs };
    if (!isValidQuestion(log)) return { ok: false };
    logs.push(log);
  }
  const totalDurationMs = logs.filter((l) => l.index >= 2).reduce((s, l) => s + l.durationMs, 0);
  return { ok: true, logs, totalDurationMs };
}
```

- [ ] **Step 4: Run** `npm test` → all PASS.
- [ ] **Step 5: Commit** `feat: drill domain (generation, validation, summary, payload)` with the Co-Authored-By trailer.

---

### Task 3: Drill state machine (pure reducer)

**Files:** Create `lib/drill/machine.ts`; Test `tests/machine.test.ts`

**Interfaces:**
- Consumes: `Question`, `QuestionLog`, `MAX_QUESTION_MS` from Task 2.
- Produces:
  - `sanitizeInput(raw: string): string` (digits only, max 5 chars)
  - `shouldAutoSubmit(typed: string, expected: number): boolean`
  - `type DrillState = { phase: "ready" | "running" | "done"; questions: Question[]; index: number; attempts: number; startedAt: number; logs: QuestionLog[] }`
  - `initState(questions: Question[]): DrillState`
  - `startDrill(s, now): DrillState`
  - `submitAnswer(s, typed: string, now): { state: DrillState; correct: boolean | null }` (`null` = ignored)
  - `isWrongAnswerShown` not needed.

- [ ] **Step 1: Failing tests** `tests/machine.test.ts`

```ts
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
```

- [ ] **Step 2:** `npm test -- machine` → FAIL.
- [ ] **Step 3: Implement** `lib/drill/machine.ts`

```ts
import { MAX_QUESTION_MS, type Question, type QuestionLog } from "./types";

export type DrillState = {
  phase: "ready" | "running" | "done";
  questions: Question[];
  index: number;
  attempts: number;
  startedAt: number;
  logs: QuestionLog[];
};

export const sanitizeInput = (raw: string) => raw.replace(/\D/g, "").slice(0, 5);
export const shouldAutoSubmit = (typed: string, expected: number) =>
  typed.length > 0 && typed.length === String(expected).length;

export const initState = (questions: Question[]): DrillState =>
  ({ phase: "ready", questions, index: 0, attempts: 1, startedAt: 0, logs: [] });

export const startDrill = (s: DrillState, now: number): DrillState =>
  s.phase === "ready" ? { ...s, phase: "running", startedAt: now } : s;

export function submitAnswer(s: DrillState, typed: string, now: number): { state: DrillState; correct: boolean | null } {
  if (s.phase !== "running" || typed === "" || !/^\d+$/.test(typed)) return { state: s, correct: null };
  const q = s.questions[s.index];
  if (Number(typed) !== q.expected) return { state: { ...s, attempts: s.attempts + 1 }, correct: false };
  const durationMs = Math.min(MAX_QUESTION_MS, Math.max(0, Math.round(now - s.startedAt)));
  const logs = [...s.logs, { ...q, index: s.index + 1, attempts: s.attempts, durationMs }];
  const done = s.index + 1 >= s.questions.length;
  return {
    state: { ...s, logs, index: s.index + 1, attempts: 1, startedAt: now, phase: done ? "done" : "running" },
    correct: true,
  };
}
```

- [ ] **Step 4:** `npm test` → PASS. **Step 5:** Commit `feat: drill state machine`.

---

### Task 4: Database (migration, Kysely types, client, runner)

**Files:** Create `migrations/001_init.sql`, `scripts/migrate.ts`, `lib/db/schema.ts`, `lib/db/index.ts`

**Interfaces:**
- Produces: `db: Kysely<Database>` exported from `@/lib/db`; tables `users`, `sessions_drill`, `question_logs`; `npm run migrate`.

- [ ] **Step 1: `migrations/001_init.sql`**

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  birth_date DATE,
  gender VARCHAR(20) CHECK (gender IN ('male','female','non-binary','other','prefer_not_to_say')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sessions_drill (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  total_duration_ms INTEGER NOT NULL,
  rules_version SMALLINT NOT NULL DEFAULT 1,
  completed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE question_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions_drill(id) ON DELETE CASCADE,
  question_index SMALLINT NOT NULL CHECK (question_index BETWEEN 1 AND 60),
  num1 SMALLINT NOT NULL,
  num2 SMALLINT NOT NULL,
  operator VARCHAR(1) NOT NULL CHECK (operator IN ('+','-','*','/')),
  expected_answer SMALLINT NOT NULL,
  attempts_count SMALLINT NOT NULL DEFAULT 1,
  duration_ms INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_user ON sessions_drill(user_id);
CREATE INDEX idx_sessions_completed ON sessions_drill(user_id, completed_at);
CREATE INDEX idx_logs_session ON question_logs(session_id);
```

- [ ] **Step 2: `scripts/migrate.ts`** (WebSocket Pool so multi-statement files work)

```ts
import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString: url });
  await pool.query("CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW())");
  const dir = path.join(process.cwd(), "migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const done = await pool.query("SELECT 1 FROM _migrations WHERE name = $1", [file]);
    if (done.rowCount) continue;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(readFileSync(path.join(dir, file), "utf8"));
      await client.query("INSERT INTO _migrations(name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log("applied", file);
    } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
  }
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
```

`dotenv/config` loads `.env`; tell Next users to put the URL in `.env.local` — so use `import dotenv from "dotenv"; dotenv.config({ path: ".env.local" })` instead of `import "dotenv/config"` (use this form).

- [ ] **Step 3: `lib/db/schema.ts`**

```ts
import type { ColumnType, Generated } from "kysely";

export interface UsersTable {
  id: Generated<string>;
  email: string;
  password_hash: string;
  birth_date: string | null;
  gender: "male" | "female" | "non-binary" | "other" | "prefer_not_to_say" | null;
  created_at: ColumnType<Date, never, never>;
}
export interface SessionsDrillTable {
  id: Generated<string>;
  user_id: string;
  total_duration_ms: number;
  rules_version: Generated<number>;
  completed_at: ColumnType<Date, never, never>;
}
export interface QuestionLogsTable {
  id: Generated<string>;
  session_id: string;
  question_index: number;
  num1: number;
  num2: number;
  operator: "+" | "-" | "*" | "/";
  expected_answer: number;
  attempts_count: number;
  duration_ms: number;
  created_at: ColumnType<Date, never, never>;
}
export interface Database {
  users: UsersTable;
  sessions_drill: SessionsDrillTable;
  question_logs: QuestionLogsTable;
}
```

Note: `date` columns arrive as JS `Date` or string depending on driver; `birth_date` is read with `.toString()`-safe handling in Task 8 (cast to text in SQL: `birth_date::text`).

- [ ] **Step 4: `lib/db/index.ts`**

```ts
import { Kysely } from "kysely";
import { NeonDialect } from "kysely-neon";
import { Pool } from "@neondatabase/serverless";
import type { Database } from "./schema";

export const db = new Kysely<Database>({
  dialect: new NeonDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) } as never),
});
```

Verify the `NeonDialect` constructor options against `node_modules/kysely-neon` types/README after install. Requirement: transactions must work (Task 5 inserts a session and 60 logs atomically), so use the WebSocket/Pool mode, not the HTTP `neon()` mode. Remove the `as never` cast once the options match the types. If kysely-neon cannot do pooled transactions, fall back to `new PostgresDialect({ pool: new Pool({ connectionString }) })` from `kysely` (Neon's Pool is pg-compatible) and note it in `docs/SETUP.md`.

- [ ] **Step 5: Verify.** `npx tsc --noEmit` passes. If a `DATABASE_URL` exists in `.env.local`: `npm run migrate` prints `applied 001_init.sql`; running it again prints nothing. If no `DATABASE_URL` yet, ask the user (they may provide one, or via the Neon skills) before running; otherwise skip the live check and say so.
- [ ] **Step 6: Commit** `feat: database schema, kysely client, migration runner`.

---

### Task 5: Rate limit + drills API

**Files:** Create `lib/rateLimit.ts`, `app/api/drills/route.ts`; Test `tests/rateLimit.test.ts`

**Interfaces:**
- Consumes: `validateDrillPayload` (Task 2), `db` (Task 4), `auth` from `@/auth` (Task 6; stub-compatible: `await auth()` returns `{ user?: { id?: string } } | null`).
- Produces: `rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean` (true = allowed); `POST /api/drills` → `201 { id }`, `204` for guests, `400`, `429`.

Task 6 must land before this route compiles; if executing in order, create the route in Task 6 Step 6 instead. (Do `lib/rateLimit.ts` here.)

- [ ] **Step 1: Test** `tests/rateLimit.test.ts`

```ts
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
```

- [ ] **Step 2:** `npm test -- rateLimit` → FAIL. **Step 3: Implement** `lib/rateLimit.ts`

```ts
const hits = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) { hits.set(key, recent); return false; }
  recent.push(now); hits.set(key, recent);
  return true;
}
```

(Per-instance only; adequate for v1 and noted in `docs/SETUP.md` as a known limit.)

- [ ] **Step 4:** PASS. **Step 5: Commit** `feat: in-memory rate limiter`.

---

### Task 6: Authentication (signup, login, drills route)

**Files:** Create `auth.ts`, `app/api/auth/[...nextauth]/route.ts`, `app/api/signup/route.ts`, `lib/signup.ts`, `app/login/page.tsx`, `app/signup/page.tsx`, `components/AuthForm.tsx`, `app/api/drills/route.ts`; Test `tests/signup.test.ts`

**Interfaces:**
- Produces: `auth(): Promise<Session | null>` where `session.user.id: string`; `signIn`, `signOut`, `handlers` from `@/auth`; `parseSignup(input: unknown)` → `{ ok: true; data: { email; password; birthDate: string | null; gender: Gender | null } } | { ok: false; error: string }`; `POST /api/signup` → `201`, `400 {error}`, `409`; `POST /api/drills` as in Task 5.

- [ ] **Step 1: Test** `tests/signup.test.ts`

```ts
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
});
```

- [ ] **Step 2:** FAIL. **Step 3: `lib/signup.ts`**

```ts
import { z } from "zod";

export const GENDERS = ["male", "female", "non-binary", "other", "prefer_not_to_say"] as const;
export type Gender = (typeof GENDERS)[number];

const empty = (v: unknown) => (v === "" || v === undefined ? null : v);

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(8).max(72),
  birthDate: z.preprocess(empty, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()),
  gender: z.preprocess(empty, z.enum(GENDERS).nullable()),
}).superRefine((v, ctx) => {
  if (!v.birthDate) return;
  const t = Date.parse(v.birthDate + "T00:00:00Z");
  const year = Number(v.birthDate.slice(0, 4));
  if (Number.isNaN(t) || t > Date.now() || year < 1900)
    ctx.addIssue({ code: "custom", path: ["birthDate"], message: "Invalid birth date" });
});

export function parseSignup(input: unknown):
  | { ok: true; data: { email: string; password: string; birthDate: string | null; gender: Gender | null } }
  | { ok: false; error: string } {
  const r = schema.safeParse(input);
  if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? "Invalid input" };
  return { ok: true, data: r.data as never };
}
```

Run tests → PASS.

- [ ] **Step 4: `auth.ts`**

```ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rateLimit";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(creds) {
        const email = String(creds?.email ?? "").trim().toLowerCase();
        const password = String(creds?.password ?? "");
        if (!email || !password || !rateLimit(`login:${email}`, 10, 15 * 60_000)) return null;
        const user = await db.selectFrom("users").select(["id", "email", "password_hash"]).where("email", "=", email).executeTakeFirst();
        if (!user || !(await bcrypt.compare(password, user.password_hash))) return null;
        return { id: user.id, email: user.email };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) { if (user?.id) token.uid = user.id; return token; },
    session({ session, token }) { if (token.uid) session.user.id = token.uid as string; return session; },
  },
});
```

Add module augmentation in `types/next-auth.d.ts`: `declare module "next-auth" { interface Session { user: { id: string } & DefaultSession["user"] } }` and `declare module "next-auth/jwt" { interface JWT { uid?: string } }`.

`app/api/auth/[...nextauth]/route.ts`: `import { handlers } from "@/auth"; export const { GET, POST } = handlers;`

- [ ] **Step 5: `app/api/signup/route.ts`**

```ts
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseSignup } from "@/lib/signup";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  if (!rateLimit(`signup:${ip}`, 5, 60 * 60_000)) return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  const body = await req.json().catch(() => null);
  const parsed = parseSignup(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { email, password, birthDate, gender } = parsed.data;
  const exists = await db.selectFrom("users").select("id").where("email", "=", email).executeTakeFirst();
  if (exists) return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  await db.insertInto("users").values({ email, password_hash: await bcrypt.hash(password, 10), birth_date: birthDate, gender }).execute();
  return NextResponse.json({ ok: true }, { status: 201 });
}
```

(A unique-violation race falls through as 500; acceptable, but catch error code `23505` and return 409.)

- [ ] **Step 6: `app/api/drills/route.ts`**

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { validateDrillPayload } from "@/lib/drill/payload";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new NextResponse(null, { status: 204 });
  if (!rateLimit(`drill:${userId}`, 30, 60 * 60_000)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const v = validateDrillPayload(await req.json().catch(() => null));
  if (!v.ok) return NextResponse.json({ error: "Invalid drill" }, { status: 400 });
  const id = await db.transaction().execute(async (trx) => {
    const s = await trx.insertInto("sessions_drill").values({ user_id: userId, total_duration_ms: v.totalDurationMs }).returning("id").executeTakeFirstOrThrow();
    await trx.insertInto("question_logs").values(v.logs.map((l) => ({
      session_id: s.id, question_index: l.index, num1: l.num1, num2: l.num2,
      operator: l.operator, expected_answer: l.expected, attempts_count: l.attempts, duration_ms: l.durationMs,
    }))).execute();
    return s.id;
  });
  return NextResponse.json({ id }, { status: 201 });
}
```

- [ ] **Step 7: Auth pages.** `components/AuthForm.tsx` is a client component with `mode: "login" | "signup"`. Signup mode fields: email, password, optional birth date (`type=date`, `max=today`), optional gender select (the 5 values plus blank). Signup POSTs `/api/signup` then calls `signIn("credentials", { email, password, redirectTo: "/drill" })` from `next-auth/react` (requires `SessionProvider`-free usage: `signIn` from `next-auth/react` works without provider). Login mode calls `signIn` and shows "Invalid email or password" on failure. `app/login/page.tsx` and `app/signup/page.tsx` render `<AuthForm mode=… />` with a link to the other page. Style with Tailwind: centered card, labeled inputs, visible focus rings.
- [ ] **Step 8: Verify** `npx tsc --noEmit` and `npm test` pass. With a DB: `npm run dev`, sign up, log in, confirm a `users` row (lowercased email) exists and re-signup with differently-cased email gives "Email already registered". Without a DB, say so explicitly in the report.
- [ ] **Step 9: Commit** `feat: auth (signup/login) and drills API`.

---

### Task 7: Drill UI and results summary

**Files:** Create `components/Drill.tsx`, `components/Numpad.tsx`, `components/Summary.tsx`, `app/drill/page.tsx`, `app/results/[id]/page.tsx`, rewrite `app/page.tsx`

**Interfaces:**
- Consumes: `generateDrill`, `initState/startDrill/submitAnswer/sanitizeInput/shouldAutoSubmit`, `summarize`, `auth`, `db`.
- Produces: `<Drill signedIn: boolean />`; `<Summary logs: QuestionLog[] />` (also used by guest end-of-drill view); `/drill`, `/results/[id]`.

- [ ] **Step 1: `components/Summary.tsx`** (presentational; no DB). Props `{ logs: QuestionLog[] }`; uses `summarize(logs)`. Shows: total time in seconds with one decimal (`(ms/1000).toFixed(1)`s), "Questions needing a retry: N of 60", accuracy %, a table of the 5 slowest (question text like `87 × 93`, time, attempts), and per-operator average seconds. Use the display symbols `+ − × ÷` mapped from `+ - * /`. Include `data-testid="total-time"` on the total.
- [ ] **Step 2: `components/Numpad.tsx`**: grid of buttons 0-9 and backspace; props `{ onDigit(d: string): void; onBackspace(): void }`; rendered only on coarse-pointer devices via Tailwind `[@media(pointer:coarse)]:grid hidden`.
- [ ] **Step 3: `components/Drill.tsx`** (client). Behavior:
  - `useState` initial `initState(generateDrill(Math.random))` created lazily in `useState(() => …)` so it is generated once on the client only (page is a client island; avoid hydration mismatch by rendering the drill only after mount via a `mounted` flag).
  - `ready` phase: "Start" button → `startDrill(state, performance.now())`, focuses input.
  - `running`: shows `Question {index+1} / 60`, the expression (`data-testid="question"` with text like `87 × 93`), the input (`inputMode="numeric"`, `autoComplete="off"`, `data-testid="answer"`), and "Warm-up (untimed)" label on Q1. `onChange`: `v = sanitizeInput(e.target.value)`; if `shouldAutoSubmit(v, expected)` → `submitAnswer`; on wrong, clear the field and flash a red border for 300 ms; on correct, clear the field. Otherwise set the field to `v`. Numpad handlers append/remove digits through the same path.
  - Do not render a running clock for the user (keeps focus on accuracy); a progress bar only.
  - On transition to `done`: compute `logs`; if `signedIn`, POST once to `/api/drills` (guard with a `useRef` flag so it posts exactly once, even under React strict-mode double effects); body `{ questions: logs.map(l => ({ index, num1, num2, operator, expectedAnswer: l.expected, attempts, durationMs })) }`. On `201` → `router.replace(/results/${id})`. On failure retry once after 1 s, then show "Couldn't save. Retry" button keeping `<Summary />` visible. If not signed in, show `<Summary logs />` plus "Sign up to save your results" link and a "Play again" button.
  - `beforeunload` is not needed; abandoned drills are simply lost (spec: no partial saves).
- [ ] **Step 4: `app/drill/page.tsx`** (server): `const session = await auth(); return <Drill signedIn={!!session?.user?.id} />`.
- [ ] **Step 5: `app/results/[id]/page.tsx`** (server). Validate `params.id` as UUID with zod (else `notFound()`); require session (else `redirect("/login")`); load session row where `id = params.id AND user_id = session.user.id` (else `notFound()`; never reveal other users' drills); load logs ordered by `question_index`, map to `QuestionLog` (`expected_answer`→`expected`, `attempts_count`→`attempts`, `duration_ms`→`durationMs`); render `<Summary />`, links "Play again" (`/drill`) and "Stats" (`/stats`).
- [ ] **Step 6: `app/page.tsx`**: simple landing: "MathTilde", one-sentence explanation ("60 questions. Be fast. Be right."), primary "Start drill" → `/drill`, secondary links Log in / Sign up / Stats (show Log out when signed in via a server action calling `signOut`).
- [ ] **Step 7: Verify manually.** `npm run dev`; as a guest complete a drill by reading each question and typing the answer; confirm: Q1 labeled warm-up, wrong answer of the right length clears and keeps the same question, summary total excludes Q1, one POST (check the Network tab, guests get 204). `npm run build` passes.
- [ ] **Step 8: Commit** `feat: drill UI, results page, landing`.

---

### Task 8: Stats (history, per-operator, benchmark)

**Files:** Create `lib/stats.ts`, `components/HistoryChart.tsx`, `app/stats/page.tsx`; Test `tests/stats.test.ts`

**Interfaces:**
- Produces (pure, tested): `ageBand(birthDate: string, at: Date): number` (5-year band index = floor(age/5)); `percentileRank(cohortBest: number[], mine: number): number` (percent of cohort users you were faster than or equal to... defined below); `MIN_COHORT = 20`.
- Produces (DB): `getHistory(userId): Promise<{ id: string; completedAt: Date; totalDurationMs: number }[]>` (oldest first, last 100); `getPerOperator(userId): Promise<Partial<Record<Operator, number>>>` (avg ms, Q>=2); `getBenchmark(userId): Promise<{ status: "ok"; percentile: number; cohortSize: number; bandLabel: string } | { status: "no-profile" } | { status: "no-drills" } | { status: "insufficient"; cohortSize: number }>`.

- [ ] **Step 1: Tests** `tests/stats.test.ts`

```ts
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
```

- [ ] **Step 2:** FAIL. **Step 3: `lib/stats.ts`**

```ts
import { sql } from "kysely";
import { db } from "@/lib/db";
import type { Operator } from "@/lib/drill/types";

export const MIN_COHORT = 20;

export function ageBand(birthDate: string, at: Date): number {
  const b = new Date(birthDate + "T00:00:00Z");
  let age = at.getUTCFullYear() - b.getUTCFullYear();
  const m = at.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && at.getUTCDate() < b.getUTCDate())) age--;
  return Math.floor(age / 5);
}

export function percentileRank(cohortBest: number[], mine: number): number {
  if (!cohortBest.length) return 0;
  return (cohortBest.filter((t) => t > mine).length / cohortBest.length) * 100;
}

export async function getHistory(userId: string) {
  const rows = await db.selectFrom("sessions_drill").select(["id", "completed_at", "total_duration_ms"])
    .where("user_id", "=", userId).orderBy("completed_at", "desc").limit(100).execute();
  return rows.reverse().map((r) => ({ id: r.id, completedAt: new Date(r.completed_at), totalDurationMs: r.total_duration_ms }));
}

export async function getPerOperator(userId: string) {
  const rows = await db.selectFrom("question_logs")
    .innerJoin("sessions_drill", "sessions_drill.id", "question_logs.session_id")
    .select(["question_logs.operator as operator", sql<number>`avg(question_logs.duration_ms)::float`.as("avg_ms")])
    .where("sessions_drill.user_id", "=", userId).where("question_logs.question_index", ">=", 2)
    .groupBy("question_logs.operator").execute();
  const out: Partial<Record<Operator, number>> = {};
  for (const r of rows) out[r.operator] = Number(r.avg_ms);
  return out;
}

export async function getBenchmark(userId: string) {
  const me = await db.selectFrom("users").select([sql<string | null>`birth_date::text`.as("birth_date"), "gender"]).where("id", "=", userId).executeTakeFirst();
  if (!me?.birth_date || !me.gender || me.gender === "prefer_not_to_say") return { status: "no-profile" as const };
  const mine = await db.selectFrom("sessions_drill").select(sql<number>`min(total_duration_ms)`.as("best")).where("user_id", "=", userId).executeTakeFirst();
  if (mine?.best == null) return { status: "no-drills" as const };
  const myBand = ageBand(me.birth_date, new Date());
  // Cohort: each user's best time, restricted to the same gender and the same age band at the time of that drill.
  const { rows } = await sql<{ user_id: string; best: number }>`
    SELECT s.user_id, MIN(s.total_duration_ms)::int AS best
    FROM sessions_drill s JOIN users u ON u.id = s.user_id
    WHERE u.gender = ${me.gender} AND u.birth_date IS NOT NULL
      AND FLOOR(DATE_PART('year', AGE(s.completed_at, u.birth_date)) / 5) = ${myBand}
      AND s.rules_version = 1
    GROUP BY s.user_id`.execute(db);
  if (rows.length < MIN_COHORT) return { status: "insufficient" as const, cohortSize: rows.length };
  return { status: "ok" as const, percentile: percentileRank(rows.map((r) => r.best), Number(mine.best)), cohortSize: rows.length, bandLabel: `${myBand * 5}–${myBand * 5 + 4}` };
}
```

(Note: `ageBand` pure function and the SQL must agree; the SQL band uses completed-at age, `myBand` uses today's age. Both use whole-year age floor/5.) Tests PASS.

- [ ] **Step 4: `components/HistoryChart.tsx`** (client, Recharts `LineChart` in `ResponsiveContainer`): props `{ data: { label: string; seconds: number }[] }`; X = drill date, Y = seconds; single series, no legend; accessible `aria-label`; empty state "Complete a drill to see your history".
- [ ] **Step 5: `app/stats/page.tsx`** (server). Redirect to `/login` if no session. Fetch history, per-operator, benchmark in parallel. Render: best time & latest time; `<HistoryChart />`; per-operator table (`+ − × ÷`, avg seconds); benchmark card with the four statuses: ok → "Faster than {percentile.toFixed(0)}% of {cohortSize} people aged {bandLabel}", insufficient → "Not enough data yet ({cohortSize}/20)", no-profile → "Add your age and gender to see a benchmark" (sign-up fields are not editable in v1, so state "available for accounts created with age and gender"), no-drills → "Complete a drill first". List of the last 10 drills linking to `/results/[id]`.
- [ ] **Step 6: Verify.** `npm test`, `npm run build`. With a DB, insert drills and check the pages render, including a user with null profile (`no-profile`) and zero drills (empty states, no crash).
- [ ] **Step 7: Commit** `feat: stats page with history, per-operator and benchmark`.

---

### Task 9: End-to-end smoke test and setup docs

**Files:** Create `playwright.config.ts`, `e2e/drill.spec.ts`, `docs/SETUP.md`, `README.md`

**Interfaces:** Consumes the `data-testid`s `question`, `answer`, `total-time` and the Start button (accessible name "Start").

- [ ] **Step 1: `playwright.config.ts`**

```ts
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "e2e",
  webServer: { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: true, timeout: 120_000 },
  use: { baseURL: "http://localhost:3000" },
});
```

- [ ] **Step 2: `e2e/drill.spec.ts`** (guest flow needs no DB)

```ts
import { expect, test } from "@playwright/test";

function solve(text: string): number {
  const m = text.match(/(\d+)\s*([+−×÷-])\s*(\d+)/);
  if (!m) throw new Error("cannot parse: " + text);
  const a = Number(m[1]), b = Number(m[3]);
  return { "+": a + b, "−": a - b, "-": a - b, "×": a * b, "÷": a / b }[m[2] as "+"];
}

test("guest completes a 60-question drill and sees summary", async ({ page }) => {
  await page.goto("/drill");
  await page.getByRole("button", { name: "Start" }).click();
  const input = page.getByTestId("answer");
  for (let i = 0; i < 60; i++) {
    const text = await page.getByTestId("question").innerText();
    await input.pressSequentially(String(solve(text)));
  }
  await expect(page.getByTestId("total-time")).toBeVisible();
  await expect(page.getByText(/sign up to save/i)).toBeVisible();
});

test("wrong answer keeps the same question", async ({ page }) => {
  await page.goto("/drill");
  await page.getByRole("button", { name: "Start" }).click();
  const before = await page.getByTestId("question").innerText();
  const right = solve(before);
  const wrongSameLength = right === 9 ? 8 : right + 1 > 9 && String(right + 1).length !== String(right).length ? right - 1 : right + 1;
  await page.getByTestId("answer").pressSequentially(String(wrongSameLength));
  expect(await page.getByTestId("question").innerText()).toBe(before);
});

test("signup page rejects short password", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Email").fill("x@example.com");
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: /sign up/i }).click();
  await expect(page.getByText(/at least 8/i)).toBeVisible();
});
```

If the signup form shows a different message, align the message in `AuthForm` ("Password must be at least 8 characters") rather than loosening the test. (`right - 1` can be 0 when `right = 1`; since a wrong same-length answer of `0` is still wrong, this is fine. When `right === 1` and `right + 1 = 2` is used, the first branch applies.)

- [ ] **Step 3:** `npx playwright install chromium && npm run e2e` → PASS (fix real bugs found, not the test).
- [ ] **Step 4: `docs/SETUP.md`** with: (1) Neon: create project, copy pooled `DATABASE_URL` into `.env.local` and Vercel env, `npm run migrate`; (2) `AUTH_SECRET` via `openssl rand -base64 32`, set in Vercel; also `AUTH_URL`/`AUTH_TRUST_HOST=true` on Vercel; (3) GitHub: repo `mathtilde-com/web`, push `main`; (4) Vercel: import repo, production branch `main`, primary domain `mathtilde.com`, redirect `www` → apex; (5) Cloudflare: `A @ → 76.76.21.21`, `CNAME www → cname.vercel-dns.com`, SSL/TLS Full (strict) (set records to DNS-only first if cert issuance fails); (6) known limits: in-memory rate limiter is per-instance, no password reset/email verification, auth signup fields (age/gender) can't be edited after creation in v1.
- [ ] **Step 5: `README.md`**: what it is, `npm i`, env vars, `npm run migrate`, `npm run dev`, `npm test`, `npm run e2e`.
- [ ] **Step 6: Final verification:** `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run e2e` all pass; state exactly which were run and what was skipped (e.g. DB-dependent checks).
- [ ] **Step 7: Commit** `docs: setup guide, README, e2e smoke tests`. Do NOT push; ask the user to confirm creating/pushing `github.com/mathtilde-com/web`.

---

## Self-Review

- **Spec coverage:** drill rules (T2, T3), Q1 untimed + server total (T2, T3, T5/6), schema changes incl. `rules_version`/CHECKs/indexes (T4), guests 204 (T6), auth + optional profile (T6), summary/history/per-operator/benchmark with cohort 20 and 5-year bands (T7, T8), rate limits (T5, T6), tests (all), infra docs/no-push (T9). Numpad on touch (T7).
- **Types consistent:** `QuestionLog.expected` ↔ payload `expectedAnswer` ↔ DB `expected_answer` mapped in T6 Step 6 and T7 Step 5; `durationMs`/`attempts` mapped likewise.
- **Known soft spots flagged for the executor:** `kysely-neon` constructor options (T4 Step 4, with fallback), Auth.js v5 beta API drift, Recharts under React 19.
