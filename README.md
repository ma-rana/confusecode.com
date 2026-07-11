# ConfuseCode

> **Learn debugging, not copy-pasting. Find the problem, understand the problem,
> and solve it yourself.**

A learning-focused static code reviewer for JavaScript & TypeScript. It finds
issues and explains why they matter — it never fixes your code for you. Built to
teach, not to solve.

This repository is **Phase 1 (the MVP)** from the Master Design Document: paste
code → real ESLint findings, deployed end to end. No database, no accounts, no AI,
no teaching-card layer yet (that's Phase 2).

---

## Structure

```
confusecode/
├── backend/     Node + TypeScript API (Fastify). Validates → routes → analyzes.
│   └── src/
│       ├── config.ts          all caps/limits in one place
│       ├── validate.ts        server-side input validation (the security boundary)
│       ├── router.ts          language router seam (one route: JS/TS → ESLint)
│       ├── eslint-worker.ts   runs INSIDE a worker thread — parse-only, never executes code
│       ├── analyze.ts         spawns the worker with a hard wall-clock timeout
│       ├── semaphore.ts       concurrency cap
│       └── server.ts          the pipeline: validate → rate-limit → route → analyze → JSON
└── frontend/    Next.js + TypeScript. Monaco editor + Analyze + findings list.
    └── app/
        ├── page.tsx           the workbench
        ├── components/Findings.tsx
        ├── types.ts
        └── globals.css        the visual identity
```

The two run as separate processes, matching the design doc's topology: both bind
to localhost; in production only Caddy is public and proxies to them.

---

## Run it locally

You need **Node.js 22.9+** (22 LTS). The backend reads `backend/.env` via Node's
built-in `--env-file-if-exists` — no dotenv dependency — and that flag needs 22.9.
If there's no `.env`, the backend simply boots in stateless mode.

Open two terminals.

### 1. Backend

```bash
cd backend
npm install
npm run dev          # tsx watch — http://127.0.0.1:4000
```

Check it:

```bash
curl http://127.0.0.1:4000/health          # {"status":"ok"}
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev          # http://127.0.0.1:3000
```

Open <http://localhost:3000>, paste some broken JS/TS, and press **Analyze**.
The frontend proxies `/api/*` to the backend automatically (see
`frontend/next.config.mjs`), so everything is same-origin from the browser's view.

### Production build

```bash
cd backend  && npm run build && npm start   # compiles to dist/, runs node
cd frontend && npm run build && npm start
```

Deployment (VPS, Caddy, systemd, firewall) is covered step-by-step in the Phase 0
and Phase 1 setup checklists.

---

## What's enforced (Phase 1)

- **Input validation, server-side** — extension allow-list, ~1 MB size cap,
  line-count and line-length caps, nesting-depth guard, binary/null-byte
  rejection. Fails closed. Client checks are UX only; the server is the boundary.
- **Parse-only isolation** — ESLint runs in a worker thread with a hard wall-clock
  timeout. Submitted code is never executed (no eval/import/require/Function/vm).
- **DoS resistance** — per-IP rate limiting (429 + Retry-After) and a concurrency
  cap (503 + Retry-After).
- **Statelessness** — code is analyzed then discarded. Nothing is stored. Request
  bodies are never logged.
- **XSS discipline** — findings render as escaped text; no `dangerouslySetInnerHTML`
  with user-derived content.

## Accounts & learning history (Phase 5) — optional

Signing in is optional and changes **nothing** about how code is analyzed. With
no account, ConfuseCode is exactly what it always was: paste code, get cards,
nothing leaves the browser.

An account adds one thing — a memory of the *issues* you've worked through, so a
card can tell you **"you've hit this 5× before, and fixed it once."** That's the
whole feature. It stores rules, concepts and outcomes; it never stores your code,
your filenames, or the lines an issue was on.

The layer is strictly opt-in, twice over: signing in doesn't imply consent to be
remembered (a separate switch does), and if `DATABASE_URL`/`COOKIE_SECRET` aren't
set, the server boots stateless with no pool, no cookies, and no account routes
at all.

Setup, schema, routes and the security posture: **[`backend/db/README.md`](backend/db/README.md)**.
