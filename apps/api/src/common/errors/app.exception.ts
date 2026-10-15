import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@kidzzy/shared';

export interface FieldError {
  field: string;
  message: string;
}

/**
 * An error the client can act on, with the stable `code` from API Design V1 ("Errors").
 * ProblemDetailsFilter turns it into an RFC 9457 response.
 */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    status: HttpStatus,
    readonly detail?: string,
    readonly errors?: FieldError[],
  ) {
    super(detail ?? code, status);
  }
}
