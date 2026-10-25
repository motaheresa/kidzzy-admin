import { Controller, Get, Query } from '@nestjs/common';
import type { AuditLog, Page } from '@kidzzy/shared';
import { RequirePermission } from '../auth/access.decorators';
import { AuditService } from './audit.service';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs.query';

/** /audit-logs (US-35): the admin reads the log. HTTP only; the permission matches x-permission. */
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @RequirePermission('audit.read')
  @Get()
  list(@Query() query: ListAuditLogsQueryDto): Promise<Page<AuditLog>> {
    return this.audit.list(query);
  }
}
