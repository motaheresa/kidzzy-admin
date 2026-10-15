import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // `prisma generate` runs on every `pnpm install` and never connects, so a fresh clone
    // without apps/api/.env must still load this file. Commands that connect fail with a
    // clear connection error until DATABASE_URL is set.
    url: process.env.DATABASE_URL ?? 'postgresql://set-DATABASE_URL-in-apps-api-.env',
  },
});
