// Seeds the data every environment needs: the permission catalog, the academy, its system
// roles and, when SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are set, the first admin.
// Run with `pnpm --filter @kidzzy/api prisma:seed`; safe to run more than once.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { seedAccess } from './seed/access.seed';
import { seedAdmin } from './seed/admin.seed';

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

    const email = process.env.SEED_ADMIN_EMAIL;
    const password = process.env.SEED_ADMIN_PASSWORD;
    if (email && password) {
      const result = await seedAdmin(prisma, academyId, {
        name: process.env.SEED_ADMIN_NAME || 'Admin',
        email,
        password,
      });
      console.log(
        result === 'created' ? `Created admin ${email}` : `Admin ${email} already exists`,
      );
    } else {
      console.log('No SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD: skipped the first admin');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
