import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import type { ReminderRule } from '@kidzzy/shared';
import { RequirePermission } from '../auth/access.decorators';
import { CreateReminderRuleDto, UpdateReminderRuleDto } from './dto/reminder-rule.dto';
import { ReminderRuleService } from './reminder-rule.service';

/** /reminder-rules (US-30): the admin manages when reminders are sent. HTTP only. */
@Controller('reminder-rules')
export class ReminderRulesController {
  constructor(private readonly rules: ReminderRuleService) {}

  @RequirePermission('reminders.manage')
  @Get()
  async list(): Promise<{ data: ReminderRule[] }> {
    return { data: await this.rules.list() };
  }

  @RequirePermission('reminders.manage')
  @Post()
  create(@Body() dto: CreateReminderRuleDto): Promise<ReminderRule> {
    return this.rules.create(dto);
  }

  @RequirePermission('reminders.manage')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReminderRuleDto,
  ): Promise<ReminderRule> {
    return this.rules.update(id, dto);
  }

  @RequirePermission('reminders.manage')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.rules.remove(id);
  }
}
