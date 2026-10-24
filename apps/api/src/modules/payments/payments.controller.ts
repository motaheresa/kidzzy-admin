import { Controller, Get, Query } from '@nestjs/common';
import type { Page, Payment } from '@kidzzy/shared';
import { RequirePermission } from '../auth/access.decorators';
import { ListPaymentsQueryDto } from './dto/list-payments.query';
import { PaymentsService } from './payments.service';

/**
 * /payments (US-24, US-25): the payment history. HTTP only: the DTO in, a service call, the
 * mapped page out. Its permission matches x-permission in openapi.yaml.
 */
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @RequirePermission('payments.read')
  @Get()
  list(@Query() query: ListPaymentsQueryDto): Promise<Page<Payment>> {
    return this.payments.list(query);
  }
}
