import { Controller, Get, Query } from '@nestjs/common';
import type { Page, PaymentCycle } from '@kidzzy/shared';
import { RequirePermission } from '../auth/access.decorators';
import { ListPaymentCyclesQueryDto } from './dto/list-payment-cycles.query';
import { PaymentCyclesService } from './payment-cycles.service';

/**
 * /payment-cycles (US-24, US-25). HTTP only: the DTO in, a service call, the mapped page out.
 * Its permission matches x-permission in openapi.yaml.
 */
@Controller('payment-cycles')
export class PaymentCyclesController {
  constructor(private readonly cycles: PaymentCyclesService) {}

  @RequirePermission('payments.read')
  @Get()
  list(@Query() query: ListPaymentCyclesQueryDto): Promise<Page<PaymentCycle>> {
    return this.cycles.list(query);
  }
}
