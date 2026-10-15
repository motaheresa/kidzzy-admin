// Seeds the data every environment needs: the permission catalog, the academy and its
// system roles. Run with `pnpm --filter @kidzzy/api prisma:seed`; safe to run more than once.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { seedAccess } from './seed/access.seed';

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set (see apps/api/.env.example)');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const { academyId } = await seedAccess(prisma, {
      name: process.env.SEED_ACADEMY_NAME ?? 'KidzzyCoders',
      timezone: process.env.SEED_ACADEMY_TIMEZONE ?? 'Africa/Cairo',
    });
    console.log(`Seeded permissions and system roles for academy ${academyId}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
