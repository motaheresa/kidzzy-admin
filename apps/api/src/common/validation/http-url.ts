import { ValidateBy, type ValidationOptions } from 'class-validator';

/** The scheme, `://` and the first character of a host: `//host` and `http:///path` do not match. */
const WEB_ADDRESS_START = /^https?:\/\/[^/\\?#]/i;
/** Spaces, tabs, line breaks and other control characters, which an address never holds. */
const SPACE_OR_CONTROL = /[\s\p{Cc}]/u;

/**
 * An absolute http or https address of at most `max` characters (`value.length`, as an input's
 * maxLength counts). It is for links a browser opens, so `javascript:`, `data:` and relative
 * addresses are refused. The text is only checked, never rewritten.
 */
export function isHttpUrl(value: unknown, max: number): boolean {
  if (typeof value !== 'string' || value.length > max) return false;
  if (SPACE_OR_CONTROL.test(value) || !WEB_ADDRESS_START.test(value)) return false;
  try {
    const { protocol, hostname } = new URL(value);
    return (protocol === 'http:' || protocol === 'https:') && hostname !== '';
  } catch {
    return false;
  }
}

export function HttpUrl(max: number, options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'httpUrl',
      validator: {
        validate: (value: unknown) => isHttpUrl(value, max),
        defaultMessage: (args) =>
          `${args?.property ?? 'value'} must be an http or https address of at most ${max} characters`,
      },
    },
    options,
  );
}
