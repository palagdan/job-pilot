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

Conventions: kebab-case file names (enforced by both linters), no `index.*` files — entry points are `main.ts`,
packages expose explicit subpaths (`@job-pilot/shared/targets`).

## Requirements

- Node.js >= 24
- pnpm 11
- Docker (with Compose)

## Getting started

```sh
pnpm install
cp .env.example .env
pnpm infra:up       # Postgres, object storage, Mailpit (waits until healthy)
pnpm db:migrate
pnpm db:seed        # demo user + starter sources
pnpm dev            # runs web + api
```

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
| `pnpm db:seed`                 | Seed demo data (safe to re-run; local DB only)              |
| `pnpm db:reset`                | Drop the local DB schema, migrate, seed (local DB only)     |
| `pnpm db:studio`               | Drizzle Studio                                              |
| `pnpm lint` / `typecheck` / `build` | All packages via Turborepo                             |
