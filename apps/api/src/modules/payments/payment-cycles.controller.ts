import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import type { Page, Payment, PaymentCycle } from '@kidzzy/shared';
import { RequirePermission } from '../auth/access.decorators';
import { ListPaymentCyclesQueryDto } from './dto/list-payment-cycles.query';
import { PaymentCreateDto } from './dto/payment-create.dto';
import { PaymentCyclesService } from './payment-cycles.service';
import { PaymentsService } from './payments.service';

/**
 * /payment-cycles (US-24, US-25) and the payment of one cycle (US-23). HTTP only: the DTO in, a service call, the mapped page out.
 * Its permission matches x-permission in openapi.yaml.
 */
@Controller('payment-cycles')
export class PaymentCyclesController {
  constructor(
    private readonly cycles: PaymentCyclesService,
    private readonly payments: PaymentsService,
  ) {}

  @RequirePermission('payments.read')
  @Get()
  list(@Query() query: ListPaymentCyclesQueryDto): Promise<Page<PaymentCycle>> {
    return this.cycles.list(query);
  }

  @RequirePermission('payments.manage')
  @Post(':id/payments')
  record(@Param('id', ParseUUIDPipe) id: string, @Body() body: PaymentCreateDto): Promise<Payment> {
    return this.payments.record(id, body);
  }
}
