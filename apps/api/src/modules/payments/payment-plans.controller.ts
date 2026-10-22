import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import type { PaymentPlan } from '@kidzzy/shared';
import { RequirePermission } from '../auth/access.decorators';
import { InstructorPlanDto } from './dto/instructor-plan.dto';
import { ListPaymentPlansQueryDto } from './dto/list-payment-plans.query';
import { PlanInputDto } from './dto/plan-input.dto';
import { PaymentPlansService } from './payment-plans.service';

/**
 * /payment-plans, /students/{id}/payment-plans (US-20) and /instructors/{id}/payment-plans
 * (US-21). HTTP only: the DTO in, a service
 * call, the mapped response out. Each route's permission matches its x-permission in
 * openapi.yaml.
 */
@Controller()
export class PaymentPlansController {
  constructor(private readonly plans: PaymentPlansService) {}

  @RequirePermission('payments.read')
  @Get('payment-plans')
  async list(@Query() query: ListPaymentPlansQueryDto): Promise<{ data: PaymentPlan[] }> {
    return { data: await this.plans.list(query) };
  }

  @RequirePermission('payments.manage')
  @Post('students/:id/payment-plans')
  changeStudentPlan(
    @Param('id', ParseUUIDPipe) studentId: string,
    @Body() dto: PlanInputDto,
  ): Promise<PaymentPlan> {
    return this.plans.changeStudentPlan(studentId, dto);
  }

  @RequirePermission('payments.manage')
  @Post('instructors/:id/payment-plans')
  setInstructorPlan(
    @Param('id', ParseUUIDPipe) instructorId: string,
    @Body() dto: InstructorPlanDto,
  ): Promise<PaymentPlan> {
    return this.plans.setInstructorPlan(instructorId, dto);
  }
}
