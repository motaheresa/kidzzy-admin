import { Transform } from 'class-transformer';

/** Trims a string before the checks run; leaves other values for the type checks to refuse. */
export function Trim(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );
}

/**
 * Trims a string, and turns one that is blank after trimming into null, so an optional text
 * (a note) is either real text or null. JavaScript trim removes more than the database btrim does
 * (tabs, newlines, no-break spaces), so a value that passes here always satisfies `col = btrim(col)`.
 */
export function TrimToNull(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  });
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
