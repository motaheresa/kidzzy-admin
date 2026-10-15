import { HttpStatus, type ValidationError } from '@nestjs/common';
import { ErrorCode } from '@kidzzy/shared';
import { AppException, type FieldError } from './app.exception';

/** Flattens class-validator errors, including nested objects, into { field, message } pairs. */
export function toFieldErrors(errors: ValidationError[], parent = ''): FieldError[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = Object.values(error.constraints ?? {}).map((message) => ({ field, message }));
    return [...own, ...toFieldErrors(error.children ?? [], field)];
  });
}

/** Used by the global ValidationPipe: a body that breaks its DTO rules gives 400 VALIDATION_FAILED. */
export function validationExceptionFactory(errors: ValidationError[]): AppException {
  return new AppException(
    ErrorCode.ValidationFailed,
    HttpStatus.BAD_REQUEST,
    'The request is not valid',
    toFieldErrors(errors),
  );
}
