import { IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { Trim, TrimToNull } from '../../../common/validation/transforms';

/** The summary is a few sentences at least: a month of a child's work is not "ok". */
export const SUMMARY_MIN = 20;
export const TEXT_MAX = 2000;

/**
 * POST /evaluation-requests/{id}/submit body (openapi.yaml: SubmitEvaluationRequest). The rating
 * and the summary are required; strengths and to-improve are optional, and a blank one is null.
 */
export class SubmitEvaluationDto {
  @IsInt()
  @Min(1)
  @Max(5)
  overallRating!: number;

  @Trim()
  @IsString()
  @Length(SUMMARY_MIN, TEXT_MAX)
  summary!: string;

  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(TEXT_MAX)
  strengths?: string | null;

  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(TEXT_MAX)
  toImprove?: string | null;
}
