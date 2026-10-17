import { IsInt, IsString, Matches, Max, Min } from 'class-validator';

/** Sessions per cycle: 1 to 100 (a check constraint holds the same range). */
export const MAX_SESSIONS_PER_CYCLE = 100;

/**
 * An amount in EGP as a decimal string: up to 8 digits, a dot and 2 digits, more than zero
 * ("1500.00"). numeric(10,2) holds at most 99999999.99, so a longer amount is a 400, not a 500.
 */
export const AMOUNT_PATTERN = /^(?!0+\.00$)\d{1,8}\.\d{2}$/;

/** openapi.yaml: PlanInput. N sessions per cycle for an amount. */
export class PlanInputDto {
  @IsInt()
  @Min(1)
  @Max(MAX_SESSIONS_PER_CYCLE)
  sessionsPerCycle!: number;

  @IsString()
  @Matches(AMOUNT_PATTERN, { message: 'amount must be a decimal string like "1500.00", above 0' })
  amount!: string;
}
