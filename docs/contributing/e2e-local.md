# Running a signed-in e2e spec on the local stack

Measured on 2026-09-23 (Windows 11, PR E1). A signed-in spec that WRITES needs
three things the CI job provides and a bare `npm run dev` does not.

## 1. The local Supabase stack, never production

Use the CLI version the CI uses:

```bash
npx supabase@2.84.2 status -o env
```

`API_URL` must contain `127.0.0.1`. Every writing spec refuses to start
otherwise.

## 2. A rate limiter that answers

`rateLimit()` fails CLOSED on mutations when its Redis cannot be reached: the
server logs `Rate limit upstream error`, the action returns
`errors.session.rateLimited`, and a spec sees a tap that "did nothing". The
login may still pass, which makes this hard to spot.

The CI job runs Redis behind a Serverless-Redis-HTTP gateway on port 8079
(`.github/workflows/ci.yml`, service `srh`). Do the same locally:

```bash
docker network create e2e-rl
docker run -d --name redis --network e2e-rl redis:7-alpine
docker run -d --name e2e-srh --network e2e-rl -p 8079:80 \
  -e SRH_MODE=env -e SRH_TOKEN=ci-local-not-a-secret \
  -e SRH_CONNECTION_STRING=redis://redis:6379 \
  hiett/serverless-redis-http@sha256:5b0bb9239fce53abf87b2018a7a0deb9ec7bd900c5360738fe5fbeeb426f9150
```

The container named `redis` matters: SRH reaches Redis by that name.

## 3. A dev server wired to both, on its own port

Pick a free port (3107 below). Start Next with the local keys and the local limiter in the PROCESS
environment (it wins over `.env.local`):

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` from `supabase status -o env`;
- `UPSTASH_REDIS_REST_URL=http://localhost:8079`,
  `UPSTASH_REDIS_REST_TOKEN=ci-local-not-a-secret`;
- `npx next dev -p 3107`.

Load `/login` once and wait for HTTP 200 before running anything.

## 4. Run the spec

Same three Supabase variables, plus `E2E_SUPABASE_READY=1` and
`E2E_BASE_URL=http://localhost:3107`, then:

```bash
npx playwright test e2e/<spec>.spec.ts --project=chromium-desktop --workers=1
```

## 5. Looking at a signed-in screen (capture, manual check)

`e2e/helpers/seed.ts` creates a RANDOM account per test and deletes it
afterwards: there is no fixed login there. The fixed, fictitious account of the
local stack comes from `scripts/dev/seed-profil-test.mjs` (both scripts refuse
any non-local URL):

```bash
node scripts/dev/seed-profil-test.mjs    # bills, a repayment plan, expenses
node scripts/dev/seed-vie-complete.mjs   # accounts, a second commitment, payments
```

Same three Supabase variables in the environment. Then sign in on
`/fr-BE/login` with:

- email: `ankora-test-profil@ankora.test`
- password: `TestProfil!2026`

Local stack only: this account does not exist anywhere else, and these values
are not secrets. After login, go straight to `/fr-BE/app/charges` or
`/fr-BE/app/commitments`.

## Traps met on the way

- **A tap before hydration does nothing** under `next dev` (first compile of a
  route). Retry a gesture only while its effect is absent (database row,
  `aria-expanded`), never blindly: a second tap would undo a late first one.
- **"Trop de tentatives"** at login after a dozen runs: flushing the local
  Redis did not clear it. Cause not established. One lead from review: a
  second browser context opened with `browser.newContext()` does not inherit
  the fixture's per-test `x-forwarded-for` header nor its consent seed, so all
  its logins share one address. Give such a context the same header.
- Stop what you started: the dev server, `e2e-srh`, `redis`, the network.
