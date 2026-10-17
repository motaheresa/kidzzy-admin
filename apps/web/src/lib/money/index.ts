// Money typed by staff, turned into the API's decimal string ("1500.00") with string steps only:
// money is never a JS number, so nothing is rounded on the way.

const ARABIC_DIGITS = /[٠-٩۰-۹]/g;

function toLatinDigit(digit: string): string {
  const code = digit.charCodeAt(0);
  // Arabic-Indic ٠ is U+0660 and Extended (Persian) ۰ is U+06F0.
  return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
}

/**
 * "1500", "1,500", "1500.5", "١٥٠٠" -> "1500.00", "1500.00", "1500.50", "1500.00". Anything else
 * (letters, a negative, three decimals) is returned trimmed as typed, for the API to refuse.
 */
export function toAmount(input: string): string {
  const text = input
    .trim()
    .replace(ARABIC_DIGITS, toLatinDigit)
    .replace(/[,٬\s]/g, '')
    .replace('٫', '.');
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(text);
  if (!match) return input.trim();
  const whole = match[1].replace(/^0+(?=\d)/, '');
  return `${whole}.${(match[2] ?? '').padEnd(2, '0')}`;
}
