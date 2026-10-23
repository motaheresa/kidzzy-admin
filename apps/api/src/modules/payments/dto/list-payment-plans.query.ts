import { IsOptional, IsUUID } from 'class-validator';

/**
 * GET /payment-plans query (openapi.yaml: listPaymentPlans). The plans of ONE payee: exactly one
 * of the two ids; the service answers 400 otherwise. With instructorId, groupId narrows the
 * answer to one group (without it, every group the instructor has a plan for).
 */
export class ListPaymentPlansQueryDto {
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsUUID()
  instructorId?: string;

  @IsOptional()
  @IsUUID()
  groupId?: string;
}
