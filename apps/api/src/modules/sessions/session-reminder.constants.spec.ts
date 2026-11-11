import { graceMinutes, leadWindow, matchingLeads } from './session-reminder.constants';

const NOW = new Date('2026-11-10T10:00:00.000Z');
const minutes = (count: number) => new Date(NOW.getTime() + count * 60_000);

describe('session reminder windows', () => {
  it('keeps the grace of the leads that were hardcoded before the rules', () => {
    expect(graceMinutes(60)).toBe(30);
    expect(graceMinutes(1440)).toBe(180);
  });

  it('is half the lead, at least one tick (15) and at most 3 hours', () => {
    expect(graceMinutes(30)).toBe(15);
    expect(graceMinutes(45)).toBe(23);
    expect(graceMinutes(360)).toBe(180);
    expect(graceMinutes(10080)).toBe(180);
  });

  it('makes a window of (lead - grace, lead] minutes ahead', () => {
    expect(leadWindow(NOW, 60)).toEqual({ after: minutes(30), until: minutes(60) });
    expect(leadWindow(NOW, 1440)).toEqual({ after: minutes(1260), until: minutes(1440) });
  });

  describe('matchingLeads', () => {
    it('checks every lead on its own, so overlapping windows both match', () => {
      expect(matchingLeads(minutes(50), NOW, [60, 90, 1440])).toEqual([60, 90]);
    });

    it('excludes the start of the window and includes its end', () => {
      expect(matchingLeads(minutes(30), NOW, [60])).toEqual([]);
      expect(matchingLeads(minutes(31), NOW, [60])).toEqual([60]);
      expect(matchingLeads(minutes(60), NOW, [60])).toEqual([60]);
      expect(matchingLeads(minutes(61), NOW, [60])).toEqual([]);
    });

    it('matches nothing for a session that already started, or with no lead', () => {
      expect(matchingLeads(minutes(0), NOW, [60])).toEqual([]);
      expect(matchingLeads(minutes(-10), NOW, [60])).toEqual([]);
      expect(matchingLeads(minutes(50), NOW, [])).toEqual([]);
    });
  });
});
