import { Controller, Get } from '@nestjs/common';

/** GET /api/v1/health: liveness check for monitoring (API spec operation `health`). */
@Controller('health')
export class HealthController {
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
