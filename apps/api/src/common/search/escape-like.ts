/**
 * Makes user text safe inside a SQL LIKE / ILIKE pattern: `%` and `_` are wildcards there, and
 * `\` is the escape character, so each of them gets a `\` in front and matches itself.
 * The query must say `ESCAPE '\'`. Without this, a search for "%" would match every row.
 *
 *   escapeLike('50%_off') -> '50\%\_off'
 */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}
