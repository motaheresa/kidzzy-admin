import { normalizeStudentCode, STUDENT_CODE_PATTERN } from './student-code';

describe('normalizeStudentCode', () => {
  it.each([
    ['  kc-001 ', 'KC-001'],
    ['KC-001', 'KC-001'],
    ['a/12.b_c', 'A/12.B_C'],
    ['kc-٠٠١', 'KC-001'],
    ['KC-۰۹۵', 'KC-095'],
    ['ط-١٢', 'ط-12'],
  ])('%j -> %j', (input, expected) => {
    expect(normalizeStudentCode(input)).toBe(expected);
  });
});

describe('STUDENT_CODE_PATTERN', () => {
  it.each(['KC-001', 'kc-001', '2026/7', 'ط-١٢', 'A.B_C'])('accepts %j', (code) => {
    expect(STUDENT_CODE_PATTERN.test(code)).toBe(true);
  });

  it.each(['', '-KC', 'KC 001', 'straße', 'KC%1', 'KC_\n1'])('refuses %j', (code) => {
    expect(STUDENT_CODE_PATTERN.test(code)).toBe(false);
  });
});
