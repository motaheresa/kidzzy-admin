import { ErrorCode } from '@kidzzy/shared';
import { AppException } from '../../common/errors/app.exception';
import { resolvePeriod } from './report-period';

const ZONE = 'Africa/Cairo';

function failure(run: () => unknown): AppException {
  try {
    run();
  } catch (error) {
    if (error instanceof AppException) return error;
    throw error;
  }
  throw new Error('expected an AppException');
}

describe('resolvePeriod', () => {
  it('is the current local month when from and to are missing', () => {
    const period = resolvePeriod({}, '2026-11-12', ZONE);
    expect(period.from).toBe('2026-11-01');
    expect(period.to).toBe('2026-11-30');
  });

  it('completes a missing end to the edge of the month of the other one', () => {
    expect(resolvePeriod({ from: '2026-09-10' }, '2026-11-12', ZONE).to).toBe('2026-09-30');
    expect(resolvePeriod({ to: '2026-09-10' }, '2026-11-12', ZONE).from).toBe('2026-09-01');
  });

  it('turns both local dates into instants: from at its midnight, to excluded at the next one', () => {
    // Cairo is UTC+2 in November.
    const period = resolvePeriod({ from: '2026-11-11', to: '2026-11-11' }, '2026-11-12', ZONE);
    expect(period.start.toISOString()).toBe('2026-11-10T22:00:00.000Z');
    expect(period.end.toISOString()).toBe('2026-11-11T22:00:00.000Z');
  });

  it('follows the clock change: the day Egypt goes back is 25 hours, one day lasts 24 in summer', () => {
    // 2026-10-29 starts at UTC+3 (21:00Z the day before) and the next day at UTC+2.
    const day = resolvePeriod({ from: '2026-10-29', to: '2026-10-29' }, '2026-11-12', ZONE);
    expect(day.start.toISOString()).toBe('2026-10-28T21:00:00.000Z');
    expect(day.end.toISOString()).toBe('2026-10-29T22:00:00.000Z');
    const summer = resolvePeriod({ from: '2026-07-10', to: '2026-07-10' }, '2026-11-12', ZONE);
    expect(summer.end.getTime() - summer.start.getTime()).toBe(24 * 3_600_000);
  });

  it('accepts one day and exactly 366 days', () => {
    expect(() =>
      resolvePeriod({ from: '2026-11-01', to: '2026-11-01' }, '2026-11-12', ZONE),
    ).not.toThrow();
    // 2026-01-01 .. 2027-01-01 is 366 days, both included.
    expect(() =>
      resolvePeriod({ from: '2026-01-01', to: '2027-01-01' }, '2026-11-12', ZONE),
    ).not.toThrow();
  });

  it('is 422 REPORT_PERIOD_TOO_LONG from 367 days', () => {
    const error = failure(() =>
      resolvePeriod({ from: '2026-01-01', to: '2027-01-02' }, '2026-11-12', ZONE),
    );
    expect(error.getStatus()).toBe(422);
    expect(error.code).toBe(ErrorCode.ReportPeriodTooLong);
  });

  it('is 400 when to is before from', () => {
    const error = failure(() =>
      resolvePeriod({ from: '2026-11-10', to: '2026-11-09' }, '2026-11-12', ZONE),
    );
    expect(error.getStatus()).toBe(400);
    expect(error.code).toBe(ErrorCode.ValidationFailed);
  });
});
