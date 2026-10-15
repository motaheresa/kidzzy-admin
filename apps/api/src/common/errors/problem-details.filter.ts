import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { ErrorCode, type Problem } from '@kidzzy/shared';
import { STATUS_CODES } from 'node:http';
import type { Request, Response } from 'express';
import { AppException } from './app.exception';

/** Code used when an error did not come from an AppException. */
function codeForStatus(status: number): ErrorCode {
  if (status === 401) return ErrorCode.Unauthenticated;
  if (status === 403) return ErrorCode.Forbidden;
  if (status === 404 || status === 405) return ErrorCode.NotFound;
  if (status === 429) return ErrorCode.RateLimited;
  if (status >= 400 && status < 500) return ErrorCode.ValidationFailed;
  return ErrorCode.InternalError;
}

/**
 * Turns every error into an RFC 9457 Problem Details response with a stable `code`
 * (API Design V1, "Errors"). Unexpected errors become 500 INTERNAL_ERROR and are logged;
 * their message never reaches the client.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const problem: Problem = {
      type: 'about:blank',
      title: STATUS_CODES[status] ?? 'Error',
      status,
      code: exception instanceof AppException ? exception.code : codeForStatus(status),
      instance: request.originalUrl,
    };

    if (exception instanceof AppException) {
      if (exception.detail) problem.detail = exception.detail;
      if (exception.errors?.length) problem.errors = exception.errors;
    }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.originalUrl}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).type('application/problem+json').json(problem);
  }
}
