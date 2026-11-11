import { Controller, Get } from '@nestjs/common';
import type { Dashboard } from '@kidzzy/shared';
import { RequirePermission } from '../auth/access.decorators';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /** Admin only (dashboard.read has scope any): an instructor is refused by the guard. */
  @RequirePermission('dashboard.read')
  @Get()
  get(): Promise<Dashboard> {
    return this.dashboard.get();
  }
}
