# App Build Specification: MathTilde (mathtilde.com)

## 1. Overview & Architecture

MathTilde (`mathtilde.com`) is a lightweight, high-performance web application designed for timed arithmetic practice (Addition, Subtraction, Multiplication, Division). Users complete a 60-question drill as fast as possible, while the application captures granular per-question timing data to power simple analytics and performance benchmarks.

### Tech Stack & Operations
*   **Domain & DNS:** `mathtilde.com` (Managed via Cloudflare DNS & Proxy)
*   **GitHub Organization:** [`github.com/mathtilde-com`](https://github.com/mathtilde-com)
*   **Frontend & API Framework:** Next.js (App Router, TypeScript, Tailwind CSS)
*   **Hosting & Continuous Deployment:** Vercel (Auto-deploy on `main` branch push from `mathtilde-com` GitHub repositories)
*   **Database:** Neon (Serverless PostgreSQL via `@neondatabase/serverless`)
*   **Query Builder & Type Safety:** Kysely (with `kysely-neon` dialect)
*   **Authentication:** NextAuth.js / Auth.js (Credentials provider: Email & Password)
*   **Charts:** Recharts / Chart.js

---

## 2. Infrastructure & Routing Setup

### 2.1 Cloudflare + Vercel Integration
1.  **DNS Configuration (Cloudflare):**
    *   `A` record `@` pointing to Vercel IP (`76.76.21.21`).
    *   `CNAME` record `www` pointing to `cname.vercel-dns.com`.
    *   SSL/TLS encryption mode set to **Full (strict)** in Cloudflare.
2.  **Vercel Configuration:**
    *   Primary Domain: `mathtilde.com`
    *   Redirect `www.mathtilde.com` -> `mathtilde.com`
3.  **Deployment Pipeline:**
    *   Repository hosted under `github.com/mathtilde-com/web` (or primary app repo).
    *   Automated preview deployments for Pull Requests.
    *   Automated production deployments on merges to `main`.

---

## 3. Database Schema & Kysely Types

### 3.1 Migration DDL (Neon PostgreSQL)

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  birth_date DATE,
  gender VARCHAR(20), -- 'male', 'female', 'non-binary', 'other', 'prefer_not_to_say'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE sessions_drill (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  total_duration_ms INTEGER NOT NULL, -- Sum of timed questions (Q2 through Q60)
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE question_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions_drill(id) ON DELETE CASCADE,
  question_index SMALLINT NOT NULL, -- 1 to 60
  num1 SMALLINT NOT NULL,
  num2 SMALLINT NOT NULL,
  operator VARCHAR(1) NOT NULL, -- '+', '-', '*', '/'
  expected_answer SMALLINT NOT NULL,
  attempts_count SMALLINT NOT NULL DEFAULT 1,
  duration_ms INTEGER NOT NULL, -- Time spent on this specific question
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sessions_user ON sessions_drill(user_id);
CREATE INDEX idx_logs_session ON question_logs(session_id);