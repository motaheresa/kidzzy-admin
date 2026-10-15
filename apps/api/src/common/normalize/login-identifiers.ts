// The one place that decides how emails and phones are stored and compared.
// Every write (user creation, seed, tests) and the login lookup go through these functions,
// and the database rejects anything else (check constraints in the normalize_login_fields
// migration), so a login always compares like with like.

/** "  Admin@Kidzzy.COM " -> "admin@kidzzy.com" */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Keeps the digits, plus a leading "+" for international numbers:
 * "010 1234-5678" -> "01012345678", "+20 (10) 1234-5678" -> "+201012345678".
 */
export function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  return (trimmed.startsWith('+') ? '+' : '') + trimmed.replace(/\D/g, '');
}
