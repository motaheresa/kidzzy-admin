import { normalizeSearchText } from './search-text';

describe('normalizeSearchText', () => {
  it.each([
    ['hamza forms of alef', 'أحمد إيمان آمال ٱلنور', 'احمد ايمان امال النور'],
    ['taa marbuta', 'فاطمة', 'فاطمه'],
    ['alef maqsura', 'مصطفى', 'مصطفي'],
    ['tashkeel', 'مَرْيَمُ', 'مريم'],
    ['shadda and tanween', 'عليّ محمدٌ', 'علي محمد'],
    ['superscript alef', 'رحمٰن', 'رحمن'],
    ['tatweel', 'أحمــــد', 'احمد'],
    ['Latin case', 'Mona ADEL', 'mona adel'],
    ['spaces collapsed and trimmed', '  سارة   \t محمود \n', 'ساره محمود'],
    ['Arabic-Indic digits', 'طالب ١٢', 'طالب 12'],
    ['Persian digits', 'KC-۰۹', 'kc-09'],
    ['mixed Arabic and Latin', 'أحمد Ali', 'احمد ali'],
    ['% and _ stay as they are (escapeLike handles them)', '100% a_b', '100% a_b'],
    ['an empty string', '   ', ''],
  ])('%s: %j -> %j', (_rule, input, expected) => {
    expect(normalizeSearchText(input)).toBe(expected);
  });

  it('is idempotent', () => {
    const once = normalizeSearchText('  أَحمــد  فاطمة ');
    expect(normalizeSearchText(once)).toBe(once);
  });
});
