import { Module } from '@nestjs/common';
import { AcademyRepository } from './academy.repository';

/** Academies (tenants). For now only what the jobs and the generator read. */
@Module({ providers: [AcademyRepository], exports: [AcademyRepository] })
export class AcademiesModule {}
