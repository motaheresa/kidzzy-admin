import { Module } from '@nestjs/common';
import { AuditRepository } from './audit.repository';
import { AuditService } from './audit.service';

/**
 * The audit log (NFR-06, US-35): who changed what and when. Other modules call AuditService from
 * their own transactions. Reading the log is a later story. AccessContext comes from the global
 * AuthModule.
 */
@Module({
  providers: [AuditRepository, AuditService],
  exports: [AuditService],
})
export class AuditModule {}
