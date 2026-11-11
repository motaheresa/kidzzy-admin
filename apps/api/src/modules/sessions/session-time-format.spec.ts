import { heldReport } from '../session-reports/session-report.format';
import { formatDuration } from './session-time-format';

// The same cases as formatDuration in the web app (apps/web/src/lib/format/format.test.ts): the two
// functions are kept in step by these tests.
describe('formatDuration', () => {
  it.each([
    [1, 'دقيقة'],
    [2, 'دقيقتين'],
    [5, '5 دقايق'],
    [10, '10 دقايق'],
    [11, '11 دقيقة'],
    [45, '45 دقيقة'],
    [60, 'ساعة'],
    [65, 'ساعة و5 دقايق'],
    [90, 'ساعة و30 دقيقة'],
    [120, 'ساعتين'],
    [122, 'ساعتين ودقيقتين'],
    [181, '3 ساعات ودقيقة'],
    [660, '11 ساعة'],
  ])('%i minutes is "%s"', (minutes, text) => {
    expect(formatDuration(minutes)).toBe(text);
  });
});

describe('heldReport with a duration', () => {
  const present = (studentName: string) => ({
    status: 'present' as const,
    performanceRating: null,
    studentName,
  });

  it('puts the duration right after the attendance count', () => {
    const report = heldReport({
      groupName: 'سكواتش',
      topic: 'Loops',
      durationMin: 65,
      attendance: [present('أ'), present('ب')],
    });
    expect(report.body).toBe('حضر 2 من 2، المدة ساعة و5 دقايق، الشرح: Loops');
  });

  it('adds nothing for a session held before the times were recorded', () => {
    const report = heldReport({
      groupName: 'سكواتش',
      topic: null,
      durationMin: null,
      attendance: [present('أ')],
    });
    expect(report.body).toBe('حضر 1 من 1');
  });

  it('puts it after "no students" too', () => {
    const report = heldReport({
      groupName: 'سكواتش',
      topic: 'Loops',
      durationMin: 45,
      attendance: [],
    });
    expect(report.body).toBe('مفيش طلاب مسجلين في الحصة، المدة 45 دقيقة، الشرح: Loops');
  });
});
