# MathTilde Design (2026-10-06)

Source: `spec.md` (stack, infra, DB schema) plus decisions made in brainstorming. This doc supersedes `spec.md` where they differ.

## 1. Goal
A general-audience web app for a timed 60-question arithmetic drill (mixed `+ − × ÷`) that records per-question timing and attempts, and shows simple analytics and benchmarks. Minimal, neutral UI.

## 2. Stack
Next.js (App Router, TypeScript, Tailwind), Neon Postgres via `@neondatabase/serverless`, Kysely + `kysely-neon`, Auth.js (Credentials: email + password, JWT sessions), Recharts, Vitest, Playwright. Hosting: Vercel; DNS: Cloudflare (user-managed, see §10).

## 3. Drill rules
- 60 questions, operators mixed uniformly at random.
- Operands are integers 1-100 for all operators.
  - `+`: a, b in 1..100.
  - `-`: a >= b, result >= 0 (a, b in 1..100).
  - `*`: a, b in 1..100 (max answer 10,000, fits SMALLINT).
  - `/`: exact division only. Pick divisor b in 1..100 and quotient q such that a = b*q <= 100; num1 = a, num2 = b, answer = q (q >= 1).
- Q1 is an untimed warm-up: logged, but excluded from `total_duration_ms`. The clock starts when Q1 is answered correctly; `total_duration_ms` = sum of durations of Q2..Q60.
- Input: numeric field, auto-focused; auto-submits when typed length equals the digit count of the expected answer. A wrong answer clears the field, increments `attempts_count`, timer keeps running. Advance only on a correct answer. On-screen numpad on touch devices.
- Known tradeoff (accepted): auto-submit reveals the answer's digit count.

## 4. Architecture
1. `lib/drill/` - pure functions: `generateDrill(rng)`, `expectedAnswer(q)`, `isValidQuestion(q)`, `summarize(logs)`. No I/O; unit-tested. Seedable RNG for tests.
2. Drill UI (client component) - state machine `ready -> warmup(Q1) -> timed(Q2..Q60) -> done`; per-question timing via `performance.now()`; one payload POSTed at the end.
3. `POST /api/drills` - validates the payload, then stores the drill.
   - Re-checks every question: ranges, `expected_answer` matches `num1 op num2`, 60 questions, indices 1..60, `attempts_count >= 1`, durations sane.
   - Recomputes `total_duration_ms` server-side from Q2..Q60 durations (ignores client total).
   - Anonymous (no session): returns 204 and stores nothing; client shows the result locally with a "sign up to save" prompt.
4. Auth - Credentials provider, passwords hashed (argon2 or bcrypt), sign-up collects optional `birth_date` and `gender`. Validation with zod.
5. Data layer - Kysely typed DB interface, SQL migration files in `migrations/`, simple runner script (`npm run migrate`).
6. Analytics pages:
   - `/results/[id]` (and local result for guests): total time, accuracy (questions needing >1 attempt), slowest questions.
   - `/stats` (auth required): history line chart (total time per drill), per-operator average time, benchmark.
   - Benchmark = percentile of the user's latest/best total time among drills of users in the same age band and gender. Shown only if cohort has >= 20 distinct users; otherwise "not enough data yet". Age bands computed from `birth_date` at drill time (5-year bands).

## 5. Schema
As in `spec.md` with these changes:
- `sessions_drill.rules_version SMALLINT NOT NULL DEFAULT 1` so benchmarks stay comparable if rules change.
- `question_logs.operator` stays `VARCHAR(1)`; add CHECK constraints for operator set, `question_index BETWEEN 1 AND 60`.
- `sessions_drill.user_id` is NOT NULL (guest drills are never stored).
- Migration also adds index `idx_sessions_completed (user_id, completed_at)`.

## 6. Error handling
- API: 400 on invalid payload (generic message), 401 not needed for guests (204), 500 logged without leaking details.
- Network failure on save: client retries once and offers "retry save" while keeping the result in memory.
- Auth: generic "invalid email or password"; duplicate-email handled on sign-up.

## 7. Security
Rate limit auth and drill endpoints (basic in-memory/edge limit in v1), hash passwords, never trust client totals, parameterized queries via Kysely, secrets only in env (`DATABASE_URL`, `AUTH_SECRET`).

## 8. Testing
- Vitest: generator invariants over many seeds (ranges, exact division, no negatives), answer-length logic, scoring, API validation (accept valid, reject tampered).
- Playwright: one full guest drill smoke test, and sign-up -> drill -> saved result.

## 9. Out of scope (v1)
Single-operator drills, difficulty levels, leaderboards, password reset/email verification, social login, i18n.

## 10. Infra and delivery
- I build code and migrations; git repo initialized locally. Push to `github.com/mathtilde-com/web` only after explicit confirmation.
- User handles Vercel project, Cloudflare DNS (A `@` -> 76.76.21.21, CNAME `www` -> cname.vercel-dns.com, SSL Full strict), Neon database and env vars. A setup checklist (`docs/SETUP.md`) will be provided.
- Neon: user supplies `DATABASE_URL` (optionally via Neon skills).
