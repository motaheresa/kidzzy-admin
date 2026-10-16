import { ErrorCode } from '@kidzzy/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { ERROR_MESSAGES, KIND_MESSAGES } from './messages';
import { fromResponse, timeoutError } from './normalize';
import { reportError } from './report';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

describe('reportError', () => {
  afterEach(() => vi.mocked(toast.error).mockClear());

  it.each([
    ['network', new TypeError('Failed to fetch'), KIND_MESSAGES.network],
    ['timeout', timeoutError(), KIND_MESSAGES.timeout],
    ['server', fromResponse(500, null), KIND_MESSAGES.server],
    ['forbidden', fromResponse(403, { status: 403, code: 'FORBIDDEN' }), ERROR_MESSAGES.FORBIDDEN],
    [
      'conflict',
      fromResponse(409, { status: 409, code: ErrorCode.CycleAlreadyPaid }),
      ERROR_MESSAGES.CYCLE_ALREADY_PAID,
    ],
    ['unknown', new Error('bug'), KIND_MESSAGES.unknown],
  ])('toasts a %s error once, with its Arabic message as the id', (_kind, error, message) => {
    reportError(error);
    expect(toast.error).toHaveBeenCalledExactlyOnceWith(message, { id: message });
  });

  it.each([
    ['unauthenticated', fromResponse(401, { status: 401, code: 'UNAUTHENTICATED' })],
    ['validation', fromResponse(400, { status: 400, code: 'VALIDATION_FAILED' })],
    ['a cancelled request', new DOMException('aborted', 'AbortError')],
  ])('stays silent for %s', (_label, error) => {
    reportError(error);
    expect(toast.error).not.toHaveBeenCalled();
  });
});
