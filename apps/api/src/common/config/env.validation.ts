import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  Matches,
  Min,
  MinLength,
  NotEquals,
  validateSync,
} from 'class-validator';

/** The placeholder in apps/api/.env.example; a real environment must replace it. */
export const EXAMPLE_JWT_SECRET = 'change-me-to-a-long-random-string';

export const NODE_ENVS = ['development', 'test', 'production'] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

/** Values used when a variable is not set at all. An empty value (`X=`) is not "unset". */
const DEFAULTS = {
  LOGIN_RATE_LIMIT: '5',
  COOKIE_SECURE: 'true',
} as const;

/** "5" -> 5; anything that is not a whole number stays as it is, so @IsInt rejects it. */
function toInteger(value: unknown): unknown {
  return typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : value;
}

/** "true" / "false" -> boolean. Implicit conversion would turn "false" into true. */
function toBoolean(value: unknown): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

/**
 * Every variable the API reads, checked once when AppModule is imported, so a bad value stops
 * the API at startup with a clear message instead of failing later, request by request.
 * After validation, ConfigService.get returns these typed values (number, boolean).
 * A new variable is added here first.
 */
export class EnvironmentVariables {
  @IsIn(NODE_ENVS, { message: `NODE_ENV must be one of: ${NODE_ENVS.join(', ')}` })
  NODE_ENV!: NodeEnv;

  @IsString({ message: 'DATABASE_URL is required' })
  @Matches(/^postgres(ql)?:\/\//, { message: 'DATABASE_URL must be a postgresql:// URL' })
  DATABASE_URL!: string;

  @IsString({ message: 'JWT_ACCESS_SECRET is required' })
  @MinLength(32, { message: 'JWT_ACCESS_SECRET must be at least 32 characters long' })
  @NotEquals(EXAMPLE_JWT_SECRET, {
    message: 'JWT_ACCESS_SECRET still has the example value from .env.example; set a random one',
  })
  JWT_ACCESS_SECRET!: string;

  @Transform(({ value }) => toInteger(value))
  @IsInt({ message: 'LOGIN_RATE_LIMIT must be a whole number' })
  @Min(1, { message: 'LOGIN_RATE_LIMIT must be at least 1' })
  LOGIN_RATE_LIMIT!: number;

  @Transform(({ value }) => toBoolean(value))
  @IsBoolean({ message: 'COOKIE_SECURE must be true or false' })
  COOKIE_SECURE!: boolean;
}

/**
 * Used as ConfigModule.forRoot({ validate }). Receives the .env file merged with process.env and
 * returns the typed values, or throws one error that lists every problem. Messages name the
 * variable but never print its value, so a secret cannot end up in a log.
 */
export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  // Defaults are filled in first: class-transformer runs @Transform only for keys that exist.
  const withDefaults: Record<string, unknown> = { ...config };
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (withDefaults[key] === undefined) withDefaults[key] = value;
  }
  const env = plainToInstance(EnvironmentVariables, withDefaults);
  const problems = validateSync(env).flatMap((error) => Object.values(error.constraints ?? {}));

  // Rules that span two variables.
  if (env.NODE_ENV === 'production' && env.COOKIE_SECURE === false) {
    problems.push('COOKIE_SECURE must not be false when NODE_ENV=production (cookies need HTTPS)');
  }

  if (problems.length > 0) {
    throw new Error(
      `Invalid environment (apps/api/.env or the process environment):\n- ${problems.join('\n- ')}`,
    );
  }
  return env;
}
