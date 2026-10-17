// The one place that decides how a name is compared in a search (US-06). Names are stored as
// typed; a second column (name_search, on students and users) keeps this normalized form, written
// by the repositories on every write of a name, and a search normalizes the query the same way.
//
// The migration search_columns has kidzzy_normalize_search(), the same rules in SQL, used once
// to fill the column for existing rows. test/search.e2e-spec.ts checks the two agree.

/** أ إ آ ٱ -> ا, ة -> ه, ى -> ي, and Arabic-Indic / Persian digits -> 0-9. */
const LETTER_FORMS: Record<string, string> = {
  أ: 'ا',
  إ: 'ا',
  آ: 'ا',
  ٱ: 'ا',
  ة: 'ه',
  ى: 'ي',
};

/** Tashkeel (harakat, U+064B–U+065F), the superscript alef (U+0670) and tatweel (U+0640). */
const MARKS = /[ً-ٰٟـ]/g;

const FORMS = /[أإآٱةى]/g;
const EASTERN_DIGITS = /[٠-٩۰-۹]/g;

/**
 * "  أَحمــد  عليّ " -> "احمد علي", "فاطمة" -> "فاطمه", "Mona  ADEL" -> "mona adel".
 * Rules: one form per letter group, no diacritics or tatweel, Latin in lowercase, digits as 0-9,
 * and runs of whitespace as one space, trimmed.
 */
export function normalizeSearchText(text: string): string {
  return text
    .replace(EASTERN_DIGITS, (digit) => String(digit.charCodeAt(0) & 0xf))
    .replace(FORMS, (letter) => LETTER_FORMS[letter] ?? letter)
    .replace(MARKS, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
