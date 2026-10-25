import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditRepository } from './audit.repository';
import { AuditService } from './audit.service';

/**
 * The audit log (NFR-06, US-35): who changed what and when. Other modules call AuditService from
 * their own transactions, and the admin reads the log through GET /audit-logs. AccessContext comes
 * from the global AuthModule.
 */
@Module({
  controllers: [AuditController],
  providers: [AuditRepository, AuditService],
  exports: [AuditService],
})
export class AuditModule {}
