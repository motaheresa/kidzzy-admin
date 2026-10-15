import { API_PREFIX, ErrorCode, type Problem } from '@kidzzy/shared';

/** An error answer from the API, carrying its Problem Details body (stable `code`). */
export class ApiError extends Error {
  readonly problem: Problem;

  constructor(problem: Problem) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiError';
    this.problem = problem;
  }

  get code(): ErrorCode {
    return this.problem.code;
  }
}

/**
 * Calls the API on the same origin. The browser attaches the httpOnly auth cookies by itself,
 * so this code never sees or stores a token.
 */
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/${API_PREFIX}${path}`, {
      method: options.method ?? 'GET',
      headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError({
      type: 'about:blank',
      title: 'Network error',
      status: 0,
      code: ErrorCode.InternalError,
    });
  }

  if (response.status === 204) return undefined as T;
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new ApiError(
      (body as Problem | undefined) ?? {
        type: 'about:blank',
        title: response.statusText,
        status: response.status,
        code: ErrorCode.InternalError,
      },
    );
  }
  return body as T;
}
