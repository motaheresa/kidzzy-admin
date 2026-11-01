// Same rule as the web's safeReturnTo, without a browser: a path on this app, never another host.
// Control characters and whitespace: a tab inside "/\t/evil.com" would become "//evil.com".
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARACTERS = /[\u0000- \u007f-\u009f]/;

/** A same-site path (`/sessions/…`), or undefined when the value could point somewhere else. */
export function safeAppPath(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return undefined;
  if (raw.includes('\\') || UNSAFE_CHARACTERS.test(raw)) return undefined;
  return raw;
}
