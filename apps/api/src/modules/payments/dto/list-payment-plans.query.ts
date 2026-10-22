import { IsOptional, IsUUID } from 'class-validator';

/**
 * GET /payment-plans query (openapi.yaml: listPaymentPlans). The plans of ONE payee: exactly one
 * of the two ids; the service answers 400 otherwise.
 */
export class ListPaymentPlansQueryDto {
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsUUID()
  instructorId?: string;
}
