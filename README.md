# CrossBorderTransferMechanismRegister

CrossBorderTransferMechanismRegister is a privacy-compliance platform that tracks every cross-border personal-data flow inside an organization and proves each one is covered by a valid GDPR Chapter V transfer mechanism (SCCs, adequacy decision, or BCRs) backed by a documented Transfer Impact Assessment (TIA).

It is the system of record for the legal transfer layer: the register of flows, the mechanism that lawfully covers each flow, the TIA that justifies that mechanism, and the audit-ready export that a DPA examiner or accountability review can rely on. Every flow resolves to a coverage state (Covered, Gap, Expiring, At-Risk, Under-Review) computed deterministically by the mechanism-validity engine from the attached mechanism, its expiry, the destination's adequacy status, and the TIA outcome.

See `docs/idea.md` for the full product specification, target users, and the complete feature list (Transfer-Flow Register, Mechanism Validity Engine, TIA Workflow, adequacy tracker, SCC lifecycle, onward-transfer map, and audit export).

## Stack

- **Backend:** Hono (Node, ESM) running on `@hono/node-server`, with Drizzle ORM over a Neon Postgres database. Zod for request validation. Runs directly from TypeScript via `node --import tsx/esm`, no build step at runtime.
- **Frontend:** Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS 4. Authentication via `@neondatabase/auth` (Neon Auth).
- **Auth model:** The Next.js server resolves the session and proxies requests to the backend through `/api/proxy/*`, injecting an `X-User-Id` header that the backend trusts.
- **Database:** Neon Postgres. Tables are provisioned out-of-band (Drizzle schema push / Neon console); the backend seeds sample data idempotently on first boot but does not create its own tables.

## Local Development

Prerequisites: Node 22, pnpm, and a Neon Postgres connection string.

Install dependencies and run both services:

```bash
# Backend (Hono API) — http://localhost:3001
cd backend
pnpm install
pnpm dev

# Frontend (Next.js) — http://localhost:3000
cd web
pnpm install
pnpm dev
```

The backend listens on port 3001 and the web app on port 3000 by default. Alternatively, bring both up together with Docker:

```bash
docker compose up
```

## Environment Variables

### Backend (`backend/.env`)

```
PORT=3001
DATABASE_URL=postgres://user:password@host/db?sslmode=require
FRONTEND_URL=http://localhost:3000
ADMIN_USER_IDS=
```

### Frontend (`web/.env.local`)

```
NEON_AUTH_BASE_URL=https://<endpoint>.neonauth.<region>.aws.neon.tech/<db>/auth
NEON_AUTH_COOKIE_SECRET=<random 32-byte hex>
NEXT_PUBLIC_API_URL=http://localhost:3001
```

`NEXT_PUBLIC_API_URL` is the only `NEXT_PUBLIC_*` variable; it is baked into the bundle at build time and read by the proxy route. The `NEON_AUTH_*` variables are server-only.

## Deployment

- **Backend** deploys to Render as a Node web service (see `render.yaml`): build `cd backend && pnpm install`, start `cd backend && node --import tsx/esm src/index.ts`. Set `DATABASE_URL` and `FRONTEND_URL` as Render environment variables.
- **Frontend** deploys to Vercel with root directory `web`, framework `nextjs`, Node 22.x.

## Pricing

All features are free for signed-in users. There is no paid tier or billing gate; every capability described in `docs/idea.md` is available to any authenticated account.
