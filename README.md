# MathTilde

Timed 60-question arithmetic drill (`+ − × ÷`, operands 1–100) with per-question timing, accounts, history and benchmarks. See `docs/superpowers/specs/` for the design and `docs/SETUP.md` for deployment.

```bash
npm install
cp .env.example .env.local   # set DATABASE_URL and AUTH_SECRET
npm run migrate
npm run dev
npm test        # unit tests
npm run e2e     # Playwright (starts its own server on :3100)
```
