import type { ScheduleSlot } from '@kidzzy/shared';
import {
  diffSchedule,
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

describe('diffSchedule', () => {
  const row = (
    id: string,
    weekday: number,
    startTime: string,
    durationMin = 60,
    retired = false,
  ) => ({
    id,
    weekday,
    startTime,
    durationMin,
    retired,
  });
  const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

  it('keeps a slot that did not change, removes the one that went, adds the new one', () => {
    const existing = [row('sat', 6, '16:00'), row('tue', 2, '16:00')];
    const diff = diffSchedule(existing, [slot(6, '16:00'), slot(0, '10:00')]);
    expect(ids(diff.keep)).toEqual(['sat']);
    expect(ids(diff.remove)).toEqual(['tue']);
    expect(diff.add).toEqual([slot(0, '10:00')]);
    expect(diff.revive).toEqual([]);
  });

  it('treats a changed time or duration as a different slot', () => {
    const diff = diffSchedule([row('sat', 6, '16:00', 60)], [slot(6, '16:00', 90)]);
    expect(ids(diff.remove)).toEqual(['sat']);
    expect(diff.add).toEqual([slot(6, '16:00', 90)]);
    expect(diff.keep).toEqual([]);
  });

  it('changes nothing for the same schedule, in any order', () => {
    const diff = diffSchedule(
      [row('a', 1, '09:00'), row('b', 3, '18:00')],
      [slot(3, '18:00'), slot(1, '09:00')],
    );
    expect(ids(diff.keep)).toEqual(['a', 'b']);
    expect([diff.remove, diff.revive, diff.add].map((x) => x.length)).toEqual([0, 0, 0]);
  });

  it('revives a retired slot that comes back, instead of adding a second row', () => {
    const diff = diffSchedule([row('old', 6, '16:00', 60, true)], [slot(6, '16:00')]);
    expect(ids(diff.revive)).toEqual(['old']);
    expect(diff.add).toEqual([]);
  });

  it('never removes an already retired slot again, and prefers a row in use', () => {
    const existing = [row('retired', 6, '16:00', 60, true), row('live', 6, '16:00')];
    expect(ids(diffSchedule(existing, []).remove)).toEqual(['live']);
    const diff = diffSchedule(existing, [slot(6, '16:00')]);
    expect(ids(diff.keep)).toEqual(['live']);
    expect(diff.revive).toEqual([]);
  });
});
