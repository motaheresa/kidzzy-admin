import { EXAMPLE_JWT_SECRET, validateEnv } from './env.validation';

const valid = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://kidzzy:kidzzy@localhost:5432/kidzzy_admin?schema=public',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
};

describe('validateEnv', () => {
  it('accepts a valid environment and applies the defaults', () => {
    const env = validateEnv({ ...valid });
    expect(env.LOGIN_RATE_LIMIT).toBe(5);
    expect(env.COOKIE_SECURE).toBe(true);
  });

  it('converts strings to typed values', () => {
    const env = validateEnv({ ...valid, LOGIN_RATE_LIMIT: '20', COOKIE_SECURE: 'false' });
    expect(env.LOGIN_RATE_LIMIT).toBe(20);
    expect(env.COOKIE_SECURE).toBe(false); // not true, as implicit conversion would give
  });

  it('keeps other variables, so ConfigService still reads them', () => {
    expect(validateEnv({ ...valid, SEED_ADMIN_NAME: 'Admin' })).toMatchObject({
      SEED_ADMIN_NAME: 'Admin',
    });
  });

  it.each([
    ['NODE_ENV missing', { NODE_ENV: undefined }, /NODE_ENV must be one of/],
    ['NODE_ENV unknown', { NODE_ENV: 'staging' }, /NODE_ENV must be one of/],
    ['DATABASE_URL missing', { DATABASE_URL: undefined }, /DATABASE_URL is required/],
    ['DATABASE_URL not postgres', { DATABASE_URL: 'mysql://x' }, /postgresql:\/\/ URL/],
    [
      'JWT_ACCESS_SECRET missing',
      { JWT_ACCESS_SECRET: undefined },
      /JWT_ACCESS_SECRET is required/,
    ],
    ['JWT_ACCESS_SECRET short', { JWT_ACCESS_SECRET: 'a'.repeat(31) }, /at least 32 characters/],
    ['JWT_ACCESS_SECRET the example', { JWT_ACCESS_SECRET: EXAMPLE_JWT_SECRET }, /example value/],
    ['LOGIN_RATE_LIMIT empty', { LOGIN_RATE_LIMIT: '' }, /LOGIN_RATE_LIMIT must be a whole number/],
    ['LOGIN_RATE_LIMIT a typo', { LOGIN_RATE_LIMIT: '5a' }, /LOGIN_RATE_LIMIT must be a whole/],
    [
      'LOGIN_RATE_LIMIT a fraction',
      { LOGIN_RATE_LIMIT: '2.5' },
      /LOGIN_RATE_LIMIT must be a whole/,
    ],
    ['LOGIN_RATE_LIMIT zero', { LOGIN_RATE_LIMIT: '0' }, /LOGIN_RATE_LIMIT must be at least 1/],
    ['COOKIE_SECURE not a boolean', { COOKIE_SECURE: 'no' }, /COOKIE_SECURE must be true or false/],
    [
      'COOKIE_SECURE false in production',
      { NODE_ENV: 'production', COOKIE_SECURE: 'false' },
      /COOKIE_SECURE must not be false when NODE_ENV=production/,
    ],
  ])('rejects %s', (_label, override, message) => {
    expect(() => validateEnv({ ...valid, ...override })).toThrow(message);
  });

  it('lists every problem at once and never prints a value', () => {
    const secret = 'short-secret-value';
    let message = '';
    try {
      validateEnv({ ...valid, JWT_ACCESS_SECRET: secret, LOGIN_RATE_LIMIT: 'x' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/JWT_ACCESS_SECRET/);
    expect(message).toMatch(/LOGIN_RATE_LIMIT/);
    expect(message).not.toContain(secret);
  });

  it('allows COOKIE_SECURE=false outside production', () => {
    expect(validateEnv({ ...valid, COOKIE_SECURE: 'false' }).COOKIE_SECURE).toBe(false);
  });
});
