# MathTilde setup checklist

1. **Neon** – create a project, copy the *pooled* connection string into `.env.local` as `DATABASE_URL` (and into Vercel env vars). Run `npm run migrate`.
2. **Auth secret** – `openssl rand -base64 32` → `AUTH_SECRET` in `.env.local` and Vercel. On Vercel also set `AUTH_TRUST_HOST=true`.
3. **GitHub** – create `github.com/mathtilde-com/web` and push `main`.
4. **Vercel** – import the repo, production branch `main`, add env vars, set primary domain `mathtilde.com`, redirect `www.mathtilde.com` → `mathtilde.com`.
5. **Cloudflare DNS** – `A @ → 76.76.21.21`, `CNAME www → cname.vercel-dns.com`, SSL/TLS mode **Full (strict)**. If certificate issuance fails, set the records to DNS-only until Vercel issues the cert.

## Known limits (v1)
- The rate limiter is in-memory, so it is per server instance only (login failures are counted per IP+email and per IP).
- No password reset or email verification.
- Birth date and gender are set at signup and can't be edited afterwards; benchmarks need both.
- Benchmarks compare your all-time best with each cohort member's best in your current 5-year age band.
- `kysely-neon` is installed but unused: the HTTP driver has no transactions, so the app uses Kysely's `PostgresDialect` with Neon's WebSocket `Pool`.
