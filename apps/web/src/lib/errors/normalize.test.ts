import { ErrorCode } from '@kidzzy/shared';
import { describe, expect, it } from 'vitest';
import { AppError } from './app-error';
import { ERROR_MESSAGES, FIELD_FALLBACK, FIELD_MESSAGES, KIND_MESSAGES } from './messages';
import { fromResponse, normalizeError, timeoutError } from './normalize';

const problem = (status: number, code?: string, extra: object = {}) => ({
  type: 'about:blank',
  title: 'Error',
  status,
  ...(code ? { code } : {}),
  detail: 'Internal English text the user must never see',
  ...extra,
});

describe('fromResponse: Problem Details -> AppError', () => {
  it.each([
    [400, ErrorCode.ValidationFailed, 'validation'],
    [401, ErrorCode.Unauthenticated, 'unauthenticated'],
    [401, ErrorCode.InvalidCredentials, 'unauthenticated'],
    [403, ErrorCode.Forbidden, 'forbidden'],
    [403, ErrorCode.PasswordChangeRequired, 'forbidden'],
    [404, ErrorCode.NotFound, 'notFound'],
    [409, ErrorCode.SessionNotScheduled, 'conflict'],
    [422, ErrorCode.StartingPointOutOfRange, 'validation'],
    [429, ErrorCode.RateLimited, 'rateLimited'],
    [500, ErrorCode.InternalError, 'server'],
  ] as const)('%i %s -> %s, with the code’s Arabic message', (status, code, kind) => {
    const error = fromResponse(status, problem(status, code));
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ kind, status, code, message: ERROR_MESSAGES[code] });
  });

  it.each([
    [502, 'server'],
    [503, 'server'],
    [404, 'notFound'],
    [409, 'conflict'],
    [418, 'unknown'],
  ] as const)('%i without a known code -> %s, with the kind’s message', (status, kind) => {
    const error = fromResponse(status, '<html>Bad gateway</html>');
    expect(error).toMatchObject({ kind, status, code: undefined, message: KIND_MESSAGES[kind] });
  });

  it('ignores a code the app does not know', () => {
    const error = fromResponse(409, problem(409, 'SOMETHING_NEW'));
    expect(error).toMatchObject({ kind: 'conflict', code: undefined });
    expect(error.message).toBe(KIND_MESSAGES.conflict);
  });

  it('never uses the server’s detail text', () => {
    for (const status of [400, 401, 403, 404, 409, 500]) {
      expect(fromResponse(status, problem(status, ErrorCode.Forbidden)).message).not.toMatch(
        /English/,
      );
    }
  });

  it('maps VALIDATION_FAILED errors[] to Arabic messages keyed by field', () => {
    const error = fromResponse(
      400,
      problem(400, ErrorCode.ValidationFailed, {
        errors: [
          { field: 'login', message: 'login should not be empty' },
          { field: 'password', message: 'password must be longer than or equal to 8 characters' },
          { field: 'password', message: 'a second message for the same field' },
          { field: 'schedule.0.email', message: 'email must be an email' },
          { field: 'role', message: 'property role should not exist' },
        ],
      }),
    );
    expect(error.fieldErrors).toEqual({
      login: FIELD_MESSAGES.login,
      password: FIELD_MESSAGES.password,
      'schedule.0.email': FIELD_MESSAGES.email,
      role: FIELD_FALLBACK,
    });
  });

  it('has no field errors outside validation', () => {
    const body = problem(409, ErrorCode.CycleAlreadyPaid, {
      errors: [{ field: 'x', message: 'y' }],
    });
    expect(fromResponse(409, body).fieldErrors).toEqual({});
  });

  it.each([
    [ErrorCode.EmailTaken, 'email'],
    [ErrorCode.PhoneTaken, 'phone'],
    [ErrorCode.StudentCodeTaken, 'code'],
  ] as const)('puts the 409 %s message under the %s field', (code, field) => {
    const error = fromResponse(409, problem(409, code));
    expect(error).toMatchObject({ kind: 'conflict', code, message: ERROR_MESSAGES[code] });
    expect(error.fieldErrors).toEqual({ [field]: ERROR_MESSAGES[code] });
  });

  it.each([
    [ErrorCode.CurrentPasswordIncorrect, 'currentPassword'],
    [ErrorCode.PasswordUnchanged, 'newPassword'],
  ] as const)('puts the 422 %s message under the %s field', (code, field) => {
    const error = fromResponse(422, problem(422, code));
    expect(error).toMatchObject({ kind: 'validation', code, message: ERROR_MESSAGES[code] });
    expect(error.fieldErrors).toEqual({ [field]: ERROR_MESSAGES[code] });
  });
});

describe('normalizeError: anything thrown -> AppError', () => {
  it('returns an AppError as it is', () => {
    const original = timeoutError();
    expect(normalizeError(original)).toBe(original);
  });

  it('treats fetch’s TypeError as a network error', () => {
    expect(normalizeError(new TypeError('Failed to fetch'))).toMatchObject({
      kind: 'network',
      message: KIND_MESSAGES.network,
    });
  });

  it('treats a TimeoutError as a timeout', () => {
    expect(normalizeError(new DOMException('slow', 'TimeoutError')).kind).toBe('timeout');
  });

  it('reads a thrown Problem object', () => {
    expect(normalizeError(problem(403, ErrorCode.Forbidden)).kind).toBe('forbidden');
  });

  it.each([['a string'], [null], [undefined], [{ any: 'object' }], [new Error('bug')], [42]])(
    'maps %j to unknown, keeping it as the cause',
    (thrown) => {
      const error = normalizeError(thrown);
      expect(error).toMatchObject({ kind: 'unknown', message: KIND_MESSAGES.unknown });
      expect(error.cause).toBe(thrown);
    },
  );
});
