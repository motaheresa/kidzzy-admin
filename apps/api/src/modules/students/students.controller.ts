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
import type { Page, Student } from '@kidzzy/shared';
import { RequirePermission } from '../auth/access.decorators';
import { CreateStudentDto } from './dto/create-student.dto';
import { ListStudentsQueryDto } from './dto/list-students.query';
import { UpdateStudentDto } from './dto/update-student.dto';
import { StudentsService } from './students.service';

/**
 * /students (US-05). HTTP only: the DTO in, a service call, the mapped response out.
 * Each route's permission matches its x-permission in openapi.yaml.
 */
@Controller('students')
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @RequirePermission('students.read')
  @Get()
  list(@Query() query: ListStudentsQueryDto): Promise<Page<Student>> {
    return this.students.list(query);
  }

  @RequirePermission('students.manage')
  @Post()
  create(@Body() dto: CreateStudentDto): Promise<Student> {
    return this.students.create(dto);
  }

  @RequirePermission('students.read')
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<Student> {
    return this.students.get(id);
  }

  @RequirePermission('students.manage')
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStudentDto): Promise<Student> {
    return this.students.update(id, dto);
  }

  @RequirePermission('students.manage')
  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  deactivate(@Param('id', ParseUUIDPipe) id: string): Promise<Student> {
    return this.students.deactivate(id);
  }
}
