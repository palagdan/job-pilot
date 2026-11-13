# JobPilot

Turborepo monorepo, TypeScript everywhere.

| App        | Stack                                   | Lint / format     | Port |
| ---------- | --------------------------------------- | ----------------- | ---- |
| `apps/web` | Next.js 16 (Turbopack) + React Compiler | Oxlint            | 3000 |
| `apps/api` | Hono on Node                            | Biome             | 3001 |

| Package           | What                                                        |
| ----------------- | ----------------------------------------------------------- |
| `packages/shared` | Contracts: enums, zod DTOs, API route map, error shape      |
| `packages/db`     | Persistence: Drizzle schema, migrations, client, seed       |
| `packages/config` | Env validation (`parseEnv` + fragments)                     |
| `packages/logger` | Logging port + pino adapter (pretty in dev, JSON otherwise) |
| `packages/storage`| File storage port + S3 adapter (RustFS/R2/S3), signed URLs  |
| `packages/jobs`   | Background job contract + typed pg-boss client              |
| `packages/llm`    | Featherless LLM layer                                       |

Conventions: kebab-case file names (enforced by both linters), no `index.*` files — entry points are `main.ts`,
packages expose explicit subpaths (`@job-pilot/shared/targets`).

## Requirements

- Node.js >= 24
- pnpm 11
- Docker (with Compose)

## Getting started

```sh
pnpm install
cp .env.example .env   # then set BETTER_AUTH_SECRET=$(openssl rand -base64 32)
pnpm infra:up       # Postgres, object storage, Mailpit (waits until healthy)
pnpm db:migrate
pnpm db:seed        # demo user + starter sources
pnpm dev            # runs web + api
```

Google sign-in (optional locally): create an OAuth client (type Web) in Google Cloud, add the redirect URI
`http://localhost:3000/api/auth/callback/google`, and set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `.env`.
Without them the api runs, but sign-in is disabled. The browser reaches the api only through the web app
(Next rewrites `/api/auth/*` and `/v1/*` to `API_URL`).

Local sign-in without Google: run `pnpm db:seed`, open the app and press **Dev: sign in as demo user**
(`POST /api/dev/sign-in`, mounted by the api only when `NODE_ENV=development`). The seed gives the demo user a
confirmed master CV, new Today cards and a pipeline item in every status. Re-running it **replaces** the demo user's
opportunities, pipeline, CVs and runs (uploads are kept).

Web Push (optional locally): `pnpm push:keys`, put the pair into `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`, restart, then
switch Push on in Profile and targets. Browsers allow push on `http://localhost`.
UI reference: `/design-system` shows every token and component state.

Integration tests run against the docker services when `TEST_DATABASE_URL` / `TEST_S3_ENDPOINT` are set
(values in `.env.example`): `TEST_DATABASE_URL=… TEST_S3_ENDPOINT=… pnpm test`.

Local services:

| Service              | URL                                         | Credentials                 |
| -------------------- | ------------------------------------------- | --------------------------- |
| Postgres             | `postgres://localhost:5432/jobpilot`        | `jobpilot` / `jobpilot`     |
| Postgres (tests)     | `postgres://localhost:5432/jobpilot_test`   | same                        |
| S3 API (RustFS)      | `http://localhost:9000`, bucket `jobpilot`  | `jobpilot` / `jobpilot-secret` |
| Storage console      | `http://localhost:9001`                     | same                        |
| Mailpit (email inbox)| `http://localhost:8025` (SMTP on 1025)      | —                           |

## Scripts

| Script                         | What                                                        |
| ------------------------------ | ----------------------------------------------------------- |
| `pnpm infra:up` / `infra:down` | Start / stop local services                                 |
| `pnpm infra:reset`             | Stop and **delete all local data volumes**, start again     |
| `pnpm db:generate`             | Create a migration from schema changes (`packages/db/src/schema`) |
| `pnpm db:migrate`              | Apply migrations                                            |
| `pnpm db:seed`                 | Seed sources + demo user with data (re-run resets the demo user; local DB only) |
| `pnpm push:keys`               | Generate a VAPID key pair for Web Push                      |
| `pnpm db:reset`                | Drop the local DB schema, migrate, seed (local DB only)     |
| `pnpm db:studio`               | Drizzle Studio                                              |
| `pnpm lint` / `typecheck` / `build` | All packages via Turborepo                             |
