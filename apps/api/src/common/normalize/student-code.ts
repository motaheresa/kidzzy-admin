// The one place that decides how a student code is stored and compared. The database refuses
// any other form (students_code_normalized_check in the students migration), and the unique
// index (academy_id, code) then treats "kc-001", " KC-001" and "KC-٠٠١" as the same code.

/**
 * What an admin may type: letters (Latin or Arabic), digits (0-9, or Arabic-Indic ٠-٩ / ۰-۹)
 * and . _ / - , starting with a letter or a digit. Only Latin letters have a case here, and for
 * those JavaScript's toUpperCase and PostgreSQL's upper() agree, so the stored code always
 * passes the check. (Letters like "ß", which the two upper-case differently, are refused.)
 */
export const STUDENT_CODE_PATTERN = /^[A-Za-z0-9ء-ي٠-٩۰-۹][A-Za-z0-9ء-ي٠-٩۰-۹._/-]*$/;

/** Arabic-Indic (٠-٩) and Persian (۰-۹) digits as 0-9. */
function westernDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹]/g, (digit) => String(digit.charCodeAt(0) & 0xf));
}

/** "  kc-٠٠١ " -> "KC-001" */
export function normalizeStudentCode(code: string): string {
  return westernDigits(code.trim()).toUpperCase();
}
