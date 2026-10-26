# Cross-Border-Payments

A EUR → INR transfer cost comparison tool. Fetches the live interbank rate and real bank-published forex rates (currently HDFC and SBI, pulled from each bank's own published rate-card PDF), and ranks providers by what you'd actually receive — not by the rate they advertise.

See `docs/prd-eur-inr-comparison.md` for the product requirements this was built against, and `docs/superpowers/plans/` for how each piece was implemented (task-by-task plans with tests specified up front).

## Requirements

- Node.js 20+ (built and tested on Node 26)
- Internet access at runtime — the app makes live calls to `frankfurter.dev` (interbank rate) and each bank's own PDF server; there's no offline/mock mode for local dev

## Setup

```bash
npm install
```

## Running it

```bash
npm run dev
```

Then open `http://localhost:3000`. The first comparison takes a few seconds (real network fetch + PDF parsing for each bank); results are cached afterward — in a SQLite file at `data/cache.sqlite`, which persists across restarts and is git-ignored.

To see the raw API response directly:

```bash
curl "http://localhost:3000/api/compare?amount=1000"
```

## Tests

```bash
npm test          # run once
npm run test:watch  # re-run on change
```

All of this project's business logic (`lib/`) is unit-tested with Jest, independent of the live network calls — tests inject fake fetch/clock dependencies rather than hitting real banks. `npx tsc --noEmit` comes back clean. `npm run lint` has one known, deliberately-deferred finding (`lib/types.ts`, an `any` in a fetch-response type that's narrowed immediately after) — everything else should be clean.

## Deploying with Docker

```bash
docker compose up -d --build
```

This builds a production image (`npm run build` inside the container, so
`better-sqlite3` and `pdf-parse`'s native pieces compile for the container's
own platform rather than your host's) and serves it on `http://localhost:3030`.
The SQLite cache lives in a named Docker volume (`cache-data`), so it survives
container restarts and rebuilds the same way `data/cache.sqlite` does locally.

Not using `output: "standalone"` here on purpose: its dependency tracer
dropped `pdfjs-dist`'s optional `@napi-rs/canvas` dependency (needed at
runtime even for text-only PDF extraction), crashing every `/api/compare`
request. Shipping the full `node_modules` avoids re-litigating that for every
native dependency.

## Project layout

- `lib/` — the actual logic: benchmark rate fetching + caching, provider quote fetching (PDF parsing) + caching, cost computation/ranking, the SQLite-backed key-value store.
- `app/api/compare/route.ts` — the API route composing the above into one response.
- `app/page.tsx` — the UI (a client-rendered page; the amount you enter triggers a live fetch against the API route).
- `tests/` — mirrors `lib/`, one test file per module.
- `docs/prd-eur-inr-comparison.md` — the product spec.
- `docs/superpowers/plans/` — implementation plans, one per feature slice, each with its own task breakdown and test cases.
- `docs/superpowers/README.md` — the development workflow this repo follows (plan → TDD build → review → finish), for anyone picking up a branch.
