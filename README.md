# KidzzyCoders Academy Management System

Internal system for KidzzyCoders to manage instructors, students, groups, sessions, attendance, payments and reminders. V1 serves one academy; the design is multi-tenant so the product can later be sold to other academies.

| Part         | Path              | Stack                                           |
| ------------ | ----------------- | ----------------------------------------------- |
| API          | `apps/api`        | NestJS 11, Prisma 7, PostgreSQL 16              |
| Web app      | `apps/web`        | React 19, Vite, Tailwind CSS 4, PWA, Arabic RTL |
| Shared types | `packages/shared` | Enums and API types used by both apps           |
| Docs         | `docs`            | ADRs and the OpenAPI spec                       |

Production: <https://app.kidzzy-coders.com> · API: `/api/v1`

## Run it locally (Windows, macOS or Linux)

Prerequisites: [Node.js 22](https://nodejs.org), [Docker Desktop](https://www.docker.com/products/docker-desktop/) and Git.

```powershell
# 1. Enable pnpm (ships with Node through Corepack)
corepack enable

# 2. Install dependencies (also builds packages/shared and sets up git hooks)
pnpm install

# 3. Start PostgreSQL in Docker
pnpm db:up

# 4. Create the API environment file
copy apps\api\.env.example apps\api\.env     # macOS/Linux: cp apps/api/.env.example apps/api/.env

# 5. Run API and web app together
pnpm dev
```

- Web app: <http://localhost:5173> (calls the API through the Vite proxy, same as production)
- API health: <http://localhost:3000/api/v1/health>

## Everyday commands

| Command                                    | What it does                             |
| ------------------------------------------ | ---------------------------------------- |
| `pnpm dev`                                 | API and web app in watch mode            |
| `pnpm lint` / `pnpm typecheck`             | ESLint / TypeScript across the workspace |
| `pnpm test` / `pnpm test:e2e`              | Unit tests / API end-to-end tests        |
| `pnpm build`                               | Production builds                        |
| `pnpm lint:api-spec`                       | Validate `docs/api/openapi.yaml`         |
| `pnpm --filter @kidzzy/api prisma:migrate` | Create and apply a migration             |
| `pnpm db:up` / `pnpm db:down`              | Start / stop local PostgreSQL            |

## Project documents

Requirements and design live in Claude Docs and are linked from [`docs/README.md`](docs/README.md). Architecture decisions are in [`docs/adr`](docs/adr), and the API contract is [`docs/api/openapi.yaml`](docs/api/openapi.yaml).

Work is tracked in Jira (project `SCRUM`); see [CONTRIBUTING.md](CONTRIBUTING.md) for branches, commits and pull requests.
