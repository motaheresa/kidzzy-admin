import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import type { HeldResult, Page, Session } from '@kidzzy/shared';
import { RequirePermission } from '../auth/access.decorators';
import { CancelSessionDto } from './dto/cancel-session.dto';
import { ListSessionsQueryDto } from './dto/list-sessions.query';
import { RescheduleSessionDto } from './dto/reschedule-session.dto';
import { SessionsService } from './sessions.service';

/**
 * /sessions (US-12, US-13, US-14, US-15, US-17). HTTP only: the DTO in, a service call, the mapped response out.
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

  @RequirePermission('sessions.update')
  @Post(':id/held')
  @HttpCode(HttpStatus.OK)
  markHeld(@Param('id', ParseUUIDPipe) id: string): Promise<HeldResult> {
    return this.sessions.markHeld(id);
  }

  @RequirePermission('sessions.update')
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() body: CancelSessionDto): Promise<Session> {
    return this.sessions.cancel(id, body.reason);
  }

  @RequirePermission('sessions.update')
  @Post(':id/reschedule')
  @HttpCode(HttpStatus.OK)
  reschedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RescheduleSessionDto,
  ): Promise<Session> {
    return this.sessions.reschedule(id, body);
  }

  @RequirePermission('sessions.undo_held')
  @Post(':id/undo-held')
  @HttpCode(HttpStatus.OK)
  undoHeld(@Param('id', ParseUUIDPipe) id: string): Promise<Session> {
    return this.sessions.undoHeld(id);
  }
}
