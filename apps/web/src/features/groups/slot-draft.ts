import type { ScheduleSlot } from './types';

/** One row of the schedule editor, as typed: strings, because that is what the inputs hold. */
export interface SlotDraft {
  /** Local key, so React keeps a row's inputs when another row is removed. */
  key: string;
  weekday: string;
  startTime: string;
  durationMin: string;
}

let nextKey = 0;

/** A new row: Saturday 16:00 for an hour, the academy's most common slot. */
export function newSlotDraft(draft: Partial<Omit<SlotDraft, 'key'>> = {}): SlotDraft {
  nextKey += 1;
  return { key: `slot-${nextKey}`, weekday: '6', startTime: '16:00', durationMin: '60', ...draft };
}

/** Saved slots -> rows to edit. */
export function slotsToDrafts(slots: readonly ScheduleSlot[]): SlotDraft[] {
  return slots.map((slot) =>
    newSlotDraft({
      weekday: String(slot.weekday),
      startTime: slot.startTime,
      durationMin: String(slot.durationMin),
    }),
  );
}

/**
 * Rows -> the API's slots. The browser's time input may add seconds ("16:00:00"); the API wants
 * "HH:MM". A blank number becomes NaN, which the API refuses (400) and shows under its row.
 */
export function draftsToSlots(drafts: readonly SlotDraft[]): ScheduleSlot[] {
  return drafts.map((draft) => ({
    weekday: Number(draft.weekday),
    startTime: draft.startTime.slice(0, 5),
    durationMin: Number(draft.durationMin),
  }));
}
