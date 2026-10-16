import { Transform } from 'class-transformer';

/** Trims a string before the checks run; leaves other values for the type checks to refuse. */
export function Trim(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );
}

/**
 * Query strings are text: "true" and "false" become booleans, anything else is left as it is,
 * so @IsBoolean refuses it (400) instead of treating "yes" as true.
 */
export function ToBoolean(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  });
}
