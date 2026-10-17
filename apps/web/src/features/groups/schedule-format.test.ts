import { describe, expect, it } from 'vitest';
import { formatDuration, formatSchedule, formatSlot, formatTime12 } from './schedule-format';

const slot = (weekday: number, startTime: string, durationMin = 60) => ({
  weekday,
  startTime,
  durationMin,
});

describe('schedule format', () => {
  it.each([
    ['16:00', '4:00 م'],
    ['09:30', '9:30 ص'],
    ['00:15', '12:15 ص'],
    ['12:00', '12:00 م'],
    ['23:59', '11:59 م'],
  ])('formats %s as %s', (time, expected) => {
    expect(formatTime12(time)).toBe(expected);
  });

  it.each([
    [60, 'ساعة'],
    [90, 'ساعة ونص'],
    [120, 'ساعتين'],
    [45, '45 دقيقة'],
  ])('formats %i minutes as %s', (minutes, expected) => {
    expect(formatDuration(minutes)).toBe(expected);
  });

  it('formats one slot with its weekday name (Sunday is 0)', () => {
    expect(formatSlot(slot(0, '16:00'))).toBe('الأحد · 4:00 م');
    expect(formatSlot(slot(6, '09:30'))).toBe('السبت · 9:30 ص');
  });

  it('joins the days that meet at the same time, as in the wireframe', () => {
    expect(formatSchedule([slot(2, '16:00'), slot(6, '16:00')])).toBe('التلات والسبت · 4:00 م');
  });

  it('separates different times', () => {
    expect(formatSchedule([slot(0, '09:00'), slot(3, '18:00')])).toBe(
      'الأحد · 9:00 ص، الأربع · 6:00 م',
    );
  });

  it('is empty for no slots', () => {
    expect(formatSchedule([])).toBe('');
  });
});
