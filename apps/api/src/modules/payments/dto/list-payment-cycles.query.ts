import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PageQueryDto } from '../../../common/pagination/page-query.dto';

export const CYCLE_FILTERS = ['in_progress', 'approaching', 'due', 'paid'] as const;
export type CycleFilter = (typeof CYCLE_FILTERS)[number];

/**
 * GET /payment-cycles query (openapi.yaml: listPaymentCycles). `approaching` is a cycle in
 * progress with one or two sessions left. The filters are combined with AND.
 */
export class ListPaymentCyclesQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(CYCLE_FILTERS)
  status?: CycleFilter;

  @IsOptional()
  @IsIn(['student', 'instructor'])
  payeeType?: 'student' | 'instructor';

  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsUUID()
  instructorId?: string;
}
