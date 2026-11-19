import { IsIn, IsOptional } from 'class-validator';

/** GET /evaluation-requests?status=pending. Only pending requests are listed today. */
export class ListEvaluationRequestsQueryDto {
  @IsOptional()
  @IsIn(['pending'])
  status?: 'pending';
}
