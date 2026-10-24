import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PaymentMethod } from '@kidzzy/shared';
import { IsCalendarDate } from '../../../common/validation/is-calendar-date';
import { Trim } from '../../../common/validation/transforms';
import { AMOUNT_PATTERN } from './plan-input.dto';

const METHODS = [PaymentMethod.Cash, PaymentMethod.Transfer, PaymentMethod.Wallet] as const;

/**
 * POST /payment-cycles/{id}/payments body (openapi.yaml: PaymentCreate). The amount is a decimal
 * string, never a number; the service checks that it equals the cycle's plan amount, and that the
 * date is not after today in the academy's timezone.
 */
export class PaymentCreateDto {
  @Matches(AMOUNT_PATTERN, { message: 'amount must be a decimal string like "1500.00", above 0' })
  amount!: string;

  /** Academy-local date, YYYY-MM-DD. */
  @IsCalendarDate()
  paidOn!: string;

  @IsIn(METHODS)
  method!: PaymentMethod;

  /** Stored trimmed; a blank note is stored as null. */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  note?: string;
}
