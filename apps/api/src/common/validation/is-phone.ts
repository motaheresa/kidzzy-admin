import { registerDecorator, type ValidationOptions } from 'class-validator';
import { normalizePhone } from '../normalize/login-identifiers';

/** What people type: digits, spaces, dashes, dots, brackets, and a leading "+". */
const TYPED_PHONE = /^\+?[\d\s\-().]+$/;
/** The stored form; the same rule as the database check users_phone_format_check. */
const STORED_PHONE = /^\+?[0-9]{6,20}$/;

/** True when the text is a phone number the database will accept once normalized. */
export function isPhone(value: unknown): boolean {
  return (
    typeof value === 'string' && TYPED_PHONE.test(value) && STORED_PHONE.test(normalizePhone(value))
  );
}

/**
 * A phone number as people write it ("010 1234-5678", "+20 (10) 1234-5678"), 6 to 20 digits.
 * The repository stores it through normalizePhone. Checking here gives a 400 with the field,
 * instead of the database check failing as a 500.
 */
export function IsPhone(options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isPhone',
      target: target.constructor,
      propertyName: String(propertyName),
      options: { message: `${String(propertyName)} must be a phone number`, ...options },
      validator: { validate: isPhone },
    });
  };
}
