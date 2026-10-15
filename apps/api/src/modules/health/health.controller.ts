import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/public.decorator';

/** GET /api/v1/health: liveness check for monitoring (API spec operation `health`). */
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
