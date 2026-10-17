import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import type { Group, Page } from '@kidzzy/shared';
import { RequirePermission } from '../auth/access.decorators';
import { CreateGroupDto } from './dto/create-group.dto';
import { ListGroupsQueryDto } from './dto/list-groups.query';
import { GroupsService } from './groups.service';

/**
 * /groups (US-07). HTTP only: the DTO in, a service call, the mapped response out.
 * Each route's permission matches its x-permission in openapi.yaml.
 */
@Controller('groups')
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @RequirePermission('groups.read')
  @Get()
  list(@Query() query: ListGroupsQueryDto): Promise<Page<Group>> {
    return this.groups.list(query);
  }

  @RequirePermission('groups.create')
  @Post()
  create(@Body() dto: CreateGroupDto): Promise<Group> {
    return this.groups.create(dto);
  }

  @RequirePermission('groups.read')
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<Group> {
    return this.groups.get(id);
  }
}
