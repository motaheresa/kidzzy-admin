import { Controller, Get, Query } from '@nestjs/common';
import type { FinanceReport, OverviewReport } from '@kidzzy/shared';
import { RequirePermission } from '../auth/access.decorators';
import { ReportPeriodQueryDto } from './dto/report-period.query';
import { ReportsService } from './reports.service';

/** Admin only: every route needs reports.read (scope any), so an instructor is refused by the guard. */
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @RequirePermission('reports.read')
  @Get('finance')
  finance(@Query() query: ReportPeriodQueryDto): Promise<FinanceReport> {
    return this.reports.finance(query);
  }

  @RequirePermission('reports.read')
  @Get('overview')
  overview(): Promise<OverviewReport> {
    return this.reports.overview();
  }
}
