import { ValidateBy, type ValidationOptions } from 'class-validator';

/**
 * The text has between min and max characters as JavaScript counts them (`value.length`), the same
 * count as an input's `maxLength` in the web. class-validator's @Length counts an emoji with its
 * variation selector as one character, while the database's char_length counts two, so a text
 * could pass @Length and then fail a CHECK. `value.length` is never smaller than char_length.
 */
export function TextLength(
  min: number,
  max: number,
  options?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'textLength',
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && value.length >= min && value.length <= max,
        defaultMessage: (args) =>
          `${args?.property ?? 'value'} must be ${min} to ${max} characters`,
      },
    },
    options,
  );
}
