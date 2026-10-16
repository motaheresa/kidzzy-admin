import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './common/config/env.validation';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { InstructorsModule } from './modules/instructors/instructors.module';
import { StudentsModule } from './modules/students/students.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { TenancyModule } from './modules/tenancy/tenancy.module';

@Module({
  imports: [
    // validateEnv runs once, before anything starts: a bad variable stops the API at startup.
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    TenancyModule,
    PrismaModule,
    AuthModule,
    HealthModule,
    InstructorsModule,
    StudentsModule,
  ],
})
export class AppModule {}
