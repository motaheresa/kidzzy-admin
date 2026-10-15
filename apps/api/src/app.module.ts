import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './modules/health/health.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { TenancyModule } from './modules/tenancy/tenancy.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), TenancyModule, PrismaModule, HealthModule],
})
export class AppModule {}
