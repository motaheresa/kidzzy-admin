import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { Instructor, InstructorDetail, Page } from '@kidzzy/shared';
import { RequirePermission } from '../auth/access.decorators';
import { CreateInstructorDto } from './dto/create-instructor.dto';
import { ListInstructorsQueryDto } from './dto/list-instructors.query';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateInstructorDto } from './dto/update-instructor.dto';
import { InstructorsService } from './instructors.service';

/**
 * /instructors (US-04). HTTP only: the DTO in, a service call, the mapped response out.
 * Each route's permission matches its x-permission in openapi.yaml.
 * ParseUUIDPipe answers 400 for an id that is not a UUID, before any query runs.
 */
@Controller('instructors')
export class InstructorsController {
  constructor(private readonly instructors: InstructorsService) {}

  @RequirePermission('instructors.read')
  @Get()
  list(@Query() query: ListInstructorsQueryDto): Promise<Page<Instructor>> {
    return this.instructors.list(query);
  }

  @RequirePermission('instructors.manage')
  @Post()
  create(@Body() dto: CreateInstructorDto): Promise<Instructor> {
    return this.instructors.create(dto);
  }

  @RequirePermission('instructors.read')
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<InstructorDetail> {
    return this.instructors.get(id);
  }

  @RequirePermission('instructors.manage')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInstructorDto,
  ): Promise<Instructor> {
    return this.instructors.update(id, dto);
  }

  @RequirePermission('instructors.manage')
  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  deactivate(@Param('id', ParseUUIDPipe) id: string): Promise<Instructor> {
    return this.instructors.deactivate(id);
  }

  @RequirePermission('instructors.manage')
  @Post(':id/reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
  ): Promise<void> {
    return this.instructors.resetPassword(id, dto.temporaryPassword);
  }

  @RequirePermission('instructors.manage')
  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  reactivate(@Param('id', ParseUUIDPipe) id: string): Promise<Instructor> {
    return this.instructors.reactivate(id);
  }
}
