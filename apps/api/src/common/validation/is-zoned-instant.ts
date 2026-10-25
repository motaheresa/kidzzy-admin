import { applyDecorators } from '@nestjs/common';
import { IsISO8601, Matches } from 'class-validator';

/**
 * An ISO 8601 instant that names its zone (Z or an offset). Without one the server would read the
 * time in its own zone, so it is refused (400). The value stays a string; the service turns it
 * into a Date.
 */
export function IsZonedInstant(): PropertyDecorator {
  return applyDecorators(
    IsISO8601({ strict: true, strictSeparator: true }),
    Matches(/(Z|[+-]\d{2}:\d{2})$/, {
      message: 'must include a time zone (Z or an offset)',
    }),
  );
}
