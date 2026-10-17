import type { ScheduleSlot } from '@kidzzy/shared';
import {
  findScheduleProblem,
  sameSlot,
  sortSlots,
  START_TIME_PATTERN,
  stringToTime,
  timeToString,
  toMinutes,
} from './schedule';

const slot = (weekday: number, startTime: string, durationMin = 60): ScheduleSlot => ({
  weekday,
  startTime,
  durationMin,
});

describe('findScheduleProblem', () => {
  it.each([
    ['one slot', [slot(6, '16:00')]],
    ['two days', [slot(6, '16:00'), slot(2, '16:00')]],
    ['back to back on the same day', [slot(1, '16:00', 60), slot(1, '17:00', 60)]],
    ['a gap on the same day', [slot(1, '09:00', 60), slot(1, '17:00', 60)]],
    ['ending exactly at midnight', [slot(5, '23:00', 60)]],
  ])('accepts %s', (_label, slots) => {
    expect(findScheduleProblem(slots)).toBeNull();
  });

  it.each([
    ['partly sharing time', [slot(1, '16:00', 60), slot(1, '16:30', 60)]],
    ['one inside the other', [slot(1, '16:00', 120), slot(1, '16:30', 30)]],
    ['identical slots', [slot(1, '16:00'), slot(1, '16:00')]],
    ['given out of order', [slot(1, '16:30', 60), slot(1, '16:00', 60)]],
  ])('refuses an overlap: %s', (_label, slots) => {
    expect(findScheduleProblem(slots)).toBe('overlap');
  });

  it('refuses a slot that ends after midnight', () => {
    expect(findScheduleProblem([slot(1, '23:30', 60)])).toBe('past-midnight');
  });

  it('does not mix weekdays: the same time on two days is fine', () => {
    expect(findScheduleProblem([slot(0, '16:00'), slot(1, '16:00')])).toBeNull();
  });
});

describe('schedule helpers', () => {
  it('sorts by weekday (Sunday first), then time, without changing the input', () => {
    const input = [slot(6, '16:00'), slot(0, '18:00'), slot(0, '09:00')];
    expect(sortSlots(input).map((s) => `${s.weekday} ${s.startTime}`)).toEqual([
      '0 09:00',
      '0 18:00',
      '6 16:00',
    ]);
    expect(input[0].weekday).toBe(6);
  });

  it('compares slots by weekday, time and length', () => {
    expect(sameSlot(slot(1, '16:00'), slot(1, '16:00'))).toBe(true);
    expect(sameSlot(slot(1, '16:00'), slot(1, '16:00', 90))).toBe(false);
    expect(sameSlot(slot(1, '16:00'), slot(2, '16:00'))).toBe(false);
  });

  it('converts times both ways', () => {
    expect(toMinutes('16:30')).toBe(990);
    expect(timeToString(stringToTime('09:05'))).toBe('09:05');
  });

  it.each(['00:00', '09:30', '23:59'])('accepts the start time %s', (time) => {
    expect(START_TIME_PATTERN.test(time)).toBe(true);
  });

  it.each(['24:00', '99:99', '9:30', '16:60', '16:5', ''])('refuses the start time %j', (time) => {
    expect(START_TIME_PATTERN.test(time)).toBe(false);
  });
});
