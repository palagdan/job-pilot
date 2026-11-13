# JobPilot

Turborepo monorepo, TypeScript everywhere.

| App        | Stack                                   | Lint / format     | Port |
| ---------- | --------------------------------------- | ----------------- | ---- |
| `apps/web` | Next.js 16 (Turbopack) + React Compiler | Oxlint            | 3000 |
| `apps/api` | Hono on Node                            | Biome             | 3001 |

Conventions: kebab-case file names (enforced by both linters), no `index.*` files — entry points are `main.ts`.

## Requirements

- Node.js >= 24
- pnpm 11

## Getting started

```sh
pnpm install
pnpm dev        # runs web + api
pnpm build
pnpm lint
pnpm typecheck
```
