// Letters and digits that cannot be confused when read aloud or copied by hand: no 0/O, 1/l/I.
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const TEMPORARY_PASSWORD_LENGTH = 10;

/**
 * A random temporary password for a new account (the instructor replaces it at the first
 * login). It uses the browser's cryptographic generator, never Math.random, and rejection
 * sampling so every character is equally likely.
 */
export function generateTemporaryPassword(length = TEMPORARY_PASSWORD_LENGTH): string {
  const limit = 256 - (256 % ALPHABET.length); // bytes at or above this would bias the result
  let password = '';
  while (password.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const byte of bytes) {
      if (byte < limit && password.length < length) password += ALPHABET[byte % ALPHABET.length];
    }
  }
  return password;
}
