import { registerDecorator, type ValidationOptions } from 'class-validator';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date written YYYY-MM-DD ("2026-02-30" is not one). */
export function isCalendarDate(value: unknown): boolean {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/** A date without a time, YYYY-MM-DD (openapi.yaml format: date), academy-local by meaning. */
export function IsCalendarDate(options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isCalendarDate',
      target: target.constructor,
      propertyName: String(propertyName),
      options: { message: `${String(propertyName)} must be a date as YYYY-MM-DD`, ...options },
      validator: { validate: isCalendarDate },
    });
  };
}
