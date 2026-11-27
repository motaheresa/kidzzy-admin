import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import type {
  Announcement,
  AudienceRole,
  AudienceUser,
  Page,
  RecipientsCount,
} from '@kidzzy/shared';
import { PageQueryDto } from '../../common/pagination/page-query.dto';
import { RequirePermission } from '../auth/access.decorators';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { ListAudienceUsersQueryDto } from './dto/list-audience-users.query';
import { RecipientsCountQueryDto } from './dto/recipients-count.query';

/** Announcements (US-31). HTTP only. Every route is the sender's: announcements.send. */
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @RequirePermission('announcements.send')
  @Get()
  list(@Query() query: PageQueryDto): Promise<Page<Announcement>> {
    return this.announcements.list(query);
  }

  @RequirePermission('announcements.send')
  @Post()
  send(@Body() dto: CreateAnnouncementDto): Promise<Announcement> {
    return this.announcements.send(dto);
  }

  @RequirePermission('announcements.send')
  @Get('recipients-count')
  count(@Query() query: RecipientsCountQueryDto): Promise<RecipientsCount> {
    return this.announcements.count(query);
  }

  /** The roles the audience picker offers. */
  @RequirePermission('announcements.send')
  @Get('audience/roles')
  listRoles(): Promise<AudienceRole[]> {
    return this.announcements.listRoles();
  }

  /** The people the audience picker offers. */
  @RequirePermission('announcements.send')
  @Get('audience/users')
  listUsers(@Query() query: ListAudienceUsersQueryDto): Promise<Page<AudienceUser>> {
    return this.announcements.listUsers(query);
  }
}
