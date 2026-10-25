import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { Session } from '@kidzzy/shared';
import { RequirePermission } from '../auth/access.decorators';
import { CreateSessionDto } from './dto/create-session.dto';
import { SessionsService } from './sessions.service';

/**
 * /groups/{id}/sessions (US-16): adding a make-up or extra session. It lives with the sessions
 * module, which owns the write rules, and only borrows the groups URL.
 */
@Controller('groups')
export class GroupSessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @RequirePermission('sessions.update')
  @Post(':id/sessions')
  @HttpCode(HttpStatus.CREATED)
  create(@Param('id', ParseUUIDPipe) id: string, @Body() body: CreateSessionDto): Promise<Session> {
    return this.sessions.createForGroup(id, body);
  }
}
