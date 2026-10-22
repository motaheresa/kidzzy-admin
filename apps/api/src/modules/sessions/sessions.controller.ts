import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import type { Page, Session } from '@kidzzy/shared';
import { RequirePermission } from '../auth/access.decorators';
import { ListSessionsQueryDto } from './dto/list-sessions.query';
import { SessionsService } from './sessions.service';

/**
 * /sessions (US-12). HTTP only: the DTO in, a service call, the mapped response out.
 * Each route's permission matches its x-permission in openapi.yaml.
 */
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @RequirePermission('sessions.read')
  @Get()
  list(@Query() query: ListSessionsQueryDto): Promise<Page<Session>> {
    return this.sessions.list(query);
  }

  @RequirePermission('sessions.read')
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<Session> {
    return this.sessions.get(id);
  }
}
