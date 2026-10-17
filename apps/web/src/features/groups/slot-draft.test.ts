import { describe, expect, it } from 'vitest';
import { draftsToSlots, newSlotDraft, slotsToDrafts } from './slot-draft';

describe('slot drafts', () => {
  it('starts a new row on Saturday at 16:00 for an hour, with its own key', () => {
    const a = newSlotDraft();
    const b = newSlotDraft();
    expect(a).toMatchObject({ weekday: '6', startTime: '16:00', durationMin: '60' });
    expect(a.key).not.toBe(b.key);
  });

  it('turns saved slots into rows and back', () => {
    const slots = [
      { weekday: 2, startTime: '16:00', durationMin: 60 },
      { weekday: 6, startTime: '09:30', durationMin: 90 },
    ];
    expect(draftsToSlots(slotsToDrafts(slots))).toEqual(slots);
  });

  it('cuts seconds off a time input value and turns the numbers into numbers', () => {
    expect(
      draftsToSlots([newSlotDraft({ weekday: '0', startTime: '16:00:00', durationMin: '45' })]),
    ).toEqual([{ weekday: 0, startTime: '16:00', durationMin: 45 }]);
  });
});
