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

Prerequisites: [Node.js 22](https://nodejs.org), [PostgreSQL 16](https://www.postgresql.org/download/) and Git. No Docker needed.

### One-time PostgreSQL setup (Windows)

1. Download the PostgreSQL **16** installer from <https://www.postgresql.org/download/windows/>.
2. In the components step, keep **PostgreSQL Server** and **Command Line Tools**; pgAdmin and Stack Builder are optional and can be unticked to save space.
3. Set a password for the `postgres` superuser and keep port `5432`. PostgreSQL then runs as a Windows service and starts with the machine.
4. Create the app's user and database (enter the `postgres` password when asked):

```powershell
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -c "CREATE USER kidzzy WITH PASSWORD 'kidzzy' CREATEDB;"
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -c "CREATE DATABASE kidzzy_admin OWNER kidzzy;"
```

`CREATEDB` is needed because `prisma migrate dev` creates a temporary shadow database to check each migration.

### Run the project

```powershell
# 1. Enable pnpm (ships with Node through Corepack)
corepack enable

# 2. Install dependencies (also builds packages/shared and sets up git hooks)
pnpm install

# 3. Create the API environment file (its DATABASE_URL matches the user created above)
copy apps\api\.env.example apps\api\.env     # macOS/Linux: cp apps/api/.env.example apps/api/.env

# 4. Create the tables, then add the permission catalog, the academy, its roles and the first admin
pnpm --filter @kidzzy/api prisma:migrate
pnpm --filter @kidzzy/api prisma:seed

# 5. Run API and web app together
pnpm dev
```

In `apps/api/.env`, set `JWT_ACCESS_SECRET` to a long random value, and set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` before step 4 so the seed creates an admin you can log in with.

After pulling changes that add a migration, run step 4 again: `prisma:migrate` applies new migrations, and the seed is safe to repeat.

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
| `pnpm --filter @kidzzy/api prisma:seed`    | Seed permissions, academy and roles      |

## Project documents

Requirements and design live in Claude Docs and are linked from [`docs/README.md`](docs/README.md). Architecture decisions are in [`docs/adr`](docs/adr), and the API contract is [`docs/api/openapi.yaml`](docs/api/openapi.yaml).

Work is tracked in Jira (project `SCRUM`); see [CONTRIBUTING.md](CONTRIBUTING.md) for branches, commits and pull requests.
